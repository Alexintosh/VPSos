FROM oven/bun:1.3.8

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN bun install

EXPOSE 5173

ENV NODE_ENV=development

CMD ["bun", "run", "--filter", "@vpsos/web", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
