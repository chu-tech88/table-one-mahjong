# Mahjong Multiplayer Server

Single-process server for real-time Mahjong multiplayer rooms.

It serves:

- static client files from `dist/`
- WebSocket multiplayer traffic

Both run on the same port.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start server:

```bash
npm run dev:server
```

3. Start client in another terminal:

```bash
npm run dev
```

4. Open the client URL on up to 4 browsers/devices and join the same room.

## What the Server Handles

- room creation and cleanup
- seat ownership (0..3)
- action validation and execution
- authoritative game state broadcasting
- disconnection handling
- 30-second reconnect grace period with AI takeover
- server-owned next-hand readiness, score carryover, and dealer rotation
- AI turns only for seats without a connected human

## Lobby Seat Availability

Before a player joins, the client can request seat occupancy for a room:

- client sends: `request-room-seats`
- server responds: `room-seats-update` with `occupiedSeats`

This lets the lobby prevent joins when a room is full. On join, the server
randomly selects an open seat and responds with `room-joined`.

## Message Overview

Client to server:

- `join-room`
- `player-action`
- `request-state`
- `request-room-seats`

Server to client:

- `room-joined`
- `game-state-update`
- `action-rejected`
- `player-disconnected`
- `room-seats-update`

## Environment

- Server port precedence: `PORT` -> `WS_PORT` -> `8080`

For Render, `PORT` is provided automatically.

Examples:

```bash
PORT=8080 npm run dev:server
WS_PORT=8090 npm run dev:server
```

## Tests

Run all checks:

```bash
npm test
```

Run multiplayer smoke test only:

```bash
npm run test:multiplayer
```

The smoke test validates join flow, seat conflict rejection, and cross-client state broadcast.

## Notes

- Maximum seats per room: 4
- Server is authoritative; clients should treat local checks as UI hints only
- Use `wss://` for hosted production environments

## Render single-service setup

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```
