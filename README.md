# Loreframe

Reusable visual blocks, layouts and RPG content templates for the **Foundry VTT 14** Journal editor.

Loreframe adds a single **Loreframe** menu to the standard Journal (ProseMirror) editor and a **Template Library**
window. Blocks are ordinary, readable HTML stored in your Journal pages: you keep writing normal text and using
normal Foundry links, and if Loreframe is disabled your content stays readable.

- **Verified:** Foundry VTT 14.367. dnd5e 5.3.3 integration is optional.
- **Languages:** English, Русский.

## Using Loreframe

### Inserting blocks

1. Open a Journal text page in edit mode and place the cursor.
2. Pick a block from the **Loreframe** menu (Quick Blocks, Layouts, Structures), or choose
   **Open Template Library…** to browse, search, preview and pick a style.
3. The block's first field is selected: start typing to replace the placeholder.

Blocks can be nested only inside layout regions (columns, card grids, hero content, galleries inside a location).
Anywhere else, a new block is inserted after the current one.

### Editing blocks

Click inside a block to show its toolbar: **Edit**, **Duplicate**, **Delete**.

- **Keyboard:** <kbd>Alt</kbd>+<kbd>F10</kbd> moves focus to the toolbar, the arrow keys move between buttons,
  and <kbd>Esc</kbd> returns to the text.
- **Edit** opens the block inspector. It holds the block's properties: names, images and alt text, gallery images,
  Foundry links, optional sections, and the style (preset, portrait position, density, infobox placement).
- **Rich text is always edited directly in the page.** Switching off a section that contains your writing asks for
  confirmation first; <kbd>Ctrl</kbd>+<kbd>Z</kbd> brings it back.

### Templates

| Group | Templates |
| --- | --- |
| Blocks | Heading, Subtitle, Divider, Quote, Read Aloud, Note, Warning, Lore, GM Note, Secret, Image + Text, Hero Image, Key/Value List, Tags, Stats Row, Gallery |
| Layouts | Two Columns, 33/66, 66/33, Three Columns, Sidebar Left/Right, Hero + Content, Media + Content, Card Grid |
| Characters | NPC Card, NPC Dossier (styles: Editorial, Minimal, Arcane, Bestiary) |
| Places & lore | Location, Wiki Article |

#### GM-only content

GM Note, Secret and the GM Secrets sections use Foundry's own secret blocks. Players do not receive them until you
reveal them. Wiki infobox placement "Hidden from readers" only hides the box visually and is not a secret.

#### Foundry links

Points of interest, notable NPCs, factions and related entries are Foundry content links. Drag a Scene, Actor,
Item or Journal page from the sidebar onto the list in the block inspector.

#### Wiki contents

The Wiki Article's contents box is built from the article's headings when the page is read, so it never goes stale.

### My Templates

In the library, choose **Save as my template…** on any template. In a block inspector, choose
**Save as template…**. A template of your own remembers the style, sections and options, and appears under
**My Templates**, where you can edit, duplicate, delete, export and import templates.

- Inserted blocks remain regular blocks of the base template, so deleting a template of your own never affects
  your pages.
- Templates of your own belong to your Foundry user.
- Import accepts only Loreframe template packages (JSON, up to 256 KB).

### dnd5e: Actors as NPC cards

With dnd5e active, dragging an Actor you can observe into a Journal editor asks how to insert it:

- as a **standard Foundry link**;
- as an **NPC Card**;
- as an **NPC Dossier**.

Cards are snapshots: later Actor changes do not update them. The public biography becomes the summary. An NPC's
private biography goes only into the dossier's GM Secrets. You can turn this off with the world setting
**Game system integrations**.

## Settings

| Setting | Scope | Purpose |
| --- | --- | --- |
| Game system integrations | World | dnd5e Actor drops (requires reload) |
| Debug logging | Client | Extra console output |
| Favorites, recent templates | Client (hidden) | Library shortcuts |
| My Templates | User (hidden) | Your saved template variants |

## For module developers

The API is available at `game.modules.get("loreframe").api` from the `loreframeRegisterTemplates` hook (fired
during `setup`) onward. `loreframeReady` fires on `ready`.

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

| Member | Description |
| --- | --- |
| `version` | Module version. |
| `openTemplateLibrary()` | Opens the library. |
| `insertTemplate(id, { preset }?)` | Inserts into the most recently focused editable editor; returns `false` if there is none. |
| `registerTemplate(definition)` / `unregisterTemplate(id)` | Data-only templates. |
| `registerPreset(preset)` | A visual preset: adds `loreframe-preset--<id>` to block roots. |
| `registerSystemAdapter(adapter)` | Maps system documents to NPC data (see `src/integrations/types.ts`). |

### Template rules

Templates are **declarative data**. They must use one of the built-in renderers:

- `heading`, `subtitle`, `divider`, `quote`;
- `callout` (`rendererOptions.tone`: note, lore, warning, read-aloud, gm-note, secret);
- `media`, `hero-image`, `key-value`, `tags`, `stats-row`, `gallery`;
- `columns` (`rendererOptions.pattern`), `hero-content`, `card-grid`;
- `npc` (`rendererOptions.variant`: card, dossier), `location`, `wiki-article`.

Renderers cannot be registered through the API. All markup passes through a tag and attribute allow-list and every
value is escaped.

### Stored markup

Every block root carries `data-loreframe-template`, `data-loreframe-version` and `data-loreframe-instance`, and
optionally `data-loreframe-preset` and `data-loreframe-opt-<field>`. Semantics live in `data-loreframe-*`
attributes; classes are for styling only.

Blocks whose version differs from the registered template are never rebuilt:

- **Outdated blocks** are migrated only when the author confirms.
- **Newer, invalid or unknown blocks** are left untouched.

## Development

```bash
npm install
npm run check    # typecheck, ESLint, Stylelint, Vitest, build
npm run deploy   # copy dist/ into %LOCALAPPDATA%/FoundryVTT/Data/modules/loreframe (or FOUNDRY_DATA)
npm run release  # check, then write ../loreframe-v<version>.zip (next to the project folder)
```

### Publishing a release

1. Bump `version` in `package.json` and `module.json` (the `download` URL contains the version) and add a
   `CHANGELOG.md` entry.
2. Run `npm run release`. It refuses to package when the manifest version, URLs or listed files do not match.
3. Push to `main` of [TacticalOtaku/Loreframe](https://github.com/TacticalOtaku/Loreframe), create the GitHub release
   `v<version>` and attach `loreframe-v<version>.zip`.

Foundry installs the module from
`https://raw.githubusercontent.com/TacticalOtaku/Loreframe/main/module.json`.
