## ADDED Requirements

### Requirement: Manual binary path override
The plugin SHALL provide a settings tab where users can specify a custom path to the Claude CLI binary. When set, this path SHALL be used instead of auto-detection.

#### Scenario: User sets a custom binary path
- **WHEN** user enters a valid path in the "Claude binary path" settings field
- **THEN** the plugin uses that path when spawning the Claude process, bypassing auto-detection

#### Scenario: Settings field is blank
- **WHEN** the binary path field is empty
- **THEN** the plugin falls back to the existing auto-detection logic (candidate list + `which`)

#### Scenario: User opens settings with a previously saved path
- **WHEN** user opens plugin settings after having set a custom path
- **THEN** the previously saved path is pre-filled in the input field

### Requirement: Settings persist across restarts
The custom binary path SHALL be stored in the plugin's persisted data and survive Obsidian restarts.

#### Scenario: Path survives restart
- **WHEN** user sets a custom binary path and restarts Obsidian
- **THEN** the custom path is still active and the plugin uses it

### Requirement: Binary path used in auth check
The custom binary path SHALL also be used during the Claude status/auth check on view open.

#### Scenario: Auth check uses custom path
- **WHEN** ChatView initialises and custom binary path is set
- **THEN** `checkClaudeStatus` receives the custom path and validates that binary specifically
