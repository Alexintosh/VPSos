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

## Useful commands

```bash
make check   # typechecks api + web
```
