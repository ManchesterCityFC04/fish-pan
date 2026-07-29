## ADDED Requirements

### Requirement: The user can trigger a one-click stock diagnosis

The system SHALL provide a "一键诊断" entry point on the per-stock surface. The diagnosis SHALL aggregate the current quote, the latest K-line summary, recent news, the current holding (if any), and the active alert rules (if any) into a single LLM input bundle.

#### Scenario: User triggers diagnosis for a held stock

- **WHEN** the user clicks "一键诊断" on a stock they hold
- **THEN** the system SHALL assemble the input bundle including the holding and active alert rules and SHALL send the bundle to the LLM

#### Scenario: User triggers diagnosis for a non-held stock

- **WHEN** the user clicks "一键诊断" on a stock they do not hold
- **THEN** the system SHALL assemble the input bundle without the holding section and SHALL still include any active alert rules

#### Scenario: User cancels the diagnosis

- **WHEN** the user clicks cancel while the LLM call is in flight
- **THEN** the system SHALL abort the request and SHALL NOT persist or render a partial result

### Requirement: The diagnosis produces a fixed structured brief

The LLM response SHALL be parsed into a brief with the fields: `summary`, `sentiment`, `drivers[]`, `risks[]`, `observations[]`, `watchPoints[]`. The renderer SHALL validate the response shape before rendering.

#### Scenario: Valid response

- **WHEN** the LLM returns a response that matches the brief schema
- **THEN** the system SHALL render the brief in the modal and SHALL persist the record

#### Scenario: Malformed response

- **WHEN** the LLM returns a response that does not match the brief schema
- **THEN** the system SHALL show a recoverable error and SHALL NOT persist a malformed record

### Requirement: The diagnosis is persisted through the analysis history capability

When the LLM response is valid, the renderer SHALL send the brief to the `ai-analysis-history` capability for persistence. Persistence failure SHALL NOT block the modal from displaying the brief.

#### Scenario: Successful persistence

- **WHEN** the LLM returns a valid brief
- **THEN** the system SHALL send the brief to the analysis history IPC and SHALL show the record in the history view

#### Scenario: Persistence failure

- **WHEN** the LLM returns a valid brief but the analysis history IPC fails
- **THEN** the system SHALL still render the brief and SHALL log the persistence error

### Requirement: The diagnosis UI shows progress and supports cancel

The modal SHALL display an explicit "analyzing" state with the current step (e.g., "collecting inputs", "calling LLM", "rendering brief") and SHALL expose a cancel action at all times.

#### Scenario: Progress is shown

- **WHEN** the diagnosis is running
- **THEN** the modal SHALL show the current step and SHALL disable destructive actions until the response is rendered

#### Scenario: Cancel is honored

- **WHEN** the user clicks cancel before the LLM responds
- **THEN** the modal SHALL return to the per-stock surface and SHALL NOT show a partial brief
