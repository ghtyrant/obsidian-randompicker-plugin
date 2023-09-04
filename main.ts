import {
	App,
	Editor,
	FuzzySuggestModal,
	MarkdownView,
	Modal,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

interface RandomPickerPluginSettings {
	listsFolder: string;
	stripListSymbols: boolean;
	insertSpace: boolean;
}

const DEFAULT_SETTINGS: RandomPickerPluginSettings = {
	listsFolder: "Random",
	stripListSymbols: true,
	insertSpace: true,
};

export default class MyPlugin extends Plugin {
	settings: RandomPickerPluginSettings;

	async onload() {
		await this.loadSettings();

		console.log(this.settings);

		this.addCommand({
			id: "insert-random-pick",
			name: "Insert random pick",
			editorCheckCallback: (
				checking: boolean,
				editor: Editor,
				_view: MarkdownView
			) => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);

				if (markdownView) {
					if (!checking) {
						new RandomSourceSelectorModal(
							this.app,
							this.settings.listsFolder,
							(source) =>
								this.insertRandomPickFromSource(editor, source)
						).open();
					}

					return true;
				}
			},
		});

		this.addCommand({
			id: "insert-random-pick-with-preview",
			name: "Insert random pick with preview",
			editorCheckCallback: (
				checking: boolean,
				editor: Editor,
				_view: MarkdownView
			) => {
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);

				if (markdownView) {
					if (!checking) {
						new RandomSourceSelectorModal(
							this.app,
							this.settings.listsFolder,
							(source) => this.showPreviewModal(editor, source)
						).open();
					}

					return true;
				}
			},
		});

		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	editorInsertText(editor: Editor, text: string) {
		editor.replaceRange(text, editor.getCursor());

		// Move cursor to the end of the inserted text
		const newCursorPosition =
			editor.posToOffset(editor.getCursor()) + text.length;
		editor.setCursor(editor.offsetToPos(newCursorPosition));
	}

	showPreviewModal(editor: Editor, source: RandomSource) {
		new RandomPickPreviewModal(
			this.app,
			source,
			this.settings.stripListSymbols
		).open();
	}

	insertRandomPickFromSource(editor: Editor, source: RandomSource) {
		source.getRandomPick(this.settings.stripListSymbols).then((text) => {
			if (this.settings.insertSpace) {
				text += " ";
			}

			this.editorInsertText(editor, text);
		});
	}
}

class RandomSource {
	file: TFile;
	app: App;

	constructor(app: App, file: TFile) {
		this.app = app;
		this.file = file;
	}

	name(): string {
		return this.file.basename;
	}

	async getRandomPick(stripListSymbols: boolean): Promise<string> {
		return this.app.vault.cachedRead(this.file).then((text) => {
			const items = text.split("\n").filter((l) => l.trim().length > 0);
			const item = items[Math.floor(Math.random() * items.length)].trim();

			// Remove bullet list symbols. There's probably a better way to do this
			if (
				stripListSymbols &&
				(item.startsWith("* ") || item.startsWith("- "))
			) {
				return item.slice(2);
			}

			return item;
		});
	}
}

class RandomPickPreviewModal extends Modal {
	source: RandomSource;
	stripListSymbols: boolean;

	constructor(app: App, source: RandomSource, stripListSymbols: boolean) {
		super(app);
		this.source = source;
		this.stripListSymbols = stripListSymbols;
	}

	onOpen() {
		const { contentEl } = this;
		this.source
			.getRandomPick(this.stripListSymbols)
			.then((text) => contentEl.setText(text));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class RandomSourceSelectorModal extends FuzzySuggestModal<RandomSource> {
	callback: (item: RandomSource) => void;
	folder: string;
	randomLists: Map<string, string[]>;

	constructor(
		app: App,
		folder: string,
		callback: (item: RandomSource) => void
	) {
		super(app);
		this.callback = callback;
		this.randomLists = new Map();
		this.folder = folder;
	}

	getItems(): RandomSource[] {
		const files = this.app.vault
			.getFiles()
			.filter((f) => f.path.startsWith(this.folder))
			.map((f) => new RandomSource(this.app, f));

		return files;
	}

	getItemText(item: RandomSource): string {
		return item.name();
	}

	onChooseItem(item: RandomSource, _evt: MouseEvent | KeyboardEvent): void {
		this.callback(item);
	}
}

class SettingTab extends PluginSettingTab {
	plugin: MyPlugin;
	warnText: HTMLElement;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	updateWarnText(value: string) {
		const folder = this.app.vault.getAbstractFileByPath(value);
		let message = "";

		if (folder == null) {
			message = "Folder does not exist! Oh no";
		}

		if (folder instanceof TFile) {
			message = "Please specify a path to a folder!";
		}

		console.log(message);

		this.warnText.setText(message);
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h1", { text: "Random Picker Settings" });
		new Setting(containerEl)
			.setHeading()
			.setName("Data Folder")
			.setDesc(
				"The plugin will read all files in the folder and allows you to choose from which one to pick a random line."
			)
			.addText((text) =>
				text
					.setPlaceholder("e.g. Random/")
					.setValue(this.plugin.settings.listsFolder)
					.onChange(async (value) => {
						// Make sure the folder name ends with a slash
						if (value.endsWith("/")) {
							value = value.slice(0, -1);
						}

						this.updateWarnText(value);
						this.plugin.settings.listsFolder = value;
						await this.plugin.saveSettings();
					})
			);

		this.warnText = containerEl.createEl("small", {
			text: "",
			cls: "random-picker-warn",
		});

		console.log(this.warnText);

		this.updateWarnText(this.plugin.settings.listsFolder);

		new Setting(containerEl)
			.setName("Strip List Symbols")
			.setDesc(
				"Strip Markdown list symbols (e.g. - or *) before inserting the random pick."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.stripListSymbols)
					.onChange(async (value) => {
						this.plugin.settings.stripListSymbols = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Insert Space")
			.setDesc("Insert space after inserted text")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.insertSpace)
					.onChange(async (value) => {
						this.plugin.settings.insertSpace = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
