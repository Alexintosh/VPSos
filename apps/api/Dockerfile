FROM oven/bun:1.3.8

ENV DEBIAN_FRONTEND=noninteractive

# Install common VPS tooling used by the API (proc/network/log inspection).
RUN apt-get update && apt-get install -y --no-install-recommends \
    procps \
    iproute2 \
    iputils-ping \
    curl \
    zsh \
    dnsutils \
    netcat-openbsd \
    git \
    make \
    systemd \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN bun install

EXPOSE 3000

ENV NODE_ENV=production

CMD ["bun", "run", "--filter", "@devos/api", "start"]
