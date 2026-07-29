# price-alerts Specification

## Purpose
TBD - created by archiving change add-price-alerts. Update Purpose after archive.
## Requirements
### Requirement: Users can manage local alert rules

The system SHALL allow a user to create, view, edit, enable, disable, and delete alert rules for stocks already known to the watchlist. Each rule MUST identify a stock, a condition type, a numeric threshold, and an enabled state. Rule enable and disable actions MUST persist so they survive application restart.

#### Scenario: Create an enabled price-above rule

- **WHEN** the user selects a watchlist stock, chooses "price above", enters a positive threshold, and saves
- **THEN** the system SHALL create an enabled rule, persist it, and display it in the alert management view

#### Scenario: Reject an invalid rule

- **WHEN** the user tries to save a rule without a stock, supported condition, finite numeric threshold, or valid threshold sign
- **THEN** the system SHALL show a validation error and SHALL NOT create the rule

#### Scenario: Disable a rule

- **WHEN** the user disables an existing rule
- **THEN** the system SHALL retain the rule, persist the disabled state, and SHALL NOT evaluate it for notifications until re-enabled

#### Scenario: Persisted disable state survives restart

- **WHEN** the user disables a rule and then closes and reopens the application
- **THEN** the system SHALL restore the rule with its disabled state intact

### Requirement: The system evaluates price and percentage conditions as threshold crossings

The system SHALL support price-above, price-below, gain-percentage, and loss-percentage conditions. Evaluation MUST use a valid newly refreshed quote and MUST distinguish a threshold crossing from a value that was already beyond the threshold. A rule's first valid quote after creation or restart SHALL be stored as the previous value and SHALL NOT trigger a notification by itself.

#### Scenario: Price crosses above a threshold

- **WHEN** the previous valid price is at or below the rule threshold and the newly refreshed price is above it
- **THEN** the system SHALL mark the rule as triggered and create one trigger-history record

#### Scenario: Price crosses below a threshold

- **WHEN** the previous valid price is at or above the rule threshold and the newly refreshed price is below it
- **THEN** the system SHALL mark the rule as triggered and create one trigger-history record

#### Scenario: Percentage crosses a threshold

- **WHEN** the current-day quote percentage moves from the non-matching side of a gain/loss threshold to the matching side
- **THEN** the system SHALL trigger the corresponding percentage rule using the latest quote

#### Scenario: First quote primes a rule

- **WHEN** a rule receives its first valid quote after creation or application restart
- **THEN** the system SHALL store the observed value as the previous value and SHALL NOT notify the user for that first observation alone

### Requirement: The system prevents duplicate alerts via cooldown

The system SHALL enforce a per-rule cooldown and SHALL NOT emit another notification or trigger-history record while the rule is within its cooldown period. A reset action SHALL clear the triggered state and last-triggered metadata so the rule is immediately eligible for a new crossing.

#### Scenario: Matching value remains beyond the threshold

- **WHEN** successive valid quotes remain on the matching side of a threshold
- **THEN** the system SHALL NOT create a new trigger for each refresh

#### Scenario: Cooldown expires and a new crossing occurs

- **WHEN** the cooldown period has elapsed and the value crosses from the non-matching side to the matching side again
- **THEN** the system SHALL emit a new notification and create a new trigger-history record

#### Scenario: Reset re-arms a rule

- **WHEN** the user explicitly resets a triggered rule
- **THEN** the system SHALL clear the triggered state and last-triggered metadata for that rule and persist the change

### Requirement: Alert data persists locally with backward-compatible schema

The system SHALL persist alert rules, their previous observed value, cooldown, last-triggered metadata, and trigger history locally. Persisted alert data MUST NOT contain AI API keys or unrelated secret values. Existing alert rows created before this change MUST remain valid and gain default values for the new fields.

#### Scenario: Restart restores enhanced rules

- **WHEN** the user closes and reopens Fish Pan after saving alert rules
- **THEN** the system SHALL restore the rules with their enabled state, thresholds, cooldowns, previous observed value, and last-triggered metadata

#### Scenario: Legacy rule rows gain defaults

- **WHEN** an existing alert row is loaded that has no previous value, cooldown, or last-triggered metadata
- **THEN** the system SHALL treat the row as eligible with a default cooldown and SHALL NOT trigger for the first valid quote after load

#### Scenario: Clear trigger history

- **WHEN** the user confirms clearing alert history
- **THEN** the system SHALL remove the displayed trigger records while retaining the alert rules

### Requirement: The application sends routed native desktop notifications

The system SHALL send a Windows desktop notification for an eligible alert trigger while the application is running. The notification SHALL include the stock identity, current value, condition, and trigger time, and SHALL associate enough context to focus the application and select the stock when clicked. If native notification creation or activation handling fails, the trigger SHALL still be recorded in the in-app history.

#### Scenario: Eligible trigger sends a notification

- **WHEN** an enabled rule crosses its threshold outside the cooldown period
- **THEN** the system SHALL request one native desktop notification and show the trigger in the in-app history

#### Scenario: Notification is clicked

- **WHEN** the user clicks an alert notification
- **THEN** the system SHALL focus the Fish Pan window and select the associated stock, opening its detail view when available

#### Scenario: Native notification failure

- **WHEN** native notification creation or activation handling fails for a legitimate crossing
- **THEN** the system SHALL still record the trigger in the in-app history and SHALL NOT retry the notification

#### Scenario: App is fully closed

- **WHEN** the application process is not running
- **THEN** the system SHALL NOT claim that this change provides background alert monitoring

### Requirement: Users can inspect and clear alert history

The system SHALL provide an in-app history view showing triggered alerts with stock, rule condition, observed value, trigger time, and notification status. The history view SHALL support a bounded retention policy and user-initiated clearing. An empty state SHALL be shown when there are no trigger records.

#### Scenario: View recent triggers

- **WHEN** the user opens alert history
- **THEN** the system SHALL show recent trigger records in reverse chronological order with enough information to identify the rule and quote

#### Scenario: History retention is reached

- **WHEN** adding a trigger would exceed the configured local retention limit
- **THEN** the system SHALL retain the newest records and discard the oldest records according to the retention policy

#### Scenario: Empty history state

- **WHEN** the user opens alert history and no triggers exist
- **THEN** the system SHALL show an explicit empty state and a brief explanation that alerts work while Fish Pan is running

