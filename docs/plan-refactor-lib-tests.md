# Plan: extract scan logic into modules + unit tests

## Goal
Split `index.js` (currently one 550-line file mixing CLI parsing, printing, and
scanning logic) into small, high-cohesion / low-coupling modules under `lib/`,
keeping `index.js` as thin CLI glue (arg parsing → dispatch → render). Add unit
tests for the core scanning/matching logic using Bun's built-in test runner.

## Scope

**In scope:**
- Extract each scan domain into its own `lib/*.js` module:
  - `lib/format.js` — `formatKB`, `getSizeKB`
  - `lib/residue.js` — `SCAN_DIRS`, `SKIP_PATTERNS`, `shouldSkip`, `getInstalledApps`, `isActiveApp`
  - `lib/npm.js` — `findNodeModules`
  - `lib/files.js` — `findLargeFiles` (used by `--downloads`)
  - `lib/procs.js` — `isNodeProc`, `isDevProc`, `isExcludedProc`, `parsePsLine` (new, extracted pure parser), `findNodeProcs`
  - `lib/xcode.js` — `XCODE_DIRS`, `scanXcodeDirs` (candidate filtering + size lookup, with `exists`/`getSizeKB` as injectable params for testability)
- `index.js` keeps: arg parsing, titles/printing, dispatch to lib functions. No behavior change.
- Add `tests/*.test.js` using `bun:test`, covering:
  - `formatKB` (pure)
  - `shouldSkip`, `isActiveApp` (pure)
  - `isNodeProc`, `isDevProc`, `isExcludedProc`, `parsePsLine` (pure)
  - `findNodeModules`, `findLargeFiles` against fixture dirs created/torn down in a temp folder (real fs, no mocking lib)
  - `scanXcodeDirs` filtering logic via injected fake `exists`/`getSizeKB`
- Add minimal `package.json` with `"test": "bun test"` script.
- Update README with a "Development / Tests" section (`bun test`).

**Out of scope:**
- No behavior/output changes to any CLI flag.
- Not modularizing the printing/rendering code (stays in `index.js` — it's CLI-specific glue, not "core scanning logic").
- No new test framework/dependency — Bun's built-in `bun:test` only.
- No `getInstalledApps` unit test (shells out to `plutil`/reads real `/Applications`; not pure, low value to mock).

## Steps
1. Create `lib/format.js`, move `formatKB`/`getSizeKB`.
2. Create `lib/residue.js`, move `SCAN_DIRS`/`SKIP_PATTERNS`/`shouldSkip`/`getInstalledApps`/`isActiveApp`.
3. Create `lib/npm.js`, move `findNodeModules`.
4. Create `lib/files.js`, move `findLargeFiles`.
5. Create `lib/procs.js`, move proc-matching regexes/functions; extract `parsePsLine(line, {selfPid, selfPpid})` out of `findNodeProcs` so the per-line parsing/filtering is a pure, testable unit separate from the `ps` spawn.
6. Create `lib/xcode.js`, move `XCODE_DIRS`; wrap the candidate-filter + size-lookup loop currently inline in `index.js` into `scanXcodeDirs(filter, { exists, getSizeKB })` with defaults.
7. Update `index.js` to import from `lib/*` and remove the moved code; verify all 5 CLI modes still behave identically (manual smoke test of each flag).
8. Write `tests/*.test.js` per module above.
9. Add `package.json` (`"type": "module"`, `"scripts": { "test": "bun test" }`).
10. Update README with test-running instructions.
11. Run `bun test` and fix any failures.

## Risks / open questions
- Extracting `parsePsLine` changes internal structure of `findNodeProcs` but must preserve exact filtering order (self-pid exclusion → node-proc check → excluded-proc check → dev-proc check → keyword filter) — will diff carefully against original.
- Fixture-based fs tests write to a temp dir; must clean up in `afterAll`/`afterEach` to avoid leftover test artifacts (ironic, for a cleanup tool).

## Complexity
Medium (mechanical extraction, no logic changes, but touches every mode + adds new test infra).

## Outcome

Done as planned, no deviations. Extracted into `lib/format.js`, `lib/residue.js`,
`lib/npm.js`, `lib/files.js`, `lib/procs.js`, `lib/xcode.js`; `index.js` is now
CLI-glue only (arg parsing → dispatch → print). Additionally extracted the
default-mode residue-collection logic (`collectResidueSections` /
`filterOrphanSections`) out of `index.js`'s inline loop into `lib/residue.js`,
since it counts as "core scanning logic" per the request even though the
original plan only listed `shouldSkip`/`isActiveApp` there.

Made `findNodeModules`/`findLargeFiles`/`findNodeProcs`/`scanXcodeDirs` take
`filter` as a parameter instead of closing over the CLI's module-level `filter`
variable — required for them to be usable/testable outside `index.js`.
Extracted `parsePsLine` as a pure per-line parser out of `findNodeProcs` so the
matching/filtering logic is unit-testable without spawning `ps`. `scanXcodeDirs`
takes injectable `exists`/`sizeOf` (defaulting to `fs.existsSync`/`getSizeKB`)
for the same reason.

Added `tests/*.test.js` (6 files, 35 tests) using Bun's built-in `bun:test`,
plus a minimal `package.json` (`"test": "bun test"`). Fixture-based tests for
`findNodeModules`/`findLargeFiles`/`collectResidueSections` use real temp
directories (created/torn down per suite), no mocking library needed.

Verified: `bun test` — 35/35 pass. Manually smoke-tested all 5 CLI modes
(default, `--npm`, `--downloads`, `--procs`, `--xcode`) plus `--paths` — output
unchanged from pre-refactor behavior.
