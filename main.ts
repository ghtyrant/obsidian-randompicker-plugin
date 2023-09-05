import {
	App,
	Editor,
	FuzzySuggestModal,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

class RandomPickTemplate {
	name: string;
	template: string;

	constructor(name: string, template: string) {
		this.name = name;
		this.template = template;
	}

	async generate(sources: Map<string, RandomSource>): Promise<string> {
		let output = "";
		let variableEnd = -1;

		// eslint-disable-next-line no-constant-condition
		while (true) {
			const nextVariable = this.template.indexOf("${", variableEnd);

			// No more variables found
			if (nextVariable == -1) {
				output += this.template.slice(variableEnd + 1);
				break;
			}

			output += this.template.slice(variableEnd + 1, nextVariable);

			variableEnd = this.template.indexOf("}", nextVariable);

			if (variableEnd == -1) {
				new Notice(
					`[Random Picker] Error: Malformed template '${this.name}'!`
				);
				break;
			}

			const varName = this.template.slice(nextVariable + 2, variableEnd);

			if (sources.has(varName)) {
				output += await sources.get(varName)?.getRandomPick();
			} else {
				new Notice(
					`[Random Picker] Error in '${this.name}': ${varName} not found!`
				);
			}
		}

		return output;
	}
}

interface RandomPickerPluginSettings {
	listsFolder: string;
	templates: RandomPickTemplate[];
}

const DEFAULT_SETTINGS: RandomPickerPluginSettings = {
	listsFolder: "Random/",
	templates: [],
};

export default class RandomPickerPlugin extends Plugin {
	settings: RandomPickerPluginSettings;

	async onload() {
		await this.loadSettings();

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
							this.settings.templates,
							(template) =>
								this.insertRandomPickFromSource(
									editor,
									template
								)
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
							this.settings.templates,
							(template) =>
								this.showPreviewModal(editor, template)
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

		this.settings.templates = this.settings.templates.map(
			(t) => new RandomPickTemplate(t.name, t.template)
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

	getRandomSources(): Map<string, RandomSource> {
		const randomSources = new Map();
		this.app.vault
			.getFiles()
			.filter((f) => f.path.startsWith(this.settings.listsFolder))
			.map((f) =>
				randomSources.set(f.basename, new RandomSource(this.app, f))
			);
		return randomSources;
	}

	showPreviewModal(editor: Editor, template: RandomPickTemplate) {
		new RandomPickPreviewModal(
			this.app,
			template,
			this.getRandomSources(),
			(text) => this.editorInsertText(editor, text)
		).open();
	}

	insertRandomPickFromSource(editor: Editor, template: RandomPickTemplate) {
		template
			.generate(this.getRandomSources())
			.then((value) => this.editorInsertText(editor, value));
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

	async getRandomPick(): Promise<string> {
		return this.app.vault.cachedRead(this.file).then((text) => {
			const items = text.split("\n").filter((l) => l.trim().length > 0);
			const item = items[Math.floor(Math.random() * items.length)].trim();

			// Remove bullet list symbols. There's probably a better way to do this
			if (item.startsWith("* ") || item.startsWith("- ")) {
				return item.slice(2);
			}

			return item;
		});
	}
}

class RandomPickPreviewModal extends Modal {
	template: RandomPickTemplate;
	sources: Map<string, RandomSource>;
	onSubmit: (result: string) => void;

	constructor(
		app: App,
		template: RandomPickTemplate,
		sources: Map<string, RandomSource>,
		onSubmit: (result: string) => void
	) {
		super(app);
		this.template = template;
		this.sources = sources;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h1", {
			text: `Random Pick - ${this.template.name}`,
		});

		const nameEl = contentEl.createEl("p");
		this.template
			.generate(this.sources)
			.then((text) => nameEl.setText(text));

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Regenerate").onClick(() => {
					this.template
						.generate(this.sources)
						.then((text) => nameEl.setText(text));
				})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Insert")
					.setCta()
					.onClick(() => {
						this.close();
						this.onSubmit(nameEl.getText());
					})
			);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class RandomSourceSelectorModal extends FuzzySuggestModal<RandomPickTemplate> {
	callback: (item: RandomPickTemplate) => void;
	templates: RandomPickTemplate[];
	randomLists: Map<string, string[]>;

	constructor(
		app: App,
		templates: RandomPickTemplate[],
		callback: (item: RandomPickTemplate) => void
	) {
		super(app);
		this.callback = callback;
		this.templates = templates;
	}

	getItems(): RandomPickTemplate[] {
		return this.templates;
	}

	getItemText(item: RandomPickTemplate): string {
		return item.name;
	}

	onChooseItem(
		item: RandomPickTemplate,
		_evt: MouseEvent | KeyboardEvent
	): void {
		this.callback(item);
	}
}

class SettingTab extends PluginSettingTab {
	plugin: RandomPickerPlugin;
	warnText: HTMLElement;
	templatesEl: HTMLElement;

	constructor(app: App, plugin: RandomPickerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	updateWarnText(value: string) {
		const folder = this.app.vault.getAbstractFileByPath(value);
		let message = "";

		if (folder == null) {
			message = "Folder does not exist!";
		}

		if (folder instanceof TFile) {
			message = "Please specify a path to a folder!";
		}

		this.warnText.setText(message);
	}

	displayTemplates(): void {
		this.plugin.settings.templates.forEach((template) => {
			this.templatesEl.createEl("small", { text: "Name" });
			const nameSetting = new Setting(this.templatesEl)
				.setClass("random-picker-template-setting")
				.addText((text) => {
					text.setValue(template.name).onChange(async (value) => {
						template.name = value;
						await this.plugin.saveSettings();
					});
					text.setPlaceholder("Unique Name");

					text.inputEl.addClass("random-picker-full");
				});

			nameSetting.infoEl.remove();

			this.templatesEl.createEl("small", { text: "Template" });
			const templateSetting = new Setting(this.templatesEl)
				.setClass("random-picker-template-setting")
				.addTextArea((text) => {
					text.setValue(template.template).onChange(async (value) => {
						template.template = value;
						await this.plugin.saveSettings();
					});
					text.setPlaceholder(
						"e.g. Random Name ${Names} ${Surenames}"
					);
					text.inputEl.addClass("random-picker-full");
				});

			templateSetting.infoEl.remove();

			const deleteButton = new Setting(this.templatesEl)
				.setClass("random-picker-template-setting")
				.addButton((btn) =>
					btn
						.setButtonText("Delete")
						.setWarning()
						.onClick(() => {
							this.plugin.settings.templates.remove(template);
							this.templatesEl.empty();
							this.displayTemplates();
						})
				);

			deleteButton.infoEl.remove();

			this.templatesEl.createEl("hr", {
				cls: "random-picker-template-separator",
			});
		});
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
			.addSearch((cb) => {
				cb.setValue(this.plugin.settings.listsFolder)
					.setPlaceholder("e.g. My Folder/Subfolder")
					.onChange(async (value) => {
						// Make sure the folder name does not end with a slash
						if (value.endsWith("/")) {
							value = value.slice(0, -1);
						}

						this.updateWarnText(value);
						this.plugin.settings.listsFolder = value;
						await this.plugin.saveSettings();
					});
			});

		this.warnText = containerEl.createEl("small", {
			text: "",
			cls: "random-picker-warn",
		});

		this.updateWarnText(this.plugin.settings.listsFolder);

		// Templates List
		containerEl.createEl("h2", { text: "Templates" });
		const longDoc = document.createDocumentFragment();
		longDoc.createDiv({
			text: "Create templates for generating random texts.",
		});
		longDoc.createDiv({
			text: "Use ${Filename} to insert a random line from that file. You can use the same file more than once.",
		});
		new Setting(containerEl)
			.setDesc(longDoc)
			.setClass("random-picker-template-setting");
		new Setting(containerEl).addButton((btn) =>
			btn
				.setButtonText("Add new template")
				.setCta()
				.onClick(() => {
					this.plugin.settings.templates.push(
						new RandomPickTemplate("", "")
					);
					this.templatesEl.empty();
					this.displayTemplates();
				})
		);

		this.templatesEl = containerEl.createDiv();
		this.displayTemplates();
	}
}
