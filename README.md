<div align="center">

# Loreframe

**Reusable visual blocks, responsive layouts and RPG content templates for the Foundry VTT 14 Journal editor.**

[![Foundry VTT](https://img.shields.io/badge/Foundry%20VTT-v14.367-c76b2c?style=flat-square)](https://foundryvtt.com/)
[![System](https://img.shields.io/badge/dnd5e-5.3.3%20optional-7c4d2b?style=flat-square)](https://github.com/foundryvtt/dnd5e)
[![Release](https://img.shields.io/github/v/release/TacticalOtaku/Loreframe?style=flat-square&color=4a6b53)](https://github.com/TacticalOtaku/Loreframe/releases)
[![Languages](https://img.shields.io/badge/Languages-EN%20%7C%20RU-3b5978?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-MIT-555555?style=flat-square)](LICENSE)

[Installation](#installation) · [Built-in Library](#built-in-library) · [Workflow](#using-loreframe) · [Developer API](#for-module-developers) · [Development](#development)

</div>

---

Loreframe extends the standard **Foundry VTT 14** ProseMirror Journal editor instead of replacing it. It adds a single **Loreframe** dropdown menu and a searchable **Template Library** window with live previews. Every block saves as ordinary, semantic HTML right inside your Journal page — you keep writing rich text and using native Foundry links, and your notes remain clean and readable even if Loreframe is ever disabled.

### Highlights

- **Just plain HTML** — Blocks store structure in `data-loreframe-*` attributes inside native tags (`aside`, `section`, `div`, headings, paragraphs). No proprietary page format or runtime lock-in.
- **Write directly in the page** — Prose text and nested content live directly in ProseMirror with full undo/redo (`Ctrl+Z`). Rebuilding a block in the inspector preserves your writing and nested slots.
- **Built-in presets & theme awareness** — Styled for both Foundry's light and dark themes (`.theme-light` / `.theme-dark`), with four visual presets: **Editorial**, **Minimal**, **Arcane**, and **Bestiary**.
- **Safe GM secrets** — Private notes and GM Secrets sections compile to native Foundry `<section class="secret">` blocks, stripped for players until you reveal them.
- **Drop-in `dnd5e` snapshots** — Dragging an Actor into a Journal page lets you insert a standard Foundry link or an instant **NPC Card** / **NPC Dossier** snapshot.

---

## Installation

Install directly from Foundry VTT's **Add-on Modules** browser using the manifest URL:

```text
https://raw.githubusercontent.com/TacticalOtaku/Loreframe/main/module.json
```

1. Open Foundry VTT Setup → **Add-on Modules** → **Install Module**.
2. Paste the **Manifest URL** above and click **Install**.
3. Launch your world and enable **Loreframe** under **Manage Modules**.

> [!NOTE]
> Tested on **Foundry VTT 14.367**. Includes full **English** and **Русский** localization. `dnd5e` **5.3.3** integration works out of the box when the system is active and can be disabled in world settings.

---

## Built-in Library

Loreframe ships with **29 built-in templates** and **4 visual presets** (`Editorial`, `Minimal`, `Arcane`, `Bestiary`), excluded automatically from chat editors so only Journal pages receive Loreframe tools.

| Category              | Templates                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Blocks & Callouts** | Heading, Subtitle, Divider, Quote, Read Aloud, Note, Warning, Lore, GM Note, Secret                                               |
| **Media & Data**      | Image + Text, Hero Image, Key/Value List, Tags, Stats Row                                                                         |
| **Galleries**         | Gallery _(Uniform, Portrait, Landscape, Feature + Grid, and Captioned modes)_                                                     |
| **Layouts**           | Two Columns, Columns 33/66, Columns 66/33, Three Columns, Sidebar Left, Sidebar Right, Hero + Content, Media + Content, Card Grid |
| **Characters**        | NPC Card, NPC Dossier _(presets: Editorial, Minimal, Arcane, Bestiary)_                                                           |
| **Places & Lore**     | Location, Wiki Article _(with live-generated Table of Contents and flexible infobox)_                                             |

---

## Using Loreframe

### Inserting blocks

1. Open a Journal text page in **Edit** mode and place the cursor where you want a block.
2. Choose a template from the **Loreframe** toolbar menu (**Favorites**, **Recent**, **Quick Blocks**, **Layouts**, **Structures**), or pick **Open Template Library…** to search, browse categories, switch presets, and preview live output before inserting.
3. The block's primary field is focused automatically so you can start typing immediately.

> [!TIP]
> **Nesting:** Blocks can be nested inside layout containers (columns, card grids, hero content slots, or a Location's gallery region). Inserting from anywhere else places the new block cleanly after the current one.

### Editing blocks & keyboard navigation

Clicking inside any block reveals a compact floating toolbar with **Edit**, **Duplicate**, and **Delete**.

| Action            | Behavior                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Toolbar focus** | <kbd>Alt</kbd>+<kbd>F10</kbd> focuses the block toolbar; <kbd>←</kbd> / <kbd>→</kbd>, <kbd>Home</kbd>, <kbd>End</kbd> move between buttons; <kbd>Esc</kbd> returns focus to the page |
| **Edit**          | Opens the **Block Inspector** for titles, images & alt text, gallery ordering, Foundry links, optional sections, and style presets                                                   |
| **Duplicate**     | Clones the block with a fresh instance identifier (pasted/dropped blocks also receive unique instance IDs)                                                                           |
| **Delete**        | Prompts for confirmation on layouts, structures, and blocks containing your writing (<kbd>Ctrl</kbd>+<kbd>Z</kbd> restores)                                                          |

- **Rich text stays safe:** All prose fields and nested slots are edited directly inside ProseMirror. Reapplying settings in the inspector grafts your existing rich text and nested blocks back in without losing formatting.
- **Section toggles:** Hiding an optional section that already contains your writing asks for confirmation first; cancelling leaves the inspector open and your text intact.
- **Version safety:** Blocks whose version differs from their registered template, as well as unknown templates, are kept read-only and never overwritten.

### My Templates

Turn any configured block into a reusable personal preset across worlds:

- In the **Template Library**, choose **Save as my template…** on any template.
- In the **Block Inspector**, choose **Save as template…** to capture its current preset, sections, and options.

Saved variants belong to your Foundry **user** (up to 100 templates) and can be edited, duplicated, deleted, exported, and imported as JSON packages (up to `256,000` characters, supporting full Unicode/Cyrillic text):

- Inserted blocks remain regular blocks of the base template — deleting a custom template cleans it from your **Favorites** and **Recent** shortcuts without touching existing Journal pages.
- Variants whose base template or preset is temporarily unavailable are preserved cleanly in storage until that base becomes active again.

### GM Secrets, Foundry links & Wiki TOC

- **GM-only content:** _GM Note_, _Secret_, and _GM Secrets_ sections wrap content in native Foundry secret blocks (`<section class="secret">`), keeping them invisible to players until revealed.
- **Visual hiding vs. secrets:** Setting the Wiki infobox placement to _Hidden from readers_ hides the box visually with CSS outside the editor — never use visual hiding for confidential GM notes.
- **Foundry links:** Lists such as _Points of Interest_, _Notable NPCs_, _Factions_, and _Related entries_ store native `@UUID[uuid]{label}` references. Drag any Scene, Actor, Item, or Journal page from the sidebar directly into the inspector's drop zone.
- **Wiki Contents:** The **Wiki Article** _Contents_ box builds its outline automatically from the article's headings in View mode so links never go out of date.

### `dnd5e` Actor snapshots

When **dnd5e** is active, dragging an Actor you have at least **Observer** permission for onto a Journal page prompts you to choose:

- **Standard Foundry link**
- **NPC Card**
- **NPC Dossier**

> [!IMPORTANT]
> Imported cards are **snapshots** — later edits to the Actor do not mutate your Journal text. Public biography text fills the summary, while private/GM biography notes go strictly into the dossier's **GM Secrets** block. You can toggle system drop handling via the **Game system integrations** world setting.

---

## Settings

| Setting                      | Scope             | Purpose                                                          |
| ---------------------------- | ----------------- | ---------------------------------------------------------------- |
| **Game system integrations** | World             | Enable or disable `dnd5e` Actor drop prompts _(requires reload)_ |
| **Debug logging**            | Client            | Emit detailed Loreframe diagnostics to the browser console       |
| **Favorites & Recent**       | Client _(hidden)_ | Library and menu shortcut lists                                  |
| **My Templates**             | User _(hidden)_   | Per-user declarative template variants                           |

---

## For module developers

Loreframe exposes a frozen extension API at `game.modules.get("loreframe").api` starting from the `loreframeRegisterTemplates` hook (fired during `setup`), followed by `loreframeReady` on `ready`.

<details>
<summary>Example: registering a custom preset and declarative template</summary>

```js
Hooks.once("loreframeRegisterTemplates", (api) => {
  api.registerPreset({ id: "grim", name: "MYMOD.Preset.Grim" });

  api.registerTemplate({
    id: "mymod-rumour",
    version: 1,
    name: "MYMOD.Template.Rumour",
    category: "campaign",
    type: "block",
    renderer: "callout",
    rendererOptions: { tone: "lore" },
    presets: ["grim"],
    fields: [{ id: "title", type: "text", label: "MYMOD.Field.Title", default: "Rumour" }],
  });
});
```

</details>

### Public API

| Member                                                    | Description                                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `version`                                                 | Active Loreframe module version string                                                                |
| `openTemplateLibrary()`                                   | Opens the Template Library window                                                                     |
| `insertTemplate(id, { preset }?)`                         | Inserts into the most recently focused editable editor; returns `false` if none is available          |
| `registerTemplate(definition)` / `unregisterTemplate(id)` | Registers or removes declarative templates (`LoreframeTemplateDefinition`)                            |
| `registerPreset(preset)`                                  | Registers a style preset (`loreframe-preset--<id>` applied to block roots)                            |
| `registerSystemAdapter(adapter)`                          | Registers a system integration adapter (see [`src/integrations/types.ts`](src/integrations/types.ts)) |

### Template & markup rules

Templates are strictly **declarative data** — custom executable renderers cannot be registered through the public API. Every tree passes through `serializeTree` (strict tag/attribute allow-list, HTML escaping, and safe URL filtering).

<details>
<summary>Built-in renderers (17) and stored DOM attributes</summary>

**Built-in renderers:**

- Text & callouts: `heading`, `subtitle`, `divider`, `quote`, `callout` (`rendererOptions.tone`: `note`, `lore`, `warning`, `read-aloud`, `gm-note`, `secret`)
- Media & data: `media`, `hero-image`, `key-value`, `tags`, `stats-row`, `gallery`
- Layouts: `columns` (`rendererOptions.pattern`: `halves`, `narrow-wide`, `wide-narrow`, `thirds`, `sidebar-left`, `sidebar-right`), `hero-content`, `card-grid`
- Structures: `npc` (`rendererOptions.variant`: `card`, `dossier`), `location`, `wiki-article`

**Stored HTML contract:**

- Block roots carry `data-loreframe-template`, `data-loreframe-version`, and `data-loreframe-instance`, plus optional `data-loreframe-preset` and `data-loreframe-opt-<field>` attributes.
- Semantics live strictly in `data-loreframe-*`; classes (`.loreframe*`) handle styling only.
- Blocks with an unknown template ID or a mismatched `data-loreframe-version` are left untouched and read-only for Loreframe.

</details>

---

## Development

Requires **Node.js `>=24`**. Contributor guidelines and codebase structure live in [`AGENTS.md`](AGENTS.md) and [`docs/architecture.md`](docs/architecture.md); version history is tracked in [`CHANGELOG.md`](CHANGELOG.md).

```bash
npm install
npm run check    # TypeScript, ESLint, Stylelint, Vitest, Vite production build
npm run format   # Format repository with Prettier
npm run deploy   # Copy dist/module/ into FOUNDRY_DATA or %LOCALAPPDATA%/FoundryVTT/Data
npm run release  # Run npm run check and build dist/loreframe-v<version>.zip
```

### Publishing a release

1. Update `version` in [`package.json`](package.json), [`package-lock.json`](package-lock.json), and [`module.json`](module.json) (including the `download` URL), and add an entry to [`CHANGELOG.md`](CHANGELOG.md).
2. Run `npm run release` — packaging aborts if manifest URLs, versions, or built files are inconsistent.
3. Push to `main` on [TacticalOtaku/Loreframe](https://github.com/TacticalOtaku/Loreframe), create release `v<version>`, and attach `dist/loreframe-v<version>.zip`.

---

<div align="center">
<sub>Released under the <a href="LICENSE">MIT License</a> · Copyright © 2026 <a href="https://github.com/TacticalOtaku">TacticalOtaku</a></sub>
</div>
