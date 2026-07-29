# ai-analysis-history Specification

## Purpose
TBD - created by archiving change ai-analysis-history. Update Purpose after archive.
## Requirements
### Requirement: The system persists every LLM analysis

The system SHALL persist every LLM-driven analysis as a record containing id, kind, code, model, createdAt, prompt template id, a structured input summary, and a structured response. The system SHALL NOT persist the API key, proxy URL, or any other secret.

#### Scenario: News analysis is persisted after a successful response

- **WHEN** the renderer completes a news interpretation call to the LLM
- **THEN** the renderer SHALL send the structured response to the persistence IPC and the system SHALL store one record linked to the originating news item and stock

#### Scenario: Kline analysis is persisted after a successful response

- **WHEN** the renderer completes a K-line summary call to the LLM
- **THEN** the renderer SHALL send the structured response to the persistence IPC and the system SHALL store one record linked to the originating stock

#### Scenario: Persistence failure does not block UI

- **WHEN** the LLM call succeeds but the persistence IPC fails
- **THEN** the renderer SHALL still display the analysis to the user and SHALL log the persistence error

### Requirement: The user can list and filter the analysis history

The system SHALL provide an in-app history view that lists the latest N records (default 200) in reverse-chronological order, with filters for kind, code, and date range. The list SHALL be paginated or virtualized so it remains responsive.

#### Scenario: Open history view

- **WHEN** the user opens the analysis history
- **THEN** the system SHALL display the latest records in reverse-chronological order with stock code, kind, model, and timestamp visible

#### Scenario: Filter by stock

- **WHEN** the user filters by stock code
- **THEN** the system SHALL show only records whose `code` matches the filter

#### Scenario: Filter by kind

- **WHEN** the user filters by kind
- **THEN** the system SHALL show only records whose `kind` matches the filter

### Requirement: The user can view and delete history records

The system SHALL allow the user to open a record's detail view and delete single or all records. Detail view SHALL render the same structured response the user saw originally.

#### Scenario: Open detail view

- **WHEN** the user clicks a record in the history
- **THEN** the system SHALL render the structured response in a modal identical to the original analysis surface

#### Scenario: Delete single record

- **WHEN** the user confirms deletion of a single record
- **THEN** the system SHALL remove the record and refresh the list

#### Scenario: Clear all records

- **WHEN** the user confirms clearing all history
- **THEN** the system SHALL remove every analysis record and show the empty state

### Requirement: History data survives app restart

The system SHALL persist records to the existing SQL.js store with a migration that adds the new table. After restart, the history view SHALL display the previously stored records unchanged.

#### Scenario: Restart preserves history

- **WHEN** the user closes and reopens the application after analyses have been stored
- **THEN** the system SHALL display the same records in the history view

