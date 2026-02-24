# Morph Team Conventions

**Team composition:** Up to 10 Claude Code agents
**Coordination:** Centralized git (lead only) + mutex locks on shared files
**Last Updated:** February 19, 2026

---

## Git Workflow

### Centralized Git Model

**Agents do NOT run any git commands.** All git operations (add, commit, branch, merge) are performed exclusively by the team lead. This prevents cross-contamination issues observed in Sprint 0 where agents accidentally committed each other's files.

#### Agent responsibilities:

- Write code and run tests in their assigned file zones
- Use mutex locks for shared files
- Signal "task complete" to the team lead when done

#### Team lead responsibilities:

- Review agent output
- Stage specific files (`git add <file>` — never `git add .`)
- Commit with conventional commit messages
- Manage branches and merges
- Decide when to commit (batch related changes, keep commits atomic)

---

## File Ownership Zones

Each task maps to a directory. Agents should only modify files within their zone. Shared files require a mutex lock (see below).

### Rust Backend Zones

| Zone                     | Owner (Task) | Files                                                |
| ------------------------ | ------------ | ---------------------------------------------------- |
| Window Manager (macOS)   | OE-3         | `src-tauri/src/window_manager/macos.rs`              |
| Window Manager (Windows) | OE-4         | `src-tauri/src/window_manager/windows.rs`            |
| Window Manager (trait)   | OE-1         | `src-tauri/src/window_manager/mod.rs`                |
| Calendar Types           | CAL-1        | `src-tauri/src/calendar/types.rs`                    |
| Calendar Aggregator      | CAL-1        | `src-tauri/src/calendar/aggregator.rs`               |
| Google Provider          | CAL-2        | `src-tauri/src/calendar/google.rs`                   |
| Microsoft Provider       | CAL-3        | `src-tauri/src/calendar/microsoft.rs`                |
| Apple Provider           | CAL-4        | `src-tauri/src/calendar/apple.rs`                    |
| Polling Service          | CAL-5        | `src-tauri/src/calendar/poller.rs`                   |
| Settings Store           | LP-6         | `src-tauri/src/settings.rs`, `src-tauri/migrations/` |
| Timer Backend            | MT-1         | `src-tauri/src/timer.rs`                             |
| System Tray              | ST-1, ST-2   | `src-tauri/src/tray.rs`                              |
| Tauri Commands           | Various      | `src-tauri/src/commands/` (one file per domain)      |
| Main entry point         | OE-1         | `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`      |

### TypeScript Frontend Zones

| Zone               | Owner (Task)               | Files                                                               |
| ------------------ | -------------------------- | ------------------------------------------------------------------- |
| Color Engine Types | CE-1                       | `src/lib/color-engine/types.ts`, `src/lib/color-engine/palettes.ts` |
| Color Engine Logic | CE-2, CE-3, CE-4, CE-5     | `src/lib/color-engine/index.ts`, `src/lib/color-engine/*.ts`        |
| Color Engine Tests | CE-6                       | `src/lib/color-engine/__tests__/`                                   |
| Shared Types       | CE-1                       | `src/lib/types/`                                                    |
| Timer Module       | MT-1                       | `src/lib/timer/`                                                    |
| Overlay Window     | OE-2, OE-5                 | `src/overlay/`                                                      |
| Settings Window    | SET-1, SET-2, SET-3, SET-4 | `src/settings/`                                                     |
| Calendar UI        | CAL-6                      | `src/settings/calendar/`                                            |
| Onboarding         | QA-4                       | `src/onboarding/`                                                   |

### Spike Code (Sprint 0)

Spikes produce throwaway code. Each spike agent works in an isolated directory:

```
spikes/
  ts-1-macos-overlay/
  ts-2-windows-overlay/
  ts-3-fullscreen/
  ts-4-architecture/
  ts-5-google-oauth/
  ts-6-ms-oauth/
```

Spike code does NOT merge into the production codebase. Findings are documented and the production tasks (OE-_, CAL-_) use those findings to write clean code.

---

## Shared Files (Mutex Required)

These files are modified by multiple agents. Before editing, an agent MUST acquire a lock.

| File                        | Why It's Shared                                     |
| --------------------------- | --------------------------------------------------- |
| `package.json`              | Multiple agents add dependencies                    |
| `package-lock.json`         | Generated from package.json changes                 |
| `Cargo.toml`                | Multiple agents add Rust dependencies               |
| `Cargo.lock`                | Generated from Cargo.toml changes                   |
| `src-tauri/tauri.conf.json` | Window config, plugin registration, commands        |
| `src-tauri/src/main.rs`     | Module registration, plugin setup                   |
| `src-tauri/src/lib.rs`      | Module declarations                                 |
| `tsconfig.json`             | Path aliases, compiler options                      |
| `vite.config.ts`            | Build config                                        |
| `.github/workflows/`        | CI pipeline                                         |
| `src-tauri/migrations/`     | Database schema (append-only, but ordering matters) |

### Mutex Protocol

Agents use file-based locks in a `.locks/` directory at the repo root.

```bash
# Acquire lock
echo "{agent-name}" > .locks/{filename}.lock

# Edit the shared file
# ...

# Release lock
rm .locks/{filename}.lock
```

If a lock file already exists, the agent MUST wait and retry. Never force-remove another agent's lock.

> The team lead initializes `.locks/` and coordinates lock ownership. In practice, shared file edits should be batched — e.g., the scaffold agent (OE-1) sets up all shared files first, then other agents only add to them.

---

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

### Types

| Type       | Use When                                                |
| ---------- | ------------------------------------------------------- |
| `feat`     | New feature or capability                               |
| `fix`      | Bug fix                                                 |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test`     | Adding or updating tests                                |
| `docs`     | Documentation only                                      |
| `chore`    | Build, CI, dependency updates                           |
| `spike`    | Sprint 0 exploratory work                               |

### Scopes

| Scope      | Component                       |
| ---------- | ------------------------------- |
| `overlay`  | Overlay engine (OE-\*)          |
| `color`    | Color engine (CE-\*)            |
| `cal`      | Calendar integrations (CAL-\*)  |
| `timer`    | Manual timer (MT-\*)            |
| `settings` | Settings UI (SET-\*)            |
| `tray`     | System tray (ST-\*)             |
| `billing`  | Ko-fi tip jar & support (BL-\*) |
| `dist`     | Distribution & updates (DU-\*)  |
| `infra`    | CI/CD, project config           |

### Examples

```
feat(color): implement free-time and warning state transitions
feat(cal): add Google Calendar OAuth2 PKCE provider
fix(overlay): prevent border flicker on display resolution change
test(color): add integration tests for back-to-back meeting scenarios
spike(overlay): validate macOS fullscreen overlay via objc2
chore(infra): configure GitHub Actions CI for macOS and Windows
```

---

## Agent Naming Convention

Each agent is named by their primary responsibility:

| Agent Name     | Primary Tasks                          | Sprint 0 Assignment     |
| -------------- | -------------------------------------- | ----------------------- |
| `overlay-mac`  | TS-1, TS-3, OE-3                       | TS-1 → TS-3             |
| `overlay-win`  | TS-2, OE-4                             | TS-2 (after TS-1)       |
| `overlay-arch` | TS-4, OE-1, OE-2                       | TS-4 (after TS-1, TS-2) |
| `overlay-fx`   | OE-5, OE-6                             | Idle Sprint 0           |
| `color-engine` | CE-1, CE-2, CE-3, CE-4, CE-5, CE-6     | CE-1                    |
| `google-cal`   | TS-5, CAL-2                            | TS-5                    |
| `ms-cal`       | TS-6, CAL-3                            | TS-6                    |
| `apple-cal`    | CAL-4, CAL-1                           | CAL-1                   |
| `ui-settings`  | SET-1, SET-2, SET-3, SET-4, ST-1, ST-2 | Idle Sprint 0           |
| `billing`      | BL-4, BL-5                             | BL-5                    |

> Agents idle during Sprint 0 can assist with documentation, CI setup, or pick up tasks from the next sprint if Sprint 0 completes early.

---

## Sprint 0 Parallelization (10 Agents)

Sprint 0 has a bottleneck: TS-2, TS-3, TS-4 all depend on TS-1.

### Wave 1 (Day 1 — 6 agents active)

| Agent          | Task                          | Dependencies |
| -------------- | ----------------------------- | ------------ |
| `overlay-mac`  | TS-1: macOS overlay spike     | None         |
| `google-cal`   | TS-5: Google OAuth spike      | None         |
| `ms-cal`       | TS-6: MS Graph OAuth spike    | None         |
| `color-engine` | CE-1: Color engine types      | None         |
| `apple-cal`    | CAL-1: Calendar abstraction   | None         |
| `billing`      | BL-5: Remove billing remnants | None         |

### Wave 2 (After TS-1 completes — 2 more agents)

| Agent         | Task                         | Dependencies                |
| ------------- | ---------------------------- | --------------------------- |
| `overlay-win` | TS-2: Windows overlay spike  | TS-1                        |
| `overlay-mac` | TS-3: macOS fullscreen spike | TS-1 (same agent continues) |

### Wave 3 (After TS-1 + TS-2 complete — 1 more agent)

| Agent          | Task                          | Dependencies |
| -------------- | ----------------------------- | ------------ |
| `overlay-arch` | TS-4: Architecture comparison | TS-1, TS-2   |

### Available for Early Sprint 1 Work (4 idle agents)

| Agent              | Can Start Early                                        |
| ------------------ | ------------------------------------------------------ |
| `overlay-fx`       | Documentation, CI setup                                |
| `overlay-arch`     | LP-6: SQLite schema design (no code deps, just design) |
| `ui-settings`      | Settings window wireframes / component structure       |
| Any finished agent | Pick up Sprint 1 tasks with no dependencies            |

### Sprint 0 Retrospective

**What worked:**

- Mutex lockfiles for shared file coordination
- Wave-based agent spawning (6 → 2 → 1) respected dependency chains
- Idle agents picked up follow-on work (color-engine completed CE-2 through CE-6, apple-cal set up CI)
- All 6 spikes + bonus production code completed in one session

**What didn't work:**

- Agents running git commands caused cross-contamination (broad `git add` committed other agents' files)
- Worktrees were planned but never used — all agents worked in the same directory
- Branch merging was messy due to leaked commits

**Changes for Sprint 1+:**

- **Centralized git**: Only the team lead runs git commands (see Git Workflow above)
- Agents focus purely on code + tests, signal completion to lead
- Lead reviews and commits with specific file staging

---

## Testing Standards

### TypeScript (Vitest)

- Test files: `*.test.ts` co-located with source, or in `__tests__/` directories
- Run: `npx vitest run`
- Watch: `npx vitest`
- Coverage target: >90% on color engine module
- Color engine tests use time simulation (inject `now` parameter, don't use real clocks)

### Rust (cargo test)

- Test functions: `#[cfg(test)]` modules in each source file
- Integration tests: `src-tauri/tests/`
- Run: `cargo test`
- Mock calendar providers for unit tests (implement CalendarProvider trait with hardcoded data)

### CI Pipeline (GitHub Actions)

- **On every push:** lint (ESLint + clippy), format check (Prettier + rustfmt), test (Vitest + cargo test)
- **On PR to main:** above + build check (cargo tauri build --debug)
- **On tag:** full release build (cargo tauri build) with code signing

---

## Definition of Done

A task is complete when:

1. Code is written and compiles without warnings
2. All acceptance criteria from the Asana task are met
3. Tests pass (unit tests at minimum; integration tests where specified)
4. `cargo clippy` passes with no warnings
5. `npx eslint .` passes with no errors
6. Agent signals completion to the team lead
7. Team lead commits and merges the work
8. Asana task is marked complete
