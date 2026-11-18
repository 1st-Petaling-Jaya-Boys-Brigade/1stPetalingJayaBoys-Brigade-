# E2E Test Suite Ready

## Test Runner
- **Command**: `node tests/e2e/run-e2e-suite.js`
- **CLI Options**:
  - `--tier=<1|2|3|4|all>`: Execute tests from a specific tier (e.g. `--tier 1` or `--tier=4`).
  - `--feature=<CODE>`: Filter tests by feature code (e.g. `--feature=SEC-01`).
  - `--grep=<REGEX>`: Filter tests by regular expression pattern (e.g. `--grep="^T1-F"`).
  - `--bail`: Stop suite execution immediately upon first failure.
- **Expected Semantics**:
  - Current M1-only codebase: Executes all 285 tests, yields 218 Passed, 67 honest failures on unimplemented M2/M3/M4 features, natural exit with code `1`.
  - Target upon completion of all milestones (M1..M4): 285 Passed, 0 Failed, 0 Skipped, exit code `0`.

## Coverage Summary
| Tier | Count | Description |
|------|------:|-------------|
| 1. Feature Coverage | 125 | Exactly 5 nominal feature coverage tests per feature across all 25 features |
| 2. Boundary & Corner | 125 | Exactly 5 boundary, edge, and stress tests per feature across all 25 features |
| 3. Cross-Feature Combinations | 28 | Comprehensive pairwise combinatorial interaction tests across core modules |
| 4. Real-World Application Scenarios | 7 | End-to-end realistic user journeys (Officer, Member, Parent, Admin, Realtime, CI/DevOps) |
| **Total** | **285** | Complete 4-Tier Automated Opaque-Box E2E Suite |

## Feature Checklist
| Feature Code | Feature Description | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|--------------|---------------------|:------:|:------:|:------:|:------:|
| SEC-01 | RLS Policy Hardening | 5 | 5 | ✓ | ✓ |
| SEC-02 | Password Column & OTP Protection | 5 | 5 | ✓ | ✓ |
| SEC-03 | Session Spoofing & Route Guard | 5 | 5 | ✓ | ✓ |
| SEC-04 | Stored XSS Elimination | 5 | 5 | ✓ | ✓ |
| SEC-05 | IDOR & Form/Order Protection | 5 | 5 | ✓ | ✓ |
| SEC-06 | Sync Secret Protection | 5 | 5 | ✓ | ✓ |
| SEC-07 | Mutation Concurrency & Sanitation | 5 | 5 | ✓ | ✓ |
| PERF-01 | Startup Waterfall & Batch Config | 5 | 5 | ✓ | ✓ |
| PERF-02 | Unbounded Queries & Pagination | 5 | 5 | ✓ | ✓ |
| PERF-03 | Gallery Signed URL Batching | 5 | 5 | ✓ | ✓ |
| UX-01 | UX State: Loading Skeletons | 5 | 5 | ✓ | ✓ |
| UX-02 | UX State: Error & Retry States | 5 | 5 | ✓ | ✓ |
| UX-03 | UX State: Inline Form Validation | 5 | 5 | ✓ | ✓ |
| SYNC-01 | Real-Time Sync Subscriptions | 5 | 5 | ✓ | ✓ |
| SYNC-02 | Broadcast Trigger Coverage | 5 | 5 | ✓ | ✓ |
| SYNC-03 | Forum Safe Concurrent Updates | 5 | 5 | ✓ | ✓ |
| OBS-01 | Audit Logging for Admin Operations | 5 | 5 | ✓ | ✓ |
| OBS-02 | Background Promise Error Handling | 5 | 5 | ✓ | ✓ |
| MAINT-01 | Code Duplication Cleanup | 5 | 5 | ✓ | ✓ |
| MAINT-02 | Dead Globals & ESLint Configuration | 5 | 5 | ✓ | ✓ |
| TEST-01 | Concurrency Test Clean Exit | 5 | 5 | ✓ | ✓ |
| TEST-02 | Headless Browser Layout Assertions | 5 | 5 | ✓ | ✓ |
| MAINT-03 | Prettier Code Formatting | 5 | 5 | ✓ | ✓ |
| OPS-01 | Config & Secret Externalization | 5 | 5 | ✓ | ✓ |
| DEVOPS-01 | CI Automation Workflow | 5 | 5 | ✓ | ✓ |
