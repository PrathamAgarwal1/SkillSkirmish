# Deploying SkillSkirmish

There are two ways to host SkillSkirmish:

| | **Free** (Vercel + Render + MongoDB Atlas) | **Full** (your own server with Docker) |
|---|---|---|
| Cost | $0 (free tiers) | A VPS (about $5–25/month) |
| Where code runs | In each user's browser (**browser mode**) | In Docker sandboxes on your server |
| JavaScript (React, Vite, Next.js, Express, MERN...) | ✅ Real Node.js + npm in the browser (WebContainers) | ✅ |
| Python scripts, notebooks, pandas / scikit-learn / matplotlib | ✅ Pyodide in the browser | ✅ |
| Streamlit | ✅ stlite (Streamlit in the browser) | ✅ |
| FastAPI / Flask | ✅ In-IDE API tester (no public URL while coding) | ✅ Live preview URL |
| PyTorch / TensorFlow / JupyterLab | ❌ | ✅ |
| Android (Expo) | ✅ Web preview + Expo Snack on your phone | ✅ + tunnel |
| Deploy static sites, Streamlit apps and notebooks | ✅ `https://<api>.onrender.com/apps/<name>/` | ✅ `https://<name>.apps.<domain>` |
| Deploy servers (Express, FastAPI...) | ❌ | ✅ |
| Voice & video calls (Discord-style channels, screen share) | ✅ Peer-to-peer, up to ~10 people per channel | ✅ Peer-to-peer, or the mediasoup server relay for bigger calls |
| Browsers | Chrome, Edge, Firefox (no Safari) | Any |

The same code supports both. The server switches to browser mode automatically when Docker isn't available, or when `SANDBOX_DRIVER=browser` is set.

---

# Free hosting: Vercel + Render + MongoDB Atlas

### 1. Database: MongoDB Atlas (free M0 cluster)
1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Under **Database Access**, add a user. Under **Network Access**, allow `0.0.0.0/0` (Render's free plan has no fixed IP).
3. Copy the connection string (`mongodb+srv://...`). You'll use it as `MONGO_URI`.

Deployed sites are stored in the database. Each deploy is limited to 20 MB (`DEPLOY_MAX_MB`), and only the newest 2 versions are kept (`DEPLOY_KEEP_VERSIONS`), so the free 512 MB goes a long way.

### 2. API: Render (free web service)
1. On [render.com](https://render.com): **New → Blueprint**, then pick this repository. `render.yaml` sets everything up.
2. Fill in `MONGO_URI`, `CLIENT_URL` (your Vercel URL from step 3) and, optionally, the AI keys. `JWT_SECRET`, `SECRETS_KEY` and `ADMIN_KEY` are generated for you.
3. Wait for the deploy to finish, then note the URL, e.g. `https://skillskirmish-api.onrender.com`.

Free Render services sleep after 15 minutes without traffic, so the first request after that takes about 50 seconds. While it wakes, the site shows a "Waking up the server…" banner and retries on its own. To stop it from sleeping at all, the repository includes a GitHub Actions workflow (`.github/workflows/keep-awake.yml`) that pings `/api/health` every 10 minutes. It runs automatically once the workflow is on your default branch. If your API isn't at `https://skillskirmish.onrender.com`, set the repository variable `KEEP_AWAKE_URL` to `https://<your-api>/api/health`. One always-on service fits within Render's 750 free hours a month.

Google sign-in: add `https://<your-api>/api/auth/google/callback` to **Allowed Callback URLs** in your Auth0 application. You don't need `AUTH0_CALLBACK_URL` on Render; the server works it out from its own address.

### 3. Web client: Vercel
1. On [vercel.com](https://vercel.com): **Add New → Project**, pick this repository, and set **Root Directory** to `collab-platform/client`.
2. Add the environment variable `VITE_SERVER_URL=https://skillskirmish-api.onrender.com` (your Render URL), then deploy.
3. Put the Vercel URL into Render's `CLIENT_URL` and redeploy the API.

`vercel.json` already sends the headers the in-browser runtime needs (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy: credentialless`).

### 4. Check the deploy
From `collab-platform/server`, run the read-only smoke check against your live URLs. It checks the API, database, CORS, Google sign-in redirects, published apps and the website's headers, and tells you which setting to fix:

```bash
npm run smoke -- https://your-api.onrender.com --client https://your-site.vercel.app
```

### Voice & video calls
Calls are **peer-to-peer WebRTC**: the server only passes small signaling messages over Socket.IO, so calls work on Render's free plan. Audio and video go directly between browsers.

- Public STUN servers (Google, Cloudflare) are built in, and most connections work with just those.
- About 10–20% of networks (strict corporate firewalls, some mobile carriers) need a **TURN relay**. Add one to make calls work everywhere. Any provider works:

| Option | Environment variables |
|---|---|
| Cloudflare Realtime TURN (has a free tier) | `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_API_TOKEN` |
| Any TURN service with a username/password (e.g. Metered, Twilio) | `TURN_URLS` (comma-separated `turn:`/`turns:` URLs), `TURN_USERNAME`, `TURN_CREDENTIAL` |
| Your own coturn server (`use-auth-secret`) | `TURN_URLS`, `TURN_SECRET` (short-lived credentials are generated per user) |

Peer-to-peer sends everyone's stream to everyone, so channels are capped at 10 people (`VOICE_MAX_USERS`).

### What runs where in browser mode
- **JavaScript projects** run in a [WebContainer](https://webcontainers.io), a real Node.js inside the browser tab. `npm install`, dev servers with hot reload, the terminal and production builds all happen on the user's computer. WebContainers are free for personal, open-source and non-commercial use; a commercial product needs a license from StackBlitz.
- **Python** runs in [Pyodide](https://pyodide.org). pandas, NumPy, scikit-learn, SciPy, matplotlib and statsmodels are built in. Other pure-Python packages from `requirements.txt` install automatically.
- **Kaggle**: add `KAGGLE_USERNAME` and `KAGGLE_KEY` under **Deploy → Environment**. The server downloads datasets into the project, because Kaggle's API can't be called from a browser.
- **Deploys** are built in the browser and uploaded. Vite, CRA, static HTML, Expo web, Next.js with `output: "export"`, Streamlit (served with stlite) and notebooks (rendered with their outputs) can all be published.

---

# Full hosting: VPS with Docker

This part of the guide sets up the whole platform on one Linux server with Docker:

- the API and real-time server (Express, Socket.IO, mediasoup)
- the web client
- the **code sandbox**: every Run, terminal command and package install runs in a locked-down container
- **previews** at `https://<token>.preview.example.com`
- **deployed apps** at `https://<slug>.apps.example.com`

Replace `example.com` with your domain everywhere below.

---

## 1. Server requirements

| | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 22.04 / 24.04 | Ubuntu 24.04 |
| CPU / RAM | 2 vCPU / 4 GB | 4+ vCPU / 8–16 GB |
| Disk | 30 GB | 80 GB+ (the ML image alone is ~4 GB; every project keeps its own `node_modules`) |

Each running sandbox gets its own CPU and memory limit (1 CPU and 1.5 GB by default), and each deployed app gets 0.5 CPU and 512 MB. Size the server for how many people will run code at the same time.

## 2. Install the prerequisites

```bash
# Docker Engine
curl -fsSL https://get.docker.com | sh

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# A dedicated user for the app. The docker group is effectively root access,
# so don't use this account for anything else.
sudo adduser --disabled-password --gecos "" skillskirmish
sudo usermod -aG docker skillskirmish
```

MongoDB: use MongoDB Atlas, or run it locally bound to `127.0.0.1` only. Never expose MongoDB publicly: sandboxes are firewalled from the host (step 6), but the internet is not.

## 3. Get the code and build the sandbox images

```bash
sudo -iu skillskirmish
git clone https://github.com/PrathamAgarwal1/SkillSkirmish.git
cd SkillSkirmish/collab-platform/server
npm ci --omit=dev
npm run sandbox:build        # Node.js 22, Python 3.12 and ML (Jupyter/pandas/PyTorch/Kaggle); ~10–20 min
```

Images are built automatically on first use if you skip this, but then the first person to run a project waits for the build.

## 4. Configure the server

Create `collab-platform/server/.env`:

```env
NODE_ENV=production
PORT=5000
CLIENT_URL=https://example.com
MONGO_URI=mongodb+srv://...

# Generate each secret with: openssl rand -hex 32
JWT_SECRET=...
# Encrypts project environment variables (API keys users store for their apps).
# Don't change it after users have saved variables, or those values can no longer be decrypted.
SECRETS_KEY=...
# For the /api/admin endpoints (send it as the x-admin-key header)
ADMIN_KEY=...

# Public URLs for previews and deployed apps ({id} is replaced per preview/app)
PREVIEW_URL_TEMPLATE=https://{id}.preview.example.com
APPS_URL_TEMPLATE=https://{id}.apps.example.com

# Where project files and deployed builds live
PROJECTS_DIR=/home/skillskirmish/data/projects
DEPLOY_DIR=/home/skillskirmish/data/deployments

# Voice/video calls: peer-to-peer by default. For bigger calls (up to 25 people),
# route media through the built-in mediasoup server relay instead:
# CALL_MODE=sfu
# MEDIASOUP_ANNOUNCED_IP=203.0.113.10   # the server's public IP (needed for CALL_MODE=sfu)
# Optional TURN relay for peer-to-peer calls behind strict firewalls (see the free guide above):
# TURN_URLS=turn:turn.example.com:3478
# TURN_SECRET=...

# AI features (optional)
GROQ_API_KEY=...
GEMINI_API_KEY=...

# Google sign-in (optional)
AUTH0_DOMAIN=...
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_CALLBACK_URL=https://example.com/api/auth/google/callback
```

### Sandbox settings (all optional)

| Variable | Default | What it controls |
|---|---|---|
| `SANDBOX_DRIVER` | `docker` | `local` runs code directly on the host with **no isolation**. Use it only for local development without Docker. |
| `SANDBOX_MEMORY` / `SANDBOX_CPUS` | `1536m` / `1.0` | Limits for each project's workspace container |
| `SANDBOX_PIDS` | `1024` | Max processes per sandbox (stops fork bombs) |
| `SANDBOX_IDLE_MINUTES` | `30` | Idle workspaces are stopped after this long |
| `SANDBOX_MAX_WORKSPACES` | `20` | Max workspaces running at once |
| `SANDBOX_NETWORK` | `ss-sandbox` | Docker network for sandboxes (created automatically, containers can't talk to each other) |
| `DEPLOY_MEMORY` / `DEPLOY_CPUS` | `512m` / `0.5` | Limits for each deployed app |
| `DEPLOY_BUILD_TIMEOUT_SECONDS` | `900` | Deploy build timeout |

## 5. DNS and HTTPS

Create these DNS records, all pointing to the server's IP:

| Type | Name | Purpose |
|---|---|---|
| A | `example.com` | Web client and API |
| A | `*.preview.example.com` | Live previews while coding |
| A | `*.apps.example.com` | Deployed apps |

Wildcard certificates need a **DNS challenge**, so the reverse proxy needs your DNS provider's API. The example below uses [Caddy](https://caddyserver.com) with Cloudflare. For other providers, swap the module (see caddy-dns on GitHub).

```bash
# Caddy with the Cloudflare DNS plugin
sudo apt-get install -y golang-go
go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
~/go/bin/xcaddy build --with github.com/caddy-dns/cloudflare
sudo mv caddy /usr/bin/caddy
```

`/etc/caddy/Caddyfile`:

```caddy
{
	email you@example.com
}

(tls_dns) {
	tls {
		dns cloudflare {env.CF_API_TOKEN}
	}
}

# Web client (static build) + API + websockets
example.com {
	import tls_dns
	encode gzip

	@backend path /api/* /socket.io/*
	handle @backend {
		reverse_proxy 127.0.0.1:5000
	}
	handle {
		root * /home/skillskirmish/SkillSkirmish/collab-platform/client/dist
		try_files {path} /index.html
		file_server
	}
}

# Previews and deployed apps: the API routes these by subdomain
*.preview.example.com, *.apps.example.com {
	import tls_dns
	reverse_proxy 127.0.0.1:5000
}
```

Give Caddy the token (`CF_API_TOKEN`, a Cloudflare token with *Zone → DNS → Edit*) through `sudo systemctl edit caddy`:

```ini
[Service]
Environment=CF_API_TOKEN=your-token
```

Then run `sudo systemctl restart caddy`.

## 6. Firewall

Users' code runs in the sandbox, so treat it as hostile. Sandboxes get internet access (for npm, pip and Kaggle downloads) but must not reach services on the host or your cloud provider's metadata endpoint.

```bash
# Public ports: SSH, HTTP(S), mediasoup media
sudo ufw allow 22/tcp
sudo ufw allow 80,443/tcp
sudo ufw allow 40000:49999/udp
sudo ufw enable

# Start the API once so it creates the sandbox network (bridge interface: ss-sandbox0), then:
sudo iptables -I INPUT -i ss-sandbox0 -m conntrack --ctstate NEW -j DROP              # sandbox -> host services
sudo iptables -I DOCKER-USER -i ss-sandbox0 -d 169.254.169.254 -j DROP                # cloud metadata
sudo iptables -I DOCKER-USER -i ss-sandbox0 -d 10.0.0.0/8 -j DROP                     # private networks
sudo iptables -I DOCKER-USER -i ss-sandbox0 -d 172.16.0.0/12 -j DROP
sudo iptables -I DOCKER-USER -i ss-sandbox0 -d 192.168.0.0/16 -j DROP
sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save
```

These rules don't affect previews or deploys: the API reaches containers through ports published on `127.0.0.1`, and replies to those connections are still allowed.

Check the rules from inside a sandbox. This should time out:

```bash
docker run --rm --network ss-sandbox curlimages/curl -m 5 http://172.17.0.1:5000/
```

Other built-in protections for every container:
- no root
- all Linux capabilities dropped
- `no-new-privileges`
- memory, CPU and process limits
- no access to the server's environment variables

## 7. Build the client

The client's Content-Security-Policy is generated from `VITE_SERVER_URL` at build time. It allows the API plus `*.preview.` and `*.apps.` on the same domain.

```bash
cd ~/SkillSkirmish/collab-platform/client
echo "VITE_SERVER_URL=https://example.com" > .env.production
# If previews use a different domain than the API, list it too (space-separated):
# echo "VITE_EXTRA_ORIGINS=https://*.preview.other-domain.com" >> .env.production
npm ci && npm run build
```

## 8. Run the API as a service

`/etc/systemd/system/skillskirmish.service`:

```ini
[Unit]
Description=SkillSkirmish API
After=network-online.target docker.service
Requires=docker.service

[Service]
User=skillskirmish
WorkingDirectory=/home/skillskirmish/SkillSkirmish/collab-platform/server
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now skillskirmish
journalctl -u skillskirmish -f      # look for "[sandbox] docker driver ready"
```

Deployed apps run with `--restart unless-stopped`, so they come back after a reboot without the API.

## 9. Updating

```bash
cd ~/SkillSkirmish && git pull
cd collab-platform/server && npm ci --omit=dev
cd ../client && npm ci && npm run build
sudo systemctl restart skillskirmish
```

If you change a sandbox Dockerfile, bump its tag in `server/sandbox/config.js` (for example `env-node:1` → `env-node:2`) and run `npm run sandbox:build`.

## Troubleshooting

| Symptom | Check |
|---|---|
| "Docker is not reachable" in the logs | Is the service user in the `docker` group? Is `docker.service` running? |
| Preview shows "Starting…" forever | The Project Console shows the dev server's output. The app must listen on port **3000** and on `0.0.0.0`, not `localhost`. |
| Preview frame is blank, but the URL works in its own tab | The client was built with the wrong `VITE_SERVER_URL`. Look for a `frame-src` CSP error in the browser console. |
| Certificate errors on previews | Check the wildcard DNS records and the Caddy DNS token (`journalctl -u caddy`). |
| Kaggle downloads fail | Add `KAGGLE_USERNAME` and `KAGGLE_KEY` in the project's **Deploy → Environment** tab. They're stored encrypted and passed to runs and deploys. |
