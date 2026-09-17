//#region src/api.ts
function createApi({ core, version, openLibrary, activeEditor, insert, integrations }) {
	return Object.freeze({
		version,
		openTemplateLibrary: () => openLibrary(),
		insertTemplate: (templateId, options = {}) => {
			if (!core.templates.has(templateId)) throw new Error(`Unknown template "${templateId}"`);
			const view = activeEditor();
			return view ? insert(view, templateId, { ...options.preset ? { preset: options.preset } : {} }) : false;
		},
		registerTemplate: (definition) => core.templates.register(definition),
		unregisterTemplate: (id) => core.templates.unregister(id),
		registerPreset: (preset) => core.presets.register(preset),
		registerSystemAdapter: (adapter) => integrations.register(adapter)
	});
}
//#endregion
//#region src/constants.ts
var MODULE_ID = "loreframe";
/** Prefix for every Loreframe log line. */
var LOG_PREFIX = "Loreframe |";
var SETTINGS = {
	debug: "debug",
	favorites: "favorites",
	recent: "recent",
	enableIntegrations: "enableIntegrations",
	userTemplates: "userTemplates"
};
/** Data attributes that carry Loreframe semantics in Journal HTML (spec §10). */
var DATA_ATTR = {
	template: "data-loreframe-template",
	version: "data-loreframe-version",
	instance: "data-loreframe-instance",
	field: "data-loreframe-field",
	preset: "data-loreframe-preset",
	/** Region of a block that accepts other blocks (e.g. a layout column). */
	slot: "data-loreframe-slot",
	/** Prefix of root attributes that store select/boolean field values, e.g. data-loreframe-opt-side. */
	optionPrefix: "data-loreframe-opt-",
	/** Empty contents box that view mode fills from an article's headings. */
	contents: "data-loreframe-contents"
};
//#endregion
//#region src/utils/html.ts
var ESCAPES = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
};
/** Escape a value for safe interpolation into HTML text or a quoted attribute. */
function escapeHtml(value) {
	if (value === null || value === void 0) return "";
	return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}
//#endregion
//#region src/utils/logger.ts
var debugEnabled = false;
/** Toggle verbose diagnostics (bound to the client "debug" setting). */
function setDebugLogging(enabled) {
	debugEnabled = enabled;
}
var logger = {
	debug(...args) {
		if (debugEnabled) console.debug(LOG_PREFIX, ...args);
	},
	info(...args) {
		console.info(LOG_PREFIX, ...args);
	},
	warn(...args) {
		console.warn(LOG_PREFIX, ...args);
	},
	error(...args) {
		console.error(LOG_PREFIX, ...args);
	}
};
//#endregion
//#region src/core/links.ts
/**
* Foundry content links as stored in Journal text: `@UUID[uuid]{label}`. Foundry inserts exactly this text when a
* document is dropped into the editor (common/prosemirror/content-link-plugin.mjs) and enriches it on display.
*/
var UUID_PATTERN = /^[A-Za-z0-9._-]+$/;
var LINK_PATTERN = /^@UUID\[([^\]]+)\](?:\{([^}]*)\})?$/;
/** The link text for an item, or its plain label when it has no usable uuid. */
function formatLink(item) {
	const label = item.label.replace(/[[\]{}]/g, "").trim();
	if (!UUID_PATTERN.test(item.uuid)) return label;
	return label ? `@UUID[${item.uuid}]{${label}}` : `@UUID[${item.uuid}]`;
}
/** Read a link back from its text; anything else is a plain label. */
function parseLink(text) {
	const trimmed = text.trim();
	const match = LINK_PATTERN.exec(trimmed);
	if (!match?.[1] || !UUID_PATTERN.test(match[1])) return {
		uuid: "",
		label: trimmed
	};
	return {
		uuid: match[1],
		label: match[2]?.trim() ?? ""
	};
}
function isLinkItem(value) {
	if (typeof value !== "object" || value === null) return false;
	const item = value;
	return typeof item.uuid === "string" && typeof item.label === "string" && typeof item.note === "string";
}
//#endregion
//#region src/core/preset-registry.ts
var ID_PATTERN$3 = /^[a-z0-9][a-z0-9-]*$/;
/** Visual presets (spec §8). A structure can render with any preset it lists. */
var PresetRegistry = class {
	#presets = /* @__PURE__ */ new Map();
	register(preset) {
		if (typeof preset.id !== "string" || !ID_PATTERN$3.test(preset.id)) throw new Error(`Invalid preset id "${String(preset.id)}"`);
		if (typeof preset.name !== "string" || !preset.name) throw new Error(`Preset "${preset.id}" needs a name`);
		if (this.#presets.has(preset.id)) throw new Error(`Preset "${preset.id}" is already registered`);
		this.#presets.set(preset.id, Object.freeze({
			...preset,
			values: Object.freeze({ ...preset.values })
		}));
	}
	has(id) {
		return this.#presets.has(id);
	}
	get(id) {
		return this.#presets.get(id);
	}
	/** Presets available to a template, in the template's declared order. */
	listFor(definition) {
		return (definition.presets ?? []).flatMap((id) => this.#presets.get(id) ?? []);
	}
};
/**
* Resolve the values a template renders with: field defaults < preset values < explicit values.
* Only declared fields survive, and only with a value of the field's type.
*/
function resolveValues(definition, preset, explicit, localize) {
	const values = {};
	for (const field of definition.fields ?? []) {
		const value = [
			explicit[field.id],
			preset?.values?.[field.id],
			defaultValue(field, localize)
		].find((candidate) => isValidValue(field, candidate));
		if (value === void 0) continue;
		values[field.id] = structuredClone(value);
	}
	return values;
}
function defaultValue(field, localize) {
	if (field.default !== void 0) return field.default;
	return field.defaultKey ? localize(field.defaultKey) : void 0;
}
function isValidValue(field, value) {
	switch (field.type) {
		case "items": return Array.isArray(value) && value.every(isGalleryItem);
		case "links": return Array.isArray(value) && value.every(isLinkItem);
		case "boolean": return typeof value === "boolean";
		case "select": return typeof value === "string" && (field.options ?? []).includes(value);
		default: return typeof value === "string";
	}
}
function isGalleryItem(value) {
	if (typeof value !== "object" || value === null) return false;
	const item = value;
	return typeof item.src === "string" && typeof item.alt === "string" && typeof item.caption === "string";
}
var EXPORT_FORMAT = "loreframe-templates";
var MAX_IMPORT_BYTES = 256e3;
var ID_PATTERN$2 = /^user-[a-z0-9][a-z0-9-]{0,47}$/;
var NAME_MAX = 80;
var DESCRIPTION_MAX = 200;
/** Fields a user template may configure: sections and options, never content. */
function configurableFields(definition) {
	return (definition.fields ?? []).filter((field) => field.type === "select" || field.type === "boolean");
}
function plainText(value, max) {
	if (typeof value !== "string") return null;
	const text = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
	return text.length <= max ? text : null;
}
/** A validated copy of `raw`, or null. Unknown or invalid configuration keys are dropped. */
function sanitizeUserTemplate(raw, deps) {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
	const data = raw;
	if (data.schemaVersion !== 1) return null;
	if (typeof data.id !== "string" || !ID_PATTERN$2.test(data.id)) return null;
	const name = plainText(data.name, NAME_MAX);
	if (!name) return null;
	const description = data.description === void 0 ? "" : plainText(data.description, DESCRIPTION_MAX);
	if (description === null) return null;
	const base = typeof data.base === "string" ? deps.templates.get(data.base) : void 0;
	if (!base) return null;
	const preset = data.preset ?? null;
	if (preset !== null && (typeof preset !== "string" || !base.presets?.includes(preset) || !deps.presets.has(preset))) return null;
	if (typeof data.values !== "object" || data.values === null || Array.isArray(data.values)) return null;
	const raws = data.values;
	const values = {};
	for (const field of configurableFields(base)) {
		const value = raws[field.id];
		if (field.type === "boolean" && typeof value === "boolean") values[field.id] = value;
		if (field.type === "select" && typeof value === "string" && field.options?.includes(value)) values[field.id] = value;
	}
	return {
		schemaVersion: 1,
		id: data.id,
		name,
		description,
		base: base.id,
		preset,
		values
	};
}
var UserTemplateStore = class {
	#deps;
	constructor(deps) {
		this.#deps = deps;
	}
	/** Valid templates whose base is registered, in stored order. */
	list() {
		const stored = this.#deps.read();
		if (!Array.isArray(stored)) return [];
		return stored.flatMap((raw) => sanitizeUserTemplate(raw, this.#deps) ?? []);
	}
	get(id) {
		return this.list().find((template) => template.id === id);
	}
	async create(input) {
		const list = this.list();
		if (list.length >= 100) throw new Error(`User template limit (100) reached`);
		const template = this.#validate({
			...input,
			id: this.#newId()
		});
		await this.#deps.write([...list, template]);
		return template;
	}
	async update(id, patch) {
		const list = this.list();
		const current = list.find((template) => template.id === id);
		if (!current) throw new Error(`User template "${id}" not found`);
		const next = this.#validate({
			...current,
			...patch,
			id
		});
		await this.#deps.write(list.map((template) => template.id === id ? next : template));
		return next;
	}
	async duplicate(id, name) {
		const source = this.get(id);
		if (!source) throw new Error(`User template "${id}" not found`);
		return this.create({
			...source,
			name
		});
	}
	async remove(id) {
		const list = this.list();
		const next = list.filter((template) => template.id !== id);
		if (next.length === list.length) return false;
		await this.#deps.write(next);
		return true;
	}
	/** A JSON package of the given templates (all by default). */
	exportJson(ids) {
		const templates = this.list().filter((template) => !ids || ids.includes(template.id));
		return JSON.stringify({
			format: EXPORT_FORMAT,
			schemaVersion: 1,
			templates
		}, null, 2);
	}
	/** Add the valid templates of a package under new ids. Rejects malformed or oversized packages outright. */
	async import(text) {
		if (text.length > MAX_IMPORT_BYTES) throw new Error("Template package is too large");
		const data = JSON.parse(text);
		const pkg = typeof data === "object" && data !== null ? data : {};
		if (pkg.format !== "loreframe-templates") throw new Error("Not a Loreframe template package");
		if (pkg.schemaVersion !== 1) throw new Error("Unsupported template package version");
		if (!Array.isArray(pkg.templates)) throw new Error("Template package has no template list");
		const list = this.list();
		let skipped = 0;
		for (const raw of pkg.templates) {
			const template = sanitizeUserTemplate(raw, this.#deps);
			if (!template || list.length >= 100) {
				skipped++;
				continue;
			}
			list.push({
				...template,
				id: this.#newId()
			});
		}
		const added = pkg.templates.length - skipped;
		if (added) await this.#deps.write(list);
		return {
			added,
			skipped
		};
	}
	#newId() {
		return `user-${this.#deps.newId().toLowerCase()}`;
	}
	#validate(input) {
		const template = sanitizeUserTemplate({
			...input,
			schemaVersion: 1,
			description: input.description ?? ""
		}, this.#deps);
		if (!template) throw new Error(`Invalid user template "${input.name}"`);
		return template;
	}
};
//#endregion
//#region src/content-templates/shared.ts
/** Neutral image shipped with the module, used until the author picks a real image. */
var PLACEHOLDER_IMAGE = `modules/${MODULE_ID}/assets/placeholders/image.svg`;
/** Read a string value; resolveValues guarantees declared text fields are strings. */
function text(values, field) {
	const value = values[field];
	return typeof value === "string" ? value : "";
}
/** Plain text → paragraphs, splitting on blank lines. Always yields at least one (possibly empty) paragraph. */
function paragraphs(value) {
	const parts = value.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
	return (parts.length ? parts : [""]).map((part) => ({
		tag: "p",
		children: part ? [part] : []
	}));
}
/** A small label heading that Foundry's page table of contents skips (`data-no-toc`). */
function labelHeading(className, label, field) {
	return {
		tag: "h4",
		classes: [className],
		field,
		attrs: { "data-no-toc": "" },
		children: [label]
	};
}
/**
* An image field. The field lives on a wrapper because Foundry's image prompt replaces the `<img>` node
* (common/prosemirror/menu.mjs `_insertImagePrompt`), which would drop attributes set on the image itself.
*/
function imageField(className, src, alt, field = "image") {
	return {
		tag: "div",
		classes: [className],
		field,
		children: [{
			tag: "img",
			attrs: {
				src: src || PLACEHOLDER_IMAGE,
				alt
			}
		}]
	};
}
/** A slot region pre-filled with placeholder paragraphs. */
function slotRegion(classes, slot, placeholder) {
	return {
		tag: "div",
		classes,
		slot,
		children: paragraphs(placeholder)
	};
}
/** A table cell holding one paragraph (Foundry table cells require block content). */
function cell(tag, value) {
	return {
		tag,
		children: [{
			tag: "p",
			children: value ? [value] : []
		}]
	};
}
/**
* A rich-text region hidden from players: a bare Foundry secret inside the field element, so `enrichHTML` strips it
* and the reveal toggle works (spec §22). Blocks must not use other `<section>` tags: the reveal regex starts at one.
*/
function secretRegion(classes, field, label, body) {
	return {
		tag: "div",
		classes: ["loreframe-secret-region", ...classes],
		field,
		children: [{
			tag: "section",
			secret: true,
			children: [label, ...paragraphs(body)]
		}]
	};
}
//#endregion
//#region src/applications/block-inspector/inspector-model.ts
/** Form key of the preset select; field ids cannot start with "_", so it never collides with a field. */
var PRESET_FORM_KEY = "_preset";
var SECTION_ORDER = [
	{
		id: "general",
		label: "LOREFRAME.Inspector.General"
	},
	{
		id: "sections",
		label: "LOREFRAME.Inspector.Sections"
	},
	{
		id: "options",
		label: "LOREFRAME.Inspector.Options"
	},
	{
		id: "style",
		label: "LOREFRAME.Inspector.Style"
	}
];
/** View data for the block inspector (spec §24). Rich text stays in the Journal editor. */
function buildInspectorModel(definition, values, style = {
	preset: null,
	presets: []
}) {
	const groups = new Map(SECTION_ORDER.map((s) => [s.id, []]));
	const push = (id, field) => groups.get(id)?.push(field);
	const lists = [];
	if (style.presets.length > 1) push("style", {
		id: PRESET_FORM_KEY,
		type: "select",
		label: "LOREFRAME.Inspector.Preset",
		value: style.preset ?? style.presets[0]?.id ?? "",
		options: style.presets.map((preset) => ({
			value: preset.id,
			label: preset.name
		}))
	});
	for (const field of definition.fields ?? []) {
		const value = values[field.id];
		switch (field.type) {
			case "text":
			case "image":
				push(field.inspectorGroup ?? "general", {
					id: field.id,
					type: field.type,
					label: field.label,
					value: typeof value === "string" ? value : ""
				});
				break;
			case "select":
				push(field.inspectorGroup ?? "options", {
					id: field.id,
					type: "select",
					label: field.label,
					value: typeof value === "string" ? value : String(field.default ?? ""),
					options: (field.options ?? []).map((option) => ({
						value: option,
						label: `LOREFRAME.Option.${field.id}.${option}`
					}))
				});
				break;
			case "boolean":
				push(field.inspectorGroup ?? "options", {
					id: field.id,
					type: "boolean",
					label: field.label,
					value: value === true
				});
				break;
			case "items": {
				const list = Array.isArray(value) ? value : [];
				lists.push({
					fieldId: field.id,
					label: field.label,
					kind: "images",
					images: list.map((item, index) => ({
						...item,
						...position(index, list.length),
						preview: item.src || PLACEHOLDER_IMAGE
					})),
					links: []
				});
				break;
			}
			case "links": {
				const list = Array.isArray(value) ? value : [];
				lists.push({
					fieldId: field.id,
					label: field.label,
					kind: "links",
					images: [],
					links: list.map((item, index) => ({
						...item,
						...position(index, list.length),
						linked: item.uuid !== ""
					}))
				});
				break;
			}
		}
	}
	const sections = SECTION_ORDER.flatMap(({ id, label }) => {
		const fields = groups.get(id) ?? [];
		return fields.length ? [{
			id,
			label,
			fields
		}] : [];
	});
	return {
		sections,
		lists,
		richTextHint: (definition.fields ?? []).some((f) => f.type === "richText") || Boolean(definition.slots?.length),
		empty: !sections.length && !lists.length
	};
}
function position(index, length) {
	return {
		index,
		first: index === 0,
		last: index === length - 1
	};
}
/** Values from the inspector form (flat `name → value`, as FormDataExtended produces). */
function readInspectorForm(definition, form) {
	const values = {};
	const str = (key) => {
		const value = form[key];
		return typeof value === "string" ? value.trim() : "";
	};
	for (const field of definition.fields ?? []) switch (field.type) {
		case "text":
		case "image":
			if (field.id in form) values[field.id] = str(field.id);
			break;
		case "select":
			if (field.options?.includes(str(field.id))) values[field.id] = str(field.id);
			break;
		case "boolean":
			values[field.id] = form[field.id] === true || form[field.id] === "on";
			break;
		case "items": {
			const list = [];
			for (let index = 0; `${field.id}.${index}.src` in form; index++) {
				const prefix = `${field.id}.${index}`;
				list.push({
					src: str(`${prefix}.src`),
					alt: str(`${prefix}.alt`),
					caption: str(`${prefix}.caption`)
				});
			}
			values[field.id] = list;
			break;
		}
		case "links": {
			const list = [];
			for (let index = 0; `${field.id}.${index}.uuid` in form; index++) {
				const prefix = `${field.id}.${index}`;
				const item = {
					uuid: str(`${prefix}.uuid`),
					label: str(`${prefix}.label`),
					note: str(`${prefix}.note`)
				};
				if (item.uuid || item.label || item.note) list.push(item);
			}
			values[field.id] = list;
			break;
		}
	}
	return values;
}
/** The preset chosen in the form, or null when the form offers none or an unsupported one. */
function readPresetForm(form, presets) {
	const value = form[PRESET_FORM_KEY];
	return typeof value === "string" && presets.some((preset) => preset.id === value) ? value : null;
}
/** Optional sections (`show-<field>` toggles) this edit switches off although the author wrote in them. */
function sectionsToRemove(definition, original, edited, written) {
	return written.filter((id) => {
		const toggle = `show-${id}`;
		return definition.fields?.some((field) => field.id === toggle && field.type === "boolean") && original[toggle] !== false && edited[toggle] === false;
	});
}
function sameValue(a, b) {
	if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
	return a === b;
}
/** The subset of `edited` that differs from `original`. */
function changedValues(original, edited) {
	const changed = {};
	for (const [key, value] of Object.entries(edited)) if (!sameValue(original[key], value)) changed[key] = value;
	return changed;
}
function moveItem(items, index, delta) {
	const target = index + delta;
	if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
	const next = [...items];
	const [moved] = next.splice(index, 1);
	next.splice(target, 0, moved);
	return next;
}
function removeItem(items, index) {
	return items.filter((_, i) => i !== index);
}
/** Append images; the alt text starts as a readable version of the file name, for the author to refine. */
function addItems(items, sources) {
	return [...items, ...sources.map((src) => ({
		src,
		alt: altFromPath(src),
		caption: ""
	}))];
}
/**
* Append document links (dropped from the sidebar or an empty row to fill in). A document already in the list is
* not added twice.
*/
function addLinks(items, documents) {
	const next = [...items];
	for (const { uuid, label } of documents) {
		if (uuid && next.some((item) => item.uuid === uuid)) continue;
		next.push({
			uuid,
			label,
			note: ""
		});
	}
	return next;
}
function altFromPath(path) {
	return safeDecode(path.split("/").at(-1) ?? "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function safeDecode(value) {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}
//#endregion
//#region src/applications/template-editor/template-editor-model.ts
/** Configurable values of a template (sections and options), from its defaults and the given overrides. */
function initialTemplateValues(definition, overrides) {
	const resolved = resolveValues(definition, null, overrides, (key) => key);
	const values = {};
	for (const field of configurableFields(definition)) {
		const value = resolved[field.id];
		if (typeof value === "string" || typeof value === "boolean") values[field.id] = value;
	}
	return values;
}
/** View data for "My Template" settings (spec §32): the inspector's section/option/style groups, no content. */
function buildTemplateEditorModel(input) {
	const inspector = buildInspectorModel(input.definition, input.values, {
		preset: input.preset,
		presets: input.presets
	});
	const configurable = new Set(configurableFields(input.definition).map((field) => field.id));
	const sections = inspector.sections.map((section) => ({
		...section,
		fields: section.fields.filter((field) => field.id === "_preset" || configurable.has(field.id))
	})).filter((section) => section.fields.length);
	return {
		name: input.name,
		description: input.description,
		baseName: input.definition.name,
		sections
	};
}
function readTemplateEditorForm(definition, form, presets) {
	const text = (key) => typeof form[key] === "string" ? form[key].trim() : "";
	const read = readInspectorForm(definition, form);
	const values = {};
	for (const field of configurableFields(definition)) {
		const value = read[field.id];
		if (typeof value === "string" || typeof value === "boolean") values[field.id] = value;
	}
	return {
		name: text("name"),
		description: text("description"),
		preset: readPresetForm(form, presets),
		values
	};
}
//#endregion
//#region src/applications/template-editor/template-editor.ts
var TEMPLATE_DIR$2 = `modules/${MODULE_ID}/templates/applications`;
var SECTIONS_PARTIAL = `${TEMPLATE_DIR$2}/inspector-sections.hbs`;
var editorClass;
/** Open "My Template" settings (spec §32): name, preset, sections and options — never content. */
function openTemplateEditor(runtime, request) {
	const state = resolveRequest(runtime, request);
	if (!state) {
		ui.notifications.warn("LOREFRAME.UserTemplates.Missing", { localize: true });
		return;
	}
	editorClass ??= defineTemplateEditor();
	new editorClass(runtime, state).render({ force: true });
}
function resolveRequest(runtime, request) {
	if (request.mode === "edit") {
		const template = runtime.userTemplates.get(request.id);
		const definition = template ? runtime.core.templates.get(template.base) : void 0;
		if (!template || !definition) return null;
		return {
			...template,
			definition
		};
	}
	const definition = runtime.core.templates.get(request.base);
	if (!definition) return null;
	const presets = runtime.presetsFor(definition);
	const preset = request.preset && presets.some((p) => p.id === request.preset) ? request.preset : null;
	return {
		definition,
		id: null,
		name: request.name ?? game.i18n.localize(definition.name),
		description: "",
		preset: preset ?? presets[0]?.id ?? null,
		values: initialTemplateValues(definition, request.values ?? {})
	};
}
function defineTemplateEditor() {
	const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
	class TemplateEditor extends HandlebarsApplicationMixin(ApplicationV2) {
		static DEFAULT_OPTIONS = {
			classes: [
				"loreframe",
				"loreframe-inspector",
				"loreframe-template-editor"
			],
			tag: "form",
			window: {
				icon: "fa-solid fa-bookmark",
				resizable: true,
				contentClasses: ["standard-form"]
			},
			position: {
				width: 440,
				height: "auto"
			},
			form: {
				handler: submit,
				closeOnSubmit: false,
				submitOnChange: false
			}
		};
		static PARTS = {
			body: {
				template: `${TEMPLATE_DIR$2}/template-editor.hbs`,
				templates: [SECTIONS_PARTIAL],
				scrollable: [".loreframe-inspector__body"]
			},
			footer: { template: `${TEMPLATE_DIR$2}/block-inspector-footer.hbs` }
		};
		#runtime;
		#state;
		constructor(runtime, state) {
			super({
				id: `${MODULE_ID}-template-editor-${state.id ?? `new-${foundry.utils.randomID(8)}`}`,
				window: { title: game.i18n.localize(state.id ? "LOREFRAME.UserTemplates.EditTitle" : "LOREFRAME.UserTemplates.CreateTitle") }
			});
			this.#runtime = runtime;
			this.#state = state;
		}
		async _prepareContext() {
			const { definition, name, description, preset, values } = this.#state;
			return {
				...buildTemplateEditorModel({
					definition,
					name,
					description,
					preset,
					values,
					presets: this.#runtime.presetsFor(definition)
				}),
				idPrefix: this.id,
				submitLabel: "LOREFRAME.UserTemplates.Save"
			};
		}
		async save(form) {
			const { definition, id } = this.#state;
			const result = readTemplateEditorForm(definition, form, this.#runtime.presetsFor(definition));
			if (!result.name) {
				ui.notifications.warn("LOREFRAME.UserTemplates.NameRequired", { localize: true });
				return false;
			}
			try {
				const store = this.#runtime.userTemplates;
				if (id) await store.update(id, result);
				else await store.create({
					...result,
					base: definition.id
				});
			} catch (error) {
				logger.error("Could not save the user template", error);
				ui.notifications.error("LOREFRAME.UserTemplates.SaveFailed", { localize: true });
				return false;
			}
			this.#runtime.notifyUserTemplatesChanged();
			ui.notifications.info("LOREFRAME.UserTemplates.Saved", { format: { name: result.name } });
			return true;
		}
	}
	async function submit(_event, _form, formData) {
		if (await this.save(formData.object)) await this.close();
	}
	return TemplateEditor;
}
//#endregion
//#region src/applications/template-library/library-model.ts
var EMPTY_STATES = /* @__PURE__ */ new Set([
	"favorites",
	"recent",
	"mine"
]);
var FIXED_CATEGORIES = [
	{
		id: "all",
		label: "LOREFRAME.Library.Category.All",
		icon: "fa-solid fa-border-all"
	},
	{
		id: "favorites",
		label: "LOREFRAME.Library.Category.Favorites",
		icon: "fa-solid fa-star"
	},
	{
		id: "recent",
		label: "LOREFRAME.Library.Category.Recent",
		icon: "fa-solid fa-clock-rotate-left"
	},
	{
		id: "mine",
		label: "LOREFRAME.Library.Category.Mine",
		icon: "fa-solid fa-user-pen"
	}
];
var TEMPLATE_CATEGORIES = {
	blocks: {
		label: "LOREFRAME.Library.Category.Blocks",
		icon: "fa-solid fa-square"
	},
	layouts: {
		label: "LOREFRAME.Library.Category.Layouts",
		icon: "fa-solid fa-table-columns"
	},
	npc: {
		label: "LOREFRAME.Library.Category.NPC",
		icon: "fa-solid fa-user"
	},
	locations: {
		label: "LOREFRAME.Library.Category.Locations",
		icon: "fa-solid fa-map-location-dot"
	},
	wiki: {
		label: "LOREFRAME.Library.Category.Wiki",
		icon: "fa-solid fa-book-open"
	},
	gallery: {
		label: "LOREFRAME.Library.Category.Gallery",
		icon: "fa-solid fa-images"
	},
	campaign: {
		label: "LOREFRAME.Library.Category.Campaign",
		icon: "fa-solid fa-flag"
	},
	system: {
		label: "LOREFRAME.Library.Category.System",
		icon: "fa-solid fa-dice-d20"
	}
};
var DEFAULT_ICON = "fa-solid fa-shapes";
function buildLibraryModel(input) {
	const { templates, state, localize } = input;
	const favorites = new Set(input.favorites);
	const builtIn = templates.map((definition) => ({
		id: definition.id,
		definition,
		name: localize(definition.name),
		description: definition.description ? localize(definition.description) : "",
		mine: false,
		preset: void 0
	}));
	const mine = (input.userTemplates ?? []).map((template) => {
		const baseName = localize(template.base.name);
		return {
			id: template.id,
			definition: template.base,
			name: template.name,
			description: template.description || baseName,
			mine: true,
			preset: template.preset
		};
	});
	const all = [...builtIn, ...mine];
	const byId = new Map(all.map((entry) => [entry.id, entry]));
	const members = {
		all,
		favorites: all.filter((entry) => favorites.has(entry.id)),
		recent: input.recent.flatMap((id) => byId.get(id) ?? []),
		mine
	};
	for (const category of Object.keys(TEMPLATE_CATEGORIES)) members[category] = builtIn.filter((entry) => entry.definition.category === category);
	const categories = [...FIXED_CATEGORIES, ...Object.entries(TEMPLATE_CATEGORIES).filter(([id]) => members[id]?.length).map(([id, meta]) => ({
		id,
		...meta
	}))].map((category) => ({
		...category,
		count: members[category.id]?.length ?? 0,
		active: category.id === state.category
	}));
	const cards = (members[state.category] ?? []).map((entry) => {
		const { definition } = entry;
		const baseName = localize(definition.name);
		return {
			id: entry.id,
			name: entry.name,
			description: entry.description,
			icon: definition.icon ?? DEFAULT_ICON,
			thumbnail: definition.thumbnail ?? null,
			favorite: favorites.has(entry.id),
			systemBadge: definition.system ?? null,
			selected: false,
			mine: entry.mine,
			baseName,
			searchText: normalize$1([
				entry.name,
				entry.description,
				baseName,
				definition.description ? localize(definition.description) : "",
				...definition.tags ?? [],
				...definition.aliases ?? [],
				definition.id,
				localize(TEMPLATE_CATEGORIES[definition.category].label)
			].join(" ")),
			previewHtml: "",
			previewError: false
		};
	});
	const matching = cards.filter((card) => matchesQuery(card.searchText, state.query));
	const selected = matching.find((card) => card.id === state.selectedId) ?? matching[0] ?? null;
	const entry = selected ? byId.get(selected.id) : void 0;
	const available = entry && !entry.mine ? input.presetsFor(entry.definition) : [];
	const preset = entry?.mine ? entry.preset ?? null : available.find((p) => p.id === state.preset)?.id ?? available[0]?.id ?? null;
	if (selected) {
		selected.selected = true;
		const html = input.renderPreview(selected.id, preset ?? void 0);
		selected.previewHtml = html ?? "";
		selected.previewError = html === null;
	}
	let empty = null;
	if (!cards.length) empty = EMPTY_STATES.has(state.category) ? state.category : "category";
	return {
		categories,
		cards,
		selected,
		empty,
		canInsert: input.canInsert,
		presets: available.length > 1 && preset !== null ? {
			value: preset,
			options: available.map((p) => ({
				value: p.id,
				label: p.name
			}))
		} : null,
		preset
	};
}
/** Whether every whitespace-separated term of `query` occurs in `searchText`. */
function matchesQuery(searchText, query) {
	const haystack = normalize$1(searchText);
	return normalize$1(query).split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}
function normalize$1(value) {
	return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
//#endregion
//#region src/applications/template-library/template-library.ts
var TEMPLATE_DIR$1 = `modules/${MODULE_ID}/templates/applications`;
var SEARCH_DEBOUNCE_MS = 120;
var applicationClass;
var instance;
/**
* Open the Template Library (spec §14), or bring it forward. `target` pins the editor to insert into;
* otherwise the most recently focused editor is used.
*/
function openTemplateLibrary(runtime, target) {
	applicationClass ??= defineTemplateLibrary();
	instance ??= new applicationClass(runtime);
	instance.setTarget(target ?? null);
	if (instance.rendered) {
		instance.bringToFront();
		instance.render({ parts: ["preview"] });
	} else instance.render({ force: true });
}
/**
* The class is created lazily: Foundry's application base classes only exist once the game is running.
* It only holds UI state; all data shaping happens in `buildLibraryModel`.
*/
function defineTemplateLibrary() {
	const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
	class TemplateLibrary extends HandlebarsApplicationMixin(ApplicationV2) {
		static DEFAULT_OPTIONS = {
			id: `${MODULE_ID}-template-library`,
			classes: ["loreframe", "loreframe-library"],
			window: {
				title: "LOREFRAME.Library.Title",
				icon: "fa-solid fa-swatchbook",
				resizable: true
			},
			position: {
				width: 960,
				height: 620
			},
			actions: {
				selectCategory: action((app, target) => app.#selectCategory(target)),
				selectTemplate: action((app, target, event) => app.#selectTemplate(target, event)),
				toggleFavorite: action((app, target) => app.#toggleFavorite(target)),
				insert: action((app) => app.#insertSelected()),
				customize: action((app) => app.#customize()),
				editTemplate: action((app) => app.#editSelected()),
				duplicateTemplate: action((app) => app.#duplicateSelected()),
				deleteTemplate: action((app) => app.#deleteSelected()),
				exportTemplates: action((app, target) => app.#export(target.dataset.scope === "selected")),
				importTemplates: action((app) => app.#chooseImportFile())
			}
		};
		static PARTS = {
			nav: { template: `${TEMPLATE_DIR$1}/library-nav.hbs` },
			browser: {
				template: `${TEMPLATE_DIR$1}/library-browser.hbs`,
				scrollable: [".loreframe-library__results"]
			},
			preview: {
				template: `${TEMPLATE_DIR$1}/library-preview.hbs`,
				scrollable: [".loreframe-library__preview-body"]
			}
		};
		#runtime;
		#state = {
			category: "all",
			query: "",
			selectedId: null,
			preset: null
		};
		#target = null;
		#searchTimer;
		#unsubscribe = null;
		constructor(runtime) {
			super();
			this.#runtime = runtime;
		}
		#unwatchEditors = null;
		#couldInsert = null;
		async close(options) {
			this.#unsubscribe?.();
			this.#unsubscribe = null;
			this.#unwatchEditors?.();
			this.#unwatchEditors = null;
			return super.close(options);
		}
		setTarget(target) {
			this.#target = target;
		}
		async _prepareContext() {
			const { preferences } = this.#runtime;
			const model = buildLibraryModel({
				templates: this.#runtime.availableTemplates(),
				favorites: preferences.favorites(),
				recent: preferences.recent(),
				state: this.#state,
				localize: (key) => game.i18n.localize(key),
				renderPreview: (id, preset) => this.#runtime.renderPreview(id, preset),
				presetsFor: (definition) => this.#runtime.presetsFor(definition),
				canInsert: this.#insertTarget() !== null,
				userTemplates: this.#runtime.libraryUserTemplates()
			});
			this.#unsubscribe ??= this.#runtime.onUserTemplatesChanged(() => {
				if (this.rendered) this.render({ parts: [
					"nav",
					"browser",
					"preview"
				] });
			});
			this.#couldInsert = model.canInsert;
			this.#unwatchEditors ??= this.#runtime.tracker.onChange(() => {
				if (this.rendered && this.#insertTarget() !== null !== this.#couldInsert) this.render({ parts: ["preview"] });
			});
			this.#state.selectedId = model.selected?.id ?? null;
			if (model.preset !== null) this.#state.preset = model.preset;
			return {
				...model,
				query: this.#state.query,
				mineCategory: this.#state.category === "mine"
			};
		}
		_attachPartListeners(partId, html, options) {
			super._attachPartListeners(partId, html, options);
			if (partId === "preview") {
				html.querySelector("select[name=preset]")?.addEventListener("change", (event) => {
					this.#state.preset = event.currentTarget.value;
					this.render({ parts: ["preview"] });
				});
				return;
			}
			if (partId !== "browser") return;
			html.querySelector("input[name=importFile]")?.addEventListener("change", (event) => {
				const input = event.currentTarget;
				const file = input.files?.[0];
				input.value = "";
				if (file) this.#import(file);
			});
			const search = html.querySelector("input[name=query]");
			search?.addEventListener("input", () => {
				clearTimeout(this.#searchTimer);
				this.#searchTimer = setTimeout(() => {
					this.#state.query = search.value;
					this.#applySearch(html);
					this.#refreshSelection(html);
				}, SEARCH_DEBOUNCE_MS);
			});
			html.querySelector(".loreframe-library__grid")?.addEventListener("dblclick", (event) => {
				if (event.target.closest("[data-template-id]") && !event.target.closest(".loreframe-library__favorite")) this.#insertSelected();
			});
			this.#applySearch(html);
		}
		/** The editor to insert into: the pinned one while it is usable, else the most recently focused one. */
		#insertTarget() {
			const pinned = this.#target;
			if (pinned && !pinned.isDestroyed && pinned.dom.isConnected && pinned.editable) return pinned;
			return this.#runtime.tracker.active();
		}
		/** Filter rendered cards in place — no re-render per keystroke (spec §15, §42). */
		#applySearch(html) {
			const cards = html.querySelectorAll(".loreframe-library__card");
			let visible = 0;
			for (const card of cards) {
				const match = matchesQuery(card.dataset.search ?? "", this.#state.query);
				card.hidden = !match;
				if (match) visible++;
			}
			const noResults = html.querySelector(".loreframe-library__no-results");
			if (noResults) noResults.hidden = visible > 0 || cards.length === 0;
		}
		/** The selection must stay visible: re-render the preview and mirror the selection onto the cards. */
		async #refreshSelection(browser) {
			const previous = this.#state.selectedId;
			await this.render({ parts: ["preview"] });
			if (this.#state.selectedId === previous) return;
			for (const card of browser.querySelectorAll(".loreframe-library__card")) {
				const selected = card.dataset.templateId === this.#state.selectedId;
				card.classList.toggle("loreframe-library__card--selected", selected);
				card.querySelector(".loreframe-library__card-main")?.setAttribute("aria-pressed", String(selected));
			}
		}
		#selectCategory(target) {
			const category = target.dataset.category;
			if (!category || category === this.#state.category) return;
			this.#state.category = category;
			this.#state.selectedId = null;
			this.render({ parts: [
				"nav",
				"browser",
				"preview"
			] });
		}
		#selectTemplate(target, event) {
			const id = target.closest("[data-template-id]")?.dataset.templateId;
			if (!id) return;
			if (id === this.#state.selectedId && event.detail === 0) {
				this.#insertSelected();
				return;
			}
			if (id === this.#state.selectedId) return;
			this.#state.selectedId = id;
			this.render({ parts: ["browser", "preview"] });
		}
		async #toggleFavorite(target) {
			const id = target.closest("[data-template-id]")?.dataset.templateId;
			if (!id) return;
			try {
				await this.#runtime.preferences.toggleFavorite(id);
			} catch (error) {
				logger.error(`Could not update favorite "${id}"`, error);
				ui.notifications.error("LOREFRAME.Error.PreferencesFailed", { localize: true });
				return;
			}
			if (game.tooltip.element && this.element.contains(game.tooltip.element)) game.tooltip.deactivate();
			await this.render({ parts: ["nav", "browser"] });
		}
		/** Start a user template from the selected template (with the preset chosen in the preview). */
		#customize() {
			const id = this.#state.selectedId;
			if (!id) return;
			if (this.#runtime.userTemplates.get(id)) {
				this.#editSelected();
				return;
			}
			openTemplateEditor(this.#runtime, {
				mode: "create",
				base: id,
				preset: this.#state.preset
			});
		}
		#editSelected() {
			const id = this.#state.selectedId;
			if (id && this.#runtime.userTemplates.get(id)) openTemplateEditor(this.#runtime, {
				mode: "edit",
				id
			});
		}
		async #duplicateSelected() {
			const template = this.#state.selectedId ? this.#runtime.userTemplates.get(this.#state.selectedId) : null;
			if (!template) return;
			const name = game.i18n.format("LOREFRAME.UserTemplates.CopyName", { name: template.name }).slice(0, 80);
			await this.#changeUserTemplates(async (store) => {
				const copy = await store.duplicate(template.id, name);
				this.#state.selectedId = copy.id;
			});
		}
		async #deleteSelected() {
			const template = this.#state.selectedId ? this.#runtime.userTemplates.get(this.#state.selectedId) : null;
			if (!template) return;
			if (await foundry.applications.api.DialogV2.confirm({
				window: {
					title: game.i18n.localize("LOREFRAME.UserTemplates.DeleteTitle"),
					icon: "fa-solid fa-trash"
				},
				content: `<p>${game.i18n.format("LOREFRAME.UserTemplates.DeleteContent", { name: escapeHtml(template.name) })}</p>`,
				modal: true,
				yes: {
					label: game.i18n.localize("LOREFRAME.UserTemplates.Delete"),
					icon: "fa-solid fa-trash"
				}
			}) !== true) return;
			await this.#changeUserTemplates(async (store) => {
				await store.remove(template.id);
				this.#state.selectedId = null;
			});
		}
		/** Download a JSON package of the selected user template, or of all of them. */
		#export(selectedOnly) {
			const store = this.#runtime.userTemplates;
			const ids = selectedOnly && this.#state.selectedId ? [this.#state.selectedId] : void 0;
			if (!store.list().some((template) => !ids || ids.includes(template.id))) {
				ui.notifications.warn("LOREFRAME.UserTemplates.NothingToExport", { localize: true });
				return;
			}
			foundry.utils.saveDataToFile(store.exportJson(ids), "application/json", "loreframe-templates.json");
		}
		#chooseImportFile() {
			this.element.querySelector("input[name=importFile]")?.click();
		}
		async #import(file) {
			try {
				const text = await foundry.utils.readTextFromFile(file);
				const result = await this.#runtime.userTemplates.import(text);
				this.#runtime.notifyUserTemplatesChanged();
				ui.notifications.info("LOREFRAME.UserTemplates.Imported", { format: {
					added: String(result.added),
					skipped: String(result.skipped)
				} });
			} catch (error) {
				logger.warn("Template import rejected", error);
				ui.notifications.error("LOREFRAME.UserTemplates.ImportFailed", { localize: true });
			}
		}
		async #changeUserTemplates(change) {
			try {
				await change(this.#runtime.userTemplates);
			} catch (error) {
				logger.error("Could not update user templates", error);
				ui.notifications.error("LOREFRAME.UserTemplates.SaveFailed", { localize: true });
				return;
			}
			this.#runtime.notifyUserTemplatesChanged();
		}
		#insertSelected() {
			const id = this.#state.selectedId;
			if (!id) return;
			const view = this.#insertTarget();
			if (!view) {
				ui.notifications.warn("LOREFRAME.Error.NoEditor", { localize: true });
				return;
			}
			const definition = this.#runtime.core.templates.get(id);
			const preset = (definition ? this.#runtime.presetsFor(definition) : []).find((p) => p.id === this.#state.preset)?.id;
			if (this.#runtime.insertEntry(view, id, preset)) this.render({ parts: ["nav"] });
		}
	}
	/** Adapt a private-method handler to Foundry's `actions` signature (`this` is the application). */
	function action(handler) {
		return function(event, target) {
			return handler(this, target, event);
		};
	}
	return TemplateLibrary;
}
//#endregion
//#region src/core/instance-id.ts
/** A new identifier for an inserted Loreframe block instance. */
function newInstanceId() {
	return foundry.utils.randomID(16);
}
//#endregion
//#region src/core/settings.ts
var DEFINITIONS = {
	[SETTINGS.debug]: {
		name: "LOREFRAME.Settings.Debug.Name",
		hint: "LOREFRAME.Settings.Debug.Hint",
		scope: "client",
		config: true,
		type: Boolean,
		default: false,
		onChange: (enabled) => setDebugLogging(enabled)
	},
	[SETTINGS.favorites]: {
		scope: "client",
		config: false,
		type: Array,
		default: []
	},
	[SETTINGS.recent]: {
		scope: "client",
		config: false,
		type: Array,
		default: []
	},
	[SETTINGS.userTemplates]: {
		scope: "user",
		config: false,
		type: Array,
		default: []
	},
	[SETTINGS.enableIntegrations]: {
		name: "LOREFRAME.Settings.EnableIntegrations.Name",
		hint: "LOREFRAME.Settings.EnableIntegrations.Hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: true,
		requiresReload: true
	}
};
function registerSettings() {
	for (const [key, data] of Object.entries(DEFINITIONS)) game.settings.register(MODULE_ID, key, data);
	setDebugLogging(getSetting(SETTINGS.debug));
}
function getSetting(key) {
	return game.settings.get(MODULE_ID, key);
}
//#endregion
//#region src/applications/block-inspector/block-inspector.ts
var TEMPLATE_DIR = `modules/${MODULE_ID}/templates/applications`;
var emptyLink = {
	uuid: "",
	label: ""
};
var inspectorClass;
var open = /* @__PURE__ */ new Map();
/** Open the inspector for one block (spec §24), or bring its existing window forward. */
async function openBlockInspector(runtime, view, instanceId) {
	const existing = open.get(instanceId);
	if (existing?.rendered) {
		existing.bringToFront();
		return;
	}
	let block = runtime.readBlock(view, instanceId);
	if (!block) {
		ui.notifications.warn("LOREFRAME.Error.BlockMissing", { localize: true });
		return;
	}
	if (block.version === "outdated") {
		if (await foundry.applications.api.DialogV2.confirm({
			window: {
				title: game.i18n.localize("LOREFRAME.Migration.Title"),
				icon: "fa-solid fa-arrows-rotate"
			},
			content: `<p>${game.i18n.localize("LOREFRAME.Migration.Content")}</p>`,
			modal: true,
			yes: {
				label: game.i18n.localize("LOREFRAME.Migration.Confirm"),
				icon: "fa-solid fa-arrows-rotate"
			}
		}) !== true || !runtime.migrateBlock(view, instanceId)) return;
		block = runtime.readBlock(view, instanceId);
	}
	if (!block || block.version !== "current") {
		ui.notifications.warn("LOREFRAME.Error.BlockVersion", { localize: true });
		return;
	}
	inspectorClass ??= defineBlockInspector();
	const app = new inspectorClass({
		runtime,
		view,
		instanceId,
		...block
	});
	open.set(instanceId, app);
	await app.render({
		force: true,
		position: besideEditor(view)
	});
}
var INSPECTOR_WIDTH = 460;
var MARGIN = 8;
/** Next to the window holding the editor: right of it when it fits, else left of it, else over its right edge. */
function besideEditor(view) {
	const frame = view.dom.closest(".application")?.getBoundingClientRect();
	if (!frame) return void 0;
	const right = frame.right + MARGIN;
	return {
		left: right + INSPECTOR_WIDTH <= window.innerWidth ? right : frame.left - MARGIN - INSPECTOR_WIDTH >= 0 ? frame.left - MARGIN - INSPECTOR_WIDTH : Math.max(MARGIN, frame.right - INSPECTOR_WIDTH - MARGIN),
		top: Math.max(MARGIN, frame.top)
	};
}
/** Created lazily: Foundry's application classes exist only once the game runs. */
function defineBlockInspector() {
	const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
	class BlockInspector extends HandlebarsApplicationMixin(ApplicationV2) {
		static DEFAULT_OPTIONS = {
			classes: ["loreframe", "loreframe-inspector"],
			tag: "form",
			window: {
				icon: "fa-solid fa-sliders",
				resizable: true,
				contentClasses: ["standard-form"]
			},
			position: {
				width: INSPECTOR_WIDTH,
				height: "auto"
			},
			form: {
				handler: submit,
				closeOnSubmit: false,
				submitOnChange: false
			},
			actions: {
				addItem: action((app, target) => app.#addImage(listOf(target))),
				saveAsTemplate: action((app) => app.#saveAsTemplate()),
				addLink: action((app, target) => app.#changeList(listOf(target), (items) => addLinks(items, [emptyLink]))),
				removeItem: action((app, target) => app.#changeList(listOf(target), (items) => removeItem(items, indexOf(target)))),
				moveItemUp: action((app, target) => app.#changeList(listOf(target), (items) => moveItem(items, indexOf(target), -1))),
				moveItemDown: action((app, target) => app.#changeList(listOf(target), (items) => moveItem(items, indexOf(target), 1)))
			}
		};
		static PARTS = {
			body: {
				template: `${TEMPLATE_DIR}/block-inspector.hbs`,
				templates: [`${TEMPLATE_DIR}/inspector-sections.hbs`],
				scrollable: [".loreframe-inspector__body"]
			},
			footer: { template: `${TEMPLATE_DIR}/block-inspector-footer.hbs` }
		};
		#target;
		/** Edits made so far (form inputs are folded in before every re-render). */
		#values;
		#preset;
		constructor(target) {
			super({
				id: `${MODULE_ID}-inspector-${target.instanceId}`,
				window: { title: game.i18n.format("LOREFRAME.Inspector.Title", { name: game.i18n.localize(target.definition.name) }) }
			});
			this.#target = target;
			this.#values = structuredClone(target.values);
			this.#preset = target.preset;
		}
		get #presets() {
			return this.#target.runtime.presetsFor(this.#target.definition);
		}
		async _prepareContext() {
			return {
				...buildInspectorModel(this.#target.definition, this.#values, {
					preset: this.#preset,
					presets: this.#presets
				}),
				instanceId: this.#target.instanceId,
				canSaveTemplate: configurableFields(this.#target.definition).length > 0
			};
		}
		_attachPartListeners(partId, html, options) {
			super._attachPartListeners(partId, html, options);
			for (const zone of html.querySelectorAll("[data-drop-list]")) {
				zone.addEventListener("dragover", (event) => {
					event.preventDefault();
					zone.classList.add("loreframe-inspector__links--drop");
				});
				zone.addEventListener("dragleave", () => zone.classList.remove("loreframe-inspector__links--drop"));
				zone.addEventListener("drop", (event) => {
					event.preventDefault();
					zone.classList.remove("loreframe-inspector__links--drop");
					this.#dropLink(zone.dataset.dropList ?? "", event);
				});
			}
		}
		async close(options) {
			open.delete(this.#target.instanceId);
			return super.close(options);
		}
		/** Called by the form handler. Resolves false when the author cancelled, so the window stays open. */
		async apply(formValues) {
			const { runtime, view, instanceId, definition } = this.#target;
			const edited = readInspectorForm(definition, formValues);
			const changed = changedValues(this.#target.values, edited);
			const chosen = readPresetForm(formValues, this.#presets);
			const preset = chosen !== null && chosen !== this.#target.preset ? chosen : void 0;
			if (!Object.keys(changed).length && preset === void 0) return true;
			const removed = sectionsToRemove(definition, runtime.readBlock(view, instanceId)?.values ?? this.#target.values, edited, runtime.writtenFields(view, instanceId));
			if (removed.length && !await confirmRemoval(definition.fields ?? [], removed)) return false;
			runtime.updateBlock(view, instanceId, changed, preset);
			return true;
		}
		#readForm() {
			const form = this.element instanceof HTMLFormElement ? this.element : null;
			if (!form) return;
			const data = new foundry.applications.ux.FormDataExtended(form).object;
			this.#values = {
				...this.#values,
				...readInspectorForm(this.#target.definition, data)
			};
			this.#preset = readPresetForm(data, this.#presets) ?? this.#preset;
		}
		/** Keep the current section, option and preset choices as a "My Template" (spec §32). */
		#saveAsTemplate() {
			this.#readForm();
			const { runtime, definition } = this.#target;
			openTemplateEditor(runtime, {
				mode: "create",
				base: definition.id,
				preset: this.#preset,
				values: this.#values
			});
		}
		/** Apply a change to one list field (images or links), keeping everything typed so far. */
		#changeList(fieldId, change) {
			const field = this.#target.definition.fields?.find((f) => f.id === fieldId);
			if (field?.type !== "items" && field?.type !== "links") return;
			this.#readForm();
			const value = this.#values[fieldId];
			const items = Array.isArray(value) ? value : [];
			this.#values = {
				...this.#values,
				[fieldId]: [...change(items)]
			};
			this.render();
		}
		#addImage(fieldId) {
			const { FilePicker } = foundry.applications.apps;
			new FilePicker.implementation({
				type: "image",
				callback: (path) => this.#changeList(fieldId, (items) => addItems(items, [path]))
			}).browse().catch((error) => logger.error("Could not open the file picker", error));
		}
		/** A document dragged from the sidebar (or a compendium) becomes a linked entry named after it. */
		async #dropLink(fieldId, event) {
			const { TextEditor } = foundry.applications.ux;
			const data = TextEditor.implementation.getDragEventData(event);
			const uuid = typeof data.uuid === "string" ? data.uuid : "";
			if (!uuid) return;
			let label = "";
			try {
				label = (await foundry.utils.fromUuid(uuid))?.name ?? "";
			} catch (error) {
				logger.warn(`Could not resolve dropped document "${uuid}"`, error);
			}
			this.#changeList(fieldId, (items) => addLinks(items, [{
				uuid,
				label
			}]));
		}
	}
	function action(handler) {
		return function(_event, target) {
			return handler(this, target);
		};
	}
	async function submit(_event, _form, formData) {
		if (await this.apply(formData.object)) await this.close();
	}
	/** Ask before an edit removes sections that contain the author's text. "No" is the default button. */
	async function confirmRemoval(fields, removed) {
		const names = removed.map((id) => {
			const label = (fields.find((field) => field.id === `show-${id}`) ?? fields.find((field) => field.id === id))?.label;
			return escapeHtml(label ? game.i18n.localize(label) : id);
		});
		return await foundry.applications.api.DialogV2.confirm({
			window: {
				title: game.i18n.localize("LOREFRAME.Inspector.DropSections.Title"),
				icon: "fa-solid fa-trash"
			},
			content: `<p>${game.i18n.format("LOREFRAME.Inspector.DropSections.Content", { sections: names.join(", ") })}</p>`,
			modal: true,
			yes: {
				label: game.i18n.localize("LOREFRAME.Inspector.DropSections.Confirm"),
				icon: "fa-solid fa-trash"
			}
		}) === true;
	}
	function listOf(target) {
		return target.closest("[data-list]")?.dataset.list ?? "";
	}
	function indexOf(target) {
		return Number(target.closest("[data-index]")?.dataset.index ?? -1);
	}
	return BlockInspector;
}
//#endregion
//#region src/editor/node-attrs.ts
function getHtmlAttribute(node, name) {
	const preserved = node.attrs._preserve;
	if (typeof preserved !== "object" || preserved === null) return void 0;
	const value = preserved[name];
	return typeof value === "string" ? value : void 0;
}
/** Whether the node is the root element of a Loreframe block. */
function isLoreframeRoot(node) {
	return getHtmlAttribute(node, DATA_ATTR.template) !== void 0;
}
/** Whether the node is a slot region inside a block, where other blocks may be nested. */
function isLoreframeSlot(node) {
	return getHtmlAttribute(node, DATA_ATTR.slot) !== void 0;
}
/** Node attrs with one HTML attribute replaced, for `tr.setNodeMarkup`. */
function withHtmlAttribute(node, name, value) {
	const preserved = node.attrs._preserve;
	const base = typeof preserved === "object" && preserved !== null ? preserved : {};
	return {
		...node.attrs,
		_preserve: {
			...base,
			[name]: value
		}
	};
}
/** Foundry's secret node (common/prosemirror/schema/secret-node.mjs). */
function isFoundrySecret(node) {
	return node.type.name === "secret";
}
/** A secret that exists only to hide one Loreframe block (see TemplateRenderer). It belongs to that block. */
function isSecretWrapper(node) {
	return isFoundrySecret(node) && node.childCount === 1 && node.firstChild !== null && isLoreframeRoot(node.firstChild);
}
/** Identifiers that must stay unique in a document: block instance ids and Foundry secret ids. */
function identityOf(node) {
	const instance = getHtmlAttribute(node, DATA_ATTR.instance);
	if (instance) return {
		key: `instance:${instance}`,
		renamed: (freshId) => withHtmlAttribute(node, DATA_ATTR.instance, freshId)
	};
	const secretId = isFoundrySecret(node) ? node.attrs.id : void 0;
	if (typeof secretId === "string" && secretId) return {
		key: `secret:${secretId}`,
		renamed: (freshId) => ({
			...node.attrs,
			id: `secret-${freshId}`
		})
	};
	return null;
}
//#endregion
//#region src/editor/block-integrity-plugin.ts
var COPY_EVENTS = /* @__PURE__ */ new Set(["paste", "drop"]);
/** Marker prosemirror-view reads to treat clipboard HTML as a closed slice ("openStart openEnd context"). */
var CLOSED_SLICE = "0 0 []";
var BLOCK_CONTAINERS = /* @__PURE__ */ new Set([
	"ASIDE",
	"DIV",
	"SECTION",
	"HEADER",
	"FOOTER",
	"ARTICLE",
	"UL",
	"OL",
	"LI",
	"BLOCKQUOTE",
	"FIGURE"
]);
var IGNORED_TOP_LEVEL = /* @__PURE__ */ new Set([
	"META",
	"STYLE",
	"LINK",
	"TITLE"
]);
/**
* Keeps Loreframe blocks whole and uniquely identified through copy and paste:
* - clipboard HTML holding a block at top level is parsed as a closed slice, so ProseMirror does not
*   dissolve the block into the surrounding paragraph (HTML copied outside the editor has no slice marker);
* - pasted or dropped copies get new instance ids (and Foundry secret ids); the pre-existing node keeps its id,
*   a moved node keeps its id.
* Ordinary edits are ignored, so the document is never scanned on keystrokes.
*/
function buildBlockIntegrityPlugin({ Plugin, newInstanceId }) {
	return new Plugin({
		props: { transformPastedHTML: (html) => closeClipboardSlice(html) },
		appendTransaction(transactions, oldState, newState) {
			if (!transactions.some((tr) => tr.docChanged && COPY_EVENTS.has(String(tr.getMeta("uiEvent"))))) return null;
			const anchors = /* @__PURE__ */ new Map();
			oldState.doc.descendants((node, pos) => {
				const key = identityOf(node)?.key;
				if (!key || anchors.has(key)) return;
				let mapped = pos;
				for (const tr of transactions) {
					if (mapped === null) break;
					const result = tr.mapping.mapResult(mapped, 1);
					mapped = result.deleted ? null : result.pos;
				}
				anchors.set(key, mapped);
			});
			const seen = /* @__PURE__ */ new Set();
			const tr = newState.tr;
			newState.doc.descendants((node, pos) => {
				const identity = identityOf(node);
				if (!identity) return;
				const anchor = anchors.get(identity.key);
				const keep = anchor === void 0 || anchor === null ? !seen.has(identity.key) : anchor === pos;
				seen.add(identity.key);
				if (!keep) tr.setNodeMarkup(pos, void 0, identity.renamed(newInstanceId()));
			});
			return tr.docChanged ? tr : null;
		}
	});
}
/**
* Mark foreign clipboard HTML that carries a Loreframe block at top level as a closed slice.
* HTML produced by ProseMirror itself (already marked) and HTML without top-level blocks pass through unchanged.
*/
function closeClipboardSlice(html) {
	const template = document.createElement("template");
	template.innerHTML = html;
	const root = template.content;
	if (root.querySelector("[data-pm-slice]")) return html;
	const topLevel = [...root.children].filter((el) => !IGNORED_TOP_LEVEL.has(el.tagName));
	if (!topLevel.some(isBlockOrWrappedBlock)) return html;
	removeBlockWhitespace(root);
	topLevel[0]?.setAttribute("data-pm-slice", CLOSED_SLICE);
	return template.innerHTML;
}
/** A block root, or a bare secret section wrapping one (GM-only templates). */
function isBlockOrWrappedBlock(el) {
	if (el.hasAttribute(DATA_ATTR.template)) return true;
	const only = el.childElementCount === 1 ? el.firstElementChild : null;
	return el.matches("section.secret") && only !== null && only.hasAttribute(DATA_ATTR.template);
}
function removeBlockWhitespace(parent) {
	for (const child of [...parent.childNodes]) if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim()) child.remove();
	else if (child.nodeType === Node.COMMENT_NODE) child.remove();
	else if (child instanceof Element && BLOCK_CONTAINERS.has(child.tagName)) removeBlockWhitespace(child);
}
//#endregion
//#region src/core/template-parser.ts
var BLOCK_SELECTOR = `[${DATA_ATTR.template}]`;
var FIELD_SELECTOR = `[${DATA_ATTR.field}]`;
/** Template versions are positive integers (TemplateRegistry). */
var VERSION_PATTERN = /^[1-9]\d*$/;
/**
* Find Loreframe blocks under `root` (inclusive) in document order. Identification relies only on
* `data-loreframe-*` attributes, never on styling classes (spec §10). Nothing is modified.
*/
function parseBlocks(root, templates) {
	const elements = [...root.querySelectorAll(BLOCK_SELECTOR)];
	if (root instanceof Element && root.matches(BLOCK_SELECTOR)) elements.unshift(root);
	return elements.map((element) => parseBlock(element, templates));
}
function parseBlock(element, templates) {
	const templateId = element.getAttribute(DATA_ATTR.template) ?? "";
	const rawVersion = element.getAttribute(DATA_ATTR.version);
	const version = rawVersion !== null && VERSION_PATTERN.test(rawVersion) ? Number(rawVersion) : null;
	return {
		element,
		templateId,
		version,
		instanceId: element.getAttribute(DATA_ATTR.instance),
		preset: element.getAttribute(DATA_ATTR.preset),
		status: statusOf(templateId, version, templates),
		fields: ownFields(element)
	};
}
function statusOf(templateId, version, templates) {
	const definition = templates.get(templateId);
	if (!definition) return "unknown";
	if (version === null) return "invalid";
	if (version < definition.version) return "outdated";
	if (version > definition.version) return "newer";
	return "current";
}
/** Field elements whose nearest enclosing block is `block`. First occurrence of a field name wins. */
function ownFields(block) {
	const fields = /* @__PURE__ */ new Map();
	for (const field of block.querySelectorAll(FIELD_SELECTOR)) {
		if (field.parentElement?.closest(BLOCK_SELECTOR) !== block) continue;
		const name = field.getAttribute(DATA_ATTR.field) ?? "";
		if (!fields.has(name)) fields.set(name, field);
	}
	return fields;
}
//#endregion
//#region src/editor/block-document.ts
function locationFor(root, rootPos, $root) {
	const wrapped = $root.depth > 0 && isSecretWrapper($root.parent);
	return {
		templateId: getHtmlAttribute(root, DATA_ATTR.template) ?? "",
		instanceId: getHtmlAttribute(root, DATA_ATTR.instance) ?? "",
		root,
		rootPos,
		host: wrapped ? $root.parent : root,
		hostPos: wrapped ? $root.before() : rootPos
	};
}
/** The block with the given instance id, or null when it no longer exists. */
function locateBlock(doc, instanceId) {
	let found = null;
	doc.descendants((node, pos) => {
		if (found) return false;
		if (isLoreframeRoot(node) && getHtmlAttribute(node, DATA_ATTR.instance) === instanceId) {
			found = locationFor(node, pos, doc.resolve(pos));
			return false;
		}
		return true;
	});
	return found;
}
/** The innermost block that contains `$pos` (slots do not stop the search: the toolbar targets the nearest block). */
function blockAt($pos) {
	for (let depth = $pos.depth; depth > 0; depth--) {
		const node = $pos.node(depth);
		if (isLoreframeRoot(node)) {
			const rootPos = $pos.before(depth);
			return locationFor(node, rootPos, $pos.doc.resolve(rootPos));
		}
	}
	return null;
}
/**
* How a block's stored version relates to its registered template (same rules as the template parser). Only
* current blocks may be rebuilt: rendering a newer or invalid block with this template would destroy its markup.
*/
function blockVersionState(root, definition) {
	const raw = getHtmlAttribute(root, DATA_ATTR.version);
	if (raw === void 0 || !VERSION_PATTERN.test(raw)) return "invalid";
	const version = Number(raw);
	if (version === definition.version) return "current";
	return version < definition.version ? "outdated" : "newer";
}
/**
* Bring one outdated block (with its secret wrapper) to the current template version (spec §46). The migration runs
* on a copy of the block's HTML; on any issue the document is left untouched.
*/
function migrateBlockTransaction(state, location, deps) {
	const result = deps.migrations.migrateHtml(deps.serialize(location.host));
	const issue = result.issues.find((entry) => entry.instanceId === location.instanceId);
	if (issue) return {
		ok: false,
		issue: issue.kind
	};
	const migrated = result.changed ? deps.parse(result.html) : null;
	if (!migrated || migrated.childCount !== 1 || !migrated.firstChild) return {
		ok: false,
		issue: "unchanged"
	};
	const { hostPos, host } = location;
	return {
		ok: true,
		tr: state.tr.replaceWith(hostPos, hostPos + host.nodeSize, migrated.firstChild)
	};
}
/** The first node inside `root` named `name` (field or slot), not looking into nested blocks. */
function findRegion(root, name, attr) {
	let found = null;
	root.descendants((node) => {
		if (found) return false;
		if (isLoreframeRoot(node)) return false;
		if (getHtmlAttribute(node, attr) === name) {
			found = node;
			return false;
		}
		return true;
	});
	return found;
}
function firstImage(node) {
	let found = null;
	node.descendants((child) => {
		if (found) return false;
		if (child.type.name === "image") found = child;
		return !found;
	});
	return found;
}
function imageSource(image) {
	const src = image?.attrs.src;
	return typeof src === "string" && src !== PLACEHOLDER_IMAGE ? src : "";
}
function textAttr(node, name) {
	const value = node?.attrs[name];
	return typeof value === "string" ? value : "";
}
function readItems(region) {
	const items = [];
	region.forEach((figure) => {
		if (figure.type.name !== "figure") return;
		const image = firstImage(figure);
		let caption = "";
		figure.forEach((child) => {
			if (child.type.name === "figcaption") caption = child.textContent;
		});
		items.push({
			src: imageSource(image),
			alt: textAttr(image, "alt"),
			caption
		});
	});
	return items;
}
function readLinks(region) {
	const items = [];
	region.forEach((item) => {
		if (item.type.name !== "list_item") return;
		const paragraphs = [];
		item.forEach((child) => {
			if (child.isTextblock) paragraphs.push(child.textContent);
		});
		const [link = "", ...notes] = paragraphs;
		const parsed = parseLink(link);
		if (!parsed.uuid && !parsed.label) return;
		items.push({
			...parsed,
			note: notes.join(" ").trim()
		});
	});
	return items;
}
/**
* Property values of a block as stored in the document. Rich-text fields are not read: they are edited in the
* Journal editor and preserved by `rebuildBlockTransaction`.
*/
function readBlockValues(root, definition) {
	const values = {};
	for (const field of definition.fields ?? []) switch (field.type) {
		case "select":
		case "boolean": {
			const raw = getHtmlAttribute(root, `${DATA_ATTR.optionPrefix}${field.id}`);
			if (raw === void 0) break;
			values[field.id] = field.type === "boolean" ? raw === "true" : raw;
			break;
		}
		case "image": {
			const region = findRegion(root, field.id, DATA_ATTR.field);
			if (region) values[field.id] = imageSource(firstImage(region));
			break;
		}
		case "text":
			if (field.imageAltFor) {
				const region = findRegion(root, field.imageAltFor, DATA_ATTR.field);
				if (region) values[field.id] = textAttr(firstImage(region), "alt");
				break;
			}
			values[field.id] = findRegion(root, field.id, DATA_ATTR.field)?.textContent ?? "";
			break;
		case "items": {
			const region = findRegion(root, field.id, DATA_ATTR.field);
			if (region) values[field.id] = readItems(region);
			break;
		}
		case "links": {
			const region = findRegion(root, field.id, DATA_ATTR.field);
			values[field.id] = region ? readLinks(region) : [];
			break;
		}
	}
	return values;
}
/** Structural equality that ignores identifiers generated while parsing (Foundry secret ids). */
function sameContent(a, b) {
	if (a.type !== b.type || a.childCount !== b.childCount || !sameMarks(a, b)) return false;
	if (a.isText) return a.text === b.text;
	const comparable = (node) => JSON.stringify(isFoundrySecret(node) ? {
		...node.attrs,
		id: null
	} : node.attrs);
	if (comparable(a) !== comparable(b)) return false;
	for (let i = 0; i < a.childCount; i++) if (!sameContent(a.child(i), b.child(i))) return false;
	return true;
}
function sameMarks(a, b) {
	return a.marks.length === b.marks.length && a.marks.every((mark, i) => b.marks[i]?.eq(mark) === true);
}
/** Whether a region holds anything worth keeping: text, images or nested blocks. */
function hasContent(region) {
	if (region.textContent.trim()) return true;
	let found = false;
	region.descendants((node) => {
		if (node.type.name === "image" || isLoreframeRoot(node)) found = true;
		return !found;
	});
	return found;
}
/**
* Rich-text fields and slots the author has changed: they hold content and differ from the same region of
* `fresh` (the block rendered with default values). Used to confirm before a toggle removes them.
*/
function writtenRegions(root, fresh, definition) {
	return [...(definition.fields ?? []).filter((f) => f.type === "richText").map((f) => [f.id, DATA_ATTR.field]), ...(definition.slots ?? []).map((slot) => [slot, DATA_ATTR.slot])].filter(([id, attr]) => {
		const written = findRegion(root, id, attr);
		if (!written || !hasContent(written)) return false;
		const original = findRegion(fresh, id, attr);
		return !original || !sameContent(written, original);
	}).map(([id]) => id);
}
/**
* `fresh` is the block rendered with new values. Every rich-text field and slot is replaced by the matching
* region of `old`, so the author's writing and nested blocks survive property edits.
*/
function graftBlock(fresh, old, definition) {
	const richFields = new Set((definition.fields ?? []).filter((f) => f.type === "richText").map((f) => f.id));
	const slots = new Set(definition.slots ?? []);
	const graft = (node) => {
		const field = getHtmlAttribute(node, DATA_ATTR.field);
		const slot = getHtmlAttribute(node, DATA_ATTR.slot);
		const kept = field !== void 0 && richFields.has(field) && findRegion(old, field, DATA_ATTR.field) || slot !== void 0 && slots.has(slot) && findRegion(old, slot, DATA_ATTR.slot);
		if (kept) return node.copy(kept.content);
		let content = node.content;
		node.forEach((child, _offset, index) => {
			const next = graft(child);
			if (next !== child) content = content.replaceChild(index, next);
		});
		return content === node.content ? node : node.copy(content);
	};
	return graft(fresh);
}
/** Replace a block with a freshly rendered version of itself (`freshHost` as parsed, wrapper included). */
function rebuildBlockTransaction(state, location, freshHost, definition, pm) {
	const freshWrapped = isSecretWrapper(freshHost);
	const grafted = graftBlock((freshWrapped ? freshHost.firstChild : freshHost) ?? freshHost, location.root, definition);
	let host = grafted;
	if (location.host !== location.root) host = location.host.copy(location.host.content.replaceChild(0, grafted));
	else if (freshWrapped) host = freshHost.copy(freshHost.content.replaceChild(0, grafted));
	const tr = state.tr.replaceWith(location.hostPos, location.hostPos + location.host.nodeSize, host);
	return tr.setSelection(pm.Selection.near(tr.doc.resolve(location.hostPos + 1)));
}
/** Insert a copy of the block right after it, with new instance and secret ids. */
function duplicateBlockTransaction(state, location, newId) {
	const start = location.hostPos + location.host.nodeSize;
	const tr = state.tr.insert(start, location.host);
	tr.doc.nodesBetween(start, start + location.host.nodeSize, (node, pos) => {
		if (pos < start) return true;
		const identity = identityOf(node);
		if (identity) tr.setNodeMarkup(pos, void 0, identity.renamed(newId()));
		return true;
	});
	return tr;
}
/** Remove the block (and its secret wrapper). The document never ends up empty. */
function deleteBlockTransaction(state, location, pm) {
	const from = location.hostPos;
	const to = from + location.host.nodeSize;
	const tr = state.tr;
	const $from = state.doc.resolve(from);
	const paragraph = state.schema.nodes.paragraph;
	if ($from.parent.childCount === 1 && paragraph) {
		tr.replaceWith(from, to, paragraph.create());
		return tr.setSelection(pm.TextSelection.create(tr.doc, from + 1));
	}
	tr.delete(from, to);
	return tr.setSelection(pm.Selection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size)), -1));
}
//#endregion
//#region src/editor/block-toolbar.ts
var GAP = 4;
/**
* Where the toolbar goes, relative to its container: above the block's right edge, pinned to the top of the
* visible editor area while the block's top is scrolled away. Null when the block is not visible.
*/
function toolbarPosition(block, container, visible, size) {
	if (block.bottom <= visible.top || block.top >= visible.bottom) return null;
	return {
		top: Math.max(block.top - size.height - GAP, visible.top + GAP) - container.top,
		left: Math.min(Math.max(block.right - size.width, container.left), container.right - size.width) - container.left
	};
}
var ACTIONS = [
	{
		id: "edit",
		key: "LOREFRAME.Toolbar.Edit",
		icon: "fa-solid fa-sliders"
	},
	{
		id: "duplicate",
		key: "LOREFRAME.Toolbar.Duplicate",
		icon: "fa-solid fa-copy"
	},
	{
		id: "delete",
		key: "LOREFRAME.Toolbar.Delete",
		icon: "fa-solid fa-trash"
	}
];
var toolbars = /* @__PURE__ */ new WeakMap();
/**
* Compact contextual toolbar for the block holding the selection (spec §23). It is rendered next to the editor
* (inside `<prose-mirror>`), never inside ProseMirror's own DOM, and exists only while a block is selected.
*/
var BlockToolbarView = class {
	#view;
	#deps;
	#element;
	#label;
	#buttons = [];
	#onScroll = () => this.#position();
	#instanceId = null;
	/** Roving tab stop (WAI-ARIA toolbar pattern): the one button reachable with Tab. */
	#current = 0;
	constructor(view, deps) {
		this.#view = view;
		this.#deps = deps;
		const doc = view.dom.ownerDocument;
		this.#element = doc.createElement("div");
		this.#element.className = "loreframe loreframe-block-toolbar";
		this.#element.setAttribute("role", "toolbar");
		this.#element.setAttribute("aria-label", deps.localize("LOREFRAME.Toolbar.Label"));
		this.#element.hidden = true;
		this.#label = doc.createElement("span");
		this.#label.className = "loreframe-block-toolbar__label";
		this.#element.append(this.#label);
		for (const action of ACTIONS) {
			const button = doc.createElement("button");
			button.type = "button";
			button.className = `loreframe-block-toolbar__button loreframe-block-toolbar__button--${action.id}`;
			const label = deps.localize(action.key);
			button.setAttribute("aria-label", label);
			button.dataset.tooltip = label;
			const icon = doc.createElement("i");
			icon.className = `${action.icon} fa-fw`;
			icon.setAttribute("aria-hidden", "true");
			button.append(icon);
			button.addEventListener("mousedown", (event) => event.preventDefault());
			button.addEventListener("click", () => this.#run(action.id));
			button.addEventListener("focus", () => this.#setCurrent(this.#buttons.indexOf(button)));
			this.#buttons.push(button);
			this.#element.append(button);
		}
		this.#element.addEventListener("keydown", (event) => this.#onKeyDown(event));
		(view.dom.parentElement ?? doc.body).append(this.#element);
		view.dom.addEventListener("scroll", this.#onScroll, { passive: true });
		this.update();
	}
	update() {
		const view = this.#view;
		const block = view.editable ? blockAt(view.state.selection.$from) : null;
		this.#instanceId = block?.instanceId ?? null;
		if (!block) {
			this.#element.hidden = true;
			return;
		}
		const name = this.#deps.templateName(block.templateId);
		this.#label.textContent = name ?? block.templateId;
		const edit = this.#buttons[0];
		if (edit) edit.hidden = name === null;
		this.#element.hidden = false;
		this.#setCurrent(this.#current);
		this.#position();
	}
	/** Alt+F10 from the editor: move focus into the toolbar. False when there is no toolbar to focus. */
	focus() {
		const button = this.#buttons[this.#current];
		if (this.#element.hidden || !button || button.hidden) return false;
		button.focus();
		return true;
	}
	destroy() {
		this.#view.dom.removeEventListener("scroll", this.#onScroll);
		this.#element.remove();
	}
	#visibleButtons() {
		return this.#buttons.filter((button) => !button.hidden);
	}
	/** Make `index` the tab stop, falling back to the first visible button. */
	#setCurrent(index) {
		const target = this.#buttons[index];
		const visible = this.#visibleButtons();
		const chosen = target && !target.hidden ? target : visible[0];
		this.#current = chosen ? this.#buttons.indexOf(chosen) : 0;
		this.#buttons.forEach((button, i) => button.tabIndex = i === this.#current ? 0 : -1);
	}
	#onKeyDown(event) {
		const visible = this.#visibleButtons();
		const at = visible.indexOf(this.#buttons[this.#current]);
		let next;
		if (event.key === "ArrowRight") next = visible[(at + 1) % visible.length];
		else if (event.key === "ArrowLeft") next = visible[(at - 1 + visible.length) % visible.length];
		else if (event.key === "Home") next = visible[0];
		else if (event.key === "End") next = visible.at(-1);
		else if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			this.#view.focus();
			return;
		} else return;
		event.preventDefault();
		if (!next) return;
		this.#setCurrent(this.#buttons.indexOf(next));
		next.focus();
	}
	#run(action) {
		const id = this.#instanceId;
		if (!id) return;
		if (action === "edit") this.#deps.onEdit(this.#view, id);
		else if (action === "duplicate") this.#deps.onDuplicate(this.#view, id);
		else this.#deps.onDelete(this.#view, id);
	}
	#position() {
		const view = this.#view;
		const container = this.#element.parentElement;
		const block = blockAt(view.state.selection.$from);
		if (!container || !block || this.#element.hidden) return;
		const dom = view.nodeDOM(block.hostPos);
		if (!(dom instanceof HTMLElement)) return;
		const position = toolbarPosition(dom.getBoundingClientRect(), container.getBoundingClientRect(), view.dom.getBoundingClientRect(), {
			width: this.#element.offsetWidth,
			height: this.#element.offsetHeight
		});
		this.#element.style.visibility = position ? "" : "hidden";
		if (position) {
			this.#element.style.top = `${position.top}px`;
			this.#element.style.left = `${position.left}px`;
		}
	}
};
function buildBlockToolbarPlugin(deps) {
	return new deps.Plugin({
		view: (view) => {
			const toolbar = new BlockToolbarView(view, deps);
			toolbars.set(view, toolbar);
			return toolbar;
		},
		props: { handleKeyDown(view, event) {
			if (!event.altKey || event.key !== "F10") return false;
			return toolbars.get(view)?.focus() ?? false;
		} }
	});
}
//#endregion
//#region src/editor/editor-kind.ts
/**
* Whether the plugins being configured belong to the chat message input.
*
* Foundry 14 gives every editor a placeholder `chatInput` plugin (client/applications/ux/prosemirror-editor.mjs
* `buildDefaultPlugins`); only the chat log (client/applications/sidebar/tabs/chat.mjs) replaces it with a
* ChatInputPlugin, whose spec carries `ChatInputPlugin.key`. The key, not the slot name, identifies chat.
*/
function isChatEditor(plugins, chatInputKey) {
	return plugins.chatInput?.spec?.key === chatInputKey;
}
//#endregion
//#region src/editor/document-drop.ts
/**
* Targeted drop handling (spec §35): claims only document drops a system adapter can turn into a block; everything
* else stays with Foundry's content-link plugin. The work after the claim is asynchronous (dialog, document lookup).
*/
function buildDocumentDropPlugin(deps) {
	return new deps.Plugin({ props: { handleDrop(view, event, _slice, moved) {
		if (moved) return false;
		const data = deps.getDragData(event);
		if (typeof data.type !== "string" || typeof data.uuid !== "string" || !data.uuid) return false;
		if (!deps.claims(data.type)) return false;
		const target = view.posAtCoords({
			left: event.clientX,
			top: event.clientY
		});
		if (!target) return false;
		event.preventDefault();
		event.stopPropagation();
		deps.onDrop(view, {
			type: data.type,
			uuid: data.uuid,
			pos: target.pos
		});
		return true;
	} } });
}
/**
* Add a plugin in front of the others. Foundry adds its content-link drop plugin before `createProseMirrorEditor`
* runs and builds the editor from `Object.values(plugins)`, so order decides which `handleDrop` wins.
*/
function prependPlugin(plugins, key, plugin) {
	const existing = Object.entries(plugins);
	for (const [name] of existing) Reflect.deleteProperty(plugins, name);
	plugins[key] = plugin;
	for (const [name, value] of existing) plugins[name] = value;
}
//#endregion
//#region src/editor/editor-tracker.ts
/**
* Remembers which ProseMirror editors are open and which one the user worked in last, so windows such as
* the Template Library know where to insert. Fed by a per-editor plugin — no DOM polling or global observers.
*/
var EditorTracker = class {
	#open = /* @__PURE__ */ new Set();
	/** Open views that have had focus, least recently focused first. Never-focused editors are no target. */
	#focused = [];
	#listeners = /* @__PURE__ */ new Set();
	/** Called whenever the active editor may have changed (focus moved, an editor closed). */
	onChange(listener) {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}
	track(view) {
		this.#open.add(view);
	}
	untrack(view) {
		this.#open.delete(view);
		const wasFocused = this.#focused.includes(view);
		this.#focused = this.#focused.filter((v) => v !== view);
		if (wasFocused) this.#notify();
	}
	markActive(view) {
		if (!this.#open.has(view) || this.#focused.at(-1) === view) return;
		this.#focused = [...this.#focused.filter((v) => v !== view), view];
		this.#notify();
	}
	#notify() {
		for (const listener of this.#listeners) listener();
	}
	/** The most recently focused editor that is still open, attached and editable. */
	active() {
		for (let i = this.#focused.length - 1; i >= 0; i--) {
			const view = this.#focused[i];
			if (view && isUsable(view)) return view;
		}
		return null;
	}
};
function isUsable(view) {
	return !view.isDestroyed && view.dom.isConnected && view.editable;
}
function buildEditorTrackerPlugin({ Plugin, tracker }) {
	return new Plugin({
		view(view) {
			tracker.track(view);
			return { destroy: () => tracker.untrack(view) };
		},
		props: { handleDOMEvents: { focus(view) {
			tracker.markActive(view);
			return false;
		} } }
	});
}
//#endregion
//#region src/integrations/npc-values.ts
var BLOCK_TAGS = /* @__PURE__ */ new Set([
	"P",
	"DIV",
	"LI",
	"UL",
	"OL",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"BLOCKQUOTE",
	"SECTION",
	"PRE"
]);
/**
* Plain text from system HTML (e.g. a biography): one paragraph per leaf block, markup dropped. Parsed in an inert
* `<template>`, so nothing in the source runs or loads.
*/
function htmlToText(html) {
	if (!html) return "";
	const template = document.createElement("template");
	template.innerHTML = html;
	const paragraphs = [];
	let inline = "";
	const flush = () => {
		const text = normalize(inline);
		if (text) paragraphs.push(text);
		inline = "";
	};
	const walk = (node) => {
		const isBlock = node instanceof Element && BLOCK_TAGS.has(node.tagName);
		const hasBlocks = isBlock && [...node.children].some((child) => BLOCK_TAGS.has(child.tagName));
		if (isBlock) flush();
		if (isBlock && !hasBlocks) {
			inline = node.textContent ?? "";
			flush();
			return;
		}
		if (node.nodeType === Node.TEXT_NODE) {
			inline += node.textContent ?? "";
			return;
		}
		node.childNodes.forEach(walk);
		if (isBlock) flush();
	};
	template.content.childNodes.forEach(walk);
	flush();
	return paragraphs.join("\n\n");
}
function normalize(text) {
	return text.replace(/\s+/g, " ").trim();
}
var DOSSIER_SECTIONS = [
	"appearance",
	"personality",
	"motivation",
	"relationships",
	"fears"
];
var DOSSIER_EMPTY = [
	"voice",
	"goals",
	"knowledge",
	"rumours"
];
/**
* Template values for a snapshot of `npc` (spec §35). Missing data is an empty value, never placeholder text; GM-only
* text is only used where the template renders it inside a Foundry secret.
*/
function npcTemplateValues(npc, templateId, deps) {
	const link = formatLink({
		uuid: npc.uuid,
		label: npc.name
	});
	const common = {
		name: npc.name,
		image: npc.image,
		alt: deps.format("LOREFRAME.Integration.PortraitAlt", { name: npc.name }),
		ancestry: npc.ancestry,
		occupation: npc.occupation
	};
	switch (templateId) {
		case "npc-card": return {
			...common,
			summary: npc.summary,
			personality: firstSentence(npc.personality),
			goal: firstSentence(npc.motivation),
			location: "",
			notes: link
		};
		case "npc-dossier": {
			const values = {
				...common,
				role: npc.role,
				summary: [npc.summary, link].filter(Boolean).join("\n\n"),
				secrets: npc.secrets,
				"show-summary": true,
				"show-secrets": npc.secrets !== ""
			};
			for (const field of DOSSIER_SECTIONS) {
				values[field] = npc[field];
				values[`show-${field}`] = npc[field] !== "";
			}
			for (const field of DOSSIER_EMPTY) {
				values[field] = "";
				values[`show-${field}`] = false;
			}
			return values;
		}
		default: throw new Error(`Template "${templateId}" cannot be filled from NPC data`);
	}
}
/** Card facts are one line: keep the first sentence of longer text. */
function firstSentence(text) {
	const line = text.split("\n")[0] ?? "";
	return (/^(.+?[.!?])(\s|$)/.exec(line)?.[1] ?? line).trim();
}
//#endregion
//#region src/integrations/dnd5e/dnd5e-adapter.ts
var DEFAULT_PORTRAIT = /(^|\/)icons\/svg\/mystery-man\.svg$/;
var bag = (value) => typeof value === "object" && value !== null ? value : {};
var str = (value) => typeof value === "string" ? value.trim() : "";
function createDnd5eAdapter(deps) {
	return {
		id: "dnd5e",
		systemId: "dnd5e",
		documentTypes: ["Actor"],
		canHandle: (document) => {
			const doc = bag(document);
			return doc.documentName === "Actor" && (doc.type === "npc" || doc.type === "character");
		},
		getNpcData: (document) => toNpcData(bag(document), deps)
	};
}
function toNpcData(actor, deps) {
	const details = bag(bag(actor.system).details);
	const biography = bag(details.biography);
	const isCharacter = actor.type === "character";
	const species = str(bag(details.race).name);
	const cr = typeof details.cr === "number" ? details.cr : null;
	const challenge = !isCharacter && cr !== null ? deps.format("LOREFRAME.Integration.Dnd5e.Challenge", { cr: deps.formatCR(cr) }) : "";
	const image = str(actor.img);
	const publicText = htmlToText(str(biography.public));
	const privateText = htmlToText(str(biography.value));
	return {
		uuid: str(actor.uuid),
		name: str(actor.name),
		image: DEFAULT_PORTRAIT.test(image) ? "" : image,
		ancestry: species || str(bag(details.type).label),
		occupation: isCharacter ? classSummary(actor) : "",
		role: [challenge, str(details.alignment)].filter(Boolean).join(" · "),
		summary: isCharacter ? publicText || privateText : publicText,
		appearance: isCharacter ? str(details.appearance) : "",
		personality: isCharacter ? str(details.trait) : "",
		motivation: str(details.ideal),
		relationships: str(details.bond),
		fears: str(details.flaw),
		secrets: isCharacter ? "" : privateText
	};
}
function classSummary(actor) {
	const classes = bag(actor.itemTypes).class;
	if (!Array.isArray(classes)) return "";
	return classes.map((item) => {
		const name = str(bag(item).name);
		const levels = bag(bag(item).system).levels;
		return name && typeof levels === "number" ? `${name} ${levels}` : name;
	}).filter(Boolean).join(" / ");
}
//#endregion
//#region src/integrations/dnd5e/index.ts
/** Register the built-in dnd5e adapter; the manager only uses it while dnd5e is the active system. */
function registerDnd5eIntegration(integrations, format) {
	integrations.register(createDnd5eAdapter({
		formatCR: (cr) => globalThis.dnd5e?.utils?.formatCR?.(cr) ?? String(cr),
		format
	}));
}
//#endregion
//#region src/integrations/document-drop-flow.ts
var CHOICES = [
	{
		value: "link",
		label: "LOREFRAME.Integration.InsertAs.Link"
	},
	{
		value: "npc-card",
		label: "LOREFRAME.Template.NpcCard.Name"
	},
	{
		value: "npc-dossier",
		label: "LOREFRAME.Template.NpcDossier.Name"
	}
];
/** The last choice made in this session; the standard Foundry link until the author picks something else. */
var lastChoice = "link";
/**
* Actor → NPC snapshot (spec §35): ask how to insert a dropped document, then insert a Foundry link or a block
* filled from the system adapter. The block is an independent copy; later Actor changes do not rewrite it.
*/
async function handleDocumentDrop(runtime, view, drop) {
	let document = null;
	try {
		document = await foundry.utils.fromUuid(drop.uuid);
	} catch (error) {
		logger.warn(`Could not resolve dropped document "${drop.uuid}"`, error);
	}
	const readable = document?.testUserPermission?.(game.user, "OBSERVER") === true;
	const npc = document && readable ? runtime.integrations.npcData(document) : null;
	const choice = npc ? await chooseInsertion(npc.name) : "link";
	if (choice === null || view.isDestroyed || !view.editable) return;
	if (choice === "link" || !npc) {
		await insertLink(view, drop);
		return;
	}
	lastChoice = choice;
	const values = npcTemplateValues(npc, choice, {
		localize: (key) => game.i18n.localize(key),
		format: (key, data) => game.i18n.format(key, data)
	});
	runtime.insert(view, choice, {
		values,
		at: drop.pos
	});
}
async function insertLink(view, drop) {
	const { TextEditor } = foundry.applications.ux;
	const link = await TextEditor.implementation.getContentLink({
		type: drop.type,
		uuid: drop.uuid
	});
	if (!link || view.isDestroyed || !view.editable) return;
	const pos = Math.min(drop.pos, view.state.doc.content.size);
	view.dispatch(view.state.tr.insertText(link, pos));
	view.focus();
}
async function chooseInsertion(name) {
	const options = CHOICES.map(({ value, label }) => `
      <label class="loreframe-insert-as__option">
        <input type="radio" name="loreframeInsertAs" value="${value}" ${value === lastChoice ? "checked" : ""}>
        <span>${escapeHtml(game.i18n.localize(label))}</span>
      </label>`).join("");
	const result = await foundry.applications.api.DialogV2.wait({
		window: {
			title: game.i18n.localize("LOREFRAME.Integration.InsertAs.Title"),
			icon: "fa-solid fa-user-plus"
		},
		classes: ["loreframe", "loreframe-insert-as"],
		content: `
      <p class="loreframe-insert-as__hint">${escapeHtml(game.i18n.format("LOREFRAME.Integration.InsertAs.Hint", { name }))}</p>
      <fieldset class="loreframe-insert-as__choices">
        <legend>${escapeHtml(game.i18n.localize("LOREFRAME.Integration.InsertAs.Label"))}</legend>
        ${options}
      </fieldset>`,
		buttons: [{
			action: "insert",
			label: game.i18n.localize("LOREFRAME.Integration.InsertAs.Insert"),
			icon: "fa-solid fa-check",
			default: true,
			callback: (_event, button) => {
				return (button.form?.querySelector("input[name=loreframeInsertAs]:checked"))?.value ?? "link";
			}
		}, {
			action: "cancel",
			label: game.i18n.localize("COMMON.Cancel"),
			icon: "fa-solid fa-xmark"
		}]
	});
	if (result === "link" || result === "npc-card" || result === "npc-dossier") return result;
	return null;
}
//#endregion
//#region src/editor/menu.ts
/** Key of the Loreframe entry in the `menus` record passed to `getProseMirrorMenuDropDowns`. */
var DROPDOWN_KEY = "loreframe";
/** Menu groups by template type. */
var TYPE_GROUPS = [
	{
		type: "block",
		title: "LOREFRAME.Editor.QuickBlocks"
	},
	{
		type: "layout",
		title: "LOREFRAME.Editor.Layouts"
	},
	{
		type: "page",
		title: "LOREFRAME.Editor.Structures"
	}
];
/**
* Build the single Loreframe editor dropdown (spec §13): Favorites, Recent, template groups, library.
* Foundry resolves actions across all dropdowns, so every action is prefixed with `loreframe-`.
* Foundry builds dropdowns once per editor, so shortcut groups reflect preferences at editor creation.
*/
function buildLoreframeDropdown(deps) {
	const available = deps.templates.list({ systemId: deps.systemId });
	const byId = new Map(available.map((t) => [t.id, t]));
	const pick = (ids) => ids.flatMap((id) => byId.get(id) ?? []).slice(0, 8);
	const entry = (prefix, definition) => ({
		action: `loreframe-${prefix}-${definition.id}`,
		title: definition.name,
		cmd: (_state, _dispatch, view) => deps.insert(view, definition.id)
	});
	const group = (action, title, groupIndex, prefix, templates) => templates.length ? [{
		action,
		title,
		group: groupIndex,
		children: templates.map((t) => entry(prefix, t))
	}] : [];
	return {
		title: "LOREFRAME.Editor.Menu",
		cssClass: DROPDOWN_KEY,
		icon: "<i class=\"fa-solid fa-scroll fa-fw\"></i>",
		entries: [
			...group("loreframe-group-favorites", "LOREFRAME.Editor.Favorites", 0, "favorite", pick(deps.favorites())),
			...group("loreframe-group-recent", "LOREFRAME.Editor.Recent", 0, "recent", pick(deps.recent())),
			...TYPE_GROUPS.flatMap(({ type, title }) => group(`loreframe-group-${type}`, title, 1, "insert", available.filter((t) => t.type === type))),
			{
				action: "loreframe-open-library",
				title: "LOREFRAME.Editor.OpenLibrary",
				group: 2,
				cmd: (_state, _dispatch, view) => {
					deps.openLibrary(view);
					return true;
				}
			}
		]
	};
}
//#endregion
//#region src/content-templates/basic/callout.ts
var CALLOUT_RENDERER = "callout";
var CALLOUT_TONES = [
	"note",
	"lore",
	"warning",
	"read-aloud",
	"gm-note",
	"secret"
];
/**
* Callout: a labelled aside. The label is a heading for accessibility but carries `data-no-toc`,
* which Foundry's JournalEntryPage.buildTOC skips.
*/
var calloutRenderer = ({ definition, values }) => {
	const tone = definition.rendererOptions?.tone;
	if (typeof tone !== "string" || !CALLOUT_TONES.includes(tone)) throw new Error(`Callout template "${definition.id}" has invalid tone "${String(tone)}"`);
	return {
		tag: "aside",
		classes: ["loreframe-callout", `loreframe-callout--${tone}`],
		children: [labelHeading("loreframe-callout__title", text(values, "title"), "title"), {
			tag: "div",
			classes: ["loreframe-callout__body"],
			field: "body",
			children: paragraphs(text(values, "body"))
		}]
	};
};
function calloutDefinition({ tone, key, icon, tags, secret, bodyKey }) {
	return {
		id: tone,
		version: 1,
		name: `LOREFRAME.Template.${key}.Name`,
		description: `LOREFRAME.Template.${key}.Description`,
		category: "blocks",
		type: "block",
		icon,
		renderer: CALLOUT_RENDERER,
		rendererOptions: { tone },
		fields: [{
			id: "title",
			type: "text",
			label: "LOREFRAME.Field.Title",
			defaultKey: `LOREFRAME.Template.${key}.Name`
		}, {
			id: "body",
			type: "richText",
			label: "LOREFRAME.Field.Body",
			defaultKey: bodyKey ?? "LOREFRAME.Field.BodyPlaceholder"
		}],
		focusField: "body",
		secret,
		tags
	};
}
var readAloudDefinition = calloutDefinition({
	tone: "read-aloud",
	key: "ReadAloud",
	icon: "fa-solid fa-book-open-reader",
	tags: [
		"boxed text",
		"description",
		"narration"
	],
	bodyKey: "LOREFRAME.Template.ReadAloud.Placeholder"
});
var noteDefinition = calloutDefinition({
	tone: "note",
	key: "Note",
	icon: "fa-solid fa-message-lines",
	tags: [
		"callout",
		"aside",
		"info"
	]
});
var loreDefinition = calloutDefinition({
	tone: "lore",
	key: "Lore",
	icon: "fa-solid fa-scroll-old",
	tags: [
		"callout",
		"history",
		"legend"
	]
});
var warningDefinition = calloutDefinition({
	tone: "warning",
	key: "Warning",
	icon: "fa-solid fa-triangle-exclamation",
	tags: [
		"callout",
		"danger",
		"caution"
	]
});
var gmNoteDefinition = calloutDefinition({
	tone: "gm-note",
	key: "GmNote",
	icon: "fa-solid fa-user-secret",
	tags: [
		"private",
		"gm only",
		"hidden"
	],
	secret: true
});
var secretDefinition = calloutDefinition({
	tone: "secret",
	key: "Secret",
	icon: "fa-solid fa-eye-slash",
	tags: [
		"reveal",
		"hidden",
		"plot"
	],
	secret: true
});
//#endregion
//#region src/content-templates/basic/data-blocks.ts
var KEY_VALUE_RENDERER = "key-value";
var TAGS_RENDERER = "tags";
var STATS_RENDERER = "stats-row";
var PLACEHOLDER_ROWS = 3;
var PLACEHOLDER_TAGS = 3;
var PLACEHOLDER_STATS = 4;
/**
* Key/value facts as a two-column table: Foundry's table tools (add/remove rows) edit it without HTML.
*/
var keyValueRenderer = ({ values, localize }) => {
	const rows = Array.from({ length: PLACEHOLDER_ROWS }, () => ({
		tag: "tr",
		children: [cell("th", localize("LOREFRAME.Template.KeyValue.KeyPlaceholder")), cell("td", localize("LOREFRAME.Template.KeyValue.ValuePlaceholder"))]
	}));
	return {
		tag: "div",
		classes: ["loreframe-facts"],
		children: [labelHeading("loreframe-facts__title", text(values, "title"), "title"), {
			tag: "table",
			classes: ["loreframe-facts__table"],
			field: "rows",
			children: [{
				tag: "tbody",
				children: rows
			}]
		}]
	};
};
var keyValueDefinition = {
	id: "key-value",
	version: 1,
	name: "LOREFRAME.Template.KeyValue.Name",
	description: "LOREFRAME.Template.KeyValue.Description",
	category: "blocks",
	type: "block",
	icon: "fa-solid fa-list-dropdown",
	renderer: KEY_VALUE_RENDERER,
	fields: [{
		id: "title",
		type: "text",
		label: "LOREFRAME.Field.Title",
		defaultKey: "LOREFRAME.Template.KeyValue.Title"
	}, {
		id: "rows",
		type: "richText",
		label: "LOREFRAME.Field.Rows"
	}],
	focusField: "title",
	tags: [
		"facts",
		"properties",
		"details",
		"infobox"
	]
};
/** A list of short labels. Pressing Enter in a tag creates the next one (list items). */
var tagsRenderer = ({ localize }) => ({
	tag: "div",
	classes: ["loreframe-tags"],
	children: [{
		tag: "ul",
		classes: ["loreframe-tags__list"],
		field: "tags",
		children: Array.from({ length: PLACEHOLDER_TAGS }, () => ({
			tag: "li",
			children: [{
				tag: "p",
				children: [localize("LOREFRAME.Template.Tags.Placeholder")]
			}]
		}))
	}]
});
var tagsDefinition = {
	id: "tags",
	version: 1,
	name: "LOREFRAME.Template.Tags.Name",
	description: "LOREFRAME.Template.Tags.Description",
	category: "blocks",
	type: "block",
	icon: "fa-solid fa-tags",
	renderer: TAGS_RENDERER,
	fields: [{
		id: "tags",
		type: "richText",
		label: "LOREFRAME.Field.Tags"
	}],
	focusField: "tags",
	tags: [
		"keywords",
		"labels",
		"traits"
	]
};
/** A row of labelled numbers as a one-row table with a header row. */
var statsRenderer = ({ localize }) => {
	const label = localize("LOREFRAME.Template.StatsRow.LabelPlaceholder");
	const value = localize("LOREFRAME.Template.StatsRow.ValuePlaceholder");
	const row = (tag, content) => ({
		tag: "tr",
		children: Array.from({ length: PLACEHOLDER_STATS }, () => cell(tag, content))
	});
	return {
		tag: "div",
		classes: ["loreframe-stats"],
		children: [{
			tag: "table",
			classes: ["loreframe-stats__table"],
			field: "stats",
			children: [{
				tag: "thead",
				children: [row("th", label)]
			}, {
				tag: "tbody",
				children: [row("td", value)]
			}]
		}]
	};
};
var statsRowDefinition = {
	id: "stats-row",
	version: 1,
	name: "LOREFRAME.Template.StatsRow.Name",
	description: "LOREFRAME.Template.StatsRow.Description",
	category: "blocks",
	type: "block",
	icon: "fa-solid fa-chart-simple",
	renderer: STATS_RENDERER,
	fields: [{
		id: "stats",
		type: "richText",
		label: "LOREFRAME.Field.Stats"
	}],
	focusField: "stats",
	tags: [
		"numbers",
		"attributes",
		"scores"
	]
};
//#endregion
//#region src/content-templates/basic/divider.ts
var DIVIDER_RENDERER = "divider";
var DIVIDER_STYLES = ["ornament", "line"];
/** Section divider. The ornament is drawn by CSS on the wrapper, so the content stays a plain <hr>. */
var dividerRenderer = ({ values }) => {
	return {
		tag: "div",
		classes: ["loreframe-divider", `loreframe-divider--${typeof values.style === "string" && DIVIDER_STYLES.includes(values.style) ? values.style : "ornament"}`],
		attrs: { role: "separator" },
		children: [{
			tag: "hr",
			classes: ["loreframe-divider__rule"]
		}]
	};
};
var dividerDefinition = {
	id: "divider",
	version: 1,
	name: "LOREFRAME.Template.Divider.Name",
	description: "LOREFRAME.Template.Divider.Description",
	category: "blocks",
	type: "block",
	icon: "fa-solid fa-horizontal-rule",
	renderer: DIVIDER_RENDERER,
	fields: [{
		id: "style",
		type: "select",
		label: "LOREFRAME.Field.Style",
		options: DIVIDER_STYLES,
		default: "ornament"
	}],
	tags: [
		"separator",
		"rule",
		"break"
	]
};
//#endregion
//#region src/content-templates/basic/heading.ts
var HEADING_RENDERER = "heading";
/** Section heading with a subtitle. The title is a real section heading and stays in the page ToC. */
var headingRenderer = ({ values }) => {
	const subtitle = text(values, "subtitle");
	return {
		tag: "header",
		classes: ["loreframe-heading"],
		children: [{
			tag: "h2",
			classes: ["loreframe-heading__title"],
			field: "title",
			children: [text(values, "title")]
		}, ...subtitle ? [{
			tag: "p",
			classes: ["loreframe-heading__subtitle"],
			field: "subtitle",
			children: [subtitle]
		}] : []]
	};
};
var headingDefinition = {
	id: "heading",
	version: 1,
	name: "LOREFRAME.Template.Heading.Name",
	description: "LOREFRAME.Template.Heading.Description",
	category: "blocks",
	type: "block",
	icon: "fa-solid fa-heading",
	renderer: HEADING_RENDERER,
	fields: [{
		id: "title",
		type: "text",
		label: "LOREFRAME.Field.Title",
		defaultKey: "LOREFRAME.Template.Heading.Name"
	}, {
		id: "subtitle",
		type: "text",
		label: "LOREFRAME.Field.Subtitle",
		defaultKey: "LOREFRAME.Field.SubtitlePlaceholder"
	}],
	focusField: "title",
	tags: [
		"title",
		"section",
		"header"
	],
	aliases: ["heading block"]
};
//#endregion
//#region src/content-templates/basic/media-blocks.ts
var MEDIA_RENDERER = "media";
var HERO_IMAGE_RENDERER = "hero-image";
var SIDES = ["left", "right"];
/**
* Image beside content. `rendererOptions.region` chooses whether the content is a text field (Image + Text block)
* or a slot that accepts other blocks (Media + Content layout).
*/
var mediaRenderer = ({ definition, values, localize }) => {
	const side = typeof values.side === "string" && SIDES.includes(values.side) ? values.side : "left";
	const isSlot = definition.rendererOptions?.region === "slot";
	return {
		tag: "div",
		classes: ["loreframe-media", `loreframe-media--${side}`],
		children: [imageField("loreframe-media__image", text(values, "image"), text(values, "alt")), {
			tag: "div",
			classes: ["loreframe-media__content"],
			...isSlot ? { slot: "content" } : { field: "text" },
			children: paragraphs(isSlot ? localize("LOREFRAME.Layout.ContentPlaceholder") : text(values, "text"))
		}]
	};
};
var MEDIA_FIELDS = [
	{
		id: "image",
		type: "image",
		label: "LOREFRAME.Field.Image",
		default: ""
	},
	{
		id: "alt",
		type: "text",
		label: "LOREFRAME.Field.ImageAlt",
		defaultKey: "LOREFRAME.Field.ImageAltPlaceholder",
		imageAltFor: "image"
	},
	{
		id: "side",
		type: "select",
		label: "LOREFRAME.Field.ImageSide",
		options: SIDES,
		default: "left"
	}
];
var imageTextDefinition = {
	id: "image-text",
	version: 1,
	name: "LOREFRAME.Template.ImageText.Name",
	description: "LOREFRAME.Template.ImageText.Description",
	category: "blocks",
	type: "block",
	icon: "fa-solid fa-image-landscape",
	renderer: MEDIA_RENDERER,
	rendererOptions: { region: "field" },
	fields: [...MEDIA_FIELDS, {
		id: "text",
		type: "richText",
		label: "LOREFRAME.Field.Text",
		defaultKey: "LOREFRAME.Field.BodyPlaceholder"
	}],
	focusField: "text",
	tags: [
		"picture",
		"illustration",
		"portrait"
	]
};
var mediaContentDefinition = {
	id: "media-content",
	version: 1,
	name: "LOREFRAME.Template.MediaContent.Name",
	description: "LOREFRAME.Template.MediaContent.Description",
	category: "layouts",
	type: "layout",
	icon: "fa-solid fa-table-columns",
	renderer: MEDIA_RENDERER,
	rendererOptions: { region: "slot" },
	fields: MEDIA_FIELDS,
	slots: ["content"],
	focusField: "content",
	tags: [
		"image",
		"columns",
		"layout"
	]
};
/** A full-width image with an optional caption. */
var heroImageRenderer = ({ values }) => {
	const caption = text(values, "caption");
	return {
		tag: "div",
		classes: ["loreframe-hero-image"],
		children: [imageField("loreframe-hero-image__image", text(values, "image"), text(values, "alt")), ...caption ? [{
			tag: "p",
			classes: ["loreframe-hero-image__caption"],
			field: "caption",
			children: [caption]
		}] : []]
	};
};
var heroImageDefinition = {
	id: "hero-image",
	version: 1,
	name: "LOREFRAME.Template.HeroImage.Name",
	description: "LOREFRAME.Template.HeroImage.Description",
	category: "blocks",
	type: "block",
	icon: "fa-solid fa-panorama",
	renderer: HERO_IMAGE_RENDERER,
	fields: [
		{
			id: "image",
			type: "image",
			label: "LOREFRAME.Field.Image",
			default: ""
		},
		{
			id: "alt",
			type: "text",
			label: "LOREFRAME.Field.ImageAlt",
			defaultKey: "LOREFRAME.Field.ImageAltPlaceholder",
			imageAltFor: "image"
		},
		{
			id: "caption",
			type: "text",
			label: "LOREFRAME.Field.Caption",
			defaultKey: "LOREFRAME.Field.CaptionPlaceholder"
		}
	],
	focusField: "caption",
	tags: [
		"banner",
		"cover",
		"splash"
	]
};
//#endregion
//#region src/content-templates/gallery/gallery.ts
var GALLERY_RENDERER = "gallery";
var GALLERY_MODES = [
	"uniform",
	"portrait",
	"landscape",
	"feature",
	"captioned"
];
var PLACEHOLDER_COUNT = 3;
function galleryItems(value) {
	return Array.isArray(value) ? value : null;
}
/**
* Gallery (spec §18): a grid of native <figure> elements (image + optional caption) in an `items` field.
* Layout modes are CSS only, so switching modes never touches the images.
*/
var galleryRenderer = ({ values, localize }) => {
	const mode = typeof values.mode === "string" && GALLERY_MODES.includes(values.mode) ? values.mode : "uniform";
	const placeholderAlt = localize("LOREFRAME.Template.Gallery.PlaceholderAlt");
	const items = galleryItems(values.items) ?? Array.from({ length: PLACEHOLDER_COUNT }, () => ({
		src: "",
		alt: placeholderAlt,
		caption: ""
	}));
	return {
		tag: "div",
		classes: ["loreframe-gallery", `loreframe-gallery--${mode}`],
		children: [{
			tag: "div",
			classes: ["loreframe-gallery__grid"],
			field: "items",
			children: items.map((item) => ({
				tag: "figure",
				classes: ["loreframe-gallery__item"],
				children: [{
					tag: "img",
					attrs: {
						src: item.src || PLACEHOLDER_IMAGE,
						alt: item.alt
					}
				}, ...item.caption ? [{
					tag: "figcaption",
					classes: ["loreframe-gallery__caption"],
					children: [item.caption]
				}] : []]
			}))
		}]
	};
};
var galleryDefinition = {
	id: "gallery",
	version: 1,
	name: "LOREFRAME.Template.Gallery.Name",
	description: "LOREFRAME.Template.Gallery.Description",
	category: "gallery",
	type: "block",
	icon: "fa-solid fa-images",
	renderer: GALLERY_RENDERER,
	fields: [{
		id: "items",
		type: "items",
		label: "LOREFRAME.Field.Images"
	}, {
		id: "mode",
		type: "select",
		label: "LOREFRAME.Field.GalleryMode",
		options: [...GALLERY_MODES],
		default: "uniform"
	}],
	tags: [
		"images",
		"pictures",
		"portraits",
		"photos"
	],
	aliases: ["image grid"]
};
//#endregion
//#region src/content-templates/location/location.ts
var LOCATION_RENDERER = "location";
var INFO_SIDES = [
	"right",
	"left",
	"full"
];
var INFO_ROWS$1 = [
	"type",
	"population",
	"government",
	"climate",
	"danger"
];
var LINK_LISTS = [
	"poi",
	"npcs",
	"factions"
];
var LOCATION_PRESETS = [
	"editorial",
	"minimal",
	"arcane"
];
var pascal$2 = (id) => id.replace(/(^|-)([a-z])/g, (_m, _dash, char) => char.toUpperCase());
var labelKey$2 = (id) => `LOREFRAME.Location.${pascal$2(id)}.Label`;
var placeholderKey$2 = (id) => `LOREFRAME.Location.${pascal$2(id)}.Placeholder`;
var shown$2 = (values, id) => values[`show-${id}`] !== false;
function option$2(values, id, allowed) {
	const value = values[id];
	return typeof value === "string" && allowed.includes(value) ? value : allowed[0] ?? "";
}
var label$1 = (id, localize) => labelHeading("loreframe-location__label", localize(labelKey$2(id)));
function section(id, children) {
	return {
		tag: "div",
		classes: ["loreframe-location__section", `loreframe-location__section--${id}`],
		children
	};
}
function richSection(values, id, localize) {
	return section(id, [label$1(id, localize), {
		tag: "div",
		classes: ["loreframe-location__text"],
		field: id,
		children: paragraphs(text(values, id))
	}]);
}
/** A list value; new blocks (no value yet) get one localized sample entry to overwrite. */
function links(values, id, localize) {
	const value = values[id];
	if (Array.isArray(value)) return value;
	return [{
		uuid: "",
		label: localize(placeholderKey$2(id)),
		note: localize(`LOREFRAME.Location.${pascal$2(id)}.Note`)
	}];
}
/** Foundry-linked entries (spec §21): link text Foundry enriches on display, plus an optional note. */
function linkSection(values, id, localize) {
	const items = links(values, id, localize);
	if (!items.length) return [];
	return [section(id, [label$1(id, localize), {
		tag: "ul",
		classes: ["loreframe-links"],
		field: id,
		children: items.map((item) => ({
			tag: "li",
			classes: ["loreframe-links__item"],
			children: [{
				tag: "p",
				classes: ["loreframe-links__link"],
				children: [formatLink(item)]
			}, ...item.note ? [{
				tag: "p",
				classes: ["loreframe-links__note"],
				children: [item.note]
			}] : []]
		}))
	}])];
}
function lists(values, localize) {
	const sections = LINK_LISTS.flatMap((id) => linkSection(values, id, localize));
	return sections.length ? [{
		tag: "div",
		classes: ["loreframe-location__lists"],
		children: sections
	}] : [];
}
function withClass(element, className) {
	return {
		...element,
		classes: [...element.classes ?? [], className]
	};
}
function hero(values) {
	const meta = ["kind", "region"].flatMap((id) => {
		const value = text(values, id);
		return value ? [{
			tag: "p",
			classes: [`loreframe-location__${id}`],
			field: id,
			children: [value]
		}] : [];
	});
	return {
		tag: "header",
		classes: ["loreframe-location__hero"],
		children: [imageField("loreframe-location__banner", text(values, "image"), text(values, "alt")), {
			tag: "div",
			classes: ["loreframe-location__heading"],
			children: [{
				tag: "h2",
				classes: ["loreframe-location__name", "loreframe-preset__name"],
				field: "name",
				children: [text(values, "name")]
			}, ...meta.length ? [{
				tag: "div",
				classes: ["loreframe-location__meta"],
				children: meta
			}] : []]
		}]
	};
}
function overview(values, localize) {
	const rows = INFO_ROWS$1.flatMap((id) => {
		const value = text(values, id);
		if (!value) return [];
		return [{
			tag: "div",
			classes: ["loreframe-location__row"],
			children: [{
				tag: "p",
				classes: ["loreframe-location__key"],
				children: [localize(labelKey$2(id))]
			}, {
				tag: "p",
				classes: ["loreframe-location__value"],
				field: id,
				children: [value]
			}]
		}];
	});
	return {
		tag: "div",
		classes: ["loreframe-location__overview"],
		children: [...rows.length ? [{
			tag: "aside",
			classes: ["loreframe-location__info"],
			children: [labelHeading("loreframe-location__label", localize(labelKey$2("info"))), ...rows]
		}] : [], withClass(richSection(values, "description", localize), "loreframe-location__main")]
	};
}
function map(values, localize) {
	return section("map", [label$1("map", localize), {
		tag: "div",
		classes: ["loreframe-location__map"],
		field: "map",
		children: [{
			tag: "img",
			attrs: {
				src: PLACEHOLDER_IMAGE,
				alt: localize(labelKey$2("map"))
			}
		}, ...paragraphs(text(values, "map"))]
	}]);
}
/** Location page (spec §21): composes hero, info, Foundry links, map, secrets and an embedded Gallery. */
var locationRenderer = ({ values, localize, embed }) => ({
	tag: "article",
	classes: ["loreframe-location", `loreframe-location--info-${option$2(values, "info-side", INFO_SIDES)}`],
	children: [
		hero(values),
		...shown$2(values, "summary") ? [{
			tag: "div",
			classes: ["loreframe-location__summary"],
			field: "summary",
			children: paragraphs(text(values, "summary"))
		}] : [],
		overview(values, localize),
		...shown$2(values, "map") ? [map(values, localize)] : [],
		...lists(values, localize),
		...shown$2(values, "rumours") ? [richSection(values, "rumours", localize)] : [],
		...shown$2(values, "secrets") ? [secretRegion(["loreframe-location__section", "loreframe-location__section--secrets"], "secrets", label$1("secrets", localize), text(values, "secrets"))] : [],
		...shown$2(values, "gallery") ? [section("gallery", [label$1("gallery", localize), {
			tag: "div",
			classes: ["loreframe-location__gallery"],
			slot: "gallery",
			children: [embed("gallery", { key: "gallery" })]
		}])] : []
	]
});
var textField$2 = (id) => ({
	id,
	type: "text",
	label: labelKey$2(id),
	defaultKey: placeholderKey$2(id),
	inspectorGroup: "general"
});
var richField$1 = (id) => ({
	id,
	type: "richText",
	label: labelKey$2(id),
	defaultKey: placeholderKey$2(id)
});
var toggle$1 = (id) => ({
	id: `show-${id}`,
	type: "boolean",
	label: labelKey$2(id),
	default: true,
	inspectorGroup: "sections"
});
var locationDefinition = {
	id: "location",
	version: 1,
	name: "LOREFRAME.Template.Location.Name",
	description: "LOREFRAME.Template.Location.Description",
	category: "locations",
	type: "page",
	icon: "fa-solid fa-map-location-dot",
	renderer: LOCATION_RENDERER,
	fields: [
		textField$2("name"),
		textField$2("kind"),
		textField$2("region"),
		{
			id: "image",
			type: "image",
			label: "LOREFRAME.Field.Image",
			default: "",
			inspectorGroup: "general"
		},
		{
			id: "alt",
			type: "text",
			label: "LOREFRAME.Field.ImageAlt",
			defaultKey: "LOREFRAME.Field.ImageAltPlaceholder",
			imageAltFor: "image",
			inspectorGroup: "general"
		},
		...INFO_ROWS$1.map(textField$2),
		...LINK_LISTS.map((id) => ({
			id,
			type: "links",
			label: labelKey$2(id)
		})),
		richField$1("summary"),
		richField$1("description"),
		richField$1("map"),
		richField$1("rumours"),
		richField$1("secrets"),
		...[
			"summary",
			"map",
			"rumours",
			"secrets",
			"gallery"
		].map(toggle$1),
		{
			id: "info-side",
			type: "select",
			label: "LOREFRAME.Field.InfoSide",
			options: INFO_SIDES,
			default: "right",
			inspectorGroup: "style"
		}
	],
	slots: ["gallery"],
	focusField: "name",
	presets: LOCATION_PRESETS,
	tags: [
		"place",
		"settlement",
		"region",
		"points of interest",
		"map",
		"wiki"
	],
	aliases: [
		"локация",
		"место",
		"город"
	]
};
//#endregion
//#region src/content-templates/wiki/wiki.ts
var WIKI_RENDERER = "wiki-article";
var INFOBOX_PLACEMENTS = [
	"right",
	"left",
	"full",
	"hidden"
];
var INFO_ROWS = [
	"type",
	"region",
	"alignment",
	"population"
];
var WIKI_PRESETS = [
	"editorial",
	"minimal",
	"arcane"
];
var pascal$1 = (id) => id.replace(/(^|-)([a-z])/g, (_m, _dash, char) => char.toUpperCase());
var labelKey$1 = (id) => `LOREFRAME.Wiki.${pascal$1(id)}.Label`;
var placeholderKey$1 = (id) => `LOREFRAME.Wiki.${pascal$1(id)}.Placeholder`;
var shown$1 = (values, id) => values[`show-${id}`] !== false;
var label = (id, localize) => labelHeading("loreframe-wiki__label", localize(labelKey$1(id)));
function option$1(values, id, allowed) {
	const value = values[id];
	return typeof value === "string" && allowed.includes(value) ? value : allowed[0] ?? "";
}
function header$1(values) {
	const subtitle = text(values, "subtitle");
	return {
		tag: "header",
		classes: ["loreframe-wiki__header"],
		children: [{
			tag: "h2",
			classes: ["loreframe-wiki__title", "loreframe-preset__name"],
			field: "title",
			children: [text(values, "title")]
		}, ...subtitle ? [{
			tag: "p",
			classes: ["loreframe-wiki__subtitle"],
			field: "subtitle",
			children: [subtitle]
		}] : []]
	};
}
/**
* Infobox (spec §19): fixed rows are properties shown when filled in; custom rows are a table the author edits with
* Foundry's table tools. It is always rendered — "hidden" is a placement that CSS hides from readers.
*/
function infobox(values, localize) {
	const rows = INFO_ROWS.flatMap((id) => {
		const value = text(values, id);
		if (!value) return [];
		return [{
			tag: "div",
			classes: ["loreframe-wiki__row"],
			children: [{
				tag: "p",
				classes: ["loreframe-wiki__key"],
				children: [localize(labelKey$1(id))]
			}, {
				tag: "p",
				classes: ["loreframe-wiki__value"],
				field: id,
				children: [value]
			}]
		}];
	});
	return {
		tag: "aside",
		classes: ["loreframe-wiki__infobox"],
		...option$1(values, "infobox", INFOBOX_PLACEMENTS) === "hidden" ? { attrs: { "data-loreframe-hint": localize("LOREFRAME.Wiki.Infobox.HiddenHint") } } : {},
		children: [
			label("infobox", localize),
			...rows.length ? [{
				tag: "div",
				classes: ["loreframe-wiki__rows"],
				children: rows
			}] : [],
			{
				tag: "table",
				classes: ["loreframe-wiki__facts"],
				field: "facts",
				children: [{
					tag: "tbody",
					children: [{
						tag: "tr",
						children: [cell("th", localize("LOREFRAME.Wiki.Facts.KeyPlaceholder")), cell("td", localize("LOREFRAME.Wiki.Facts.ValuePlaceholder"))]
					}]
				}]
			}
		]
	};
}
function contents(localize) {
	return {
		tag: "nav",
		classes: ["loreframe-wiki__contents"],
		attrs: {
			[DATA_ATTR.contents]: "",
			"data-loreframe-hint": localize(placeholderKey$1("contents"))
		},
		children: [label("contents", localize)]
	};
}
function article(localize) {
	const section = (n) => [{
		tag: "h3",
		children: [localize(`LOREFRAME.Wiki.Article.Heading${n}`)]
	}, ...paragraphs(localize(`LOREFRAME.Wiki.Article.Text${n}`))];
	return {
		tag: "div",
		classes: ["loreframe-wiki__article"],
		slot: "article",
		children: [...section(1), ...section(2)]
	};
}
function related(values, localize) {
	const value = values.related;
	const items = Array.isArray(value) ? value : [{
		uuid: "",
		label: localize(placeholderKey$1("related")),
		note: ""
	}];
	if (!items.length) return [];
	return [{
		tag: "div",
		classes: ["loreframe-wiki__related"],
		children: [label("related", localize), {
			tag: "ul",
			classes: ["loreframe-links", "loreframe-links--inline"],
			field: "related",
			children: items.map((item) => ({
				tag: "li",
				classes: ["loreframe-links__item"],
				children: [{
					tag: "p",
					classes: ["loreframe-links__link"],
					children: [formatLink(item)]
				}, ...item.note ? [{
					tag: "p",
					classes: ["loreframe-links__note"],
					children: [item.note]
				}] : []]
			}))
		}]
	}];
}
/** Wiki article (spec §19): long-form content framed by an infobox, contents and related entries. */
var wikiRenderer = ({ values, localize }) => ({
	tag: "article",
	classes: ["loreframe-wiki", `loreframe-wiki--infobox-${option$1(values, "infobox", INFOBOX_PLACEMENTS)}`],
	children: [
		header$1(values),
		imageField("loreframe-wiki__hero", text(values, "image"), text(values, "alt")),
		{
			tag: "div",
			classes: ["loreframe-wiki__body"],
			children: [
				infobox(values, localize),
				...shown$1(values, "intro") ? [{
					tag: "div",
					classes: ["loreframe-wiki__intro"],
					field: "intro",
					children: paragraphs(text(values, "intro"))
				}] : [],
				...shown$1(values, "contents") ? [contents(localize)] : [],
				article(localize)
			]
		},
		...related(values, localize)
	]
});
var textField$1 = (id) => ({
	id,
	type: "text",
	label: labelKey$1(id),
	defaultKey: placeholderKey$1(id),
	inspectorGroup: "general"
});
var wikiDefinition = {
	id: "wiki-article",
	version: 1,
	name: "LOREFRAME.Template.WikiArticle.Name",
	description: "LOREFRAME.Template.WikiArticle.Description",
	category: "wiki",
	type: "page",
	icon: "fa-solid fa-book-open",
	renderer: WIKI_RENDERER,
	fields: [
		textField$1("title"),
		textField$1("subtitle"),
		{
			id: "image",
			type: "image",
			label: "LOREFRAME.Field.Image",
			default: "",
			inspectorGroup: "general"
		},
		{
			id: "alt",
			type: "text",
			label: "LOREFRAME.Field.ImageAlt",
			defaultKey: "LOREFRAME.Field.ImageAltPlaceholder",
			imageAltFor: "image",
			inspectorGroup: "general"
		},
		...INFO_ROWS.map(textField$1),
		{
			id: "related",
			type: "links",
			label: labelKey$1("related")
		},
		{
			id: "intro",
			type: "richText",
			label: labelKey$1("intro"),
			defaultKey: placeholderKey$1("intro")
		},
		{
			id: "facts",
			type: "richText",
			label: labelKey$1("facts")
		},
		{
			id: "show-intro",
			type: "boolean",
			label: labelKey$1("intro"),
			default: true,
			inspectorGroup: "sections"
		},
		{
			id: "show-contents",
			type: "boolean",
			label: labelKey$1("contents"),
			default: true,
			inspectorGroup: "sections"
		},
		{
			id: "infobox",
			type: "select",
			label: labelKey$1("infobox"),
			options: INFOBOX_PLACEMENTS,
			default: "right",
			inspectorGroup: "style"
		}
	],
	slots: ["article"],
	focusField: "title",
	presets: WIKI_PRESETS,
	tags: [
		"article",
		"encyclopedia",
		"infobox",
		"long read",
		"lore",
		"contents"
	],
	aliases: [
		"вики",
		"статья",
		"энциклопедия"
	]
};
//#endregion
//#region src/content-templates/presets.ts
/**
* Built-in visual presets (spec §8). A preset only adds `loreframe-preset--<id>` to the block root; the styles
* decide what it means, so any structure that lists a preset renders unchanged with another one.
*/
var BUILT_IN_PRESETS = [
	{
		id: "editorial",
		name: "LOREFRAME.Preset.Editorial"
	},
	{
		id: "minimal",
		name: "LOREFRAME.Preset.Minimal"
	},
	{
		id: "arcane",
		name: "LOREFRAME.Preset.Arcane"
	},
	{
		id: "bestiary",
		name: "LOREFRAME.Preset.Bestiary"
	}
];
var BUILT_IN_PRESET_IDS = BUILT_IN_PRESETS.map((preset) => preset.id);
var PORTRAIT_POSITIONS = [
	"left",
	"right",
	"top"
];
var DENSITIES = ["comfortable", "compact"];
/** Dossier sections (spec §20) in reading order, grouped into rows that share width on wide pages. */
var DOSSIER_GROUPS = [
	{
		id: "presence",
		sections: [
			"appearance",
			"personality",
			"voice"
		]
	},
	{
		id: "drive",
		sections: [
			"motivation",
			"goals",
			"fears"
		]
	},
	{
		id: "ties",
		sections: ["relationships"]
	},
	{
		id: "lore",
		sections: ["knowledge", "rumours"]
	}
];
var CARD_FACTS = [
	"personality",
	"goal",
	"location"
];
var pascal = (id) => id.replace(/(^|-)([a-z])/g, (_m, _dash, char) => char.toUpperCase());
var labelKey = (id) => `LOREFRAME.Npc.${pascal(id)}.Label`;
var placeholderKey = (id) => `LOREFRAME.Npc.${pascal(id)}.Placeholder`;
var toggleId = (id) => `show-${id}`;
function option(values, id, allowed) {
	const value = values[id];
	return typeof value === "string" && allowed.includes(value) ? value : allowed[0] ?? "";
}
/** Optional sections are on unless explicitly switched off. */
var shown = (values, id) => values[toggleId(id)] !== false;
/** A short text line, omitted when empty so the layout does not keep blank rows. */
function line(values, id) {
	const value = text(values, id);
	return value ? [{
		tag: "p",
		classes: [`loreframe-npc__${id}`],
		field: id,
		children: [value]
	}] : [];
}
function richRegion(values, id, className) {
	return {
		tag: "div",
		classes: [className],
		field: id,
		children: paragraphs(text(values, id))
	};
}
function labelledSection(values, id, localize) {
	return {
		tag: "div",
		classes: ["loreframe-npc__section", `loreframe-npc__section--${id}`],
		children: [labelHeading("loreframe-npc__label", localize(labelKey(id))), richRegion(values, id, "loreframe-npc__text")]
	};
}
/** Name (a TOC heading: pages often list several NPCs), role, "Ancestry · Occupation" and the summary. */
function identity(variant, values) {
	const meta = ["ancestry", "occupation"].flatMap((id) => line(values, id));
	return {
		tag: "div",
		classes: ["loreframe-npc__identity"],
		children: [
			{
				tag: variant === "dossier" ? "h2" : "h3",
				classes: ["loreframe-npc__name", "loreframe-preset__name"],
				field: "name",
				children: [text(values, "name")]
			},
			...variant === "dossier" ? line(values, "role") : [],
			...meta.length ? [{
				tag: "div",
				classes: ["loreframe-npc__meta"],
				children: meta
			}] : [],
			...variant === "card" || shown(values, "summary") ? [richRegion(values, "summary", "loreframe-npc__summary")] : []
		]
	};
}
/** The portrait is always present: without an image it shows the placeholder, which CSS hides outside the editor. */
function header(variant, values) {
	return {
		tag: "header",
		classes: ["loreframe-npc__header"],
		children: [imageField("loreframe-npc__portrait", text(values, "image"), text(values, "alt")), identity(variant, values)]
	};
}
function cardBody(values, localize) {
	const facts = CARD_FACTS.flatMap((id) => {
		const value = text(values, id);
		if (!value) return [];
		return [{
			tag: "div",
			classes: ["loreframe-npc__fact", `loreframe-npc__fact--${id}`],
			children: [labelHeading("loreframe-npc__label", localize(labelKey(id))), {
				tag: "p",
				classes: ["loreframe-npc__fact-value"],
				field: id,
				children: [value]
			}]
		}];
	});
	return [...facts.length ? [{
		tag: "div",
		classes: ["loreframe-npc__facts"],
		children: facts
	}] : [], ...shown(values, "notes") ? [labelledSection(values, "notes", localize)] : []];
}
function dossierBody(values, localize) {
	const groups = DOSSIER_GROUPS.flatMap(({ id, sections }) => {
		const children = sections.filter((section) => shown(values, section));
		if (!children.length) return [];
		return [{
			tag: "div",
			classes: ["loreframe-npc__group", `loreframe-npc__group--${id}`],
			children: children.map((section) => labelledSection(values, section, localize))
		}];
	});
	const secrets = shown(values, "secrets") ? [secretRegion(["loreframe-npc__section", "loreframe-npc__section--secrets"], "secrets", labelHeading("loreframe-npc__label", localize(labelKey("secrets"))), text(values, "secrets"))] : [];
	return [...groups, ...secrets];
}
/** NPC card and dossier (spec §20). The structure is fixed; presets only restyle it (spec §8). */
var npcRenderer = ({ definition, values, localize }) => {
	const variant = definition.rendererOptions?.variant;
	if (variant !== "card" && variant !== "dossier") throw new Error(`NPC template "${definition.id}" has invalid variant "${String(variant)}"`);
	return {
		tag: "article",
		classes: [
			"loreframe-npc",
			`loreframe-npc--${variant}`,
			`loreframe-npc--portrait-${option(values, "portrait", PORTRAIT_POSITIONS)}`,
			`loreframe-npc--density-${option(values, "density", DENSITIES)}`
		],
		children: [header(variant, values), ...variant === "card" ? cardBody(values, localize) : dossierBody(values, localize)]
	};
};
var textField = (id) => ({
	id,
	type: "text",
	label: labelKey(id),
	defaultKey: placeholderKey(id),
	inspectorGroup: "general"
});
var richField = (id) => ({
	id,
	type: "richText",
	label: labelKey(id),
	defaultKey: placeholderKey(id)
});
var toggle = (id) => ({
	id: toggleId(id),
	type: "boolean",
	label: labelKey(id),
	default: true,
	inspectorGroup: "sections"
});
var PORTRAIT_FIELDS = [{
	id: "image",
	type: "image",
	label: "LOREFRAME.Field.Image",
	default: "",
	inspectorGroup: "general"
}, {
	id: "alt",
	type: "text",
	label: labelKey("portrait-alt"),
	defaultKey: placeholderKey("portrait-alt"),
	imageAltFor: "image",
	inspectorGroup: "general"
}];
var STYLE_FIELDS = [{
	id: "portrait",
	type: "select",
	label: "LOREFRAME.Field.PortraitPosition",
	options: PORTRAIT_POSITIONS,
	default: "left",
	inspectorGroup: "style"
}, {
	id: "density",
	type: "select",
	label: "LOREFRAME.Field.Density",
	options: DENSITIES,
	default: "comfortable",
	inspectorGroup: "style"
}];
var SECTION_IDS = DOSSIER_GROUPS.flatMap((group) => group.sections);
var npcCardDefinition = {
	id: "npc-card",
	version: 1,
	name: "LOREFRAME.Template.NpcCard.Name",
	description: "LOREFRAME.Template.NpcCard.Description",
	category: "npc",
	type: "block",
	icon: "fa-solid fa-id-badge",
	renderer: "npc",
	rendererOptions: { variant: "card" },
	fields: [
		...[
			textField("name"),
			textField("ancestry"),
			textField("occupation")
		],
		...PORTRAIT_FIELDS,
		...CARD_FACTS.map(textField),
		richField("summary"),
		richField("notes"),
		toggle("notes"),
		...STYLE_FIELDS
	],
	focusField: "name",
	presets: BUILT_IN_PRESET_IDS,
	tags: [
		"character",
		"person",
		"compact",
		"portrait"
	],
	aliases: ["персонаж", "нпс"]
};
var npcDossierDefinition = {
	id: "npc-dossier",
	version: 1,
	name: "LOREFRAME.Template.NpcDossier.Name",
	description: "LOREFRAME.Template.NpcDossier.Description",
	category: "npc",
	type: "page",
	icon: "fa-solid fa-user-secret",
	renderer: "npc",
	rendererOptions: { variant: "dossier" },
	fields: [
		...[
			textField("name"),
			textField("role"),
			textField("ancestry"),
			textField("occupation")
		],
		...PORTRAIT_FIELDS,
		richField("summary"),
		...SECTION_IDS.map(richField),
		richField("secrets"),
		...[
			"summary",
			...SECTION_IDS,
			"secrets"
		].map(toggle),
		...STYLE_FIELDS
	],
	focusField: "name",
	presets: BUILT_IN_PRESET_IDS,
	tags: [
		"character",
		"person",
		"profile",
		"gm secrets",
		"relationships",
		"rumours"
	],
	aliases: [
		"персонаж",
		"досье",
		"нпс"
	]
};
//#endregion
//#region src/content-templates/basic/text-blocks.ts
var SUBTITLE_RENDERER = "subtitle";
var QUOTE_RENDERER = "quote";
/** A standalone subtitle line under a heading. */
var subtitleRenderer = ({ values }) => ({
	tag: "div",
	classes: ["loreframe-subtitle"],
	children: [{
		tag: "p",
		classes: ["loreframe-subtitle__text"],
		field: "text",
		children: [text(values, "text")]
	}]
});
var subtitleDefinition = {
	id: "subtitle",
	version: 1,
	name: "LOREFRAME.Template.Subtitle.Name",
	description: "LOREFRAME.Template.Subtitle.Description",
	category: "blocks",
	type: "block",
	icon: "fa-solid fa-text",
	renderer: SUBTITLE_RENDERER,
	fields: [{
		id: "text",
		type: "text",
		label: "LOREFRAME.Field.Text",
		defaultKey: "LOREFRAME.Field.SubtitlePlaceholder"
	}],
	focusField: "text",
	tags: ["tagline", "byline"]
};
/** A pull quote with an attribution line. */
var quoteRenderer = ({ values }) => {
	const attribution = text(values, "attribution");
	return {
		tag: "div",
		classes: ["loreframe-quote"],
		children: [{
			tag: "blockquote",
			classes: ["loreframe-quote__text"],
			field: "quote",
			children: paragraphs(text(values, "quote"))
		}, ...attribution ? [{
			tag: "p",
			classes: ["loreframe-quote__attribution"],
			field: "attribution",
			children: [attribution]
		}] : []]
	};
};
var quoteDefinition = {
	id: "quote",
	version: 1,
	name: "LOREFRAME.Template.Quote.Name",
	description: "LOREFRAME.Template.Quote.Description",
	category: "blocks",
	type: "block",
	icon: "fa-solid fa-quote-left",
	renderer: QUOTE_RENDERER,
	fields: [{
		id: "quote",
		type: "richText",
		label: "LOREFRAME.Field.Quote",
		defaultKey: "LOREFRAME.Template.Quote.Placeholder"
	}, {
		id: "attribution",
		type: "text",
		label: "LOREFRAME.Field.Attribution",
		defaultKey: "LOREFRAME.Template.Quote.Attribution"
	}],
	focusField: "quote",
	tags: [
		"citation",
		"epigraph",
		"saying"
	]
};
//#endregion
//#region src/content-templates/layouts/layouts.ts
var COLUMNS_RENDERER = "columns";
var HERO_CONTENT_RENDERER = "hero-content";
var CARD_GRID_RENDERER = "card-grid";
var COLUMN = "LOREFRAME.Layout.ColumnPlaceholder";
var SIDEBAR = "LOREFRAME.Layout.SidebarPlaceholder";
var MAIN = "LOREFRAME.Layout.ContentPlaceholder";
/** Region patterns. Sizes map to flex bases, so regions wrap onto new lines when the Journal is narrow. */
var PATTERNS = {
	halves: [{
		slot: "column-1",
		size: "normal",
		placeholder: COLUMN
	}, {
		slot: "column-2",
		size: "normal",
		placeholder: COLUMN
	}],
	"narrow-wide": [{
		slot: "column-1",
		size: "narrow",
		placeholder: COLUMN
	}, {
		slot: "column-2",
		size: "wide",
		placeholder: COLUMN
	}],
	"wide-narrow": [{
		slot: "column-1",
		size: "wide",
		placeholder: COLUMN
	}, {
		slot: "column-2",
		size: "narrow",
		placeholder: COLUMN
	}],
	thirds: [
		{
			slot: "column-1",
			size: "third",
			placeholder: COLUMN
		},
		{
			slot: "column-2",
			size: "third",
			placeholder: COLUMN
		},
		{
			slot: "column-3",
			size: "third",
			placeholder: COLUMN
		}
	],
	"sidebar-left": [{
		slot: "sidebar",
		size: "sidebar",
		placeholder: SIDEBAR
	}, {
		slot: "main",
		size: "main",
		placeholder: MAIN
	}],
	"sidebar-right": [{
		slot: "main",
		size: "main",
		placeholder: MAIN
	}, {
		slot: "sidebar",
		size: "sidebar",
		placeholder: SIDEBAR
	}]
};
function patternOf(definition) {
	const name = definition.rendererOptions?.pattern;
	const regions = typeof name === "string" ? PATTERNS[name] : void 0;
	if (!regions) throw new Error(`Layout "${definition.id}" has unknown pattern "${String(name)}"`);
	return {
		name,
		regions
	};
}
var columnsRenderer = ({ definition, localize }) => {
	const { name, regions } = patternOf(definition);
	return {
		tag: "div",
		classes: ["loreframe-columns", `loreframe-columns--${name}`],
		children: regions.map(({ slot, size, placeholder }) => slotRegion(["loreframe-columns__region", `loreframe-columns__region--${size}`], slot, localize(placeholder)))
	};
};
function columnsDefinition(id, key, pattern, icon, tags) {
	const slots = (PATTERNS[pattern] ?? []).map((region) => region.slot);
	return {
		id,
		version: 1,
		name: `LOREFRAME.Template.${key}.Name`,
		description: `LOREFRAME.Template.${key}.Description`,
		category: "layouts",
		type: "layout",
		icon,
		renderer: COLUMNS_RENDERER,
		rendererOptions: { pattern },
		slots,
		focusField: slots[0],
		tags: [
			"columns",
			"layout",
			...tags
		]
	};
}
var columnDefinitions = [
	columnsDefinition("two-columns", "TwoColumns", "halves", "fa-solid fa-table-columns", ["50/50", "split"]),
	columnsDefinition("columns-narrow-wide", "NarrowWide", "narrow-wide", "fa-solid fa-table-columns", ["33/66"]),
	columnsDefinition("columns-wide-narrow", "WideNarrow", "wide-narrow", "fa-solid fa-table-columns", ["66/33"]),
	columnsDefinition("three-columns", "ThreeColumns", "thirds", "fa-solid fa-table-columns", ["thirds"]),
	columnsDefinition("sidebar-left", "SidebarLeft", "sidebar-left", "fa-solid fa-sidebar", ["aside"]),
	columnsDefinition("sidebar-right", "SidebarRight", "sidebar-right", "fa-solid fa-sidebar-flip", ["aside"])
];
/** A hero banner (image, title, subtitle) above a content slot. */
var heroContentRenderer = ({ values, localize }) => ({
	tag: "section",
	classes: ["loreframe-hero"],
	children: [{
		tag: "header",
		classes: ["loreframe-hero__banner"],
		children: [
			imageField("loreframe-hero__image", text(values, "image"), text(values, "alt")),
			{
				tag: "h2",
				classes: ["loreframe-hero__title"],
				field: "title",
				children: [text(values, "title")]
			},
			{
				tag: "p",
				classes: ["loreframe-hero__subtitle"],
				field: "subtitle",
				children: [text(values, "subtitle")]
			}
		]
	}, slotRegion(["loreframe-hero__content"], "content", localize(MAIN))]
});
var heroContentDefinition = {
	id: "hero-content",
	version: 1,
	name: "LOREFRAME.Template.HeroContent.Name",
	description: "LOREFRAME.Template.HeroContent.Description",
	category: "layouts",
	type: "layout",
	icon: "fa-solid fa-rectangle-history",
	renderer: HERO_CONTENT_RENDERER,
	fields: [
		{
			id: "image",
			type: "image",
			label: "LOREFRAME.Field.Image",
			default: ""
		},
		{
			id: "alt",
			type: "text",
			label: "LOREFRAME.Field.ImageAlt",
			defaultKey: "LOREFRAME.Field.ImageAltPlaceholder",
			imageAltFor: "image"
		},
		{
			id: "title",
			type: "text",
			label: "LOREFRAME.Field.Title",
			defaultKey: "LOREFRAME.Template.HeroContent.Name"
		},
		{
			id: "subtitle",
			type: "text",
			label: "LOREFRAME.Field.Subtitle",
			defaultKey: "LOREFRAME.Field.SubtitlePlaceholder"
		}
	],
	slots: ["content"],
	focusField: "title",
	tags: [
		"banner",
		"page",
		"layout",
		"cover"
	]
};
var CARD_COUNT = 3;
/** Cards in a responsive grid; each card is a slot. */
var cardGridRenderer = ({ localize }) => ({
	tag: "div",
	classes: ["loreframe-card-grid"],
	children: Array.from({ length: CARD_COUNT }, (_, index) => ({
		tag: "div",
		classes: ["loreframe-card-grid__card"],
		slot: `card-${index + 1}`,
		children: [labelHeading("loreframe-card-grid__title", localize("LOREFRAME.Layout.CardTitle")), ...paragraphs(localize("LOREFRAME.Layout.CardPlaceholder"))]
	}))
});
var cardGridDefinition = {
	id: "card-grid",
	version: 1,
	name: "LOREFRAME.Template.CardGrid.Name",
	description: "LOREFRAME.Template.CardGrid.Description",
	category: "layouts",
	type: "layout",
	icon: "fa-solid fa-grid-2",
	renderer: CARD_GRID_RENDERER,
	slots: Array.from({ length: CARD_COUNT }, (_, index) => `card-${index + 1}`),
	focusField: "card-1",
	tags: [
		"cards",
		"grid",
		"overview",
		"layout"
	]
};
//#endregion
//#region src/content-templates/index.ts
var RENDERERS = [
	[HEADING_RENDERER, headingRenderer],
	[SUBTITLE_RENDERER, subtitleRenderer],
	[DIVIDER_RENDERER, dividerRenderer],
	[QUOTE_RENDERER, quoteRenderer],
	[CALLOUT_RENDERER, calloutRenderer],
	[MEDIA_RENDERER, mediaRenderer],
	[HERO_IMAGE_RENDERER, heroImageRenderer],
	[KEY_VALUE_RENDERER, keyValueRenderer],
	[TAGS_RENDERER, tagsRenderer],
	[STATS_RENDERER, statsRenderer],
	[GALLERY_RENDERER, galleryRenderer],
	[COLUMNS_RENDERER, columnsRenderer],
	[HERO_CONTENT_RENDERER, heroContentRenderer],
	[CARD_GRID_RENDERER, cardGridRenderer],
	["npc", npcRenderer],
	[LOCATION_RENDERER, locationRenderer],
	[WIKI_RENDERER, wikiRenderer]
];
/** Built-in templates in the order spec §17 lists them; menus and the library follow this order. */
var BUILT_IN_TEMPLATES = [
	headingDefinition,
	subtitleDefinition,
	dividerDefinition,
	quoteDefinition,
	readAloudDefinition,
	noteDefinition,
	warningDefinition,
	loreDefinition,
	gmNoteDefinition,
	secretDefinition,
	imageTextDefinition,
	heroImageDefinition,
	keyValueDefinition,
	tagsDefinition,
	statsRowDefinition,
	galleryDefinition,
	...columnDefinitions,
	heroContentDefinition,
	mediaContentDefinition,
	cardGridDefinition,
	npcCardDefinition,
	npcDossierDefinition,
	locationDefinition,
	wikiDefinition
];
/** Register Loreframe's own renderers, presets and templates (templates validate both). */
function registerBuiltIns(core) {
	for (const [id, renderer] of RENDERERS) core.renderers.register(id, renderer);
	for (const preset of BUILT_IN_PRESETS) core.presets.register(preset);
	for (const definition of BUILT_IN_TEMPLATES) core.templates.register(definition);
}
//#endregion
//#region src/core/migration-service.ts
/**
* Explicit, targeted migrations of Loreframe blocks (spec §46). A block is replaced only after its whole
* chain succeeded on a copy; otherwise the original markup stays exactly as it was (spec §47).
*/
var MigrationService = class {
	#templates;
	#migrations = /* @__PURE__ */ new Map();
	constructor(templates) {
		this.#templates = templates;
	}
	register(migration) {
		if (!Number.isInteger(migration.from) || migration.from < 1) throw new Error(`Migration for "${migration.templateId}" needs a positive integer "from"`);
		const key = migrationKey(migration.templateId, migration.from);
		if (this.#migrations.has(key)) throw new Error(`Migration ${key} is already registered`);
		this.#migrations.set(key, migration);
	}
	migrateHtml(html) {
		const container = document.createElement("template");
		container.innerHTML = html;
		const issues = [];
		let changed = false;
		for (const block of parseBlocks(container.content, this.#templates).reverse()) {
			const base = {
				templateId: block.templateId,
				instanceId: block.instanceId,
				from: block.version
			};
			if (block.status === "unknown") issues.push({
				kind: "unknown-template",
				...base
			});
			else if (block.status === "newer") issues.push({
				kind: "newer-version",
				...base
			});
			else if (block.status === "invalid") issues.push({
				kind: "invalid-version",
				...base
			});
			if (block.status !== "outdated" || block.version === null) continue;
			const target = this.#templates.get(block.templateId)?.version ?? block.version;
			const outcome = this.#migrateBlock(block.element, block.version, target);
			if (outcome.issue) {
				issues.push({
					...base,
					...outcome.issue
				});
				continue;
			}
			block.element.replaceWith(outcome.element);
			changed = true;
		}
		return {
			html: changed ? container.innerHTML : html,
			changed,
			issues: issues.reverse()
		};
	}
	#migrateBlock(original, from, to) {
		const templateId = original.getAttribute(DATA_ATTR.template) ?? "";
		const steps = [];
		for (let version = from; version < to; version++) {
			const step = this.#migrations.get(migrationKey(templateId, version));
			if (!step) return { issue: {
				kind: "missing-migration",
				from: version
			} };
			steps.push(step);
		}
		const copy = original.cloneNode(true);
		let version = from;
		try {
			for (const step of steps) {
				step.migrate(copy);
				version++;
				copy.setAttribute(DATA_ATTR.version, String(version));
			}
		} catch (error) {
			logger.error(`Migration ${migrationKey(templateId, version)} failed; original block kept`, error);
			return { issue: {
				kind: "migration-failed",
				from: version,
				message: String(error)
			} };
		}
		return { element: copy };
	}
};
function migrationKey(templateId, from) {
	return `${templateId}@${from}`;
}
//#endregion
//#region src/core/renderer-registry.ts
/**
* Built-in renderers, addressed by id from template definitions. Not exposed through the public API:
* third-party templates are data that reuse these renderers (spec §9, §33).
*/
var RendererRegistry = class {
	#renderers = /* @__PURE__ */ new Map();
	register(id, renderer) {
		if (this.#renderers.has(id)) throw new Error(`Renderer "${id}" is already registered`);
		this.#renderers.set(id, renderer);
	}
	has(id) {
		return this.#renderers.has(id);
	}
	get(id) {
		return this.#renderers.get(id);
	}
};
//#endregion
//#region src/core/template-registry.ts
var ID_PATTERN$1 = /^[a-z0-9][a-z0-9-]*$/;
/** Lowercase only: field ids become attribute names (data-loreframe-opt-*), which HTML lowercases. */
var FIELD_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
var CATEGORIES = /* @__PURE__ */ new Set([
	"blocks",
	"layouts",
	"npc",
	"locations",
	"wiki",
	"gallery",
	"campaign",
	"system"
]);
var TYPES = /* @__PURE__ */ new Set([
	"block",
	"layout",
	"page"
]);
var FIELD_TYPES = /* @__PURE__ */ new Set([
	"text",
	"richText",
	"image",
	"select",
	"boolean",
	"items",
	"links"
]);
var INSPECTOR_GROUPS = /* @__PURE__ */ new Set([
	"general",
	"sections",
	"style"
]);
/** Central store of structure template definitions (spec §9). */
var TemplateRegistry = class {
	#templates = /* @__PURE__ */ new Map();
	#deps;
	constructor(deps) {
		this.#deps = deps;
	}
	register(definition) {
		this.#validate(definition);
		if (this.#templates.has(definition.id)) throw new Error(`Template "${definition.id}" is already registered`);
		this.#templates.set(definition.id, deepFreeze(structuredClone(definition)));
	}
	unregister(id) {
		return this.#templates.delete(id);
	}
	has(id) {
		return this.#templates.has(id);
	}
	get(id) {
		return this.#templates.get(id);
	}
	list(filter = {}) {
		return [...this.#templates.values()].filter((d) => (filter.category === void 0 || d.category === filter.category) && (filter.type === void 0 || d.type === filter.type) && (filter.systemId === void 0 || d.system == null || d.system === filter.systemId));
	}
	#validate(d) {
		const fail = (message) => {
			throw new Error(`Invalid template "${String(d.id)}": ${message}`);
		};
		if (typeof d.id !== "string" || !ID_PATTERN$1.test(d.id)) fail("id must be lowercase kebab-case");
		if (!Number.isInteger(d.version) || d.version < 1) fail("version must be a positive integer");
		if (typeof d.name !== "string" || !d.name) fail("name is required");
		if (!CATEGORIES.has(d.category)) fail(`unknown category "${d.category}"`);
		if (!TYPES.has(d.type)) fail(`unknown type "${d.type}"`);
		if (!this.#deps.hasRenderer(d.renderer)) fail(`unknown renderer "${d.renderer}"`);
		for (const preset of d.presets ?? []) if (!this.#deps.hasPreset(preset)) fail(`unknown preset "${preset}"`);
		const fieldIds = /* @__PURE__ */ new Set();
		for (const field of d.fields ?? []) {
			if (!FIELD_ID_PATTERN.test(field.id) || fieldIds.has(field.id)) fail(`invalid or duplicate field "${field.id}"`);
			fieldIds.add(field.id);
			if (!FIELD_TYPES.has(field.type)) fail(`field "${field.id}" has unknown type "${field.type}"`);
			if (field.type === "select" && !field.options?.length) fail(`select field "${field.id}" needs options`);
			if (field.inspectorGroup !== void 0 && !INSPECTOR_GROUPS.has(field.inspectorGroup)) fail(`field "${field.id}" has unknown inspectorGroup "${field.inspectorGroup}"`);
		}
		for (const field of d.fields ?? []) {
			if (field.imageAltFor === void 0) continue;
			const target = d.fields?.find((f) => f.id === field.imageAltFor);
			if (field.type !== "text" || target?.type !== "image") fail(`field "${field.id}" has imageAltFor "${field.imageAltFor}" that is not an image field`);
		}
		const slotIds = /* @__PURE__ */ new Set();
		for (const slot of d.slots ?? []) {
			if (!FIELD_ID_PATTERN.test(slot) || slotIds.has(slot) || fieldIds.has(slot)) fail(`invalid, duplicate or field-named slot "${slot}"`);
			slotIds.add(slot);
		}
		if (d.focusField !== void 0 && !fieldIds.has(d.focusField) && !slotIds.has(d.focusField)) fail(`focusField "${d.focusField}" is neither a field nor a slot`);
	}
};
function deepFreeze(value) {
	if (value && typeof value === "object") {
		for (const child of Object.values(value)) deepFreeze(child);
		Object.freeze(value);
	}
	return value;
}
//#endregion
//#region src/core/element-tree.ts
var LoreframeMarkupError = class extends Error {
	name = "LoreframeMarkupError";
};
/** Tags that only hold block children — Foundry's schema gives them `block*` content (spec §12). */
var CONTAINER_TAGS = /* @__PURE__ */ new Set([
	"aside",
	"div",
	"section",
	"header",
	"footer",
	"article",
	"nav",
	"blockquote",
	"ul",
	"ol",
	"li",
	"table",
	"thead",
	"tbody",
	"tr",
	"th",
	"td"
]);
/** Tags whose children are inline text. */
var TEXT_TAGS = /* @__PURE__ */ new Set([
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"p",
	"figcaption"
]);
var VOID_TAGS = /* @__PURE__ */ new Set(["hr", "img"]);
/** `figure` is special in the schema: `image? figcaption? block*`. */
var OTHER_TAGS = /* @__PURE__ */ new Set(["figure"]);
var EXACT_ATTRS = /* @__PURE__ */ new Set([
	"data-no-toc",
	"alt",
	"src",
	"role"
]);
var URL_ATTRS = /* @__PURE__ */ new Set(["src"]);
var CLASS_PATTERN = /^loreframe[a-z0-9_-]*$/;
var FIELD_PATTERN = /^[a-z][a-z0-9-]*$/;
var ATTR_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
/**
* Serialize an element tree into HTML. This is the only path from renderer output to markup, so it enforces
* the Loreframe allow-list and escapes every value.
*/
function serializeTree(tree) {
	return serializeElement(tree);
}
function serializeElement(node) {
	if (node.secret) return serializeSecret(node);
	const tag = node.tag;
	const isVoid = VOID_TAGS.has(tag);
	if (!isVoid && !CONTAINER_TAGS.has(tag) && !TEXT_TAGS.has(tag) && !OTHER_TAGS.has(tag)) throw new LoreframeMarkupError(`Disallowed tag <${tag}>`);
	const attrs = [];
	if (node.classes?.length) {
		for (const cls of node.classes) if (!CLASS_PATTERN.test(cls)) throw new LoreframeMarkupError(`Disallowed class "${cls}"`);
		attrs.push(`class="${node.classes.join(" ")}"`);
	}
	if (node.field !== void 0) {
		if (!FIELD_PATTERN.test(node.field)) throw new LoreframeMarkupError(`Invalid field name "${node.field}"`);
		attrs.push(`${DATA_ATTR.field}="${node.field}"`);
	}
	if (node.slot !== void 0) {
		if (!FIELD_PATTERN.test(node.slot)) throw new LoreframeMarkupError(`Invalid slot name "${node.slot}"`);
		if (!CONTAINER_TAGS.has(node.tag)) throw new LoreframeMarkupError(`Slot <${node.tag}> must be a block container`);
		attrs.push(`${DATA_ATTR.slot}="${node.slot}"`);
	}
	for (const [name, value] of Object.entries(node.attrs ?? {})) {
		assertAllowedAttribute(name, value);
		attrs.push(`${name}="${escapeHtml(value)}"`);
	}
	const open = attrs.length ? `<${tag} ${attrs.join(" ")}>` : `<${tag}>`;
	const children = node.children ?? [];
	if (isVoid) {
		if (children.length) throw new LoreframeMarkupError(`Void element <${tag}> cannot have children`);
		return open;
	}
	return `${open}${children.map((child) => serializeChild(tag, child)).join("")}</${tag}>`;
}
/**
* Foundry's reveal toggle (client/applications/elements/secret-block.mjs) rewrites the secret's opening tag with a
* regex, so the tag carries nothing but its class. ProseMirror assigns the id while parsing.
*/
function serializeSecret(node) {
	if (node.tag !== "section") throw new LoreframeMarkupError(`A secret must be a <section>, not <${node.tag}>`);
	if (node.classes?.length || node.field !== void 0 || node.slot !== void 0 || Object.keys(node.attrs ?? {}).length) throw new LoreframeMarkupError("A secret section must be bare");
	return `<section class="secret">${(node.children ?? []).map((child) => serializeChild("section", child)).join("")}</section>`;
}
function serializeChild(parentTag, child) {
	if (typeof child !== "string") return serializeElement(child);
	if (!TEXT_TAGS.has(parentTag)) throw new LoreframeMarkupError(`Bare text is not allowed directly inside <${parentTag}>`);
	return escapeHtml(child);
}
function assertAllowedAttribute(name, value) {
	if (!(ATTR_NAME_PATTERN.test(name) && (EXACT_ATTRS.has(name) || name.startsWith("data-loreframe-") || name.startsWith("aria-")))) throw new LoreframeMarkupError(`Disallowed attribute "${name}"`);
	if (URL_ATTRS.has(name) && !isSafeUrl(value)) throw new LoreframeMarkupError(`Disallowed URL in ${name}: "${value}"`);
}
/** http(s) or a relative path inside the Foundry data tree. No scheme-relative or other schemes. */
function isSafeUrl(value) {
	const trimmed = value.trim();
	if (trimmed.startsWith("//")) return false;
	const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)?.[1]?.toLowerCase();
	if (scheme === void 0) return ![...trimmed].some((char) => char.charCodeAt(0) < 32);
	return scheme === "http" || scheme === "https";
}
//#endregion
//#region src/core/template-renderer.ts
var INSTANCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
var EMBED_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
/** Blocks may embed blocks, but a template cannot (indirectly) embed itself forever. */
var MAX_EMBED_DEPTH = 4;
/** Tags a block root may use: containers the Foundry schema preserves. */
var ROOT_TAGS = /* @__PURE__ */ new Set([
	"aside",
	"div",
	"section",
	"article",
	"header",
	"footer"
]);
var RESERVED_ROOT_ATTRS = /* @__PURE__ */ new Set([
	DATA_ATTR.template,
	DATA_ATTR.version,
	DATA_ATTR.instance,
	DATA_ATTR.preset
]);
/** Renders a registered template into durable semantic HTML (spec §10). */
var TemplateRenderer = class {
	#deps;
	constructor(deps) {
		this.#deps = deps;
	}
	render(templateId, options) {
		return serializeTree(this.renderTree(templateId, options));
	}
	/** The block as an element tree: its root, or a bare Foundry secret around it for GM-only templates. */
	renderTree(templateId, options, depth = 0) {
		if (depth > MAX_EMBED_DEPTH) throw new Error(`Template "${templateId}" is nested too deeply`);
		const { templates, presets, renderers, localize } = this.#deps;
		const definition = templates.get(templateId);
		if (!definition) throw new Error(`Unknown template "${templateId}"`);
		if (!INSTANCE_ID_PATTERN.test(options.instanceId)) throw new Error(`Invalid instance id "${options.instanceId}"`);
		const presetId = options.preset === void 0 ? definition.presets?.[0] ?? null : options.preset;
		if (presetId !== null && !definition.presets?.includes(presetId)) throw new Error(`Template "${templateId}" does not support preset "${presetId}"`);
		const values = resolveValues(definition, presetId === null ? null : presets.get(presetId) ?? null, options.values ?? {}, localize);
		const renderer = renderers.get(definition.renderer);
		if (!renderer) throw new Error(`Renderer "${definition.renderer}" is not available`);
		const embed = (childId, embedOptions) => {
			if (!EMBED_KEY_PATTERN.test(embedOptions.key)) throw new Error(`Invalid embed key "${embedOptions.key}"`);
			return this.renderTree(childId, {
				instanceId: `${options.instanceId}-${embedOptions.key}`,
				values: embedOptions.values,
				...embedOptions.preset === void 0 ? {} : { preset: embedOptions.preset }
			}, depth + 1);
		};
		const tree = renderer({
			definition,
			values,
			preset: presetId,
			localize,
			embed
		});
		if (!ROOT_TAGS.has(tree.tag)) throw new Error(`Renderer "${definition.renderer}" produced root <${tree.tag}>`);
		for (const name of Object.keys(tree.attrs ?? {})) if (RESERVED_ROOT_ATTRS.has(name) || name.startsWith(DATA_ATTR.optionPrefix)) throw new Error(`Renderer may not set ${name}`);
		const rootAttrs = {
			[DATA_ATTR.template]: definition.id,
			[DATA_ATTR.version]: String(definition.version),
			[DATA_ATTR.instance]: options.instanceId
		};
		if (presetId !== null) rootAttrs[DATA_ATTR.preset] = presetId;
		for (const field of definition.fields ?? []) {
			const value = values[field.id];
			if ((field.type === "select" || field.type === "boolean") && value !== void 0) rootAttrs[`${DATA_ATTR.optionPrefix}${field.id}`] = String(value);
		}
		const root = {
			...tree,
			classes: [.../* @__PURE__ */ new Set([
				"loreframe-block",
				`loreframe-${definition.id}`,
				...presetId === null ? [] : [`loreframe-preset--${presetId}`],
				...tree.classes ?? []
			])],
			attrs: {
				...rootAttrs,
				...tree.attrs
			}
		};
		return definition.secret ? {
			tag: "section",
			secret: true,
			children: [root]
		} : root;
	}
};
//#endregion
//#region src/core/loreframe-core.ts
/** Wire the template engine. Foundry-independent: runtime and tests inject localization and id generation. */
function createCore(options) {
	const renderers = new RendererRegistry();
	const presets = new PresetRegistry();
	const templates = new TemplateRegistry({
		hasRenderer: (id) => renderers.has(id),
		hasPreset: (id) => presets.has(id)
	});
	const renderer = new TemplateRenderer({
		templates,
		presets,
		renderers,
		localize: options.localize
	});
	const core = {
		templates,
		presets,
		renderers,
		renderer,
		migrations: new MigrationService(templates),
		parse: (root) => parseBlocks(root, templates),
		renderNew: (templateId, renderOptions = {}) => renderer.render(templateId, {
			...renderOptions,
			instanceId: options.newInstanceId()
		})
	};
	if (options.builtIns !== false) registerBuiltIns(core);
	return core;
}
/** Per-user template favorites and recent use (spec §16). */
var Preferences = class {
	#storage;
	constructor(storage) {
		this.#storage = storage;
	}
	favorites() {
		return this.#read("favorites");
	}
	isFavorite(templateId) {
		return this.favorites().includes(templateId);
	}
	/** Add or remove a favorite; resolves to whether it is now a favorite. */
	async toggleFavorite(templateId) {
		const favorites = this.favorites();
		const isFavorite = favorites.includes(templateId);
		const next = isFavorite ? favorites.filter((id) => id !== templateId) : [...favorites, templateId];
		await this.#storage.set("favorites", next);
		return !isFavorite;
	}
	/** Most recently used first. */
	recent() {
		return this.#read("recent");
	}
	async recordUse(templateId) {
		const recent = this.recent();
		if (recent[0] === templateId) return;
		const next = [templateId, ...recent.filter((id) => id !== templateId)].slice(0, 15);
		await this.#storage.set("recent", next);
	}
	#read(key) {
		const value = this.#storage.get(key);
		return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
	}
};
//#endregion
//#region src/editor/insert.ts
/**
* Build a transaction that places a block-level node at the user's cursor.
*
* - Inside a Loreframe block, blocks nest only in slot regions (`data-loreframe-slot`). From any other part of a
*   block (label, content fields) the new block goes after that Loreframe block and the selection is kept, so
*   consecutive inserts never replace the previous block's selected placeholder.
* - Otherwise a non-empty selection is deleted first, then handled like a cursor.
* - A cursor in an empty textblock replaces that textblock (when the parent allows it).
* - Otherwise the block goes directly after the textblock holding the cursor.
* - If the block ends up last in its parent, an empty paragraph follows so writing can continue.
* - The focus field's text (or the block's last textblock) is selected, so typing replaces the placeholder.
*/
function insertBlockTransaction(state, block, pm, options = {}) {
	const tr = state.tr;
	const hostDepth = enclosingBlockDepth(state.selection.$from);
	let from;
	let to;
	if (hostDepth !== null) from = to = state.selection.$from.after(hostDepth);
	else {
		if (!state.selection.empty) tr.deleteSelection();
		({from, to} = cursorRange(tr, block));
	}
	const stepIndex = tr.steps.length;
	tr.replaceRangeWith(from, to, block);
	const blockPos = findInsertedBlock(tr, stepIndex, block);
	if (blockPos === null) throw new Error("Inserted block could not be located in the document");
	const blockEnd = blockPos + block.nodeSize;
	appendParagraphIfLast(tr, blockEnd);
	const target = (options.focusField ? fieldTextRange(tr.doc, blockPos, blockEnd, options.focusField) : null) ?? lastTextblockRange(tr.doc, blockPos, blockEnd);
	tr.setSelection(target ? pm.TextSelection.create(tr.doc, target.from, target.to) : pm.Selection.near(tr.doc.resolve(blockEnd), -1));
	return tr.scrollIntoView();
}
/** Depth of the nearest Loreframe block root around `$pos` that is not separated from it by a slot. */
function enclosingBlockDepth($pos) {
	for (let depth = $pos.depth; depth > 0; depth--) {
		const node = $pos.node(depth);
		if (isLoreframeSlot(node)) return null;
		if (isLoreframeRoot(node)) return depth > 1 && isSecretWrapper($pos.node(depth - 1)) ? depth - 1 : depth;
	}
	return null;
}
/** Where a block goes for a cursor outside Loreframe blocks (or inside a slot). */
function cursorRange(tr, block) {
	const { $from } = tr.selection;
	if ($from.depth === 0) return {
		from: $from.pos,
		to: $from.pos
	};
	const parent = $from.parent;
	const container = $from.node(-1);
	const index = $from.index(-1);
	return {
		from: parent.isTextblock && parent.content.size === 0 && container.canReplaceWith(index, index + 1, block.type) ? $from.before() : $from.after(),
		to: $from.after()
	};
}
function findInsertedBlock(tr, stepIndex, block) {
	let start = 0;
	let end = tr.doc.content.size;
	tr.steps[stepIndex]?.getMap().forEach((_oldStart, _oldEnd, newStart, newEnd) => {
		start = newStart;
		end = newEnd;
	});
	let found = null;
	tr.doc.nodesBetween(start, end, (node, pos) => {
		if (found !== null) return false;
		if (pos >= start && node.eq(block)) {
			found = pos;
			return false;
		}
		return true;
	});
	return found;
}
function appendParagraphIfLast(tr, blockEnd) {
	const paragraph = tr.doc.type.schema.nodes.paragraph;
	if (!paragraph) return;
	const $end = tr.doc.resolve(blockEnd);
	const index = $end.index();
	if (index < $end.parent.childCount) return;
	if (!$end.parent.canReplaceWith(index, index, paragraph)) return;
	tr.insert(blockEnd, paragraph.create());
}
/** Content range of the last textblock between `from` and `to`. */
function lastTextblockRange(doc, from, to) {
	let range = null;
	doc.nodesBetween(from, to, (node, pos) => {
		if (!node.isTextblock) return true;
		range = {
			from: pos + 1,
			to: pos + 1 + node.content.size
		};
		return false;
	});
	return range;
}
/** Content range of the first textblock inside (or being) the field or slot named `field`. */
function fieldTextRange(doc, from, to, field) {
	let range = null;
	let inField = -1;
	doc.nodesBetween(from, to, (node, pos) => {
		if (range) return false;
		const name = getHtmlAttribute(node, DATA_ATTR.field) ?? getHtmlAttribute(node, DATA_ATTR.slot);
		if (inField < 0 && name === field) inField = pos + node.nodeSize;
		if (inField >= 0 && pos < inField && node.isTextblock) {
			range = {
				from: pos + 1,
				to: pos + 1 + node.content.size
			};
			return false;
		}
		return true;
	});
	return range;
}
//#endregion
//#region src/editor/insert-template.ts
/**
* Insert a fresh instance of a template at the editor's selection (or `options.at`). Shared by the editor menu, the
* library and document drops.
*/
function insertTemplateIntoView(view, templateId, deps, options = {}) {
	if (!view.editable) {
		logger.warn(`Cannot insert "${templateId}": the editor is read-only`);
		deps.notifyError("LOREFRAME.Error.NoEditor");
		return false;
	}
	try {
		const { values, preset, at } = options;
		const renderOptions = {
			...values === void 0 ? {} : { values },
			...preset === void 0 ? {} : { preset }
		};
		const block = deps.parseHtml(Object.keys(renderOptions).length ? deps.renderNew(templateId, renderOptions) : deps.renderNew(templateId)).firstChild;
		if (!block) throw new Error(`Template "${templateId}" produced no content`);
		if (at !== void 0) {
			const { doc } = view.state;
			const $pos = doc.resolve(Math.max(0, Math.min(at, doc.content.size)));
			view.dispatch(view.state.tr.setSelection(deps.stateModule.Selection.near($pos)));
		}
		const focusField = deps.templates.get(templateId)?.focusField;
		view.dispatch(insertBlockTransaction(view.state, block, deps.stateModule, { focusField }));
		view.focus();
	} catch (error) {
		logger.error(`Inserting template "${templateId}" failed`, error);
		deps.notifyError("LOREFRAME.Error.InsertFailed");
		return false;
	}
	const used = options.recordAs ?? templateId;
	Promise.resolve(deps.recordUse(used)).catch((error) => logger.error(`Could not remember recent use of "${used}"`, error));
	return true;
}
//#endregion
//#region src/integrations/integration-manager.ts
var ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/** Chooses the adapter for a document (spec §34). The only place that compares game system ids. */
var IntegrationManager = class {
	#adapters = /* @__PURE__ */ new Map();
	#deps;
	constructor(deps) {
		this.#deps = deps;
	}
	register(adapter) {
		if (typeof adapter.id !== "string" || !ID_PATTERN.test(adapter.id)) throw new Error(`Invalid adapter id "${String(adapter.id)}"`);
		if (typeof adapter.systemId !== "string" || !adapter.systemId) throw new Error(`Adapter "${adapter.id}" needs a systemId`);
		if (typeof adapter.canHandle !== "function") throw new Error(`Adapter "${adapter.id}" needs canHandle`);
		if (!Array.isArray(adapter.documentTypes)) throw new Error(`Adapter "${adapter.id}" needs documentTypes`);
		if (this.#adapters.has(adapter.id)) throw new Error(`Adapter "${adapter.id}" is already registered`);
		this.#adapters.set(adapter.id, Object.freeze({
			...adapter,
			documentTypes: [...adapter.documentTypes]
		}));
	}
	/** Whether an active adapter can turn documents of this type into NPC data. */
	handles(documentType) {
		return this.#active().some((a) => a.getNpcData && a.documentTypes.includes(documentType));
	}
	npcData(document) {
		for (const adapter of this.#active()) {
			if (!adapter.getNpcData) continue;
			try {
				if (!adapter.canHandle(document)) continue;
				const data = adapter.getNpcData(document);
				if (data) return data;
			} catch (error) {
				logger.error(`System adapter "${adapter.id}" failed`, error);
			}
		}
		return null;
	}
	#active() {
		if (!this.#deps.enabled()) return [];
		const systemId = this.#deps.systemId();
		return [...this.#adapters.values()].filter((adapter) => adapter.systemId === systemId);
	}
};
//#endregion
//#region src/runtime.ts
/** Resolve a block for editing, reporting why it cannot be edited. */
function editableBlock(core, view, instanceId) {
	if (view.isDestroyed || !view.editable) {
		ui.notifications.warn("LOREFRAME.Error.NoEditor", { localize: true });
		return null;
	}
	const location = locateBlock(view.state.doc, instanceId);
	if (!location) {
		ui.notifications.warn("LOREFRAME.Error.BlockMissing", { localize: true });
		return null;
	}
	return location;
}
function createRuntime() {
	const core = createCore({
		localize: (key) => game.i18n.localize(key),
		newInstanceId
	});
	const preferences = new Preferences({
		get: (key) => getSetting(key === "favorites" ? SETTINGS.favorites : SETTINGS.recent),
		set: (key, value) => game.settings.set(MODULE_ID, key === "favorites" ? SETTINGS.favorites : SETTINGS.recent, value)
	});
	const tracker = new EditorTracker();
	const userTemplates = new UserTemplateStore({
		templates: core.templates,
		presets: core.presets,
		read: () => getSetting(SETTINGS.userTemplates),
		write: (list) => game.settings.set(MODULE_ID, SETTINGS.userTemplates, list),
		newId: newInstanceId
	});
	const listeners = /* @__PURE__ */ new Set();
	return {
		core,
		preferences,
		tracker,
		integrations: new IntegrationManager({
			systemId: () => game.system.id,
			enabled: () => getSetting(SETTINGS.enableIntegrations)
		}),
		userTemplates,
		libraryUserTemplates: () => {
			const available = new Map(core.templates.list({ systemId: game.system.id }).map((definition) => [definition.id, definition]));
			return userTemplates.list().flatMap((template) => {
				const base = available.get(template.base);
				return base ? [{
					...template,
					base
				}] : [];
			});
		},
		insertEntry(view, id, preset) {
			const template = userTemplates.get(id);
			if (!template) return this.insert(view, id, preset ? { preset } : {});
			return this.insert(view, template.base, {
				values: template.values,
				...template.preset ? { preset: template.preset } : {},
				recordAs: template.id
			});
		},
		onUserTemplatesChanged(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		notifyUserTemplatesChanged() {
			for (const listener of listeners) listener();
		},
		availableTemplates: () => core.templates.list({ systemId: game.system.id }),
		insert: (view, templateId, options = {}) => insertTemplateIntoView(view, templateId, {
			templates: core.templates,
			renderNew: (id, renderOptions = {}) => core.renderNew(id, renderOptions),
			parseHtml: (html) => ProseMirror.dom.parseString(html),
			stateModule: ProseMirror.state,
			recordUse: (id) => preferences.recordUse(id),
			notifyError: (key) => ui.notifications.error(key, { localize: true })
		}, options),
		presetsFor: (definition) => core.presets.listFor(definition),
		readBlock: (view, instanceId) => {
			const location = locateBlock(view.state.doc, instanceId);
			const definition = location ? core.templates.get(location.templateId) : void 0;
			if (!location || !definition) return null;
			return {
				definition,
				values: readBlockValues(location.root, definition),
				preset: getHtmlAttribute(location.root, DATA_ATTR.preset) ?? null,
				version: blockVersionState(location.root, definition)
			};
		},
		writtenFields: (view, instanceId) => {
			const location = locateBlock(view.state.doc, instanceId);
			const definition = location ? core.templates.get(location.templateId) : void 0;
			if (!location || !definition) return [];
			try {
				const preset = getHtmlAttribute(location.root, DATA_ATTR.preset) ?? null;
				const html = core.renderer.render(definition.id, {
					instanceId,
					preset
				});
				const fresh = ProseMirror.dom.parseString(html).firstChild;
				const freshRoot = fresh?.type.name === "secret" ? fresh.firstChild : fresh;
				return freshRoot ? writtenRegions(location.root, freshRoot, definition) : [];
			} catch (error) {
				logger.error(`Could not compare block "${instanceId}" with its defaults`, error);
				return [...(definition.fields ?? []).filter((f) => f.type === "richText").map((f) => f.id), ...definition.slots ?? []];
			}
		},
		updateBlock: (view, instanceId, changed, nextPreset) => {
			const location = editableBlock(core, view, instanceId);
			const definition = location ? core.templates.get(location.templateId) : void 0;
			if (!location || !definition) return false;
			if (blockVersionState(location.root, definition) !== "current") {
				ui.notifications.warn("LOREFRAME.Error.BlockVersion", { localize: true });
				return false;
			}
			try {
				const values = {
					...readBlockValues(location.root, definition),
					...changed
				};
				const preset = nextPreset ?? getHtmlAttribute(location.root, DATA_ATTR.preset) ?? null;
				const html = core.renderer.render(definition.id, {
					instanceId,
					values,
					preset
				});
				const fresh = ProseMirror.dom.parseString(html).firstChild;
				if (!fresh) throw new Error("Rendered block is empty");
				view.dispatch(rebuildBlockTransaction(view.state, location, fresh, definition, ProseMirror.state).scrollIntoView());
				view.focus();
				return true;
			} catch (error) {
				logger.error(`Updating block "${instanceId}" failed`, error);
				ui.notifications.error("LOREFRAME.Error.UpdateFailed", { localize: true });
				return false;
			}
		},
		migrateBlock: (view, instanceId) => {
			const location = editableBlock(core, view, instanceId);
			if (!location) return false;
			const result = migrateBlockTransaction(view.state, location, {
				migrations: core.migrations,
				serialize: (node) => ProseMirror.dom.serializeString(view.state.schema.topNodeType.create(null, node)),
				parse: (html) => ProseMirror.dom.parseString(html)
			});
			if (!result.ok) {
				logger.warn(`Block "${instanceId}" was not migrated (${result.issue}); it is kept unchanged`);
				ui.notifications.warn("LOREFRAME.Error.MigrationFailed", { localize: true });
				return false;
			}
			view.dispatch(result.tr.scrollIntoView());
			return true;
		},
		duplicateBlock: (view, instanceId) => {
			const location = editableBlock(core, view, instanceId);
			if (!location) return false;
			view.dispatch(duplicateBlockTransaction(view.state, location, newInstanceId).scrollIntoView());
			view.focus();
			return true;
		},
		deleteBlock: (view, instanceId) => {
			const location = editableBlock(core, view, instanceId);
			if (!location) return false;
			view.dispatch(deleteBlockTransaction(view.state, location, ProseMirror.state).scrollIntoView());
			view.focus();
			return true;
		},
		renderPreview: (id, preset) => {
			try {
				const template = userTemplates.get(id);
				const templateId = template?.base ?? id;
				return core.renderer.render(templateId, {
					instanceId: "preview",
					...template ? { values: template.values } : {},
					...preset ? { preset } : {}
				});
			} catch (error) {
				logger.error(`Preview of template "${id}" failed`, error);
				return null;
			}
		}
	};
}
//#endregion
//#region src/view/article-contents.ts
/**
* In-page contents for Wiki articles (spec §19). The document stores only an empty `nav[data-loreframe-contents]`;
* it is filled when the page is displayed, so it never goes stale and shows nothing without Loreframe.
*/
var CONTENTS_ATTR = DATA_ATTR.contents;
var ARTICLE_SLOT = "article";
var HEADINGS = /* @__PURE__ */ new Set([
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6"
]);
/** Article headings as Foundry's ToC sees them (no `data-no-toc`), limited to two levels. */
function collectContents(article) {
	const headings = [...article.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((heading) => HEADINGS.has(heading.tagName) && !("noToc" in heading.dataset) && heading.textContent.trim());
	const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
	const top = Math.min(...levels);
	return headings.flatMap((heading, i) => {
		const depth = (levels[i] ?? top) - top;
		return depth < 2 ? [{
			text: heading.textContent.trim(),
			depth,
			heading
		}] : [];
	});
}
/** Fill every contents box inside `root` from the article of the same block. */
function enhanceArticleContents(root, localize) {
	for (const nav of root.querySelectorAll(`[${CONTENTS_ATTR}]`)) {
		const block = nav.closest(`[${DATA_ATTR.template}]`);
		const article = [...block?.querySelectorAll(`[${DATA_ATTR.slot}="${ARTICLE_SLOT}"]`) ?? []].find((slot) => slot.closest(`[${DATA_ATTR.template}]`) === block);
		const entries = article ? collectContents(article) : [];
		nav.querySelector(":scope > ol")?.remove();
		nav.hidden = entries.length === 0;
		if (!entries.length) continue;
		nav.setAttribute("aria-label", localize("LOREFRAME.Wiki.Contents.Label"));
		nav.append(buildList(entries));
	}
}
function buildList(entries) {
	const list = document.createElement("ol");
	list.className = "loreframe-wiki__contents-list";
	const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
	for (const { text, depth, heading } of entries) {
		const item = document.createElement("li");
		item.className = `loreframe-wiki__contents-item loreframe-wiki__contents-item--depth-${depth}`;
		const button = document.createElement("button");
		button.type = "button";
		button.className = "loreframe-wiki__contents-link";
		button.textContent = text;
		button.addEventListener("click", () => heading.scrollIntoView({
			behavior: reduceMotion ? "auto" : "smooth",
			block: "start"
		}));
		item.append(button);
		list.append(item);
	}
	return list;
}
//#endregion
//#region src/main.ts
var runtime;
var api;
Hooks.once("init", () => {
	registerSettings();
	runtime = createRuntime();
	const module = game.modules.get(MODULE_ID);
	api = createApi({
		core: runtime.core,
		version: module?.version ?? "0.0.0",
		openLibrary: () => openTemplateLibrary(runtime),
		activeEditor: () => runtime.tracker.active(),
		insert: (view, templateId, options) => runtime.insert(view, templateId, options),
		integrations: runtime.integrations
	});
	registerDnd5eIntegration(runtime.integrations, (key, data) => game.i18n.format(key, data));
	if (module) module.api = api;
	else logger.error("Module entry missing from game.modules; API not exposed");
	Hooks.on("getProseMirrorMenuDropDowns", (_menu, menus) => {
		menus[DROPDOWN_KEY] = buildLoreframeDropdown({
			templates: runtime.core.templates,
			systemId: game.system.id,
			favorites: () => runtime.preferences.favorites(),
			recent: () => runtime.preferences.recent(),
			insert: (view, templateId) => runtime.insert(view, templateId),
			openLibrary: (view) => openTemplateLibrary(runtime, view)
		});
	});
	Hooks.on("createProseMirrorEditor", (_uuid, plugins) => {
		if (isChatEditor(plugins, ProseMirror.plugins.chat.ChatInputPlugin.key)) return;
		prependPlugin(plugins, "loreframeDocumentDrop", buildDocumentDropPlugin({
			Plugin: ProseMirror.Plugin,
			getDragData: (event) => foundry.applications.ux.TextEditor.implementation.getDragEventData(event),
			claims: (type) => runtime.integrations.handles(type),
			onDrop: (view, drop) => {
				handleDocumentDrop(runtime, view, drop).catch((error) => {
					logger.error("Document drop failed", error);
					ui.notifications.error("LOREFRAME.Error.InsertFailed", { localize: true });
				});
			}
		}));
		plugins.loreframeBlockIntegrity = buildBlockIntegrityPlugin({
			Plugin: ProseMirror.Plugin,
			newInstanceId
		});
		plugins.loreframeEditorTracker = buildEditorTrackerPlugin({
			Plugin: ProseMirror.Plugin,
			tracker: runtime.tracker
		});
		plugins.loreframeBlockToolbar = buildBlockToolbarPlugin({
			Plugin: ProseMirror.Plugin,
			localize: (key) => game.i18n.localize(key),
			templateName: (id) => {
				const definition = runtime.core.templates.get(id);
				return definition ? game.i18n.localize(definition.name) : null;
			},
			onEdit: (view, instanceId) => {
				openBlockInspector(runtime, view, instanceId).catch((error) => logger.error(`Could not open the inspector for "${instanceId}"`, error));
			},
			onDuplicate: (view, instanceId) => runtime.duplicateBlock(view, instanceId),
			onDelete: (view, instanceId) => runtime.deleteBlock(view, instanceId)
		});
	});
	Hooks.on("renderJournalEntryPageSheet", (app, element) => {
		if (!app.isView) return;
		try {
			enhanceArticleContents(element, (key) => game.i18n.localize(key));
		} catch (error) {
			logger.error("Could not build article contents", error);
		}
	});
});
Hooks.once("setup", () => {
	Hooks.callAll("loreframeRegisterTemplates", api);
});
Hooks.once("ready", () => {
	Hooks.callAll("loreframeReady", api);
	logger.debug(`Ready with ${runtime.core.templates.list().length} templates`);
});
//#endregion

