# Architecture: Local + Real Multiplayer

## Status

Architecture is implemented and active for both local and networked play.

- `local` mode uses in-browser orchestration
- `networked` mode uses a WebSocket server as authority
- both modes share the same core game logic modules

## Core Layers

### 1) Pure game logic: `src/game-logic/`

- `types.ts`
- `helpers.ts`
- `validation.ts`
- `ai.ts`
- `scoring.ts`
- `deck.ts`
- `flow.ts`

These modules are deterministic and reusable by both client and server.

### 2) Client orchestration: `src/hooks/`

- `useLocalGame.ts`: local state flow
- `useNetworkedGame.ts`: client/server sync flow
- `useGame.ts`: mode switch abstraction

### 3) Transport + protocol

- `src/network/messages.ts`: typed message protocol
- `src/network/game-client.ts`: browser WebSocket connector
- `server/game-server.ts`: authoritative server runtime

### 4) UI shell

- `src/App.tsx`: lobby, table, actions, and seat perspective mapping

## Multiplayer Model

- Up to 4 real players per room, one per seat index 0..3.
- Server validates all actions and broadcasts state updates.
- AI turns only run for seats that are currently unoccupied.
- Lobby exposes seat occupancy via protocol so clients can hide occupied seats before joining.

## Runtime Flow

1. Client connects and sends `join-room`.
2. Server validates room + seat ownership and returns `game-state-update`.
3. Player actions are sent via `player-action`.
4. Server executes shared flow functions and broadcasts updated game state.
5. Clients re-render from server state.

## Testing Strategy

- `npm run test:singleplayer`: deterministic simulation for gameplay quality.
- `npm run test:multiplayer`: integration smoke test for room join, seat conflict rejection, and state broadcast.
- `npm test`: full CI-style gate (`tsc`, build, single-player test, multiplayer test).

See `MULTIPLAYER.md` for operational and test details.
