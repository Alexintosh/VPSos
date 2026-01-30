FROM oven/bun:1.3.8

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN bun install --frozen-lockfile

EXPOSE 3000

ENV NODE_ENV=production

CMD ["bun", "run", "--filter", "@devos/api", "start"]
