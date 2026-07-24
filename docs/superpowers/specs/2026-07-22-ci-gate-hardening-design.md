# CI Gate Hardening Design

## Goal

Make pull-request CI reject regressions in the strategy scanner, API contracts, AIClaw, Radar, Track Record, and Python strategy implementation, while ensuring the E2E runner never reuses an unrelated HTTP service.

## Scope

- Add one reusable service-readiness module for the plan E2E runner.
- Require an API health response with the expected JSON shape before reusing an API process.
- Require the Web response to be successful HTML containing a JavaScript module entry before reusing a Web process.
- Add automated regression tests for correct services, 404 responses, and unrelated HTML.
- Add root-level grouped test commands for the API, Web, and Python strategy suites.
- Run all grouped suites from the existing `test:plans:ci` GitHub Actions gate.

The change will not alter production API behavior, strategy logic, page layouts, deployment commands, or the existing uncommitted UI worktree changes.

## Design

### Service identity validation

`infra/service-readiness.mjs` will expose focused API and Web readiness checks. Both checks will use a bounded request timeout and return `false` for network errors, non-success responses, or invalid content.

The API check will parse JSON and accept only the repository's health response contract. The Web check will read HTML and require a module script whose source points to a JavaScript asset. `infra/run-plan-e2e-ci.mjs` will use these checks before deciding whether to reuse an existing process.

### CI test aggregation

The root `package.json` will define explicit grouped commands rather than relying on filename discovery:

- `test:api:core` runs the scanner, scheduling, persistence, delivery, market-stream, discovery, and strategy-contract suites.
- `test:web:core` runs the entitlement, K-line, Radar, AIClaw, width, Track Record, touch-target, and routing suites.
- `test:strategy` runs Python `unittest` discovery against `services/strategy/tests`.

`test:plans:ci` will invoke those groups, both production builds, and the existing plan E2E runner. Explicit lists keep the gate auditable and avoid executing temporary test artifacts.

## Error handling

- Timeouts, invalid JSON, missing script assets, and unexpected status codes are treated as "service unavailable" so the runner starts its own service.
- If a newly started service never becomes valid within the existing deadline, the runner fails with its current readiness error.
- Any grouped test failure stops the CI command immediately.

## Testing

Implementation follows red-green-refactor:

1. Add a readiness regression test that fails against the current status-only implementation.
2. Add CI wiring assertions that fail until every grouped suite is connected.
3. Implement the minimal readiness module and root scripts.
4. Run the focused tests, all grouped suites, both builds, Python tests, and `git diff --check`.

## Acceptance criteria

- A 404 response cannot satisfy API or Web readiness.
- Unrelated successful HTML without a JavaScript module entry cannot satisfy Web readiness.
- Valid repository health JSON and built frontend HTML satisfy readiness.
- All newly added API, Web, and Python suites are reachable from the GitHub Actions gate.
- Existing builds and tests remain green.
