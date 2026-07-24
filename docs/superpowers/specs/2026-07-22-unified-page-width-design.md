# Unified Page Width Design

## Goal

Make every standard Yansir page use the same mobile-first content width as the current data page, while preserving the K-line laboratory as a wide internal workbench.

## Width Contract

- The shared application shell uses `width: min(100vw, 430px)`.
- Data, AIClaw, Radar, Track Record, Account, Alert, authentication, plans, and team pages inherit the shared shell width.
- Standard page content uses the existing shared horizontal page padding; page-specific selectors must not widen the shell.
- The fixed bottom navigation matches the shared shell width.
- The K-line laboratory remains the only `1180px` wide application view.
- Dialogs, sheets, tables, charts, and other content inside a page keep their component-specific responsive constraints.

## Implementation

1. Add one final shared-shell width rule after legacy CSS overrides.
2. Remove or override late page-specific shell widths for AIClaw, Radar, Track Record, login, register, plans, and team.
3. Keep an explicit K-line laboratory exception.
4. Align the track-record content container to the shell instead of widening the shell itself.

## Responsive Behavior

- Below `430px`, pages occupy the available viewport width.
- Above `430px`, standard pages remain centered at `430px`.
- No page introduces horizontal scrolling.
- Fixed navigation and fixed composers remain aligned with the centered shell.

## Verification

- Add a source contract test covering the shared width and K-line exception.
- Run the full web test suite and production build.
- Inspect Data, AIClaw, Radar, Track Record, and Account at mobile and desktop viewport widths.
- Confirm no overlap, clipping, or horizontal overflow.
