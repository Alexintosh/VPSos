.PHONY: api web check env docker-dev dev pm2-dev pm2-prod pm2-stop pm2-delete pm2-logs pm2-status

# Load .env (if present) and run API
api:
	@set -a; [ -f .env ] && . ./.env; set +a; bun run --filter @vpsos/api dev

# Start web (Vite) frontend
web:
	bun run --filter @vpsos/web dev

# Run type checks
check:
	bun run --filter @vpsos/api check && bun run --filter @vpsos/web check

# Run API + Web together
dev:
	@$(MAKE) -j2 api web

# Copy example env
env:
	@test -f .env || cp .env.example .env

# Run in Docker with hot reload (dev mode)
docker-dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# PM2 Commands

# Start dev mode with PM2 (API + Vite dev server)
pm2-dev:
	pm2 start pm2.config.js

# Build web and start production with PM2
pm2-prod:
	bun run --filter @vpsos/web build
	pm2 start pm2.prod.config.js

# Stop all PM2 processes
pm2-stop:
	pm2 stop all

# Delete all PM2 processes
pm2-delete:
	pm2 delete all

# View PM2 logs
pm2-logs:
	pm2 logs

# View PM2 status
pm2-status:
	pm2 status
