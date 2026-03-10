## ADDED Requirements

### Requirement: Plugin uses SideChat branding
The plugin SHALL present itself as "SideChat" in all user-visible strings, metadata, and CSS identifiers. No "ObsiClaude" or "oc-" references SHALL remain in shipped files.

#### Scenario: Plugin name in Obsidian
- **WHEN** user views the plugin in Obsidian's community plugins list or settings
- **THEN** the plugin is displayed as "SideChat"

#### Scenario: No mixed CSS prefixes
- **WHEN** the plugin is loaded
- **THEN** all CSS classes use the `sc-` prefix exclusively
