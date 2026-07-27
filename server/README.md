# Mahjong Multiplayer Server

WebSocket server for real-time Mahjong multiplayer rooms.

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
- AI turns only for seats without a connected human

## Lobby Seat Availability

Before a player joins, the client can request seat occupancy for a room:

- client sends: `request-room-seats`
- server responds: `room-seats-update` with `occupiedSeats`

This supports the UI behavior that hides seats already taken.

## Message Overview

Client to server:

- `join-room`
- `player-action`
- `request-state`
- `request-room-seats`

Server to client:

- `game-state-update`
- `action-rejected`
- `player-disconnected`
- `room-seats-update`

## Environment

- Server port precedence: `PORT` -> `WS_PORT` -> `8080`

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
