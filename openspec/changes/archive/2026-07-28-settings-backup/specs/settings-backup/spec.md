## ADDED Requirements

### Requirement: The user can export a settings bundle

The system SHALL allow the user to export a JSON bundle containing the watchlist, alerts, alert history, LLM configuration (without the API key), and indicator visibility. The export SHALL include a `version` field and an `exportedAt` timestamp.

#### Scenario: User exports a bundle with default redaction

- **WHEN** the user triggers export with default settings
- **THEN** the system SHALL write a JSON file that includes watchlist, alerts, alert history, and LLM config but redacts the API key, proxy URL with embedded credentials, and any other secret field

#### Scenario: User opts in to include secrets

- **WHEN** the user enables the “include secrets” option before exporting
- **THEN** the system SHALL write the API key and proxy URL in plain text and SHALL display a warning confirming that the file contains credentials

#### Scenario: User cancels export

- **WHEN** the user cancels the save dialog
- **THEN** the system SHALL NOT write any file and SHALL leave existing data unchanged

### Requirement: The user can import a settings bundle

The system SHALL allow the user to import a previously exported bundle. The renderer SHALL validate the bundle, show a diff summary, and require explicit confirmation before any mutation. On error, the renderer SHALL leave existing data unchanged.

#### Scenario: User previews a bundle

- **WHEN** the user selects a bundle file
- **THEN** the system SHALL show a diff summary listing the counts of stocks, alerts, and history records to be added or replaced

#### Scenario: User confirms import

- **WHEN** the user confirms the import
- **THEN** the system SHALL atomically replace or merge the data, persist changes, and show a success summary

#### Scenario: Import fails validation

- **WHEN** the user selects a file that does not match the expected schema
- **THEN** the system SHALL show the first validation error and SHALL NOT mutate any data

#### Scenario: Secret redaction on import

- **WHEN** the user imports a bundle that contains redacted secrets
- **THEN** the system SHALL NOT overwrite existing API keys or proxy URLs and SHALL prompt the user to enter them again if they were previously empty

### Requirement: The bundle format is forward-compatible

The bundle SHALL include a `version` field. Unknown top-level fields SHALL be ignored. Missing optional fields SHALL use defaults. Required fields SHALL be validated.

#### Scenario: Future-version import

- **WHEN** the user imports a bundle whose `version` is greater than the current version
- **THEN** the system SHALL show a warning and SHALL require explicit confirmation before applying

#### Scenario: Older-version import

- **WHEN** the user imports a bundle whose `version` is older than the current version
- **THEN** the system SHALL accept the import, fill missing fields with defaults, and persist a normalized bundle
