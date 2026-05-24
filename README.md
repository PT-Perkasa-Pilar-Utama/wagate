# WA-GATE

A type-safe WhatsApp gateway REST API built with **Elysia** and **Bun**, powered by [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

Features an **anti-ban multi-strategy** — two WhatsApp instances simulate organic conversation before delivering messages.

Also ships an **SMS channel** — a paired Android phone pulls queued jobs from the gateway and sends them through its own SIM, so the data center never has to reach the phone directly.

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
SECRET_KEY=            # See step 3 — clients use this
SMS_DEVICE_KEY=        # See step 3 — the paired phone uses this
WA1_NUMBER=628xxx      # Main WhatsApp number
WA2_NUMBER=628xxx      # Secondary WhatsApp number
```

3. Generate keys and paste them into `.env`. Run it once per key — `SECRET_KEY` authenticates API clients, `SMS_DEVICE_KEY` authenticates the paired phone (keep them distinct so the phone never holds the master secret):

```bash
bun run generate-key
# SECRET_KEY=81ac0289905ba97b6d55826325db52d06a2c2495282dcd36394504076709f522
bun run generate-key
# SMS_DEVICE_KEY=4f2c...  (paste as SMS_DEVICE_KEY)
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
│   ├── messaging/
│   │   ├── index.ts            # Routes (controller)
│   │   ├── orchestrator.ts     # Anti-ban 3-phase pipeline
│   │   ├── service.ts          # Direct send logic
│   │   └── model.ts            # TypeBox validation schemas
│   └── sms/
│       ├── index.ts            # Send + device (poll/ack) controllers
│       ├── service.ts          # Enqueue / poll / ack logic
│       └── model.ts            # TypeBox validation schemas
├── plugins/
│   ├── wagate.ts               # Dual WhatsApp client plugin
│   └── logger.ts               # Winston logger plugin
├── helper/
│   ├── organic.ts              # Warm-up message generator
│   ├── carrier.ts              # Dest-carrier detection + Rupiah parsing
│   ├── constant.ts             # Status codes, WA versions
│   ├── error.ts                # Custom error classes
│   ├── logger.ts               # Winston config (JSON for pm2)
│   ├── success.ts              # Success response helper
│   └── util.ts                 # Phone validation, delay
└── lib/
    ├── wwebjs.ts               # WagateClient class
    └── sms-queue.ts            # SQLite-backed outbound SMS queue
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

### Examples

Health check:

```bash
curl http://localhost:3000/api/v1/ \
  -H "x-api-key: $SECRET_KEY"
```

Send text:

```bash
curl -X POST http://localhost:3000/api/v1/send/ \
  -H "x-api-key: $SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number":"628xxxxxxxxxx","content":"Hello from wagate"}'
```

Send media (with caption):

```bash
curl -X POST http://localhost:3000/api/v1/send/media \
  -H "Authorization: Bearer $SECRET_KEY" \
  -F "number=628xxxxxxxxxx" \
  -F "content=Invoice attached" \
  -F "file=@./invoice.pdf"
```

### `POST` /api/v1/sms/send

Queue an SMS for delivery via the paired phone. Authenticated with `SECRET_KEY` like the messaging routes. Body (`application/json`):

| Field   | Type   | Required | Description                     |
| ------- | ------ | -------- | ------------------------------- |
| number  | string | ✅       | Phone number (e.g. `628xxx...`) |
| content | string | ✅       | Message text                    |

Returns the queued job, including its `id` and `status: "pending"`.

### `GET` /api/v1/sms/balance

Last SIM balance reported by the phone (secret key). Returns:

```json
{ "status": "success", "code": 200,
  "data": { "balance": "Rp25.000", "raw": "Pulsa Anda Rp25.000 ...",
            "carrier": "Telkomsel", "checked_at": 1779589427912, "stale": false } }
```

`balance` is `null` until the phone has reported once; `stale` is `true` when the last check is older than 24h (or never happened). `raw` is the full USSD response, kept so an unparsed carrier is still usable.

### `POST` /api/v1/sms/balance/refresh

Flag a fresh balance check (secret key). The phone picks it up on its next poll (`balanceRequested: true`), runs the USSD code, and reports back. No body.

### Device endpoints (phone only)

Authenticated with `SMS_DEVICE_KEY` (header `x-device-key` or `Authorization: Bearer`), **not** `SECRET_KEY`. The paired phone is the only caller.

| Method | Path                          | Purpose                                          |
| ------ | ----------------------------- | ------------------------------------------------ |
| `GET`  | `/api/v1/sms/device/poll`     | Pull pending jobs; also returns `balanceRequested` |
| `POST` | `/api/v1/sms/device/ack`      | Report a job as `sent` or `failed`               |
| `POST` | `/api/v1/sms/device/balance`  | Report the USSD balance result                   |

- `ack` body: `{ "id": "<job-id>", "status": "sent" | "failed", "error"?: "...", "reason"?: "..." }`. `reason: "insufficient_balance"` trips the circuit breaker (see below).
- `balance` body: `{ "raw": "<full USSD text>", "balance"?: "Rp25.000", "carrier"?: "Telkomsel" }`. Reporting clears any pending refresh.

### `GET` /api/v1/sms/status

Whether sending is paused by the breaker (secret key) → `{ data: { paused, reason, paused_at } }`.

### `POST` /api/v1/sms/resume

Clear the breaker and release held jobs back to `pending` after a top-up (secret key) → `{ data: { released: <count> } }`. No body.

### `GET` /api/v1/sms/forecast

Predict remaining capacity from the estimated balance (secret key). Optional `?number=628...` checks one destination:

```json
{ "data": {
    "known": true, "estimated_balance": 1000,
    "carriers": [ { "carrier": "xl", "rate": 300, "capacity": 3 }, ... ],
    "target": { "number": "628171234567", "carrier": "xl", "rate": 300, "affordable": true } } }
```

`capacity` / `affordable` are `null` until a balance has been reported (`known: false`).

### `GET` /api/v1/sms/tariff · `POST` /api/v1/sms/tariff

List or upsert per-destination-carrier rates (secret key). POST body: `{ "carrier": "xl", "rate": 300 }` (Rupiah).

---

## SMS via Paired Phone

The SMS channel inverts the WhatsApp model: instead of the gateway reaching out, a phone you control **pulls** work from the gateway and sends it through its SIM. The phone makes outbound calls only, so it works behind home/office NAT with no inbound exposure.

**Flow:** `POST /sms/send` enqueues a job → the phone polls `/sms/device/poll` (claims it) → sends the SMS → reports back via `/sms/device/ack`. Jobs persist in `logs/sms-queue.sqlite`, so they survive restarts. A claimed job left unacknowledged for 60s is automatically requeued (covers a phone that died mid-send).

### Prerequisites

- An Android phone with a SIM that has SMS allowance.
- **Termux** and **Termux:API** installed (F-Droid or Play Store).
- Phone and gateway reachable over the network — same Wi-Fi in dev (use the machine's LAN IP, not `localhost`); HTTPS over the internet in production.

### Phone setup (one-time)

In Termux:

```bash
pkg install termux-api jq curl -y
```

Grant Termux:API the SMS permission (Android Settings → Apps → Termux:API → Permissions → SMS), then confirm the SIM sends from the CLI:

```bash
termux-sms-send -n +628123456789 "direct termux test"
```

### The bridge loop

Run this in Termux — it polls the gateway, sends each job through the SIM, and acks the result:

```bash
SERVER=http://192.168.1.50:3000        # gateway LAN IP / public URL
DEVKEY=<your SMS_DEVICE_KEY>

while true; do
  curl -s "$SERVER/api/v1/sms/device/poll" -H "x-device-key: $DEVKEY" \
    | jq -c '.data[]' | while read -r job; do
      id=$(jq -r .id <<<"$job")
      num=$(jq -r .number <<<"$job")
      msg=$(jq -r .content <<<"$job")
      if termux-sms-send -n "+$num" "$msg"; then st=sent; err=""; else st=failed; err="send failed"; fi
      curl -s -X POST "$SERVER/api/v1/sms/device/ack" -H "x-device-key: $DEVKEY" \
        -H 'content-type: application/json' \
        -d "$(jq -nc --arg id "$id" --arg st "$st" --arg e "$err" '{id:$id,status:$st,error:$e}')"
      echo "sent $id → +$num [$st]"
    done
  sleep 3
done
```

`number` is stored digits-only, so the loop prepends `+` — make sure the value passed to `/sms/send` is the full international form for your SIM.

### Send a real SMS

From any client:

```bash
curl -X POST http://localhost:3000/api/v1/sms/send \
  -H "x-api-key: $SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"number":"628xxxxxxxxxx","content":"Hello via SMS"}'
```

Within ~3s the phone polls, sends, and acks. Inspect the queue anytime:

```bash
sqlite3 logs/sms-queue.sqlite 'SELECT id, number, status FROM sms_jobs;'
```

### Checking SIM balance (USSD)

Balance lives with the carrier and is read via a USSD code (`*888#` etc.). **Termux can't capture USSD replies** — `TelephonyManager.sendUssdRequest()` (Android API 26+) can, so balance requires a small companion app, not the Termux bridge. The planned phone side is a single app that both sends SMS (`SmsManager`) and runs USSD balance (`sendUssdRequest`), replacing the Termux loop.

The app detects the carrier from `getSimOperator()` (MCC `510` = Indonesia) and dials the matching code — so it works across carriers and survives a SIM swap:

| Carrier | MNC (`510xx`) | Balance USSD |
| --------- | --------- | --------- |
| Telkomsel | `10`      | `*888#`   |
| Indosat   | `01` / `21` | `*888#` |
| XL        | `11`      | `*808#`   |
| Axis      | `08`      | `*808#`   |
| Tri       | `89`      | `*111#`   |
| Smartfren | `09` / `28` | `*999#` |

(`*123#` is retired for XL/Indosat per Kominfo PM No. 5/2021, which moved customer-service USSD to the `*8XY#` format.)

The first USSD response normally leads with the balance, so the app extracts the first Rupiah amount (`Rp\s?[\d.,]+`) and always reports the **raw** text too, so a carrier whose amount doesn't parse is still readable.

**Gateway-side contract** (the app implements this; the endpoints exist and are tested):

```
GET  /api/v1/sms/balance          → client reads last { balance, raw, carrier, checked_at, stale }
POST /api/v1/sms/balance/refresh  → client flags a fresh check
GET  /api/v1/sms/device/poll      → app sees "balanceRequested": true
POST /api/v1/sms/device/balance   → app reports { raw, balance?, carrier? }
```

End-to-end: client `POST /balance/refresh` → app sees the flag on its next poll → dials the USSD code → parses → `POST /device/balance` → client `GET /balance` shows the fresh value.

### Handling insufficient balance

Carriers rarely return a clean error for low balance — the send call often succeeds while the message is silently dropped, and the carrier replies with an SMS ("pulsa tidak cukup"). So the **app** is responsible for detecting the real outcome — via the `SmsManager` delivery report (no report within a timeout = failed) and/or watching the inbox for the carrier's rejection SMS — and acking with `reason: "insufficient_balance"`.

When the gateway sees that reason it trips a **circuit breaker** so the queue doesn't drain into a SIM that can't send:

1. The job is moved to `held` (not lost, not retried).
2. Sending is **paused** — `/device/poll` returns no jobs while paused (a balance re-check is still requested).
3. `balanceRequested` flips to `true` so the app re-reads the balance.

After topping up, the operator calls `POST /api/v1/sms/resume`, which clears the breaker and releases every `held` job back to `pending` for delivery. Check the state anytime with `GET /api/v1/sms/status`.

### Cost tracking & balance prediction

The gateway estimates cost per message so it can hold a send *before* it fails, instead of only reacting after:

1. **Destination carrier** is detected from the number prefix (`62812…`→Telkomsel, `62817…`→XL, …).
2. Its **tariff** (Rupiah, from the `sms_tariff` table — seeded with placeholders, edit via `POST /sms/tariff`) is recorded as the job's `cost`.
3. **Estimated balance** = last USSD-reported balance − cost of every send since that report (in-flight `dispatched` jobs included). This resets to ground truth on each balance check.
4. At dispatch, jobs are sent FIFO while the estimate affords each one. The first that doesn't fit is `held` with reason `predicted_insufficient_balance`, sending pauses, and a confirming USSD check is requested — same recovery path as a real failure (`POST /sms/resume` after top-up).

**Accuracy caveats — treat this as a heuristic, not a guarantee:**

- **Number portability (MNP):** a ported number bills at a different carrier's rate than its prefix implies.
- Real tariffs vary by package/promo/bonus, and balance also drops from data and subscriptions. So the estimate drifts between USSD checks — the authoritative signals remain the actual balance and the real send result.

**Concurrency:** the dispatch claim (requeue stale → check budget → mark dispatched / hold) runs in a single SQLite transaction, so two simultaneous polls can't claim the same job or both spend the same balance. Counting in-flight `dispatched` cost (not just `sent`) is what prevents a second poll from over-committing before the first batch is acked.

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

# Generate and set the keys (run once per key)
bun run generate-key   # → SECRET_KEY
bun run generate-key   # → SMS_DEVICE_KEY (only needed if using the SMS channel)
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
# Edit .env: set SECRET_KEY, SMS_DEVICE_KEY, WA1_NUMBER, WA2_NUMBER

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
