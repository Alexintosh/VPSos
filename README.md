# VPSos (web-native workspace)

Single-user web desktop, makes working on your VPS feel familiar. Inspired by the classic desktop experience on mac, it allows to execute common tasks you'd normally do on the terminal. Git is integrated into the file explorer, you'll also find convinient way to run your project (w/ Makefile/bun/pnpm). You can multiple terminals, handle processes, logs, etc. Tiling system and sandboxed FS included.

<img src="https://raw.githubusercontent.com/Alexintosh/VPSos/refs/heads/main/docs/screen1.png" />

## Quickstart

1) Install deps

```bash
bun install
```

2) Create environment

```bash
make env
# then edit .env for your machine:
# REQUIRE_AUTH=true
# USER_PASSWORD=dev
# FS_ROOT=/absolute/path/to/your/workspace
# DEFAULT_CWD=/absolute/path/to/your/workspace
# PROXY_ALLOW_PORTS=3001,5173
```

3) Run API (loads .env automatically via Makefile)

```bash
make api
```

4) Run web (Vite)

```bash
make web
```

If the Vite dev proxy fails to connect to the API (e.g., IPv6 `::1`), set an explicit IPv4 target:

```bash
VITE_API_PROXY_TARGET=http://127.0.0.1:3000
VITE_WS_PROXY_TARGET=ws://127.0.0.1:3000
```

5) Open the web UI and sign in with USER_PASSWORD.

Security note: In production, keep `REQUIRE_AUTH=true` and place the API behind a reverse proxy with HTTPS and additional access controls.

### Local Web proxy (VPS localhost)

To view services bound to `127.0.0.1` on the VPS through the Local Web plugin, allow specific ports:

```bash
PROXY_ALLOW_PORTS=3001,5173
```

Then enable **VPS Proxy** in the Local Web toolbar and load the service URL.

## Docker

Run the full stack with Docker Compose:

```bash
# Copy and edit environment variables
cp .env.example .env
# Edit .env to set USER_PASSWORD and other options

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
