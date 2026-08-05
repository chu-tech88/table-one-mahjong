# Multiplayer Guide

## Current Status

Multiplayer is fully active and supports up to 4 real human players in the same room.

- server-authoritative game state and validation
- one client connection per occupied seat
- random server-authoritative seat assignment
- saved-seat reconnection and seat conflict rejection
- pre-join lobby seat availability API
- full-room protection in the lobby

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm run dev:server
```

3. Start the client in another terminal:

```bash
npm run dev
```

4. Open the app in up to 4 browser tabs/windows/devices and join the same room.

## Join Flow

1. Enter a room ID.
2. Join the room; the server randomly assigns an available seat.
3. A saved session requests its previous seat when reconnecting.
4. The lobby refreshes occupancy and prevents joining a full room.

If all 4 seats are occupied, join is disabled until a seat is freed.

## Message Protocol

Key multiplayer messages:

- `join-room`
- `room-joined`
- `player-action`
- `request-state`
- `request-room-seats`
- `game-state-update`
- `action-rejected`
- `room-seats-update`
- `player-disconnected`

The lobby uses `request-room-seats` / `room-seats-update` before joining to detect a full room. The server confirms the assigned seat with `room-joined`.

## Real 4-Player Behavior

- Any of seats 0, 1, 2, 3 can be human-controlled.
- AI auto-play only runs for unoccupied seats.
- Turn logic and claim flow are seat-aware across all players.
- Player perspective labels are normalized per client (only your own seat is shown as "You").

## Test Coverage

### Full test run

```bash
npm test
```

### Multiplayer-only smoke test

```bash
npm run test:multiplayer
```

The multiplayer smoke test (`tests/multiplayer-smoke.mjs`) validates:

1. Server startup on an ephemeral test port.
2. Two clients joining the same room on different seats.
3. Seat conflict rejection when a third client tries to claim an occupied seat.
4. Discard action broadcast and state synchronization across joined clients.

Success output includes:

- `ok: true`
- generated test room ID
- server URL
- final action sequence number

## Production Notes

- server reads `PORT` (with fallback to `WS_PORT` / `8080`)
- set client `VITE_WS_URL` to your deployed WebSocket URL
- use `wss://` in hosted environments
