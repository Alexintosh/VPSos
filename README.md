# Dev OS (VPS web-native workspace)

Single-user web desktop with Bun/Elysia backend and React/Vite frontend, featuring sandboxed FS, PTY terminal, and smart Git/Node/Make toolbars.

## Quickstart

1) Install deps

```bash
bun install
```

2) Create environment

```bash
make env
# then edit .env for your machine:
# AUTH_TOKEN=dev
# FS_ROOT=/absolute/path/to/your/workspace
# DEFAULT_CWD=/absolute/path/to/your/workspace
```

3) Run API (loads .env automatically via Makefile)

```bash
make api
```

4) Run web (Vite)

```bash
make web
```

5) In the web UI, paste the AUTH_TOKEN in the top bar before using File Explorer/Terminal/Tasks.

## Docker

Run the full stack with Docker Compose:

```bash
# Copy and edit environment variables
cp .env.example .env
# Edit .env to set AUTH_TOKEN and other options

# Build and start services
docker compose up --build

# Or run detached
docker compose up -d --build
```

Services:
- API: http://localhost:3000
- Web UI: http://localhost:5173

### Docker configuration

The container has sandbox mode enabled by default (`FS_SANDBOX=on`). If you need full filesystem access (e.g., to access system directories outside `/data`), disable it in your `.env`:

```bash
FS_SANDBOX=off
```

Then restart the containers.

### Active development with Docker

For development with hot reload, use the dev compose file which mounts source code directly:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Changes to source files are reflected immediately without rebuilding.

### Rebuilding after code changes

For production-like runs, code is baked into the image at build time. After making changes, rebuild:

```bash
docker compose up --build
```

Or run natively with `make api` and `make web` for the fastest feedback loop.

## Useful commands

```bash
make check   # typechecks api + web
```
