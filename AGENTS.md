# AGENTS GUIDE

## Project overview
- Name: **VPS OS** – macOS-inspired web desktop for VPS development use
- GitHub Pages site: `docs/index.html` (hosted at alexintosh.github.io/vpsos)
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
- Type checks: `make check` (runs `bun run --filter @vpsos/api check` and `bun run --filter @vpsos/web check`)

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

## Common Pitfalls / Agent Learnings

### React StrictMode Double-Mounting
Components mount twice in development. Using `useRef` for "initialized" flags persists across mounts and causes bugs. Solution: Use `useState` with early return or an `isActive` flag in cleanup.

### PTY Sandbox Paths in Docker
When running in Docker, `FS_ROOT=/data` but the API's working directory is `/app`. Relative paths like `.` resolve to `/app`, causing "path outside sandbox" errors. The PTY service should resolve relative paths against `DEFAULT_CWD`.

### Window Padding Consistency
Tiling and maximize must match between:
- CSS (`.window.maximized`) 
- State (`tile()`, `toggleMax()` in `state.ts`)
- Top bar height constant (44px)

Mismatch causes gaps or overlaps.

### Docker Compose Volume Mounts
Code is baked into the image at build time. For active development with hot reload, use `docker-compose.dev.yml` with volume mounts that preserve container `node_modules`.

### Shared Component State
Extract shared UI definitions (like window menu items) to separate modules (`windowMenu.ts`) rather than duplicating between Window and MenuBar components.

### TypeScript Type Imports
When using `type` imports, ensure the type keyword is used consistently: `import type { TilePreset }` or `import { type TilePreset }`.
