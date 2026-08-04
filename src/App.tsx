// Import game logic and types
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Game,
  HouseRule,
  Difficulty,
  Tile,
  Meld,
  Player,
  Activity,
} from "./game-logic/types";
import {
  nextDealerForRound,
  structuredCloneGame,
  tableNarration,
  sortTiles,
  kongLabel,
} from "./game-logic/helpers";
import {
  isWinningHand,
  concealedKongOptions,
  addedKongOptions,
  waitingSupportTileIds,
  possibleChiOptions,
  canExposedKong,
  waitCodesForHand,
} from "./game-logic/validation";
import { canDeclareReady } from "./game-logic/flow";
import { useGame } from "./hooks/useGame";
import oneBambooBird from "./assets/one-bamboo-bird.png";

// Component rendering stays exactly the same
const DEFAULT_SERVER_URL =
  import.meta.env.VITE_WS_URL ||
  (import.meta.env.DEV && typeof window !== "undefined"
    ? `ws://${window.location.hostname}:8080`
    : typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
      : "ws://localhost:8080");

const difficulties: Record<Difficulty, string> = {
  calm: "Calm",
  balanced: "Balanced",
  sharp: "Sharp",
};

const characterRanks = [
  "",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
];
const windCharacters: Record<string, string> = {
  W1: "東",
  W2: "南",
  W3: "西",
  W4: "北",
};
const dragonCharacters: Record<string, string> = {
  G1: "中",
  G2: "發",
  G3: "白",
};
const flowerCharacters: Record<string, string> = {
  F1: "梅",
  F2: "蘭",
  F3: "菊",
  F4: "竹",
  F5: "春",
  F6: "夏",
  F7: "秋",
  F8: "冬",
};

function TileFace({ tile }: { tile: Tile }) {
  if (tile.suit === "dots") {
    return (
      <span
        className={`tile-face dot-face dot-${tile.rank}`}
        aria-hidden="true"
      >
        {Array.from({ length: tile.rank }, (_, index) => (
          <i className="dot-pip" key={index} />
        ))}
      </span>
    );
  }

  if (tile.suit === "bamboo") {
    if (tile.rank === 1) {
      return (
        <span className="tile-face bamboo-bird-face" aria-hidden="true">
          <img src={oneBambooBird} alt="" />
        </span>
      );
    }
    return (
      <span
        className={`tile-face bamboo-face bamboo-${tile.rank}`}
        aria-hidden="true"
      >
        {Array.from({ length: tile.rank }, (_, index) => (
          <i className="bamboo-stick" key={index}>
            <b />
          </i>
        ))}
      </span>
    );
  }

  if (tile.suit === "characters") {
    return (
      <span className="tile-face character-face" aria-hidden="true">
        <b>{characterRanks[tile.rank]}</b>
        <em>萬</em>
      </span>
    );
  }

  if (tile.suit === "winds") {
    return (
      <span className="tile-face honor-face wind-face" aria-hidden="true">
        {windCharacters[tile.code] ?? tile.short}
      </span>
    );
  }

  if (tile.suit === "dragons") {
    return (
      <span
        className={`tile-face honor-face dragon-face dragon-${tile.rank}`}
        aria-hidden="true"
      >
        {dragonCharacters[tile.code] ?? tile.short}
      </span>
    );
  }

  if (tile.suit === "flowers") {
    return (
      <span className="tile-face flower-face" aria-hidden="true">
        <b>{flowerCharacters[tile.code] ?? tile.short}</b>
        <em>{tile.rank}</em>
      </span>
    );
  }

  return (
    <span className="tile-face honor-face" aria-hidden="true">
      {tile.short}
    </span>
  );
}

function TileView({
  tile,
  hidden,
  selected,
  drawn,
  waiting,
  large,
  disabled,
  onMouseDown,
  onClick,
  onDoubleClick,
}: {
  tile?: Tile;
  hidden?: boolean;
  selected?: boolean;
  drawn?: boolean;
  waiting?: boolean;
  large?: boolean;
  disabled?: boolean;
  onMouseDown?: () => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
}) {
  if (hidden || !tile) {
    return (
      <div
        className={`tile tile-back ${large ? "large" : ""}`}
        aria-label="Hidden tile"
      />
    );
  }
  return (
    <button
      className={`tile ${tile.suit} ${selected ? "selected" : ""} ${drawn ? "drawn" : ""} ${waiting ? "waiting" : ""} ${large ? "large" : ""}`}
      aria-label={`${tile.label}${drawn ? ", newly drawn" : ""}${waiting ? ", part of a waiting set" : ""}`}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={tile.label}
      type="button"
    >
      <TileFace tile={tile} />
      {drawn ? <span className="drawn-badge">New</span> : null}
    </button>
  );
}

function formatChiOption(tiles: Tile[]) {
  return tiles.map((tile) => tile.short).join(" · ");
}

function MeldView({ meld }: { meld: Meld }) {
  const meldName =
    meld.type === "kong"
      ? "Gong"
      : meld.type.charAt(0).toUpperCase() + meld.type.slice(1);
  return (
    <div
      className="meld"
      title={`${meld.concealed ? "Concealed " : ""}${meldName}`}
    >
      <span>{meld.concealed ? "Silent Gong" : meldName.toUpperCase()}</span>
      <div>
        {meld.tiles.map((tile) => (
          <TileView
            key={tile.id}
            tile={tile}
            hidden={meld.concealed}
            disabled
          />
        ))}
      </div>
    </div>
  );
}

function DiscardRiver({ player }: { player: Player }) {
  const discards = [...player.discards].reverse();
  return (
    <div className="discard-river" aria-label={`${player.name} discard pile`}>
      {discards.map((tile) => (
        <TileView key={tile.id} tile={tile} disabled />
      ))}
    </div>
  );
}

function TableDiscardGrid({
  players,
  selfIndex,
  onInspect,
}: {
  players: Player[];
  selfIndex: number;
  onInspect: (index: number) => void;
}) {
  return (
    <div className="table-discard-grid" aria-label="Center discard area">
      {players.map((player, index) => {
        const relativeSeat = (index - selfIndex + 4) % 4;
        const isSelf = index === selfIndex;
        if (relativeSeat === 1 || relativeSeat === 3) return null;
        return (
          <section
            className={`table-discard-lane discard-lane-${relativeSeat}`}
            key={`${player.name}-${index}`}
          >
            <div className="opponent-table-zone opponent-discard-zone">
              <button
                className="opponent-zone-header"
                type="button"
                onClick={() => onInspect(index)}
              >
                <span>
                  {isSelf ? "Your discards" : `${player.wind} discards`}
                </span>
                <small>{player.discards.length}</small>
              </button>
              <DiscardRiver player={player} />
            </div>
            {!isSelf ? (
              <div
                className="opponent-table-zone opponent-revealed-zone"
                aria-label={`${player.name} revealed tiles`}
              >
                <button
                  className="opponent-zone-header"
                  type="button"
                  onClick={() => onInspect(index)}
                >
                  <span>Revealed</span>
                  <small>{player.flowers.length + player.melds.length}</small>
                </button>
                {player.flowers.length > 0 || player.melds.length > 0 ? (
                  <SeatSets flowers={player.flowers} melds={player.melds} />
                ) : (
                  <span className="opponent-zone-empty">No open tiles</span>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function SeatSets({
  flowers,
  melds,
  actions,
}: {
  flowers: Tile[];
  melds: Meld[];
  actions?: ReactNode;
}) {
  return (
    <div className="seat-sets-row">
      {actions ? <div className="seat-actions-slot">{actions}</div> : null}
      {flowers.length > 0 ? (
        <div className="flower-row">
          {flowers.map((tile) => (
            <TileView key={tile.id} tile={tile} disabled />
          ))}
        </div>
      ) : null}
      <div className="meld-row">
        {melds.map((meld, index) => (
          <MeldView key={`${meld.type}-${index}`} meld={meld} />
        ))}
      </div>
    </div>
  );
}

function Opponent({
  player,
  active,
  dealer,
  dealerStreak,
  ready,
  reveal,
  position,
  onInspect,
}: {
  player: Player;
  active: boolean;
  dealer: boolean;
  dealerStreak: number;
  ready: boolean;
  reveal: boolean;
  position: "left" | "top" | "right";
  onInspect: () => void;
}) {
  const isSideSeat = position === "left" || position === "right";
  const revealedCount = player.flowers.length + player.melds.length;
  return (
    <section
      className={`opponent opponent-${position} ${active ? "active" : ""} ${dealer ? "dealer-seat" : ""}`}
    >
      <button className="seat-heading" type="button" onClick={onInspect}>
        <strong>{player.name}</strong>
        <div className="seat-badges">
          {dealer ? (
            <span className="dealer-badge">
              Dealer{dealerStreak > 0 ? ` +${dealerStreak * 2}` : ""}
            </span>
          ) : null}
          {ready ? <span className="ready-badge">Ready</span> : null}
          <span className="identity-badge">
            {player.controller === "human" ? "Human" : "AI"}
          </span>
          {isSideSeat ? (
            <span className="score-badge">{player.score} pts</span>
          ) : null}
          <span>{player.wind}</span>
        </div>
      </button>
      <div className="seat-meta">
        <span>{difficulties[player.difficulty]}</span>
        <span>{player.score} pts</span>
      </div>
      {isSideSeat ? (
        <div className="side-opponent-stack">
          <div className="opponent-table-zone opponent-discard-zone">
            <button
              className="opponent-zone-header"
              type="button"
              onClick={onInspect}
            >
              <span>Discards</span>
              <small>{player.discards.length}</small>
            </button>
            <DiscardRiver player={player} />
          </div>
          <div
            className="opponent-table-zone opponent-revealed-zone"
            aria-label={`${player.name} revealed tiles`}
          >
            <button
              className="opponent-zone-header"
              type="button"
              onClick={onInspect}
            >
              <span>Revealed</span>
              <small>{revealedCount}</small>
            </button>
            {revealedCount > 0 ? (
              <SeatSets flowers={player.flowers} melds={player.melds} />
            ) : (
              <span className="opponent-zone-empty">No open tiles</span>
            )}
          </div>
        </div>
      ) : null}
      {reveal ? (
        <div
          className="compact-hand revealed-hand"
          aria-label={`${player.name} revealed winning hand`}
        >
          {player.hand
            .slice(0, Math.min(player.hand.length, 18))
            .map((tile) => (
              <TileView key={tile.id} tile={tile} disabled />
            ))}
        </div>
      ) : null}
    </section>
  );
}

function PlayerInspector({
  player,
  isSelf,
  dealer,
  ready,
  reveal,
  onClose,
}: {
  player: Player;
  isSelf: boolean;
  dealer: boolean;
  ready: boolean;
  reveal: boolean;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="player-inspector"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-inspector-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="eyebrow">{player.wind} seat</p>
            <h2 id="player-inspector-title">
              {player.name}
              {isSelf ? " (You)" : ""}
            </h2>
          </div>
          <button
            className="inspector-close"
            type="button"
            aria-label="Close player details"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="inspector-summary">
          <strong>{player.score} pts</strong>
          <span>
            {player.controller === "human"
              ? "Human"
              : `AI · ${difficulties[player.difficulty]}`}
          </span>
          {dealer ? <span className="dealer-badge">Dealer</span> : null}
          {ready ? <span className="ready-badge">Ready</span> : null}
        </div>
        <section className="inspector-section">
          <div className="inspector-section-heading">
            <h3>Discards</h3>
            <span>{player.discards.length}</span>
          </div>
          <div className="inspector-tile-row">
            {player.discards.length > 0 ? (
              player.discards.map((tile) => (
                <TileView key={tile.id} tile={tile} disabled />
              ))
            ) : (
              <p>None yet</p>
            )}
          </div>
        </section>
        <section className="inspector-section">
          <div className="inspector-section-heading">
            <h3>Flowers and declared sets</h3>
            <span>
              {player.flowers.length} flowers · {player.melds.length} sets
            </span>
          </div>
          <SeatSets flowers={player.flowers} melds={player.melds} />
        </section>
        <section className="inspector-section">
          <div className="inspector-section-heading">
            <h3>{isSelf || reveal ? "Hand" : "Concealed hand"}</h3>
            <span>{player.hand.length} tiles</span>
          </div>
          <div className="inspector-tile-row inspector-hand-row">
            {player.hand.map((tile) => (
              <TileView
                key={tile.id}
                tile={tile}
                hidden={!isSelf && !reveal}
                disabled
              />
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function createSoloRoomId() {
  return `solo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

type SavedSession = {
  playMode: "solo" | "online";
  roomId: string;
  playerIndex: number;
  playerName: string;
  savedAt: number;
};

const ACTIVE_SESSION_KEY = "table-one-mahjong-active-session-v2";

function parseSavedSession(raw: string | null) {
  if (!raw) return undefined;
  const saved = JSON.parse(raw) as Partial<SavedSession> | null;
  if (
    !saved?.roomId ||
    !saved.playerName ||
    !Number.isInteger(saved.playerIndex) ||
    !saved.savedAt ||
    Date.now() - saved.savedAt > 24 * 60 * 60 * 1000
  ) {
    return undefined;
  }
  return {
    playMode: saved.playMode === "online" ? "online" : "solo",
    roomId: saved.roomId,
    playerIndex: saved.playerIndex,
    playerName: saved.playerName,
    savedAt: saved.savedAt,
  } as SavedSession;
}

function loadActiveSession() {
  if (typeof window === "undefined") return undefined;
  try {
    // sessionStorage is tab-scoped, so different tabs do not auto-join one another's lobbies.
    return parseSavedSession(window.sessionStorage.getItem(ACTIVE_SESSION_KEY));
  } catch {
    return undefined;
  }
}

function MahjongApp() {
  const restoredActiveSession = useMemo(loadActiveSession, []);
  const [playMode, setPlayMode] = useState<"solo" | "online">(
    restoredActiveSession?.playMode ?? "solo",
  );
  const [connection, setConnection] = useState(() => ({
    roomId: restoredActiveSession?.roomId ?? createSoloRoomId(),
    playerIndex: restoredActiveSession?.playerIndex ?? 0,
    playerName: restoredActiveSession?.playerName ?? "",
    joined: Boolean(restoredActiveSession),
  }));
  const [occupiedSeats, setOccupiedSeats] = useState<number[]>([]);
  const [lobbySeatError, setLobbySeatError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!connection.joined) {
      window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }
    const snapshot: SavedSession = {
      playMode,
      roomId: connection.roomId,
      playerIndex: connection.playerIndex,
      playerName: connection.playerName,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(snapshot));
  }, [connection, playMode]);

  const gameHook = useGame({
    mode: "networked",
    serverUrl: DEFAULT_SERVER_URL,
    roomId: connection.roomId,
    playerIndex: connection.playerIndex,
    playerName: connection.playerName.trim() || "Player",
    enabled: connection.joined,
  });
  const {
    game,
    selectedTileId,
    rules,
    houseRules,
    setRules,
    setHouseRules,
    selectTile,
    discard,
    claim,
    pass,
    hu,
    kong,
    declareReady,
    addHouseRule,
    removeHouseRule,
    updateHouseRule,
    updatePlayerName,
    updateDifficulty,
    newHand,
    readyNextHand,
  } = gameHook;
  const SELF = connection.playerIndex;
  const leftSeat = (SELF + 1) % 4;
  const topSeat = (SELF + 2) % 4;
  const rightSeat = (SELF + 3) % 4;
  const seatName = (index: number) => {
    if (index === SELF) return "You";
    const player = game?.players[index];
    if (!player) return "";
    const raw = player.name?.trim();
    if (!raw || raw.toLowerCase() === "you") return player.wind;
    return raw;
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectedSeat, setInspectedSeat] = useState<number | undefined>();
  const [choosingChi, setChoosingChi] = useState(false);
  const [choosingKong, setChoosingKong] = useState(false);
  const [selectedKongCode, setSelectedKongCode] = useState<
    string | undefined
  >();
  const [uiSelectedTileId, setUiSelectedTileId] = useState<string | undefined>(
    undefined,
  );
  const human = game?.players[SELF];
  const effectiveSelectedTileId =
    uiSelectedTileId ?? selectedTileId ?? game?.selectedId;
  const concealedHumanKongs = human ? concealedKongOptions(human.hand) : [];
  const addedHumanKongs = human ? addedKongOptions(human) : [];
  const humanKongs = [...new Set([...concealedHumanKongs, ...addedHumanKongs])];
  const activeHumanKong =
    humanKongs.find((code) => code === selectedKongCode) ?? humanKongs[0];
  const activeKongIsAdded =
    !!activeHumanKong && addedHumanKongs.includes(activeHumanKong);
  const humanDeclaredReady = game?.declaredReady?.includes(SELF) ?? false;
  const canDeclareSelected =
    !!game &&
    !!effectiveSelectedTileId &&
    canDeclareReady(game, SELF, effectiveSelectedTileId);
  const canDiscardSelected =
    !!effectiveSelectedTileId &&
    (!humanDeclaredReady ||
      human?.discards.length === 0 ||
      effectiveSelectedTileId === game?.drawnTileId);
  const canSelfHu =
    !!game &&
    !!human &&
    game.phase === "discard" &&
    game.turn === SELF &&
    isWinningHand(human.hand, human.melds.length);
  const waitingTileIds = useMemo(
    () =>
      human
        ? waitingSupportTileIds(human.hand, human.melds.length)
        : new Set<string>(),
    [human],
  );
  const humanChiOptions = useMemo(() => {
    if (
      !game ||
      !human ||
      game.phase !== "claim" ||
      !game.pendingClaim?.canChi ||
      !game.pendingClaim.tile
    )
      return [];
    if (game.pendingClaim.claimer !== SELF) return [];
    return possibleChiOptions(human.hand, game.pendingClaim.tile);
  }, [game, human, SELF]);

  useEffect(() => {
    setChoosingChi(false);
  }, [game?.phase, game?.pendingClaim?.tile.id]);

  useEffect(() => {
    if (
      game?.phase !== "discard" ||
      game.turn !== SELF ||
      humanKongs.length === 0
    ) {
      setChoosingKong(false);
      setSelectedKongCode(undefined);
    }
  }, [game?.phase, game?.turn, SELF, humanKongs.join("|")]);

  useEffect(() => {
    if (!game || !human) {
      setUiSelectedTileId(undefined);
      return;
    }
    const isDiscardTurn = game.turn === SELF && game.phase === "discard";
    if (!isDiscardTurn) {
      setUiSelectedTileId(undefined);
      return;
    }
    if (
      uiSelectedTileId &&
      !human.hand.some((tile) => tile.id === uiSelectedTileId)
    ) {
      setUiSelectedTileId(undefined);
    }
  }, [game?.turn, game?.phase, human, uiSelectedTileId]);

  const nextDealer = game ? nextDealerForRound(game) : SELF;
  const dealerStatus = game
    ? game.dealer === SELF
      ? `You are Dealer${game.dealerStreak > 0 ? ` · String +${game.dealerStreak * 2}` : ""}`
      : `${seatName(game.dealer)} deals${game.dealerStreak > 0 ? ` · String +${game.dealerStreak * 2}` : ""}`
    : "Waiting for server";
  const winningPlayer =
    game?.winSummary?.winner === undefined
      ? undefined
      : game.players[game.winSummary.winner];
  const humanIsWaiting =
    !!game &&
    !!human &&
    game.phase === "discard" &&
    game.turn !== SELF &&
    waitCodesForHand(human.hand, human.melds.length).length > 0;
  const activity: Activity = game?.activity ?? {
    player: game?.turn ?? SELF,
    text: game?.message ?? "Loading game...",
  };
  const currentPhase = game?.phase;
  const currentTurn = game?.turn;
  const currentClaimer = game?.pendingClaim?.claimer;
  const isSelfDiscardTurn = currentPhase === "discard" && currentTurn === SELF;
  const isSelfClaimTurn = currentPhase === "claim" && currentClaimer === SELF;
  const activityIsTurnCall = /is taking a turn\.?$/i.test(activity.text);
  const activityIndicatesSelfAction =
    activity.player === SELF &&
    /(choose a discard|is taking a turn|your turn)/i.test(activity.text);
  const showYourTurnInCenter =
    isSelfDiscardTurn || isSelfClaimTurn || activityIndicatesSelfAction;
  const activityText = isSelfDiscardTurn
    ? "Your turn"
    : isSelfClaimTurn
      ? "Your turn - choose an action"
      : activityIsTurnCall && activity.player === SELF
        ? "Your turn"
        : playMode === "online" &&
            currentPhase === "claim" &&
            currentClaimer !== undefined
          ? `${seatName(currentClaimer)} is waiting to discard.`
          : activity.text;
  const centerStatusLabel =
    !activity.tile && showYourTurnInCenter
      ? "Your turn"
      : activity.tile
        ? `${seatName(activity.player)}'s discard`
        : "Table activity";
  const ruleRows = useMemo(() => [["Base win", "baseWin"]] as const, []);

  const [houseDraft, setHouseDraft] = useState({
    name: "",
    description: "",
    points: 1,
  });

  useEffect(() => {
    if (connection.joined) return;

    const ws = new WebSocket(DEFAULT_SERVER_URL);
    let pollTimer: number | undefined;

    const requestSeats = () => {
      if (ws.readyState !== 1) return;
      ws.send(
        JSON.stringify({
          type: "request-room-seats",
          roomId: connection.roomId,
        }),
      );
    };

    ws.onopen = () => {
      setLobbySeatError(null);
      requestSeats();
      pollTimer = window.setInterval(requestSeats, 2000);
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const msg = JSON.parse(event.data) as {
          type?: string;
          roomId?: string;
          occupiedSeats?: number[];
        };
        if (
          msg.type === "room-seats-update" &&
          msg.roomId === connection.roomId &&
          Array.isArray(msg.occupiedSeats)
        ) {
          const uniqueSorted = [
            ...new Set(
              msg.occupiedSeats.filter((seat) => seat >= 0 && seat <= 3),
            ),
          ].sort((a, b) => a - b);
          setOccupiedSeats(uniqueSorted);
        }
      } catch {
        // Ignore malformed payloads.
      }
    };

    ws.onerror = () => {
      setLobbySeatError("Could not check seat availability.");
    };

    return () => {
      window.clearInterval(pollTimer);
      if (ws.readyState === 0 || ws.readyState === 1) ws.close();
    };
  }, [connection.joined, connection.roomId]);

  useEffect(() => {
    if (connection.joined) return;
    if (!occupiedSeats.includes(connection.playerIndex)) return;
    const firstOpenSeat = [0, 1, 2, 3].find(
      (seat) => !occupiedSeats.includes(seat),
    );
    if (firstOpenSeat !== undefined) {
      setConnection((current) => ({ ...current, playerIndex: firstOpenSeat }));
    }
  }, [connection.joined, connection.playerIndex, occupiedSeats]);

  const seatOptions = [
    { value: 0, label: "East (seat 0)" },
    { value: 1, label: "South (seat 1)" },
    { value: 2, label: "West (seat 2)" },
    { value: 3, label: "North (seat 3)" },
  ].filter((option) => !occupiedSeats.includes(option.value));

  const leaveCurrentGame = () => {
    setSettingsOpen(false);
    setInspectedSeat(undefined);
    setChoosingChi(false);
    setChoosingKong(false);
    setSelectedKongCode(undefined);
    setUiSelectedTileId(undefined);
    setConnection((current) => ({ ...current, joined: false }));
  };

  if (!connection.joined) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <h1>Table One Mahjong</h1>
          <div className="round-status">
            <span>Multiplayer</span>
            <strong>Choose room and seat</strong>
          </div>
        </header>
        <section className="game-layout lobby-layout">
          <div className="panel-block settings-section join-panel">
            <h2>Join table</h2>
            <div className="play-mode-control" aria-label="Game mode">
              <button
                className={playMode === "solo" ? "active" : ""}
                type="button"
                onClick={() => {
                  setPlayMode("solo");
                  setConnection((current) => ({
                    ...current,
                    roomId: createSoloRoomId(),
                    playerIndex: 0,
                  }));
                }}
              >
                Solo vs AI
              </button>
              <button
                className={playMode === "online" ? "active" : ""}
                type="button"
                onClick={() => {
                  setPlayMode("online");
                  setConnection((current) => ({
                    ...current,
                    roomId: "table-one",
                  }));
                }}
              >
                Shared room
              </button>
            </div>
            <div className="join-fields">
              <label>
                <span>Your name</span>
                <input
                  autoComplete="nickname"
                  maxLength={18}
                  placeholder="Enter your name"
                  type="text"
                  value={connection.playerName}
                  onChange={(event) =>
                    setConnection((current) => ({
                      ...current,
                      playerName: event.target.value,
                    }))
                  }
                />
              </label>
              {playMode === "online" ? (
                <>
                  <label>
                    <span>Room ID</span>
                    <input
                      type="text"
                      value={connection.roomId}
                      onChange={(event) =>
                        setConnection((current) => ({
                          ...current,
                          roomId:
                            event.target.value.replace(/\s+/g, "-") ||
                            "table-one",
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Seat</span>
                    <select
                      value={connection.playerIndex}
                      onChange={(event) =>
                        setConnection((current) => ({
                          ...current,
                          playerIndex: Number(event.target.value),
                        }))
                      }
                      disabled={seatOptions.length === 0}
                    >
                      {seatOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <div className="solo-table-summary">
                  <span>Your seat</span>
                  <strong>East · 3 AI opponents</strong>
                </div>
              )}
            </div>
            {lobbySeatError ? (
              <p style={{ fontSize: "0.9rem", color: "#a33" }}>
                {lobbySeatError}
              </p>
            ) : null}
            {seatOptions.length === 0 ? (
              <p style={{ fontSize: "0.9rem", color: "#666" }}>
                All seats in this room are currently occupied.
              </p>
            ) : null}
            <button
              className="full-width-button"
              type="button"
              disabled={
                (playMode === "online" && seatOptions.length === 0) ||
                !connection.playerName.trim()
              }
              onClick={() =>
                setConnection((current) => ({ ...current, joined: true }))
              }
            >
              {playMode === "solo" ? "Start game" : "Join room"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  // Guard for networked mode (game may be null while connecting)
  if (!game || !human) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <h1>Table One Mahjong</h1>
          <div className="round-status">
            <span>Connecting...</span>
            <strong>
              {gameHook.isConnected ? "Connected" : "Waiting for server"}
            </strong>
          </div>
        </header>
        <section className="game-layout">
          <div style={{ textAlign: "center", padding: "2rem" }}>
            {gameHook.error ? (
              <>
                <p>Error: {gameHook.error}</p>
                <p style={{ fontSize: "0.9rem", color: "#666" }}>
                  Is the server running on {DEFAULT_SERVER_URL}?
                </p>
                <button
                  className="secondary-button"
                  style={{ marginTop: "1rem", maxWidth: "240px" }}
                  type="button"
                  onClick={leaveCurrentGame}
                >
                  Leave game
                </button>
              </>
            ) : (
              <p>Loading game...</p>
            )}
          </div>
        </section>
      </main>
    );
  }

  const claimActions =
    game.phase === "claim" && game.pendingClaim?.claimer === SELF ? (
      <>
        {!game.pendingClaim?.canHu && game.pendingClaim?.canPong ? (
          <button
            onClick={() => {
              setChoosingChi(false);
              claim("pong");
            }}
            type="button"
          >
            Pong
          </button>
        ) : null}
        {!game.pendingClaim?.canHu && game.pendingClaim?.canChi ? (
          <button
            onClick={() => {
              if (humanChiOptions.length > 1) {
                setChoosingChi(true);
              } else if (humanChiOptions[0]) {
                setChoosingChi(false);
                claim("chi", humanChiOptions[0]);
              }
            }}
            type="button"
          >
            Chi
          </button>
        ) : null}
        {game.pendingClaim?.canHu ? (
          <button
            onClick={() => {
              setChoosingChi(false);
              hu("discard");
            }}
            type="button"
          >
            Hu
          </button>
        ) : null}
        {!game.pendingClaim?.canHu && game.pendingClaim?.canKong ? (
          <button
            onClick={() => {
              setChoosingChi(false);
              claim("kong");
            }}
            type="button"
          >
            Gong
          </button>
        ) : null}
        <button
          className="secondary-action"
          onClick={() => {
            setChoosingChi(false);
            pass();
          }}
          type="button"
        >
          Pass
        </button>
      </>
    ) : null;

  const defaultActions =
    game.phase !== "claim" ? (
      <>
        <button disabled type="button">
          Pong
        </button>
        <button disabled type="button">
          Chi
        </button>
        <button
          className="secondary-action"
          disabled={
            game.turn !== SELF ||
            game.phase !== "discard" ||
            !canDiscardSelected
          }
          onClick={() => {
            if (!effectiveSelectedTileId) return;
            discard(effectiveSelectedTileId);
            setUiSelectedTileId(undefined);
          }}
          type="button"
        >
          Discard
        </button>
        {canSelfHu ? (
          <button
            onClick={() => {
              hu("self-draw");
            }}
            type="button"
          >
            Hu
          </button>
        ) : null}
        {game.turn === SELF &&
        humanKongs.length > 0 &&
        game.phase === "discard" ? (
          <button
            onClick={() => {
              if (!activeHumanKong) return;
              setSelectedKongCode(activeHumanKong);
              setChoosingKong(true);
            }}
            type="button"
          >
            Gong
          </button>
        ) : null}
        {canDeclareSelected ? (
          <button
            type="button"
            onClick={() => {
              if (!effectiveSelectedTileId) return;
              declareReady(effectiveSelectedTileId);
              setUiSelectedTileId(undefined);
            }}
          >
            Declare Ready
          </button>
        ) : null}
      </>
    ) : null;

  const actionControls = game.phase === "claim" ? claimActions : defaultActions;

  const kongChoiceControls =
    choosingKong &&
    game.phase === "discard" &&
    game.turn === SELF &&
    activeHumanKong ? (
      <div className="kong-choice-panel" aria-label="Choose Gong type">
        {humanKongs.length > 1 ? (
          <select
            aria-label="Tile to use for Gong"
            value={activeHumanKong}
            onChange={(event) => setSelectedKongCode(event.target.value)}
          >
            {humanKongs.map((code) => (
              <option key={code} value={code}>
                {kongLabel(code)}
              </option>
            ))}
          </select>
        ) : (
          <span>{kongLabel(activeHumanKong)}</span>
        )}
        {activeKongIsAdded ? (
          <button
            type="button"
            onClick={() => {
              kong(activeHumanKong, false);
              setChoosingKong(false);
            }}
          >
            Add to Pong
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                kong(activeHumanKong, true);
                setChoosingKong(false);
              }}
            >
              Silent Gong
            </button>
            <button
              type="button"
              onClick={() => {
                kong(activeHumanKong, false);
                setChoosingKong(false);
              }}
            >
              Reveal Gong
            </button>
          </>
        )}
        <button
          className="secondary-action"
          type="button"
          onClick={() => setChoosingKong(false)}
        >
          Cancel
        </button>
      </div>
    ) : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>Table One Mahjong</h1>
        <div className="round-status">
          <span>Round {game.round}</span>
          <strong>{dealerStatus}</strong>
        </div>
      </header>

      <section className="game-layout">
        <section className="table" aria-label="Mahjong table">
          <div className="board-toolbar">
            <div className="table-brand">
              <strong>Table One Mahjong</strong>
              <span>
                Round {game.round} · {dealerStatus}
              </span>
            </div>
            <div className="tiles-remaining">
              <span>Tiles</span>
              <strong>{game.wall.length}</strong>
            </div>
            <div className="online-status" aria-label="Online readiness">
              <span>{playMode === "solo" ? "Solo" : "Shared room"}</span>
              <strong>
                {playMode === "solo" ? "3 AI" : connection.roomId}
              </strong>
            </div>
            <button
              className="gear-button"
              type="button"
              aria-label="Open settings"
              onClick={() => setSettingsOpen(true)}
            >
              ⚙
            </button>
          </div>
          <div className="table-wall wall-top" aria-hidden="true">
            {Array.from({ length: 18 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="table-wall wall-left" aria-hidden="true">
            {Array.from({ length: 13 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <div className="table-wall wall-right" aria-hidden="true">
            {Array.from({ length: 13 }, (_, index) => (
              <i key={index} />
            ))}
          </div>
          <Opponent
            player={{ ...game.players[topSeat], name: seatName(topSeat) }}
            active={game.turn === topSeat}
            dealer={game.dealer === topSeat}
            dealerStreak={game.dealerStreak}
            ready={game.declaredReady?.includes(topSeat) ?? false}
            reveal={game.winner === topSeat}
            position="top"
            onInspect={() => setInspectedSeat(topSeat)}
          />
          <section
            className={`human-seat ${game.turn === SELF ? "active" : ""} ${game.dealer === SELF ? "dealer-seat" : ""}`}
          >
            <div className="human-profile">
              <button
                className="human-name"
                type="button"
                onClick={() => setInspectedSeat(SELF)}
              >
                <strong>{human.name} (You)</strong>
              </button>
              <div className="seat-badges">
                {game.dealer === SELF ? (
                  <span className="dealer-badge">
                    Dealer
                    {game.dealerStreak > 0 ? ` +${game.dealerStreak * 2}` : ""}
                  </span>
                ) : null}
                {humanDeclaredReady ? (
                  <span className="ready-badge">Ready</span>
                ) : null}
                <span className="identity-badge">Human</span>
                <span>{human.wind}</span>
              </div>
              <div className="seat-meta">
                <span>{human.score} pts</span>
                <span>{human.flowers.length} flowers</span>
                <span>{human.hand.length} in hand</span>
              </div>
            </div>
            <SeatSets flowers={human.flowers} melds={human.melds} />
            {choosingChi && humanChiOptions.length > 1 ? (
              <div
                className="chi-choice-panel"
                aria-label="Choose Chi sequence"
              >
                <span>Choose Chi</span>
                <div className="chi-choice-list">
                  {humanChiOptions.map((option) => (
                    <button
                      className="chi-choice"
                      key={option.map((tile) => tile.id).join("-")}
                      type="button"
                      onClick={() => {
                        setChoosingChi(false);
                        claim("chi", option);
                      }}
                    >
                      <span>{formatChiOption(option)}</span>
                      <div className="chi-choice-tiles">
                        {option.map((tile) => (
                          <span
                            className="tile chi-choice-tile"
                            key={tile.id}
                            title={tile.label}
                          >
                            <TileFace tile={tile} />
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="human-hand">
              {human.hand.map((tile) => (
                <TileView
                  key={tile.id}
                  tile={tile}
                  selected={tile.id === effectiveSelectedTileId}
                  drawn={
                    tile.id === game.drawnTileId &&
                    game.turn === SELF &&
                    game.phase === "discard"
                  }
                  waiting={humanIsWaiting && waitingTileIds.has(tile.id)}
                  disabled={
                    game.phase !== "discard" ||
                    game.turn !== SELF ||
                    (humanDeclaredReady &&
                      human.discards.length > 0 &&
                      tile.id !== game.drawnTileId)
                  }
                  onMouseDown={() => {
                    setUiSelectedTileId(tile.id);
                    selectTile(tile.id);
                  }}
                  onClick={() => {
                    setUiSelectedTileId(tile.id);
                    selectTile(tile.id);
                  }}
                  onDoubleClick={() => {
                    if (game.phase !== "discard" || game.turn !== SELF) return;
                    setUiSelectedTileId(tile.id);
                    discard(tile.id);
                    setUiSelectedTileId(undefined);
                  }}
                />
              ))}
            </div>
            <div className="hand-actions">
              <div className="action-bar human-action-bar">
                {actionControls}
              </div>
              {kongChoiceControls}
            </div>
          </section>
          <Opponent
            player={{ ...game.players[leftSeat], name: seatName(leftSeat) }}
            active={game.turn === leftSeat}
            dealer={game.dealer === leftSeat}
            dealerStreak={game.dealerStreak}
            ready={game.declaredReady?.includes(leftSeat) ?? false}
            reveal={game.winner === leftSeat}
            position="left"
            onInspect={() => setInspectedSeat(leftSeat)}
          />
          <div className="center-table">
            <TableDiscardGrid
              players={game.players}
              selfIndex={SELF}
              onInspect={setInspectedSeat}
            />
            <div className="table-center-core">
              <div className="center-activity" aria-live="polite">
                <span>
                  Round {game.round} · {centerStatusLabel}
                </span>
                <strong>{activityText}</strong>
              </div>
              {activity.tile ? (
                <div className="last-discard">
                  <TileView tile={activity.tile} large disabled />
                </div>
              ) : null}
            </div>
          </div>
          <Opponent
            player={{ ...game.players[rightSeat], name: seatName(rightSeat) }}
            active={game.turn === rightSeat}
            dealer={game.dealer === rightSeat}
            dealerStreak={game.dealerStreak}
            ready={game.declaredReady?.includes(rightSeat) ?? false}
            reveal={game.winner === rightSeat}
            position="right"
            onInspect={() => setInspectedSeat(rightSeat)}
          />
        </section>
      </section>

      {inspectedSeat !== undefined ? (
        <PlayerInspector
          player={{
            ...game.players[inspectedSeat],
            name: seatName(inspectedSeat),
          }}
          isSelf={inspectedSeat === SELF}
          dealer={game.dealer === inspectedSeat}
          ready={game.declaredReady?.includes(inspectedSeat) ?? false}
          reveal={game.winner === inspectedSeat}
          onClose={() => setInspectedSeat(undefined)}
        />
      ) : null}

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Table controls</p>
                <h2 id="settings-title">Settings</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="settings-stack">
              <section className="panel-block settings-section">
                <h2>Players and style</h2>
                {game.players.map((player, index) => (
                  <div className="profile-row" key={index}>
                    <div className="profile-details">
                      <label>
                        <span>Name</span>
                        <input
                          aria-label={`${player.wind} player name`}
                          maxLength={18}
                          type="text"
                          value={player.name}
                          onChange={(event) =>
                            updatePlayerName(index, event.target.value)
                          }
                        />
                      </label>
                      <span>
                        {player.wind} · {player.score} pts
                      </span>
                    </div>
                    {player.controller === "human" ? (
                      <span className="profile-badge">
                        {index === SELF ? "You · Human" : "Human"}
                      </span>
                    ) : (
                      <select
                        value={player.difficulty}
                        onChange={(event) =>
                          updateDifficulty(
                            index,
                            event.target.value as Difficulty,
                          )
                        }
                      >
                        <option value="calm">Calm</option>
                        <option value="balanced">Balanced</option>
                        <option value="sharp">Sharp</option>
                      </select>
                    )}
                  </div>
                ))}
              </section>

              <section className="panel-block settings-section rules-section">
                <h2>Rules</h2>
                <div className="scoring-rules-grid">
                  {ruleRows.map(([label, key]) => (
                    <label className="rule-row" key={key}>
                      <span>{label}</span>
                      <input
                        min="0"
                        type="number"
                        value={rules[key]}
                        onChange={(event) =>
                          setRules({
                            ...rules,
                            [key]: Math.max(0, Number(event.target.value)),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <h3>Taiwanese scoring table</h3>
                <p className="settings-note">
                  Bonus conditions from the 2026 table are detected from the
                  winning hand and added to the 4-point base. Every condition
                  starts on; switch off any item your table does not use.
                </p>
                <div className="house-rule-list">
                  {houseRules.map((rule) => (
                    <div className="house-rule-card" key={rule.id}>
                      <label className="house-rule-toggle">
                        <input
                          checked={rule.enabled}
                          type="checkbox"
                          onChange={(event) =>
                            updateHouseRule(
                              rule.id,
                              rule.points,
                              event.target.checked,
                            )
                          }
                        />
                        <span>
                          <strong>{rule.name}</strong>
                          <small>
                            {rule.category ?? "Custom"} · {rule.description}
                          </small>
                        </span>
                      </label>
                      <div className="house-rule-actions">
                        <label>
                          <span>Pts</span>
                          <input
                            min="0"
                            type="number"
                            value={rule.points}
                            onChange={(event) =>
                              updateHouseRule(
                                rule.id,
                                Math.max(0, Number(event.target.value)),
                                rule.enabled,
                              )
                            }
                          />
                        </label>
                        {!rule.detector ? (
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => removeHouseRule(rule.id)}
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="house-rule-form">
                  <input
                    aria-label="House scoring name"
                    placeholder="Name"
                    type="text"
                    value={houseDraft.name}
                    onChange={(event) =>
                      setHouseDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                  <textarea
                    aria-label="House scoring win condition"
                    placeholder="Describe the win condition"
                    value={houseDraft.description}
                    onChange={(event) =>
                      setHouseDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                  <label>
                    <span>Points</span>
                    <input
                      min="0"
                      type="number"
                      value={houseDraft.points}
                      onChange={(event) =>
                        setHouseDraft((current) => ({
                          ...current,
                          points: Math.max(0, Number(event.target.value)),
                        }))
                      }
                    />
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      if (
                        houseDraft.name.trim() &&
                        houseDraft.description.trim()
                      ) {
                        addHouseRule(
                          houseDraft.name,
                          houseDraft.description,
                          houseDraft.points,
                        );
                        setHouseDraft({ name: "", description: "", points: 1 });
                      }
                    }}
                  >
                    Add house item
                  </button>
                </div>
              </section>
            </div>

            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                newHand(nextDealer, false);
                setSettingsOpen(false);
              }}
            >
              New hand
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={leaveCurrentGame}
            >
              Leave game
            </button>
          </section>
        </div>
      ) : null}

      {game.winSummary ? (
        <div className="modal-backdrop win-backdrop" role="presentation">
          <section
            className="win-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="win-title"
          >
            <p className="eyebrow">Hand complete</p>
            <h2 id="win-title">{game.winSummary.title}</h2>
            <p>{game.winSummary.detail}</p>
            {winningPlayer && game.winSummary.winner !== undefined ? (
              <div
                className="winning-hand-review"
                aria-label={`${winningPlayer.name} revealed winning hand`}
              >
                <span>{seatName(game.winSummary.winner)}'s hand</span>
                <div className="winning-review-section">
                  <strong>Concealed tiles</strong>
                  <div className="winning-tile-row">
                    {winningPlayer.hand.map((tile) => (
                      <TileView key={tile.id} tile={tile} disabled />
                    ))}
                  </div>
                </div>
                {winningPlayer.melds.length > 0 ? (
                  <div className="winning-review-section">
                    <strong>Revealed sets</strong>
                    <div className="winning-meld-row">
                      {winningPlayer.melds.map((meld, index) => (
                        <MeldView key={`${meld.type}-${index}`} meld={meld} />
                      ))}
                    </div>
                  </div>
                ) : null}
                {winningPlayer.flowers.length > 0 ? (
                  <div className="winning-review-section">
                    <strong>Flowers</strong>
                    <div className="winning-tile-row">
                      {winningPlayer.flowers.map((tile) => (
                        <TileView key={tile.id} tile={tile} disabled />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {winningPlayer ? (
              <div className="score-breakdown">
                <span
                  className="score-item"
                  tabIndex={0}
                  title="Points awarded for every completed Hu."
                >
                  Base win: {rules.baseWin}
                  <small role="tooltip">
                    Points awarded for every completed Hu.
                  </small>
                </span>
                {game.winSummary.scoreItems.map((item) => (
                  <span
                    className="score-item"
                    key={`${item.name}-${item.points}`}
                    tabIndex={0}
                    title={item.description}
                  >
                    {item.name}
                    {item.multiplier > 1 ? ` x${item.multiplier}` : ""}: +
                    {item.points}
                    <small role="tooltip">{item.description}</small>
                  </span>
                ))}
              </div>
            ) : null}
            {winningPlayer ? (
              <div className="win-total">
                <span>{game.winSummary.points} points</span>
                <strong>+{game.winSummary.total} total</strong>
              </div>
            ) : null}
            <button
              className="full-width-button"
              type="button"
              disabled={
                playMode === "online" &&
                (game.nextHandReady?.includes(SELF) ?? false)
              }
              onClick={() => {
                if (playMode === "online") {
                  readyNextHand();
                } else {
                  newHand(nextDealer, false);
                }
              }}
            >
              {playMode === "online" &&
              (game.nextHandReady?.includes(SELF) ?? false)
                ? "Waiting for other players..."
                : "Next Hand"}
            </button>
            {playMode === "online" ? (
              <p className="next-hand-status" aria-live="polite">
                {game.nextHandReady?.includes(SELF)
                  ? `${game.nextHandReady.length} of ${game.nextHandRequired?.length ?? 1} players ready. Waiting for everyone else to click Next Hand.`
                  : "The next hand begins after every player clicks Next Hand."}
              </p>
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default function Home() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <h1>Table One Mahjong</h1>
          <div className="round-status">
            <span>Preparing</span>
            <strong>Shuffling tiles</strong>
          </div>
        </header>
      </main>
    );
  }

  return <MahjongApp />;
}
