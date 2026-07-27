# 🎮 Mahjong Game Server

WebSocket-based server for multiplayer Mahjong games.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Server

```bash
npm run dev:server
```

Output:
```
🎮 Mahjong Game Server
📡 Listening on ws://localhost:8080
```

### 3. Run Client (in another terminal)

```bash
npm run dev
```

Then open `http://localhost:5173` in your browser.

## Architecture

### Server Responsibilities
- **Game State Authority** - Holds the single source of truth
- **Move Validation** - Ensures all moves are legal before executing
- **Game Execution** - Runs `game-logic/` functions to update state
- **AI Control** - Auto-plays moves for AI players (indices 1-3)
- **Broadcasting** - Sends updated state to all connected players

### Client Responsibilities
- **Rendering** - Shows UI based on game state
- **User Input** - Captures human player actions
- **Local Validation** - Pre-validates moves for UI feedback (not authoritative)
- **Optimistic Updates** - Can show move immediately, reverts if rejected

### Game Flow

```
┌─────────────────────────────────────────┐
│  Client (Player 0 - Human)              │
│  • Sees game state                      │
│  • Clicks "Discard D5"                  │
│  • Sends: { type: "player-action", action: { type: "discard", tileId: "D5-xyz" } }
└──────────────────┬──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  Server                                 │
│  • Validates: Is it player 0's turn?   │
│  • Validates: Is D5 in their hand?      │
│  • Executes: discardTile(0, "D5-xyz")   │
│  • Updates: game.players[0].hand        │
│  • Broadcasts: { game }                 │
└──────────────┬──────────────────────────┘
               │
     ┌─────────┴──────────┬──────────┬──────────┐
     ▼                    ▼          ▼          ▼
  Player 0           Player 1     Player 2   Player 3
  (Human)           (AI)         (AI)        (AI)
  Receives update   Receives     Receives    Receives
  • UI shows D5     update       update      update
  • Shows claims    • AI auto-   • Renders  • Renders
    available       plays in     state      state
                    1.5s
```

## Network Messages

### Client → Server

```typescript
// Join a game room
{ 
  type: "join-room",
  roomId: "game-123",
  playerIndex: 0
}

// Perform an action
{
  type: "player-action",
  playerIndex: 0,
  action: {
    type: "discard",
    tileId: "D5-0-xyz123"
  }
}

// Also supports: claim (chi/pong/kong) and pass
{ action: { type: "claim", claimType: "pong", tiles: [...] } }
{ action: { type: "pass" } }

// Request fresh state (for sync)
{ type: "request-state" }
```

### Server → Client

```typescript
// Game state update (after every move)
{
  type: "game-state-update",
  game: { /* full Game object */ }
}

// Move was rejected
{
  type: "action-rejected",
  reason: "Not your turn"
}

// Another player disconnected
{
  type: "player-disconnected",
  playerIndex: 1
}

// System message
{
  type: "system",
  message: "Server restarting in 5 minutes"
}
```

## Testing

### Start Server
```bash
npm run dev:server
```

### Start Client (New Terminal)
```bash
npm run dev
```

### Open 4 Browser Windows

1. **Player 0** (Human): `http://localhost:5173`
   - Can click tiles, claim, etc.

2. **Player 1-3** (AI): `http://localhost:5173`
   - Auto-plays moves
   - Visible for testing

### In Browser Console (To Simulate Player Manually)

```javascript
// Connect to server
const ws = new WebSocket("ws://localhost:8080");
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: "join-room",
    roomId: "test-game",
    playerIndex: 1
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log("Received:", msg);
};

// Send a discard
ws.send(JSON.stringify({
  type: "player-action",
  playerIndex: 1,
  action: { type: "discard", tileId: "D5-0-xyz123" }
}));
```

## Configuration

Edit `server/game-server.ts`:

```typescript
const RULES: Rules = {
  baseWin: 5,
};

const HOUSE_RULES: HouseRule[] = [];
```

## Environment Variables

```bash
# Server port (default 8080)
PORT=8080

# Enable logging
DEBUG=game:*
```

## Debugging

### Server Logs

```
[Connected] New client connected
[Room] Created room game-123
[Room] Player 0 joined room game-123
[Action] Player 0 discards 5 Dot
[AI] Playing turn for Player 1
[Stats] Active rooms: 1, Players: 3
[Disconnected] Player 2 left room game-123
```

### Client Connection

Check browser DevTools → Network → WS:
- See all WebSocket frames
- Verify messages are being sent/received
- Check for connection drops

## Multiplayer Limitations

- **Max 4 players per game** (Mahjong rules)
- **One human per room** (Player 0)
- **AI handles indices 1-3** automatically

## Common Issues

### "Room not found"
- Server restarted, room data lost
- Need to create new room
- Solution: Reconnect

### "Not your turn"
- Player tried to act when not their turn
- Another player just moved
- Expect game state update soon

### "Tile not in hand"
- Tried to discard a tile you don't have
- Can happen with bad sync
- Request fresh state: `{ type: "request-state" }`

### Connection Drops
- Check browser console for errors
- Check server logs
- Verify `ws://localhost:8080` is reachable
- Firewall may be blocking port 8080

## Next Steps

1. **Persistence** - Save games to database
2. **Authentication** - User accounts, login
3. **Matchmaking** - Auto-pair players
4. **Spectating** - Watch games in progress
5. **Ratings** - Track win/loss, ELO
6. **Replays** - Store and replay games

## Files

- `server/game-server.ts` - Main server
- `src/network/game-client.ts` - Client connector
- `src/network/messages.ts` - Message types
- `src/game-logic/*` - Shared game logic
- `src/hooks/useNetworkedGame.ts` - React hook
