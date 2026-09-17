# Changelog

## 0.1.0 — unreleased

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
