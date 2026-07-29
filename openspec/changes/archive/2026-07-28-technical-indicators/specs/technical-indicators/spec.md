## ADDED Requirements

### Requirement: The system computes standard technical indicators locally

The system SHALL compute the following indicators from existing K-line bars in pure TypeScript: MA(5,10,20,60), MACD(12,26,9), RSI(14), KDJ(9,3,3), BOLL(20,2). Each indicator function SHALL return an array of the same length as the input bars, with `null` for the warm-up region.

#### Scenario: MA computation

- **WHEN** the renderer has at least one K-line bar set
- **THEN** the system SHALL produce MA5, MA10, MA20, and MA60 arrays whose values at index `i` equal the simple moving average of the previous N closes, with `null` when fewer than N bars are available

#### Scenario: MACD computation

- **WHEN** the renderer has at least 26 K-line bars
- **THEN** the system SHALL produce DIF, DEA, and HIST arrays using the standard 12/26/9 exponential moving averages, with `null` for the warm-up region

#### Scenario: RSI computation

- **WHEN** the renderer has at least 15 K-line bars
- **THEN** the system SHALL produce an RSI14 array with `null` for the first 14 bars

#### Scenario: KDJ computation

- **WHEN** the renderer has at least 9 K-line bars
- **THEN** the system SHALL produce K, D, and J arrays using the standard 9/3/3 stochastic formula, with `null` for the warm-up region

#### Scenario: Bollinger computation

- **WHEN** the renderer has at least 20 K-line bars
- **THEN** the system SHALL produce upper, middle, and lower band arrays using a 20-period moving average and 2 standard deviations, with `null` for the warm-up region

### Requirement: Indicators render on the existing K-line chart

The renderer SHALL overlay indicator lines on the existing K-line canvas and SHALL draw sub-panels for MACD, RSI, and KDJ below the price pane. BOLL bands SHALL be drawn on the price pane.

#### Scenario: MA lines visible

- **WHEN** MA visibility is enabled
- **THEN** the price pane SHALL display one line per enabled MA period, in distinct colors

#### Scenario: MACD panel

- **WHEN** MACD visibility is enabled
- **THEN** the renderer SHALL draw a sub-panel below the price pane containing the DIF, DEA, and HIST series

#### Scenario: RSI and KDJ panels

- **WHEN** RSI visibility is enabled
- **THEN** the renderer SHALL draw a sub-panel for RSI14 with overbought (70) and oversold (30) reference lines

- **WHEN** KDJ visibility is enabled
- **THEN** the renderer SHALL draw a sub-panel for K, D, and J series

### Requirement: The user can toggle indicator visibility

The renderer SHALL expose per-indicator toggles in the K-line toolbar. Toggle state SHALL be persisted to localStorage and SHALL survive app restart.

#### Scenario: Toggle off MA

- **WHEN** the user disables MA visibility
- **THEN** the price pane SHALL no longer draw MA lines and the toggle state SHALL be persisted

#### Scenario: Restart preserves toggles

- **WHEN** the user closes and reopens the application
- **THEN** the toggle state SHALL be restored and the same indicators SHALL be visible

### Requirement: The hover tooltip shows indicator values

When the user hovers over a bar, the tooltip SHALL display the value of every visible indicator at that bar, omitting indicators whose value is `null` for the warm-up region.

#### Scenario: Hover on a bar with all indicators

- **WHEN** the user hovers over a bar that has values for all enabled indicators
- **THEN** the tooltip SHALL show the values of every enabled indicator at that bar

#### Scenario: Hover during warm-up

- **WHEN** the user hovers over a bar in the warm-up region
- **THEN** the tooltip SHALL omit indicators whose value is `null` and SHALL show the values of indicators that are already defined
