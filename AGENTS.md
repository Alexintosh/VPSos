# AGENTS GUIDE

## Project overview
- Name: **Dev OS** – macOS-inspired web desktop for VPS development use
- Stack: Bun 1.3.5+ with Elysia API (`apps/api`), React/Vite frontend (`apps/web`)
- Core features: window manager (drag/min/max/tile), contextual top menu per focused window, File Explorer with Git/Node/Make toolbars, xterm.js terminal via Bun PTY, Tasks viewer streaming backend process logs

## Environment setup
1. Install deps: `bun install`
2. Copy env template: `make env` (creates `.env` if missing)
3. Set `.env` variables:
   - `AUTH_TOKEN` (single-user secret)
   - `FS_ROOT`, `DEFAULT_CWD` (absolute paths allowed; sandbox controlled by `FS_SANDBOX`)
   - Bun PTY requires Bun ≥ 1.3.5

## Run commands
- API (loads `.env` automatically): `make api`
- Frontend (Vite dev server): `make web`
- Type checks: `make check` (runs `bun run --filter @devos/api check` and `bun run --filter @devos/web check`)

## Authentication workflow
- Web UI top bar includes token field → click **Save token** to POST `/api/auth/login`; token then stored for API + WebSocket calls.

## Desktop UX notes
- Windows support drag, resize (edge/corner handles), minimize/maximize, and snap tiling via edge drag or Window menu.
- Menu bar is contextual: File Explorer injects **File/Git/Run** menus based on detected repo data; Terminal adds **Shell**, Tasks adds **Tasks** menu.

## Branching / CI expectations
- Default branch: `main`
- Current feature work: `feature/desktop-enhance`
- Before committing: run `make check`
- Preferred commit message style: imperative summary

Keep this document updated when workflows or commands change.
