.PHONY: api web check env docker-dev

# Load .env (if present) and run API
api:
	@set -a; [ -f .env ] && . ./.env; set +a; bun run --filter @devos/api dev

# Start web (Vite) frontend
web:
	bun run --filter @devos/web dev

# Run type checks
check:
	bun run --filter @devos/api check && bun run --filter @devos/web check

# Copy example env
env:
	@test -f .env || cp .env.example .env

# Run in Docker with hot reload (dev mode)
docker-dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up
