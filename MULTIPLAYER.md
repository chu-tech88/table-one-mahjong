# Multiplayer Server Implementation Guide

## Overview

The server has been fully scaffolded with:
- ✅ WebSocket server (`server/game-server.ts`)
- ✅ Client connector (`src/network/game-client.ts`)
- ✅ Message protocol (`src/network/messages.ts`)
- ✅ Networked game hook (`src/hooks/useNetworkedGame.ts`)
- ✅ Dependencies in `package.json`

## Running the Server

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Server (Terminal 1)
```bash
npm run dev:server
```

Output:
```
🎮 Mahjong Game Server
📡 Listening on ws://localhost:8080
[Connected] New client connected
[Room] Created room test-game
[Room] Player 0 joined room test-game
```

### 3. Start Client (Terminal 2)
```bash
npm run dev
```

Navigate to `http://localhost:5173`

## Switching Between Local and Multiplayer

### Local Mode (Current Default)
Edit `src/App-new.tsx`:
```typescript
const gameHook = useGame({ mode: "local" });
```

### Multiplayer Mode
```typescript
const gameHook = useGame({ 
  mode: "networked",
  serverUrl: "ws://localhost:8080",
  roomId: "my-game-room",
  playerIndex: 0  // 0 = human, 1-3 = AI
});
```

## Code Flow: From Click to Server

```
USER CLICKS "Discard D5"
    ↓
App.tsx: selectTile("D5-xyz")
    ↓
useGame (local or networked)
    ↓
useNetworkedGame:
  → client.discard("D5-xyz")
    ↓
GameClient:
  → validates locally (UI feedback)
  → ws.send({ type: "player-action", action: { type: "discard", tileId } })
    ↓
Server (game-server.ts):
  → Validate: Is it player's turn?
  → Validate: Is tile in hand?
  → Execute: discardTile(game, playerIndex, tileId, rules, houseRules)
  → Broadcast: { type: "game-state-update", game }
    ↓
All Clients receive update
  → setGame(newGame)
  → Re-render UI
```

## Server Architecture

### Main Loop

```typescript
// 1. Player connects
socket.on("connection")
  → initialize player slot

// 2. Player joins room
msg.type === "join-room"
  → create room if needed
  → store player socket
  → send current game state

// 3. Player acts
msg.type === "player-action"
  → validate move
  → execute: discardTile() / applyClaim() / startTurn()
  → broadcast new state
  → trigger AI if needed

// 4. Player disconnects
socket.on("close")
  → mark slot as null
  → broadcast disconnect message
  → clean up room if empty
```

### Data Structure

```typescript
const rooms = new Map<string, GameRoom>();

type GameRoom = {
  game: Game;              // Current game state (from game-logic/)
  players: (WebSocket | null)[];  // 4 players
  created: number;         // Timestamp
  autoPlayAI: Map<number, NodeJS.Timeout>;  // AI turn timers
};
```

### Game Execution

```typescript
// Server uses same game-logic functions as client
import { discardTile, applyClaim, startTurn } from "../src/game-logic/flow";
import { chooseDiscard } from "../src/game-logic/ai";
import { scoreRound } from "../src/game-logic/scoring";

// Validate and execute move
const nextGame = discardTile(
  room.game,           // current state
  playerIndex,         // who moved
  tileId,              // what tile
  RULES,               // game rules
  HOUSE_RULES          // house rules
);

// Update room
room.game = nextGame;

// Broadcast to all 4 players
room.players.forEach(player => {
  player.send(JSON.stringify({
    type: "game-state-update",
    game: nextGame
  }));
});
```

## Client-Side Architecture

### GameClient Class

```typescript
// src/network/game-client.ts

class GameClient {
  connect(serverUrl, roomId, playerIndex)
    ↓ WebSocket open → join-room message

  sendAction(action: PlayerAction)
    ↓ { type: "player-action", playerIndex, action }

  handleServerMessage(msg: ServerMessage)
    ↓ Update local game state
    ↓ Trigger callbacks

  canPlayerDiscard()
    ↓ Check: phase === "discard" && turn === playerIndex

  discard(tileId)
    ↓ Validate UI only
    ↓ Send to server
}
```

### useNetworkedGame Hook

```typescript
// src/hooks/useNetworkedGame.ts

export function useNetworkedGame(
  serverUrl: string,
  roomId: string,
  playerIndex: number
) {
  const [game, setGame] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const clientRef = useRef(new GameClient({
    onGameStateUpdate: (newGame) => setGame(newGame),
    onActionRejected: (reason) => setError(reason),
  }));

  useEffect(() => {
    clientRef.current.connect(serverUrl, roomId, playerIndex);
  }, [serverUrl, roomId, playerIndex]);

  return {
    game,
    isConnected,
    discard: (tileId) => clientRef.current.discard(tileId),
    claim: (type, tiles) => clientRef.current.claim(type, tiles),
    pass: () => clientRef.current.pass(),
  };
}
```

## Testing the Implementation

### Test 1: Single Player + Server AI

1. Start server: `npm run dev:server`
2. Start client: `npm run dev`
3. Player 0 (human) makes moves
4. Players 1-3 auto-play (watch logs)

### Test 2: Two Browsers

**Terminal 1:**
```bash
npm run dev:server
```

**Terminal 2:**
```bash
npm run dev
```

**Browser 1:** `http://localhost:5173`
- Player 0 (human) - can click/claim

**Browser 2:** `http://localhost:5173?player=1`
- Would need URL param support
- Currently still shows player 0
- Both see same game state in real-time

### Test 3: WebSocket Inspector

1. Open DevTools → Network → WS
2. Filter: `localhost:8080`
3. Right-click connection → Show frame data
4. Watch messages flow back and forth

## Debugging

### Server Logs

```bash
npm run dev:server

# Output:
[Connected] New client connected
[Room] Created room my-game-room
[Room] Player 0 joined room my-game-room
[Action] Player 0 discards 5 Dot
[AI] Playing turn for Player 1
[Error] Player 1 not connected, skipping
[Stats] Active rooms: 1, Players: 2
```

### Client Errors

Browser console → check for:
- Connection errors: `Failed to connect: ...`
- Action rejected: `Server rejected action: Not your turn`
- State sync issues: `Request fresh state`

### Network Tab

Chrome DevTools → Network → WS:
- See real-time messages
- Check message size
- Verify bidirectional communication

## Next: Integrating with App

To use multiplayer in your app:

```typescript
// src/App-new.tsx

function MahjongApp() {
  // Change this line to use multiplayer:
  const gameHook = useGame({ 
    mode: "networked",
    serverUrl: "ws://localhost:8080",
    roomId: "my-game",
    playerIndex: 0
  });

  const { game, discard, claim, pass } = gameHook;

  // Rest of code unchanged!
  // The hook abstraction means UI doesn't care about local vs networked
}
```

## Files Added/Modified

```
NEW:
  server/game-server.ts           ← WebSocket server
  server/README.md                ← Server docs
  src/network/messages.ts         ← Message protocol
  src/network/game-client.ts      ← Client connector
  server/.gitignore               ← Ignore node_modules

MODIFIED:
  src/hooks/useNetworkedGame.ts   ← Now fully implemented
  package.json                    ← Added ws, tsx, @types/*
  src/App-new.tsx                 ← Ready to use useGame()

UNCHANGED:
  src/game-logic/*                ← Shared logic (both use)
  src/hooks/useLocalGame.ts       ← Still works for solo
  src/App.tsx                      ← Old version, still works
```

## Performance Considerations

### Network Usage
- Full game state (~5KB) sent after every move
- With 4 players, ~20KB/second during active play
- Acceptable for LAN, good for internet

### Latency
- Server adds ~50-100ms on local network
- With network delay, total ~200-300ms perceived
- 1.5s AI delay masks most latency

### Optimization Ideas (Future)
- Delta updates instead of full state
- Compression (gzip)
- Message batching
- Client-side caching

## Security (Future)

For production:
- ✅ Server validates ALL moves (current)
- ❌ No authentication yet
- ❌ No rate limiting
- ❌ No SSL/TLS (use `wss://` in production)

Add:
```typescript
// Rate limiting
if (lastActionTime > now - 500ms) reject;

// Authentication
if (!user.canPlayInRoom) reject;

// SSL/TLS
const wss = new WebSocket.Server({ 
  server: httpsServer  // use HTTPS
});
```

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Room not found" | Server restarted | Reconnect to new room |
| "Not your turn" | Network lag | Wait for state update |
| "Tile not in hand" | Out of sync | `client.requestState()` |
| Connection drops | Firewall | Check port 8080 |
| AI doesn't move | Not in discard phase | Wait for your turn |
| State not updating | Message not sent | Check DevTools network |

## Next Steps

1. **Add authentication** - User login/passwords
2. **Add persistence** - Database for game history
3. **Add matchmaking** - Auto-pair players
4. **Add spectating** - Watch games in progress
5. **Add replay** - Save/load game recordings

All of these are build on top of the existing architecture.
