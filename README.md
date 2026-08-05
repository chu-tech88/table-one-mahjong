# Table One Mahjong

This is the email-safe, standalone edition of Table One Mahjong.

It now supports:

- local single-device play
- real multiplayer with up to 4 human players (one per seat)
- server-authoritative turn and action validation
- automated single-player simulation and multiplayer smoke testing

It does not contain:

- account or authentication code
- hosting credentials or project identifiers
- database code or migrations
- server or worker code
- environment files
- generated dependencies or build output

## Run the game

Install Node.js 20.19 or newer, then run:

```bash
npm install
npm run dev
```

Open the local address printed in the terminal.

## Run multiplayer (4 real players)

Start the WebSocket game server:

```bash
npm run dev:server
```

In another terminal, start the web client:

```bash
npm run dev
```

Open the client URL in up to 4 browser windows/devices.

1. Enter the same room ID in each client.
2. The server randomly assigns each player an open seat.
3. When all seats are taken, join is disabled.

For remote hosting, set a client WebSocket URL:

```bash
VITE_WS_URL=wss://your-server.example.com npm run dev
```

## Deploy on Render (single process)

This project can run on Render free tier as one process that serves both:

- the built client from `dist/`
- the WebSocket game server on the same port

Recommended Render settings:

1. Build command:

```bash
npm install && npm run build
```

2. Start command:

```bash
npm start
```

Notes:

- The server reads Render `PORT` automatically.
- Client uses same-origin WebSocket by default (`ws://` or `wss://` based on page protocol).
- You can still override with `VITE_WS_URL` when needed.

## Trello bug-report configuration

The bug-report flow can create a Trello card and attach the JSON replay payload. To use it locally, set these environment variables before starting the server:

```bash
export TRELLO_API_KEY="your-trello-api-key"
export TRELLO_TOKEN="your-trello-token"
export TRELLO_LIST_ID="your-trello-list-id"
```

To make them available for every terminal session, you can add them to your shell profile, for example:

```bash
printf '\nexport TRELLO_API_KEY="your-trello-api-key"\nexport TRELLO_TOKEN="your-trello-token"\nexport TRELLO_LIST_ID="your-trello-list-id"\n' >> ~/.bashrc
```

Then restart the server:

```bash
npm run dev:server
```

How to get each value:

- TRELLO_API_KEY: from https://trello.com/app-key
- TRELLO_TOKEN: generated from the Trello authorization URL using your API key
- TRELLO_LIST_ID: the ID of the Trello list that should receive new bug-report cards

Keep these values private and do not commit them to the repository.

## Verify the game

```bash
npm test
```

This runs:

- TypeScript checks and production build
- `test:singleplayer` (100-game deterministic simulation)
- `test:multiplayer` (WebSocket smoke test)

Run test suites individually:

```bash
npm run test:singleplayer
npm run test:25-human-games
npm run test:multiplayer
```

The multiplayer smoke test starts a temporary server, verifies automatic seat
assignment and seat conflicts, performs a discard, and confirms that state
updates broadcast to all joined clients.

## Upload to GitHub

Upload this entire folder. Do not add `node_modules`, `dist`, or `.env` files.
