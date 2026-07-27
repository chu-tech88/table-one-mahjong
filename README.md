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
2. Each player picks an open seat.
3. Occupied seats are hidden in the lobby seat picker.
4. When all seats are taken, join is disabled.

For remote hosting, set a client WebSocket URL:

```bash
VITE_WS_URL=wss://your-server.example.com npm run dev
```

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
npm run test:multiplayer
```

The multiplayer smoke test starts a temporary server, connects multiple clients,
joins seats in one room, rejects a conflicting seat claim, performs a discard,
and verifies that state updates broadcast to all joined clients.

## Upload to GitHub

Upload this entire folder. Do not add `node_modules`, `dist`, or `.env` files.
