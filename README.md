# WA-GATE

A type-safe WhatsApp gateway REST API built with **Elysia** and **Bun**, powered by [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

Features an **anti-ban multi-strategy** — two WhatsApp instances simulate organic conversation before delivering messages.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Google Chrome (for Puppeteer/whatsapp-web.js)
- [PM2](https://pm2.keymetrics.io/) (production)

### Configuration

1. Clone this repository
2. Copy `.env.example` to `.env` and fill in your values:

```env
NODE_ENV=development
PORT=3000
SECRET_KEY=            # See step 3
WA1_NUMBER=628xxx      # Main WhatsApp number
WA2_NUMBER=628xxx      # Secondary WhatsApp number
```

3. Generate a secret key and paste it into `.env`:

```bash
bun run generate-key
# SECRET_KEY=81ac0289905ba97b6d55826325db52d06a2c2495282dcd36394504076709f522
```

4. Replace `logo.jpg` in root with your own (used as WhatsApp profile picture in production)

### Installation

```bash
bun install
```

### Development

```bash
bun run dev
```

Two QR codes will appear sequentially — scan each with their respective WhatsApp accounts.

## Project Structure

```
src/
├── index.ts                    # Server entry, dual client init
├── modules/
│   └── messaging/
│       ├── index.ts            # Routes (controller)
│       ├── orchestrator.ts     # Anti-ban 3-phase pipeline
│       ├── service.ts          # Direct send logic
│       └── model.ts            # TypeBox validation schemas
├── plugins/
│   ├── wagate.ts               # Dual WhatsApp client plugin
│   └── logger.ts               # Winston logger plugin
├── helper/
│   ├── organic.ts              # Warm-up message generator
│   ├── constant.ts             # Status codes, WA versions
│   ├── error.ts                # Custom error classes
│   ├── logger.ts               # Winston config (JSON for pm2)
│   ├── success.ts              # Success response helper
│   └── util.ts                 # Phone validation, delay
└── lib/
    └── wwebjs.ts               # WagateClient class
```

## Anti-Ban Strategy

Every message goes through a 3-phase warm-up pipeline:

```
Phase 1: WA2 → WA1  (1-3 organic warm-up messages, 1-5s delay)
Phase 2: WA1 → WA2  (1-3 organic reply messages, 1-5s delay)
Phase 3: WA1 → Dest  (actual payload, 1-10s delay)
```

Messages include realistic Indonesian casual texts with random emojis, occasional typos, and content fragments.

## Endpoints

All endpoints require authentication via one of these headers:

```
x-api-key: <your-secret-key>
```

or

```
Authorization: Bearer <your-secret-key>
```

Missing or invalid keys return `401 Unauthorized`.

### `GET` /api/v1/

Health check → `{ "message": "REST API is working" }`

### `POST` /api/v1/send/

Send text message. Body (`application/json`):

| Field   | Type   | Required | Description                     |
| ------- | ------ | -------- | ------------------------------- |
| number  | string | ✅       | Phone number (e.g. `628xxx...`) |
| content | string | ✅       | Message text                    |

### `POST` /api/v1/send/media

Send media file. Body (`multipart/form-data`):

| Field   | Type   | Required | Description                     |
| ------- | ------ | -------- | ------------------------------- |
| number  | string | ✅       | Phone number (e.g. `628xxx...`) |
| content | string | ❌       | Caption                         |
| file    | file   | ✅       | Media file                      |

### Response

```json
{ "status": "success", "code": 200, "message": "Message queued for delivery", "data": { ... } }
```

---

## Deployment Guide

### 1. Server Setup (Ubuntu)

```bash
# System dependencies for Puppeteer/Chromium (Ubuntu 20+)
sudo apt-get update

# Detect Ubuntu version for renamed packages
UBUNTU_VER=$(lsb_release -rs | cut -d. -f1)
if [ "$UBUNTU_VER" -ge 24 ]; then
    VERSIONED_PKGS="libgcc-s1 libasound2t64"
elif [ "$UBUNTU_VER" -ge 22 ]; then
    VERSIONED_PKGS="libgcc-s1 libasound2"
else
    # Ubuntu 20: old package names + gconf (removed in 22+)
    VERSIONED_PKGS="libgcc1 libasound2 gconf-service libgconf-2-4"
fi

sudo apt-get install -y \
    libgbm1 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    wget \
    $VERSIONED_PKGS

# Install Bun
curl -fsSL https://bun.sh/install | bash

# Install Node.js (needed for PM2 and npx)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
bun install -g pm2

# Install Chrome for Puppeteer
bunx puppeteer browsers install chrome
```

### 2. First Run (Local — QR Scan)

Run locally first to authenticate both WhatsApp accounts:

```bash
bun run dev
```

Scan both QR codes. Sessions are saved to:

- `.wwebjs_auth/session-client-1/`
- `.wwebjs_auth/session-client-2/`

### 3. Transfer to Server

```bash
# Upload project
rsync -avz --exclude node_modules --exclude logs ./ server:/app/wagate/

# Or just the session files if project is already deployed
scp -r .wwebjs_auth/session-client-1 server:/app/wagate/.wwebjs_auth/
scp -r .wwebjs_auth/session-client-2 server:/app/wagate/.wwebjs_auth/
```

### 4. Server Installation

```bash
ssh server
cd /app/wagate

# Install dependencies
bun install

# Set up environment
cp .env.example .env
# Edit .env with production values:
# NODE_ENV=production
# WA1_NUMBER=628xxx
# WA2_NUMBER=628xxx

# Generate and set a secret key
bun run generate-key
# Copy the output and set SECRET_KEY= in .env
```

### 5. Setup PM2 Logrotate

```bash
chmod +x scripts/setup-logrotate.sh
./scripts/setup-logrotate.sh
```

This configures:

- **Daily rotation** at midnight
- **7-day retention** (older logs auto-deleted)
- **100MB max size** per file (force-rotates if exceeded)
- **Compressed** rotated logs (.gz)

### 6. Start with PM2

```bash
# Start the application
pm2 start ecosystem.config.cjs

# Save PM2 process list (survives reboots)
pm2 save

# Enable PM2 startup on boot
pm2 startup
```

### 7. Monitoring

```bash
# View live logs
pm2 logs wagate

# View structured JSON logs (production)
pm2 logs wagate --json

# Monitor dashboard
pm2 monit

# Check status
pm2 status

# Restart
pm2 restart wagate

# View log files directly
tail -f logs/pm2-out.log
tail -f logs/pm2-error.log
```

### Log Files

| File                 | Content                     |
| -------------------- | --------------------------- |
| `logs/pm2-out.log`   | PM2 stdout (all info/debug) |
| `logs/pm2-error.log` | PM2 stderr                  |
| `logs/combined.log`  | Winston combined log        |
| `logs/error.log`     | Winston errors only         |

---

## Docker Deployment

An alternative to the bare-metal + PM2 setup above.

### 1. Scan QR Codes Locally

Same as [step 2](#2-first-run-local--qr-scan) — run locally first to authenticate both accounts and generate the session files.

### 2. Build the Image

```bash
docker compose build
```

### 3. Copy Sessions to Server

```bash
rsync -avz .wwebjs_auth/ server:/app/wagate/.wwebjs_auth/
```

### 4. Run on Server

```bash
# Copy project files (without node_modules)
rsync -avz --exclude node_modules --exclude logs ./ server:/app/wagate/

ssh server
cd /app/wagate

# Set up environment
cp .env.example .env
# Edit .env: set SECRET_KEY, WA1_NUMBER, WA2_NUMBER

docker compose up -d
```

### 5. Monitoring

```bash
# Live logs
docker compose logs -f wagate

# Status
docker compose ps

# Restart
docker compose restart wagate
```

Sessions and logs are persisted via bind mounts:

- `.wwebjs_auth/` — WhatsApp session files
- `logs/` — application logs

---

## Debugging

1. Delete `.wwebjs_auth` folder
2. Delete `node_modules` and `bun.lock`
3. Logout linked devices on your WhatsApp
4. Run `bun install` again
5. Re-scan QR codes

## License

MIT
