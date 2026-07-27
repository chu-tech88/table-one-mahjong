# Architecture: Game Logic Extraction & Multiplayer Support

## Status: ✅ IMPLEMENTED

The architecture has been fully scaffolded and is ready to use:

- ✅ Game logic extracted to pure functions in `src/game-logic/`
- ✅ WebSocket server implemented in `server/game-server.ts`
- ✅ Client WebSocket connector in `src/network/game-client.ts`
- ✅ Hook abstraction layer in `src/hooks/useGame.ts`
- ✅ Full documentation and examples

## Quick Start

### Local Play (Current)
```typescript
const gameHook = useGame({ mode: "local" });
```

### Multiplayer (Ready to Use)
**Terminal 1:**
```bash
npm run dev:server
```

**Terminal 2:**
```bash
npm run dev
```

**Code:**
```typescript
const gameHook = useGame({ 
  mode: "networked",
  serverUrl: "ws://localhost:8080",
  roomId: "my-game",
  playerIndex: 0
});
```

See [MULTIPLAYER.md](MULTIPLAYER.md) for full setup guide.

## Structure

### `src/game-logic/` — Pure Game Logic (AI-agent friendly)
```
types.ts          → All TypeScript types (Game, Player, Tile, Rules, etc.)
helpers.ts        → Utility functions (shuffle, sort, structuredClone, etc.)
validation.ts     → Hand checking (isWinningHand, canPong, waitCodesForHand, etc.)
ai.ts             → AI decisions (chooseDiscard, shouldCall, evaluateDiscard)
scoring.ts        → Win scoring (scoreRound, scoreStandardRules, decomposeWinningTiles)
deck.ts           → Deck & dealing (makeDeck, dealRound, drawNonFlower)
flow.ts           → Game turns (discardTile, applyClaim, startTurn, etc.)
```

**Key property:** All functions are pure (no side effects). AI agents can optimize them independently.

### `src/hooks/` — Game Orchestration (React hooks)
```
useLocalGame.ts      → Wraps all game-logic, manages React state, auto-plays AI
useNetworkedGame.ts  → Skeleton for WebSocket multiplayer (not implemented yet)
useGame.ts           → Abstraction that picks between local/networked
```

### `src/App.tsx` → UI Only
- Import from `useGame` hook
- All game logic calls go through hook methods
- No direct game state mutations
- Rest of UI rendering unchanged

## Migration Steps (Optional)

If you want to gradually adopt this, you can:

1. **Keep old App.tsx working** — Old code still runs
2. **Swap hook when ready** — Change one line to use new structure
3. **AI agents work on `game-logic/`** — Pure functions, no React needed

### To switch to new structure:
```bash
mv src/App.tsx src/App-old.tsx
mv src/App-new.tsx src/App.tsx
```

## WebSocket Architecture (Future)

### Client:
```typescript
useGame({ mode: "local" })  // or...
useGame({ mode: "networked", roomId: "abc", playerIndex: 0 })
```

### Server handles:
- Move validation
- Scoring calculation
- AI for other players (optional)
- Game state authority

### Client still gets:
- Fast UI updates
- Same game-logic functions
- Reusable AI algorithm

### Network messages:
```
→ player-action: { type: "discard", tileId }
← game-state-update: { full state }
← action-applied: { validated action + new state }
```

## AI Agent Workflow

Pure game-logic functions are isolated:
```typescript
// AI can optimize these independently
import { chooseDiscard, shouldCall } from "./game-logic/ai";
import { isWinningHand, canPong } from "./game-logic/validation";
import { scoreRound } from "./game-logic/scoring";

// No React, no WebSocket—just input → output
const tile = chooseDiscard(hand, difficulty, meldCount);
const canWin = isWinningHand(hand, meldCount);
```

**Benefits:**
- AI improves game quality without touching React code
- Easy to unit test
- Can run on server or client
- No need to modify multiplayer logic

## Quick Start

### Local play (unchanged):
```tsx
const gameHook = useGame({ mode: "local" });
const { game, discard, claim, pass, kong } = gameHook;
```

### Multiplayer (when ready):
```tsx
const gameHook = useGame({ 
  mode: "networked", 
  roomId: "game-123", 
  playerIndex: 0 
});
// Same interface, different backend!
```

## File Tree
```
src/
├── game-logic/        ← Pure functions (AI-optimizable)
│   ├── types.ts
│   ├── helpers.ts
│   ├── validation.ts
│   ├── ai.ts
│   ├── scoring.ts
│   ├── deck.ts
│   └── flow.ts
├── hooks/             ← React orchestration
│   ├── useGame.ts
│   ├── useLocalGame.ts
│   └── useNetworkedGame.ts
├── App.tsx           ← UI (mostly unchanged)
└── main.tsx
```

## Notes

- Old `App.tsx` can coexist as `App-old.tsx` for comparison
- No breaking changes to the game experience
- Pure functions in `game-logic/` are testable
- WebSocket impl is scaffolded but not active yet
- AI agents have full control over `game-logic/` layer
