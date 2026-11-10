# Gather — room bookings

A simple room-booking application. Choose a room and date, view its bookings,
and book a meeting.

## Quick start

Requires Node.js 22.12+ and npm.

```sh
npm ci
npm test
```

Start the backend in one terminal:

```sh
npm run back
```

Start the frontend in another terminal, from the same directory:

```sh
npm run front
```

Open **http://127.0.0.1:5173**. Vite serves React with hot reload and forwards
`/api` requests to the Express backend on port **3000**. Node restarts the backend
when its source files change. Tests only need `npm test`, not running servers.

Bookings live in memory and reset when the server restarts. The three rooms
are seeded automatically; no database, cloud resources, or credentials are
needed. All times are **UTC**.

Both servers listen on `127.0.0.1` by default. This demo has no authentication
and must not be exposed as a public service. To change the backend port, use
`PORT=3001 npm run back` and update the proxy target in `vite.config.js`.

## Architecture

```text
Browser → Vite (:5173) → /api proxy → Express (:3000) → booking rules → in-memory store
```

| Location | Responsibility |
| --- | --- |
| `ui/` | React room picker, schedule, booking form, and Tailwind styles. |
| `src/server.js` | Express API routes, JSON parsing, and error responses. |
| `src/bookings.js` | Input validation and booking rules. |
| `src/store.js` | Three seeded rooms and in-memory bookings. |
| `test/` | Business-rule and HTTP API tests using Node's test runner. |
| `dist/` | Generated frontend build; not committed. |

The frontend calls relative `/api` URLs through Vite's proxy, so no CORS setup
is needed. The backend does not serve frontend files or run Vite.

`npm run build` produces the frontend files in `dist/`. Production hosting is
not configured; Vite is used as a development server.

## API

| Request | Result |
| --- | --- |
| `GET /api/rooms` | `200`: array of rooms (`id`, `name`, `capacity`, `location`, `description`). |
| `GET /api/bookings?roomId=cedar&date=2030-06-12` | `200`: array of bookings touching that UTC date, sorted by start time. Both filters are required. |
| `POST /api/bookings` | `201`: the created booking, including its generated `id`. |

Example creation:

```sh
curl http://localhost:3000/api/bookings \
  -H 'Content-Type: application/json' \
  -d '{
    "roomId": "cedar",
    "title": "Product brainstorm",
    "organizer": "Alex Morgan",
    "startTime": "2030-06-12T09:00:00Z",
    "endTime": "2030-06-12T10:00:00Z"
  }'
```

The response preserves those fields, trims the title and organizer, adds a
UUID `id`, and normalizes timestamps to UTC with milliseconds
(`2030-06-12T09:00:00.000Z`). Unknown input fields are ignored.

- Rooms: `cedar` (4 people), `maple` (8), `aspen` (12).
- Title and organizer: 1–100 characters after trimming.
- Timestamps: valid ISO 8601 UTC strings ending in `Z`, with seconds and
  optional three-digit milliseconds. End must be after start.
- Multi-day bookings are supported by the API and appear on each affected date.
  The browser form creates bookings within its selected day.
- Validation errors and malformed JSON return `400`; wrong content type returns
  `415`; bodies larger than 16 KiB return `413`.
- Errors have the shape `{"error":"Helpful message"}`. Unknown routes return
  `404`; unsupported methods return `405`.
