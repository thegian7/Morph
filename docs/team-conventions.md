# LightTime Team Conventions

**Team composition:** 10 Claude Code agents
**Coordination:** Git worktrees + mutex locks on shared files
**Last Updated:** February 19, 2026

---

## Git Workflow

### Branch Model

Each agent works in an isolated **git worktree** on a dedicated branch. No agent commits directly to `main`. Completed work merges to `main` via fast-forward after rebasing.

```
main (protected — no direct commits)
  ├── agent/overlay-spike/ts-1
  ├── agent/google-spike/ts-5
  ├── agent/ms-spike/ts-6
  ├── agent/color-types/ce-1
  ├── agent/cal-abstraction/cal-1
  └── ...
```

### Branch Naming

```
agent/{agent-name}/{task-id}
```

Examples:
- `agent/overlay-mac/ts-1`
- `agent/color-engine/ce-2`
- `agent/google-cal/cal-2`

### Worktree Setup

Each agent creates a worktree at the start of their task:

```bash
# From the main repo
git worktree add ../lighttime-{agent-name} -b agent/{agent-name}/{task-id} main
```

When the task is complete:

```bash
# Merge back to main
cd /path/to/main/repo
git checkout main
git merge --ff-only agent/{agent-name}/{task-id}

# If fast-forward fails, rebase first
git checkout agent/{agent-name}/{task-id}
git rebase main
git checkout main
git merge --ff-only agent/{agent-name}/{task-id}

# Clean up
git worktree remove ../lighttime-{agent-name}
git branch -d agent/{agent-name}/{task-id}
```

---

## File Ownership Zones

Each task maps to a directory. Agents should only modify files within their zone. Shared files require a mutex lock (see below).

### Rust Backend Zones

| Zone | Owner (Task) | Files |
|------|-------------|-------|
| Window Manager (macOS) | OE-3 | `src-tauri/src/window_manager/macos.rs` |
| Window Manager (Windows) | OE-4 | `src-tauri/src/window_manager/windows.rs` |
| Window Manager (trait) | OE-1 | `src-tauri/src/window_manager/mod.rs` |
| Calendar Types | CAL-1 | `src-tauri/src/calendar/types.rs` |
| Calendar Aggregator | CAL-1 | `src-tauri/src/calendar/aggregator.rs` |
| Google Provider | CAL-2 | `src-tauri/src/calendar/google.rs` |
| Microsoft Provider | CAL-3 | `src-tauri/src/calendar/microsoft.rs` |
| Apple Provider | CAL-4 | `src-tauri/src/calendar/apple.rs` |
| Polling Service | CAL-5 | `src-tauri/src/calendar/poller.rs` |
| Settings Store | LP-6 | `src-tauri/src/settings.rs`, `src-tauri/migrations/` |
| Timer Backend | MT-1 | `src-tauri/src/timer.rs` |
| System Tray | ST-1, ST-2 | `src-tauri/src/tray.rs` |
| Tauri Commands | Various | `src-tauri/src/commands/` (one file per domain) |
| Main entry point | OE-1 | `src-tauri/src/main.rs`, `src-tauri/src/lib.rs` |

### TypeScript Frontend Zones

| Zone | Owner (Task) | Files |
|------|-------------|-------|
| Color Engine Types | CE-1 | `src/lib/color-engine/types.ts`, `src/lib/color-engine/palettes.ts` |
| Color Engine Logic | CE-2, CE-3, CE-4, CE-5 | `src/lib/color-engine/index.ts`, `src/lib/color-engine/*.ts` |
| Color Engine Tests | CE-6 | `src/lib/color-engine/__tests__/` |
| Shared Types | CE-1 | `src/lib/types/` |
| Timer Module | MT-1 | `src/lib/timer/` |
| Overlay Window | OE-2, OE-5 | `src/overlay/` |
| Settings Window | SET-1, SET-2, SET-3, SET-4 | `src/settings/` |
| Calendar UI | CAL-6 | `src/settings/calendar/` |
| Onboarding | QA-4 | `src/onboarding/` |

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

Spike code does NOT merge into the production codebase. Findings are documented and the production tasks (OE-*, CAL-*) use those findings to write clean code.

---

## Shared Files (Mutex Required)

These files are modified by multiple agents. Before editing, an agent MUST acquire a lock.

| File | Why It's Shared |
|------|----------------|
| `package.json` | Multiple agents add dependencies |
| `package-lock.json` | Generated from package.json changes |
| `Cargo.toml` | Multiple agents add Rust dependencies |
| `Cargo.lock` | Generated from Cargo.toml changes |
| `src-tauri/tauri.conf.json` | Window config, plugin registration, commands |
| `src-tauri/src/main.rs` | Module registration, plugin setup |
| `src-tauri/src/lib.rs` | Module declarations |
| `tsconfig.json` | Path aliases, compiler options |
| `vite.config.ts` | Build config |
| `.github/workflows/` | CI pipeline |
| `src-tauri/migrations/` | Database schema (append-only, but ordering matters) |

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

| Type | Use When |
|------|----------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Build, CI, dependency updates |
| `spike` | Sprint 0 exploratory work |

### Scopes

| Scope | Component |
|-------|-----------|
| `overlay` | Overlay engine (OE-*) |
| `color` | Color engine (CE-*) |
| `cal` | Calendar integrations (CAL-*) |
| `timer` | Manual timer (MT-*) |
| `settings` | Settings UI (SET-*) |
| `tray` | System tray (ST-*) |
| `billing` | Billing & licensing (BL-*) |
| `dist` | Distribution & updates (DU-*) |
| `infra` | CI/CD, project config |

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

| Agent Name | Primary Tasks | Sprint 0 Assignment |
|------------|--------------|---------------------|
| `overlay-mac` | TS-1, TS-3, OE-3 | TS-1 → TS-3 |
| `overlay-win` | TS-2, OE-4 | TS-2 (after TS-1) |
| `overlay-arch` | TS-4, OE-1, OE-2 | TS-4 (after TS-1, TS-2) |
| `overlay-fx` | OE-5, OE-6 | Idle Sprint 0 |
| `color-engine` | CE-1, CE-2, CE-3, CE-4, CE-5, CE-6 | CE-1 |
| `google-cal` | TS-5, CAL-2 | TS-5 |
| `ms-cal` | TS-6, CAL-3 | TS-6 |
| `apple-cal` | CAL-4, CAL-1 | CAL-1 |
| `ui-settings` | SET-1, SET-2, SET-3, SET-4, ST-1, ST-2 | Idle Sprint 0 |
| `billing` | BL-1, BL-2, BL-3 | BL-1 |

> Agents idle during Sprint 0 can assist with documentation, CI setup, or pick up tasks from the next sprint if Sprint 0 completes early.

---

## Sprint 0 Parallelization (10 Agents)

Sprint 0 has a bottleneck: TS-2, TS-3, TS-4 all depend on TS-1.

### Wave 1 (Day 1 — 6 agents active)

| Agent | Task | Dependencies |
|-------|------|-------------|
| `overlay-mac` | TS-1: macOS overlay spike | None |
| `google-cal` | TS-5: Google OAuth spike | None |
| `ms-cal` | TS-6: MS Graph OAuth spike | None |
| `color-engine` | CE-1: Color engine types | None |
| `apple-cal` | CAL-1: Calendar abstraction | None |
| `billing` | BL-1: Stripe product setup | None |

### Wave 2 (After TS-1 completes — 2 more agents)

| Agent | Task | Dependencies |
|-------|------|-------------|
| `overlay-win` | TS-2: Windows overlay spike | TS-1 |
| `overlay-mac` | TS-3: macOS fullscreen spike | TS-1 (same agent continues) |

### Wave 3 (After TS-1 + TS-2 complete — 1 more agent)

| Agent | Task | Dependencies |
|-------|------|-------------|
| `overlay-arch` | TS-4: Architecture comparison | TS-1, TS-2 |

### Available for Early Sprint 1 Work (4 idle agents)

| Agent | Can Start Early |
|-------|----------------|
| `overlay-fx` | Documentation, CI setup |
| `overlay-arch` | LP-6: SQLite schema design (no code deps, just design) |
| `ui-settings` | Settings window wireframes / component structure |
| Any finished agent | Pick up Sprint 1 tasks with no dependencies |

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
6. Code is committed with a conventional commit message
7. Branch is rebased on latest `main` and merges cleanly
8. Asana task is marked complete
