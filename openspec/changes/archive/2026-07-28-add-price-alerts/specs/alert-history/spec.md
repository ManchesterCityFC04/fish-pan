## ADDED Requirements

### Requirement: The system exposes a dedicated alert history capability

The system SHALL expose a dedicated alert-history capability that owns persistence, retention, clearing, and the in-app history surface. The capability SHALL be implemented as a thin layer over the existing SQL.js store and SHALL receive trigger records produced by the `price-alerts` capability. Persisted alert-history data MUST NOT contain AI API keys or unrelated secret values.

#### Scenario: History is a separate capability

- **WHEN** the renderer reads alert history
- **THEN** it SHALL access the history through the dedicated `alert-history` capability rather than through the rule-management surface of `price-alerts`

#### Scenario: History survives restarts

- **WHEN** the user closes and reopens Fish Pan after alerts have triggered
- **THEN** the system SHALL restore the persisted trigger records through the `alert-history` capability

#### Scenario: Clear history does not affect rules

- **WHEN** the user clears alert history
- **THEN** the `alert-history` capability SHALL remove trigger records while the `price-alerts` capability retains all rule data

### Requirement: Users can view and manage alert history through a dedicated surface

The system SHALL provide an in-app alert-history surface that lists recent trigger records, supports clearing, and shows an empty state. The history view SHALL display stock, condition, observed value, trigger time, and notification status, and SHALL NOT depend on the alert editor remaining open.

#### Scenario: Open history from main navigation

- **WHEN** the user navigates to the alert history view
- **THEN** the system SHALL display the trigger records produced by `price-alerts` in reverse chronological order

#### Scenario: Clear history from history view

- **WHEN** the user confirms clearing from the alert history view
- **THEN** the system SHALL remove the displayed trigger records while retaining the alert rules and SHALL show the empty state if no records remain

#### Scenario: Empty history state

- **WHEN** the user opens the alert history view and no trigger records exist
- **THEN** the system SHALL show an explicit empty state explaining that alerts work while Fish Pan is running
