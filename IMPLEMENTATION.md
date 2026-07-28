# Implementation Notes

## Summary

The codebase now supports full real-time multiplayer with up to 4 real players,
with server-authoritative rules and seat ownership.

## Implemented Components

### Server

- `server/game-server.ts`
  - room lifecycle and seat ownership
  - authoritative action validation and execution
  - `request-state` ownership safeguards
  - seat availability endpoint via `request-room-seats`
  - `room-seats-update` response for lobby UI

### Network client and protocol

- `src/network/messages.ts`
  - join/action/state message types
  - lobby seat-availability message types

- `src/network/game-client.ts`
  - connection lifecycle and action sending
  - server message handling and rejection handling

### React hooks and app integration

- `src/hooks/useGame.ts`: local/networked mode switch
- `src/hooks/useNetworkedGame.ts`: active network sync and actions
- `src/hooks/useLocalGame.ts`: local solo fallback
- `src/App.tsx`: lobby join flow, seat filtering, and perspective labels

## 4 Real Players

Multiplayer behavior now supports all-human rooms:

1. Any of the four seats can be claimed by a real client.
2. Seat conflicts are rejected by the server.
3. Occupied seats are hidden in the lobby seat selector before join.
4. AI turns execute only for seats without connected human players.

## Validation and Tests

### Full verification

```bash
npm test
```

This runs:

1. `tsc --noEmit`
2. production build
3. `npm run test:singleplayer`
4. `npm run test:multiplayer`

### Multiplayer smoke test

```bash
npm run test:multiplayer
```

`tests/multiplayer-smoke.mjs` verifies:

1. server boots on a random test port
2. two clients can join one room on distinct seats
3. duplicate seat join is rejected
4. a discard from one client is broadcast to all joined clients

## Deployment notes

- server port: `PORT` (fallback `WS_PORT`, then `8080`)
- client server URL: `VITE_WS_URL`
- production transport: use `wss://`
