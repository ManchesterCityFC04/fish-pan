## ADDED Requirements

### Requirement: The application can project an add-position outcome

The system SHALL provide an in-app "加仓测算" modal that, given (currentQuantity, currentCost, addQty, addPrice), computes newQty, newCost, diluteAbs, dilutePct, and totalInvested. The calculator SHALL be read-only and SHALL NOT mutate any persistent state.

#### Scenario: User opens the calculator manually

- **WHEN** the user opens the calculator from the toolbar with no pre-filled code
- **THEN** the system SHALL show empty input fields for current quantity, current cost, add quantity or add amount, and add price

#### Scenario: User opens the calculator for a specific stock

- **WHEN** the user opens the calculator with a pre-filled stock code
- **THEN** the system SHALL pre-fill the add price placeholder with the current market price and SHALL detect the market using `resolveCode` for the A 股 100 股/手 warning

#### Scenario: User enters a valid add-position

- **WHEN** the user enters non-negative currentQuantity, non-negative currentCost, positive addQty, and positive addPrice
- **THEN** the system SHALL display newQty, newCost, diluteAbs, dilutePct, and totalInvested

#### Scenario: User enters a build-up from empty

- **WHEN** the user enters zero currentQuantity and zero currentCost
- **THEN** the system SHALL treat the calculation as a build-up, SHALL show "建仓测算" instead of "加仓测算", and SHALL NOT show dilution

#### Scenario: User enters an invalid add-position

- **WHEN** the user enters negative or non-finite values, or omits any required field
- **THEN** the system SHALL show a placeholder message and SHALL NOT compute a result

### Requirement: The calculator accepts share-count or amount input

The system SHALL accept either a share-count input or an amount input. When the user enters an amount, the calculator SHALL convert to shares using the entered add price.

#### Scenario: User enters add amount in amount mode

- **WHEN** the user enters a positive amount and a positive add price in amount mode
- **THEN** the system SHALL display the implied share count and SHALL compute the same outputs as in share-count mode

### Requirement: The calculator can reverse-calculate share count for a target cost

When the user has a non-empty current position, the calculator SHALL accept a target blended cost and SHALL compute the share count required to reach that target. The reverse calculation SHALL be available only when `addPrice < target < currentCost`; otherwise the system SHALL show an explicit hint.

#### Scenario: User enters a feasible target

- **WHEN** the user enters a target cost that is strictly between the entered add price and the current cost
- **THEN** the system SHALL display the required share count and the implied total amount

#### Scenario: User enters an infeasible target

- **WHEN** the user enters a target that is not strictly between the entered add price and the current cost
- **THEN** the system SHALL show the hint "需 加仓价 < 目标 < 现成本 才能降到该成本" and SHALL NOT compute a value

### Requirement: The calculator shows an A 股 hand warning

When the resolved market is CN and the resulting share count is not a multiple of 100, the calculator SHALL show a soft warning recommending rounding to 100.

#### Scenario: CN market with non-multiple-of-100 shares

- **WHEN** the calculator resolves a CN market and the resulting share count is positive and not a multiple of 100
- **THEN** the system SHALL show the warning "提示:A股通常 100 股/手,建议取整到 100 的倍数"

#### Scenario: HK or US market

- **WHEN** the calculator resolves an HK or US market
- **THEN** the system SHALL NOT show the A 股 hand warning

### Requirement: The calculator matches existing visual conventions

The calculator SHALL use the existing `fmtPrice` formatter, the existing market-color tokens, and the existing modal pattern. It SHALL NOT introduce new colors, fonts, or modal patterns.

#### Scenario: Currency formatting

- **WHEN** the calculator displays numbers
- **THEN** the formatter used SHALL match the formatter used by the existing positions list for the same market

#### Scenario: Layout consistency

- **WHEN** the calculator is open alongside other modals
- **THEN** all modals SHALL use the same theme, padding, and modal mask
