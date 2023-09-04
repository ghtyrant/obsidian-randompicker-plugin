import { App, Editor, FuzzySuggestModal, MarkdownView, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

// Remember to rename these classes and interfaces!

interface RandomPickerPluginSettings {
	listsFolder: string;
	stripListSymbols: boolean;
	insertSpace: boolean;
}

const DEFAULT_SETTINGS: RandomPickerPluginSettings = {
	listsFolder: 'Random/',
	stripListSymbols: true,
	insertSpace: true
}

export default class MyPlugin extends Plugin {
	settings: RandomPickerPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'insert-random-pick',
			name: 'Insert random pick',
			editorCheckCallback: (checking: boolean, editor: Editor, _view: MarkdownView) => {
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

				if (markdownView) {
					if (!checking) {
						new RandomKindSelectorModal(this.app, this.settings.listsFolder, this.settings.stripListSymbols, (item: Promise<string>) => {
							item.then(text => {
								if (this.settings.insertSpace) {
									text += ' '
								}

								editor.replaceRange(text, editor.getCursor())

								// Move cursor to the end of the inserted text
								const cursorPosition = editor.posToOffset(editor.getCursor()) + text.length
								editor.setCursor(editor.offsetToPos(cursorPosition))
							})
						}).open();
					}

					return true;
				}
			}
		});

		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class RandomKindSelectorModal extends FuzzySuggestModal<TFile> {
	callback: (item: Promise<string>) => void
	folder: string
	randomLists: Map<string, string[]>
	stripListSymbols: boolean

	constructor(app: App, folder: string, stripListSymbols: boolean, callback: (item: Promise<string>) => void) {
		super(app);
		this.callback = callback;
		this.randomLists = new Map()
		this.folder = folder
		this.stripListSymbols = stripListSymbols
	}

	getItems(): TFile[] {
		const files = this.app.vault.getFiles()
			.filter(f => f.path.startsWith(this.folder))

		return files
	}

	getItemText(item: TFile): string {
		return item.basename
	}

	onChooseItem(item: TFile, _evt: MouseEvent | KeyboardEvent): void {
		const chosenItem = this.app.vault.cachedRead(item).then(text => {
			const items = text.split("\n").filter(l => l.trim().length > 0)
			const item = items[Math.floor(Math.random() * items.length)].trim()

			// Remove bullet list symbols. There's probably a better way to do this
			if (this.stripListSymbols && (item.startsWith("* ") || item.startsWith("- "))) {
				return item.slice(2)
			}

			return item
		})

		this.callback(chosenItem)
	}
}

class SettingTab extends PluginSettingTab {
	plugin: MyPlugin;
	warnText: HTMLElement;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h1", { text: "Random Picker Settings" })
		new Setting(containerEl)
			.setHeading()
			.setName('Data Folder')
			.setDesc('The plugin will read all files in the folder and allows you to choose from which one to pick a random line.')
			.addText(text => text
				.setPlaceholder('e.g. Random/')
				.setValue(this.plugin.settings.listsFolder)
				.onChange(async (value) => {
					// Make sure the folder name ends with a slash
					if (value.endsWith("/")) {
						value = value.slice(0, -1)
					}
					const folder = this.app.vault.getAbstractFileByPath(value)

					this.warnText.setText("")
					if (folder == null) {
						this.warnText.setText("Folder does not exist!")
					}

					if (folder instanceof TFile) {
						this.warnText.setText("Please specify a path to a folder!")
					}

					this.plugin.settings.listsFolder = value;
					await this.plugin.saveSettings();
				}));

		this.warnText = containerEl.createEl("small",
			{ text: "", cls: "random-picker-warn" })

		new Setting(containerEl)
			.setName('Strip List Symbols')
			.setDesc('Strip Markdown list symbols (e.g. - or *) before inserting the random pick.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.stripListSymbols)
				.onChange(async (value) => {
					this.plugin.settings.stripListSymbols = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Insert Space')
			.setDesc('Insert space after inserted text')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.insertSpace)
				.onChange(async (value) => {
					this.plugin.settings.insertSpace = value;
					await this.plugin.saveSettings();
				}));
	}
}
