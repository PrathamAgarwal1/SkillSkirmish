# SkillSkirmish sandbox: Node.js 22 environment
# Used by React/Vite, MERN, Next.js, Express, Vanilla web and Android (Expo) projects.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates python3 make g++ procps curl unzip \
 && rm -rf /var/lib/apt/lists/*

# Static file server used by "Vanilla Web" projects
RUN npm install -g http-server@14 && npm cache clean --force

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    # File watching through bind mounts (Docker Desktop on Windows/macOS) needs polling
    CHOKIDAR_USEPOLLING=true \
    WATCHPACK_POLLING=true \
    EXPO_NO_TELEMETRY=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    HOME=/tmp/home

RUN mkdir -p /tmp/home && chmod 1777 /tmp/home
WORKDIR /workspace
CMD ["sleep", "infinity"]
