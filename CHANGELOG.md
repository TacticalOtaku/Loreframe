# Changelog

## 0.1.1

### Fixed

- **Writing is no longer lost when a block is edited in the inspector.**
  - Text typed outside the block's fields (for example a paragraph started with Enter after a title) is kept and
    moved below the block, with a notice.
  - Bold, italics and links in names, captions and other properties survive edits that do not change them.
  - A property split in two with Enter keeps both halves.
- **Link lists keep the author's text.** Entries with text around a link, rolls or other Foundry enrichers are no
  longer mangled; links to page headings (`#anchor`) are recognised.
- **GM secrets no longer leak into NPC snapshots.** Foundry secret blocks in an Actor's biography stay out of public
  text and go into the dossier's GM Secrets.
- **Actor drops behave like Foundry's own.** Positions follow edits made while the dialog is open (including
  co-authors), a selected text becomes the link label, and links on Journal pages are relative again.
- The inspector opens for the right block when the same block exists on several pages.

### Changed

- Deleting a structure, a layout or a block with writing asks for confirmation.
- My Templates appear in the editor menu's Favorites and Recent; deleted templates leave no traces there.
- The library keeps the style chosen for built-in templates when a template of your own is selected.
- Editing the same template of your own twice brings its window forward instead of opening another one.
- Pasting blocks copied outside Foundry also ignores formatting whitespace inside Wiki contents boxes and tables.
- The block toolbar measures its position at most once per frame while typing.
- Uses `ProseMirror.state.Plugin` instead of Foundry's legacy `ProseMirror.Plugin` re-export.
- `module.json` no longer caps compatibility at Foundry 14, matching the other TacticalOtaku modules.
- Development dependencies updated.

## 0.1.0

First version for Foundry VTT 14 (verified on 14.367).

### Editor and library

- Loreframe editor menu with Quick Blocks, Layouts, Structures, Favorites and Recent.
- Template Library with categories, search, preview, preset choice and favorites.
- Block toolbar (Edit, Duplicate, Delete), with keyboard access through Alt+F10.
- Block inspector that edits properties, images, Foundry links, sections and style while keeping written text.

### Templates

- **Blocks:** Heading, Subtitle, Divider, Quote, Read Aloud, Note, Warning, Lore, GM Note, Secret, Image + Text,
  Hero Image, Key/Value List, Tags, Stats Row, Gallery (five modes).
- **Layouts:** columns (50/50, 33/66, 66/33, three), sidebars, Hero + Content, Media + Content, Card Grid.
- **Structures:**
  - NPC Card and NPC Dossier, with the Editorial, Minimal, Arcane and Bestiary presets and optional sections;
  - Location, with a nested Gallery, Foundry-linked lists and GM secrets;
  - Wiki Article, with an infobox, generated contents and related entries.

### Integrations and customization

- dnd5e integration: dropping an Actor into the editor offers a link, an NPC Card or an NPC Dossier (snapshot).
- My Templates: save, edit, duplicate, delete, import and export template variants.

### Platform

- Public API: templates, presets, system adapters, library, insertion.
- Hooks: `loreframeRegisterTemplates`, `loreframeReady`.
- Safe versioning: blocks of other versions are never rebuilt; outdated blocks are migrated on request.
- English and Russian localization; light and dark themes; narrow windows.
