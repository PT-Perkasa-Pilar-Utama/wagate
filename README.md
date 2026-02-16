# WA-GATE

A simple, type-safe WhatsApp gateway REST API built with **Elysia** and **Bun** runtime, powered by [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js).

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+
- Google Chrome (for Puppeteer/whatsapp-web.js)

### Configuration

1. Clone this repository
2. Copy `.env.example` to `.env` and update the values
3. Replace `logo.jpg` in the root directory with your own (used as WhatsApp profile picture in production)

### Installation

```bash
bun install
```

### Development

```bash
bun run dev
```

Scan the QR code printed in the terminal with your WhatsApp app, and you're ready to go.

## Project Structure

```
src/
├── index.ts                    # Server entry, global hooks
├── modules/
│   └── messaging/
│       ├── index.ts            # Routes (controller)
│       ├── service.ts          # Business logic
│       └── model.ts            # TypeBox validation schemas
├── plugins/
│   ├── wagate.ts               # WhatsApp client plugin
│   └── logger.ts               # Winston logger plugin
└── helper/
    ├── constant.ts             # Status codes, WA versions
    ├── error.ts                # Custom error classes
    ├── success.ts              # Success response helper
    └── util.ts                 # Phone validation, delay
```

## Endpoints

### `GET` /api/v1/

Health check.

```json
{ "message": "REST API is working" }
```

### `POST` /api/v1/send/

Send a text message. Body (`multipart/form-data` or `application/json`):

| Field   | Type   | Required | Description       |
| ------- | ------ | -------- | ----------------- |
| number  | string | ✅       | Phone number (e.g. `628xxx...`) |
| content | string | ✅       | Message text      |

```json
{
  "status": "success",
  "code": 200,
  "message": "Message sucessfully sent",
  "data": { "number": "628XXX...", "content": "Hi, mom!", "type": "text" }
}
```

### `POST` /api/v1/send/media

Send a media file with optional caption. Body (`multipart/form-data`):

| Field   | Type   | Required | Description       |
| ------- | ------ | -------- | ----------------- |
| number  | string | ✅       | Phone number (e.g. `628xxx...`) |
| content | string | ❌       | Caption           |
| file    | file   | ✅       | Media file        |

```json
{
  "status": "success",
  "code": 200,
  "message": "Message sucessfully sent",
  "data": { "number": "628XXX...", "content": "caption", "type": "media" }
}
```

### Error Response

```json
{ "status": "error", "code": 400, "message": "Phone number is not valid! Format: 62..." }
```

| Code | Status                |
| ---- | --------------------- |
| 200  | Success               |
| 400  | Bad Request           |
| 422  | Validation Error      |
| 500  | Internal Server Error |

## Debugging

1. Delete `.wwebjs_auth` folder
2. Delete `node_modules` and `bun.lock`
3. Logout linked devices on your WhatsApp
4. Run `bun install` again

## License

MIT