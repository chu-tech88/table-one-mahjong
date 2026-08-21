// Import game logic and types
import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  tilePrototypeFromCode,
} from "./game-logic/helpers";
import { useAuth, displayNameOf } from "./hooks/useAuth";
import { AuthScreen } from "./components/AuthScreen";
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
import {
  type CoachLesson,
  type CoachTarget,
  type GuidanceMode,
  recommendDiscard,
} from "./game-logic/learning";
import { useGame } from "./hooks/useGame";
import {
  createScenarioSnapshot,
  restoreScenarioSnapshot,
  saveScenarioSnapshot,
  type ScenarioSnapshot,
} from "./game-logic/snapshot";
import html2canvas from "html2canvas";
import oneBambooBird from "./assets/one-bamboo-bird.png";
import {
  type AnalyticsConsent,
  getAnalyticsConsent,
  initializeAnalytics,
  setAnalyticsConsent,
  trackAnalyticsEvent,
} from "./analytics";

const SOUND_SETTING_KEY = "table-one-sound-enabled";
const GUIDANCE_SETTING_KEY = "table-one-guidance-mode";
const HIDDEN_LESSONS_KEY = "table-one-hidden-lessons";
const COACH_VIEWPORT_QUERY = "(min-width: 1100px) and (min-height: 650px)";
type GameSound = "discard" | "chi" | "pong" | "gong" | "hu" | "turn";
type LearnTopic =
  | "history"
  | "objective"
  | "tiles"
  | "turn"
  | "chi"
  | "pong"
  | "gong"
  | "hu"
  | "dealer"
  | "scoring";

function loadGuidanceMode(): GuidanceMode {
  if (typeof window === "undefined") return "off";
  const saved = window.localStorage.getItem(GUIDANCE_SETTING_KEY);
  return saved === "strategy" ? "strategy" : "off";
}

function loadHiddenLessons() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(HIDDEN_LESSONS_KEY) ?? "[]",
    );
    return new Set<string>(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set<string>();
  }
}

function coachViewportIsSupported() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(COACH_VIEWPORT_QUERY).matches
  );
}

type TileFlight = {
  id: string;
  tile: Tile;
  kind: "discard" | "claim" | "reveal";
  from: number;
  to?: number;
};

function visualRelativeSeat(seat: number, self: number) {
  const relativeSeat = (seat - self + 4) % 4;
  if (relativeSeat === 1) return 3;
  if (relativeSeat === 3) return 1;
  return relativeSeat;
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function analyticsDeviceFormat() {
  if (typeof window === "undefined") return "unknown";
  if (window.innerWidth <= 760) return "mobile";
  if (window.innerWidth <= 1100) return "tablet";
  return "desktop";
}

function claimedTileBetween(previous: Game, current: Game, actor: number) {
  const previousMeldIds = new Set(
    previous.players[actor]?.melds.flatMap((meld) =>
      meld.tiles.map((tile) => tile.id),
    ) ?? [],
  );
  const newMeld = [...(current.players[actor]?.melds ?? [])]
    .reverse()
    .find((meld) => meld.tiles.some((tile) => !previousMeldIds.has(tile.id)));
  if (!newMeld || newMeld.from === undefined) return undefined;

  const previousHandIds = new Set(
    previous.players[actor]?.hand.map((tile) => tile.id) ?? [],
  );
  const tile =
    newMeld.tiles.find((candidate) => !previousHandIds.has(candidate.id)) ??
    newMeld.tiles.at(-1);
  return tile ? { tile, from: newMeld.from } : undefined;
}

const soundPatterns: Record<
  GameSound,
  Array<{
    frequency: number;
    endFrequency?: number;
    offset: number;
    duration: number;
    volume: number;
    wave: OscillatorType;
  }>
> = {
  discard: [
    {
      frequency: 210,
      endFrequency: 135,
      offset: 0,
      duration: 0.09,
      volume: 0.025,
      wave: "triangle",
    },
  ],
  chi: [
    { frequency: 392, offset: 0, duration: 0.1, volume: 0.022, wave: "sine" },
    {
      frequency: 523.25,
      offset: 0.09,
      duration: 0.13,
      volume: 0.025,
      wave: "sine",
    },
  ],
  pong: [
    {
      frequency: 196,
      offset: 0,
      duration: 0.1,
      volume: 0.03,
      wave: "triangle",
    },
    {
      frequency: 196,
      offset: 0.1,
      duration: 0.12,
      volume: 0.03,
      wave: "triangle",
    },
  ],
  gong: [
    {
      frequency: 130.81,
      offset: 0,
      duration: 0.58,
      volume: 0.04,
      wave: "sine",
    },
    {
      frequency: 261.63,
      offset: 0.02,
      duration: 0.4,
      volume: 0.018,
      wave: "triangle",
    },
  ],
  hu: [
    {
      frequency: 523.25,
      offset: 0,
      duration: 0.18,
      volume: 0.04,
      wave: "sine",
    },
    {
      frequency: 659.25,
      offset: 0.12,
      duration: 0.2,
      volume: 0.045,
      wave: "sine",
    },
    {
      frequency: 783.99,
      offset: 0.24,
      duration: 0.32,
      volume: 0.05,
      wave: "sine",
    },
  ],
  turn: [
    {
      frequency: 659.25,
      offset: 0,
      duration: 0.28,
      volume: 0.09,
      wave: "sine",
    },
    {
      frequency: 880,
      offset: 0.14,
      duration: 0.34,
      volume: 0.105,
      wave: "sine",
    },
    {
      frequency: 987.77,
      offset: 0.3,
      duration: 0.42,
      volume: 0.08,
      wave: "sine",
    },
  ],
};

function playSynthSound(context: AudioContext, sound: GameSound) {
  const start = context.currentTime + 0.01;
  soundPatterns[sound].forEach((note) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + note.offset;
    const noteEnd = noteStart + note.duration;
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    if (note.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        note.endFrequency,
        noteEnd,
      );
    }
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(note.volume, noteStart + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  });
}

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

const bambooLayouts: Record<number, Array<[number, number]>> = {
  2: [
    [35, 28],
    [65, 72],
  ],
  3: [
    [28, 24],
    [50, 50],
    [72, 76],
  ],
  4: [
    [32, 27],
    [68, 27],
    [32, 73],
    [68, 73],
  ],
  5: [
    [30, 24],
    [70, 24],
    [50, 50],
    [30, 76],
    [70, 76],
  ],
  6: [
    [34, 20],
    [66, 20],
    [34, 50],
    [66, 50],
    [34, 80],
    [66, 80],
  ],
  7: [
    [50, 18],
    [23, 50],
    [50, 50],
    [77, 50],
    [23, 82],
    [50, 82],
    [77, 82],
  ],
  8: [
    [34, 14],
    [66, 14],
    [34, 38],
    [66, 38],
    [34, 62],
    [66, 62],
    [34, 86],
    [66, 86],
  ],
  9: [
    [23, 18],
    [50, 18],
    [77, 18],
    [23, 50],
    [50, 50],
    [77, 50],
    [23, 82],
    [50, 82],
    [77, 82],
  ],
};

function BambooFace({ rank }: { rank: number }) {
  return (
    <span className="tile-face bamboo-svg-face" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {bambooLayouts[rank].map(([x, y], index) => (
          <g key={`${x}-${y}-${index}`} transform={`translate(${x} ${y})`}>
            <rect x="-7" y="-14" width="14" height="28" rx="7" fill="#147d5b" />
            <rect x="-7" y="-2.5" width="14" height="5" fill="#d7433f" />
            <path
              d="M0 -10 V10"
              stroke="#eff8e9"
              strokeWidth="1.5"
              opacity="0.65"
            />
          </g>
        ))}
      </svg>
    </span>
  );
}

function FlowerPetals({
  x,
  y,
  count,
  color,
  center,
  scale = 1,
}: {
  x: number;
  y: number;
  count: number;
  color: string;
  center: string;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {Array.from({ length: count }, (_, index) => (
        <ellipse
          key={index}
          cx="0"
          cy="-10"
          rx="5"
          ry="11"
          fill={color}
          transform={`rotate(${(360 / count) * index})`}
        />
      ))}
      <circle r="4.5" fill={center} />
    </g>
  );
}

function FlowerArtwork({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <g className="flower-artwork plum-artwork">
        <path d="M22 106 C32 84 44 72 70 54 C78 48 82 37 84 24" />
        <path d="M43 75 C35 61 27 54 17 50 M62 60 C58 43 49 35 39 31" />
        <FlowerPetals
          x={18}
          y={49}
          count={5}
          color="#de4668"
          center="#f2bd45"
          scale={0.72}
        />
        <FlowerPetals
          x={40}
          y={31}
          count={5}
          color="#ee718a"
          center="#f2bd45"
          scale={0.74}
        />
        <FlowerPetals
          x={84}
          y={23}
          count={5}
          color="#d92f59"
          center="#f2bd45"
          scale={0.82}
        />
        <FlowerPetals
          x={52}
          y={67}
          count={5}
          color="#f18ca0"
          center="#f2bd45"
          scale={0.62}
        />
      </g>
    );
  }

  if (rank === 2) {
    return (
      <g className="flower-artwork orchid-artwork">
        <path d="M48 108 C39 80 25 59 18 35 M49 108 C57 75 70 51 85 31 M47 108 C47 72 46 43 51 18" />
        <path d="M44 91 C30 81 21 80 14 84 C25 90 34 94 45 98 M55 73 C68 62 79 61 88 65 C76 73 66 78 55 82" />
        <FlowerPetals
          x={50}
          y={22}
          count={5}
          color="#8556a7"
          center="#efc34f"
          scale={0.88}
        />
        <FlowerPetals
          x={25}
          y={43}
          count={5}
          color="#ae7ac5"
          center="#efc34f"
          scale={0.68}
        />
        <FlowerPetals
          x={76}
          y={42}
          count={5}
          color="#6e4797"
          center="#efc34f"
          scale={0.65}
        />
      </g>
    );
  }

  if (rank === 3) {
    return (
      <g className="flower-artwork chrysanthemum-artwork">
        <path d="M50 109 C49 86 51 65 52 48 M49 85 C35 75 25 75 17 81 C30 85 39 91 49 96" />
        {Array.from({ length: 14 }, (_, index) => (
          <ellipse
            key={index}
            cx="52"
            cy="29"
            rx="4.2"
            ry="19"
            fill={index % 2 ? "#e5a927" : "#f4ca4b"}
            transform={`rotate(${index * 25.7} 52 29)`}
          />
        ))}
        <circle cx="52" cy="29" r="8" fill="#ad6d13" />
      </g>
    );
  }

  if (rank === 4) {
    return (
      <g className="flower-artwork bamboo-flower-artwork">
        <path d="M36 109 L42 18 M58 108 L63 28 M42 43 H38 M40 70 H35 M63 53 H58 M61 80 H56" />
        <path d="M40 38 C24 24 16 25 10 30 C20 40 29 44 39 46 M41 57 C55 43 67 42 76 46 C64 56 54 61 41 64 M61 44 C72 31 82 30 89 34 C81 43 72 49 61 51 M59 72 C45 62 35 63 27 68 C38 75 48 80 59 81" />
      </g>
    );
  }

  if (rank === 5) {
    return (
      <g className="flower-artwork spring-artwork">
        <path d="M49 109 C45 83 46 61 53 38 M46 86 C31 74 21 75 14 81 C28 87 37 92 47 96 M53 63 C68 52 79 53 87 59 C74 66 64 71 53 73" />
        <FlowerPetals
          x={52}
          y={30}
          count={8}
          color="#e34875"
          center="#f3c545"
          scale={1.15}
        />
        <FlowerPetals
          x={31}
          y={57}
          count={7}
          color="#ef7998"
          center="#f3c545"
          scale={0.65}
        />
        <circle cx="77" cy="49" r="5" fill="#e34875" />
      </g>
    );
  }

  if (rank === 6) {
    return (
      <g className="flower-artwork summer-artwork">
        <path d="M50 108 C49 80 50 58 51 42 M48 88 C32 78 20 80 13 88 C28 92 39 96 49 99" />
        <path
          d="M15 91 C27 78 43 77 52 91 C39 104 27 104 15 91 Z"
          fill="#4b9a67"
          stroke="none"
        />
        {Array.from({ length: 8 }, (_, index) => (
          <ellipse
            key={index}
            cx="51"
            cy="34"
            rx="8"
            ry="21"
            fill={index % 2 ? "#ef7090" : "#f39aaf"}
            transform={`rotate(${index * 45} 51 34)`}
          />
        ))}
        <circle cx="51" cy="34" r="7" fill="#efc742" />
      </g>
    );
  }

  if (rank === 7) {
    return (
      <g className="flower-artwork autumn-artwork">
        <path d="M48 109 C48 87 51 61 57 33 M53 68 C39 58 28 58 18 64 M55 52 C70 43 80 43 89 49" />
        <path
          d="M18 64 L10 55 L19 54 L17 44 L27 50 L31 40 L35 51 L45 47 L40 58 L48 63 L37 68 L39 79 L29 72 L22 81 L23 70 Z"
          fill="#c7522b"
          stroke="none"
        />
        <path
          d="M68 48 L62 39 L70 39 L69 30 L78 36 L82 27 L86 38 L94 36 L90 46 L97 52 L87 56 L88 66 L79 60 L72 68 L73 57 Z"
          fill="#df8a2c"
          stroke="none"
        />
        <circle cx="52" cy="79" r="7" fill="#df7c25" stroke="none" />
        <circle cx="65" cy="84" r="7" fill="#bf472d" stroke="none" />
      </g>
    );
  }

  return (
    <g className="flower-artwork winter-artwork">
      <path d="M49 109 C48 83 42 61 35 39 M51 109 C57 82 64 62 72 42 M48 90 C35 80 24 80 16 86 C29 91 39 96 49 100" />
      <FlowerPetals
        x={34}
        y={34}
        count={6}
        color="#f3f1dd"
        center="#e8b62f"
        scale={0.88}
      />
      <FlowerPetals
        x={72}
        y={40}
        count={6}
        color="#fffbea"
        center="#e8b62f"
        scale={0.78}
      />
      <FlowerPetals
        x={51}
        y={61}
        count={6}
        color="#e9eef1"
        center="#d99b24"
        scale={0.62}
      />
      <path
        d="M25 25 C39 17 54 16 68 21"
        fill="none"
        stroke="#a8c4d2"
        strokeWidth="3"
        opacity="0.8"
      />
    </g>
  );
}

function FlowerFace({ tile }: { tile: Tile }) {
  return (
    <span
      className={`tile-face flower-illustration-face flower-${tile.rank}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 120" preserveAspectRatio="xMidYMid meet">
        <FlowerArtwork rank={tile.rank} />
      </svg>
      <b>{flowerCharacters[tile.code] ?? tile.short}</b>
      <em>{tile.rank}</em>
    </span>
  );
}

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
    return <BambooFace rank={tile.rank} />;
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
    return <FlowerFace tile={tile} />;
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
  latest,
  revealed,
  waiting,
  winning,
  coachHighlighted,
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
  latest?: boolean;
  revealed?: boolean;
  waiting?: boolean;
  winning?: boolean;
  coachHighlighted?: boolean;
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
      className={`tile ${tile.suit} ${selected ? "selected" : ""} ${drawn ? "drawn tile-motion-draw" : ""} ${latest ? "discard-latest tile-motion-discard" : ""} ${revealed ? "tile-motion-reveal" : ""} ${waiting ? "waiting" : ""} ${winning ? "winning-tile" : ""} ${coachHighlighted ? "coach-tile-focus" : ""} ${large ? "large" : ""}`}
      aria-label={`${tile.label}${drawn ? ", newly drawn" : ""}${latest ? ", latest discard" : ""}${waiting ? ", part of a waiting set" : ""}${winning ? ", winning tile" : ""}`}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={tile.label}
      type="button"
    >
      <TileFace tile={tile} />
      {drawn ? <span className="drawn-badge" aria-hidden="true" /> : null}
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
      className="meld meld-motion-enter"
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

function DiscardRiver({
  player,
  latestDiscardId,
  adaptive = false,
}: {
  player: Player;
  latestDiscardId?: string;
  adaptive?: boolean;
}) {
  const discards = [...player.discards].reverse();
  const riverRef = useRef<HTMLDivElement>(null);
  const [visibleDiscardCount, setVisibleDiscardCount] = useState(3);

  useEffect(() => {
    if (!adaptive) return;
    const river = riverRef.current;
    if (!river) return;

    const updateCapacity = () => {
      const firstTile = river.querySelector<HTMLElement>(".tile");
      const styles = window.getComputedStyle(river);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 2;
      const tileWidth = firstTile?.getBoundingClientRect().width || 28;
      const maximumSlots = Math.max(
        1,
        Math.floor((river.clientWidth + gap) / (tileWidth + gap)),
      );
      const nextCount =
        discards.length <= maximumSlots
          ? discards.length
          : Math.max(1, maximumSlots - 1);
      setVisibleDiscardCount(nextCount);
    };

    updateCapacity();
    const observer = new ResizeObserver(updateCapacity);
    observer.observe(river);
    return () => observer.disconnect();
  }, [adaptive, discards.length]);

  const renderedDiscards = adaptive
    ? discards.slice(0, visibleDiscardCount)
    : discards;
  const hiddenDiscardCount = adaptive
    ? Math.max(0, discards.length - renderedDiscards.length)
    : Math.max(0, discards.length - 3);

  return (
    <div
      className="discard-river"
      aria-label={`${player.name} discard pile`}
      data-adaptive={adaptive || undefined}
      ref={riverRef}
    >
      {renderedDiscards.map((tile) => (
        <TileView
          key={tile.id}
          tile={tile}
          latest={tile.id === latestDiscardId}
          disabled
        />
      ))}
      {hiddenDiscardCount > 0 ? (
        <span
          className="discard-overflow-count"
          aria-label={`${hiddenDiscardCount} earlier discards`}
        >
          +{hiddenDiscardCount}
        </span>
      ) : null}
    </div>
  );
}

function TableDiscardGrid({
  players,
  selfIndex,
  latestDiscardId,
  onInspect,
}: {
  players: Player[];
  selfIndex: number;
  latestDiscardId?: string;
  onInspect: (index: number) => void;
}) {
  return (
    <div className="table-discard-grid" aria-label="Center discard area">
      {players.map((player, index) => {
        const relativeSeat = visualRelativeSeat(index, selfIndex);
        const isSelf = index === selfIndex;
        return (
          <section
            className={`table-discard-lane discard-lane-${relativeSeat}`}
            key={`${player.name}-${index}`}
          >
            <button
              className="discard-lane-label"
              type="button"
              aria-label={`Inspect ${isSelf ? "your" : player.name} discard history, ${player.discards.length} tiles`}
              onClick={() => onInspect(index)}
            >
              <span>{isSelf ? "You" : player.name}</span>
              <small>{player.discards.length}</small>
            </button>
            <DiscardRiver player={player} latestDiscardId={latestDiscardId} />
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
            <TileView key={tile.id} tile={tile} revealed disabled />
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

function CompactSeatSets({
  player,
  onInspect,
}: {
  player: Player;
  onInspect: () => void;
}) {
  const setsRef = useRef<HTMLDivElement>(null);
  const [visibleGroupCount, setVisibleGroupCount] = useState(
    player.melds.length + (player.flowers.length > 0 ? 1 : 0),
  );
  const totalGroupCount =
    player.melds.length + (player.flowers.length > 0 ? 1 : 0);

  useLayoutEffect(() => {
    const sets = setsRef.current;
    if (!sets) return;

    const updateCapacity = () => {
      const measurementGroups = Array.from(
        sets.querySelectorAll<HTMLElement>("[data-reveal-measure-group]"),
      );
      const overflowMeasure = sets.querySelector<HTMLElement>(
        "[data-reveal-overflow-measure]",
      );
      const styles = window.getComputedStyle(sets);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 3;
      const groupWidths = measurementGroups.map(
        (group) => group.getBoundingClientRect().width,
      );
      const totalWidth =
        groupWidths.reduce((sum, width) => sum + width, 0) +
        Math.max(0, groupWidths.length - 1) * gap;

      if (totalWidth <= sets.clientWidth) {
        setVisibleGroupCount(groupWidths.length);
        return;
      }

      const overflowWidth =
        overflowMeasure?.getBoundingClientRect().width ?? 28;
      const availableWidth = Math.max(0, sets.clientWidth - overflowWidth - gap);
      let usedWidth = 0;
      let nextVisibleCount = 0;

      for (const width of groupWidths) {
        const nextWidth = usedWidth + (nextVisibleCount > 0 ? gap : 0) + width;
        if (nextWidth > availableWidth) break;
        usedWidth = nextWidth;
        nextVisibleCount += 1;
      }

      setVisibleGroupCount(nextVisibleCount);
    };

    updateCapacity();
    const observer = new ResizeObserver(updateCapacity);
    observer.observe(sets);
    return () => observer.disconnect();
  }, [player.flowers.length, player.melds, totalGroupCount]);

  const visibleMeldCount = Math.min(
    visibleGroupCount,
    player.melds.length,
  );
  const showFlowers =
    player.flowers.length > 0 && visibleGroupCount > player.melds.length;
  const hiddenTileCount =
    player.melds
      .slice(visibleMeldCount)
      .reduce((total, meld) => total + meld.tiles.length, 0) +
    (showFlowers ? 0 : player.flowers.length);

  return (
    <div className="compact-seat-sets" ref={setsRef}>
      <div className="compact-meld-row">
        {player.melds.slice(0, visibleMeldCount).map((meld, index) => (
          <MeldView key={`${meld.type}-${index}`} meld={meld} />
        ))}
      </div>
      {showFlowers ? (
        <button
          className="compact-flower-summary"
          type="button"
          aria-label={`Inspect ${player.name}'s ${player.flowers.length} flowers`}
          onClick={onInspect}
        >
          <span aria-hidden="true">✿</span>
          <strong>×{player.flowers.length}</strong>
        </button>
      ) : null}
      {hiddenTileCount > 0 ? (
        <button
          className="compact-reveal-overflow"
          type="button"
          aria-label={`Inspect ${player.name}'s ${hiddenTileCount} additional revealed tiles`}
          onClick={onInspect}
        >
          +{hiddenTileCount}
        </button>
      ) : null}
      {player.flowers.length === 0 && player.melds.length === 0 ? (
        <span className="compact-sets-empty">No reveals</span>
      ) : null}
      <div className="compact-reveal-measure compact-meld-row" aria-hidden="true">
        {player.melds.map((meld, index) => (
          <div data-reveal-measure-group key={`${meld.type}-${index}`}>
            <MeldView meld={meld} />
          </div>
        ))}
        {player.flowers.length > 0 ? (
          <span
            className="compact-flower-summary"
            data-reveal-measure-group
          >
            <span>✿</span>
            <strong>×{player.flowers.length}</strong>
          </span>
        ) : null}
        <span
          className="compact-reveal-overflow"
          data-reveal-overflow-measure
        >
          +99
        </span>
      </div>
    </div>
  );
}

function CompactOpponentLane({
  player,
  active,
  dealer,
  dealerStreak,
  latestDiscardId,
  onInspect,
}: {
  player: Player;
  active: boolean;
  dealer: boolean;
  dealerStreak: number;
  latestDiscardId?: string;
  onInspect: () => void;
}) {
  return (
    <section
      className={`compact-opponent-lane ${active ? "turn-active" : ""} ${dealer ? "dealer-seat" : ""}`}
      aria-current={active ? "true" : undefined}
    >
      <button
        className="compact-opponent-heading"
        type="button"
        onClick={onInspect}
      >
        <span className="compact-opponent-name">
          {active ? <i className="compact-turn-dot" aria-hidden="true" /> : null}
          <strong>{player.name}</strong>
        </span>
        <span className="compact-opponent-meta">
          {dealer ? (
            <b className="compact-dealer-badge">
              Dealer{dealerStreak > 0 ? ` +${dealerStreak * 2}` : ""}
            </b>
          ) : null}
          <span>{player.score} pts</span>
        </span>
      </button>
      <div className="compact-opponent-content">
        <div
          className="compact-discard-lane"
        >
          <DiscardRiver
            player={player}
            latestDiscardId={latestDiscardId}
            adaptive
          />
          <button
            className="compact-lane-inspect"
            type="button"
            aria-label={`Inspect ${player.name}'s discard history`}
            onClick={onInspect}
          />
        </div>
        <div
          className="compact-revealed-lane"
          aria-label={`${player.name}'s revealed sets`}
        >
          <CompactSeatSets player={player} onInspect={onInspect} />
        </div>
      </div>
    </section>
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
  presence,
  onInspect,
}: {
  player: Player;
  active: boolean;
  dealer: boolean;
  dealerStreak: number;
  ready: boolean;
  reveal: boolean;
  position: "left" | "top" | "right";
  presence?: "connected" | "reconnecting" | "ai";
  onInspect: () => void;
}) {
  const revealedTileCount =
    player.flowers.length +
    player.melds.reduce((total, meld) => total + meld.tiles.length, 0);
  const revealedDensity =
    revealedTileCount > 8
      ? "revealed-density-compact"
      : revealedTileCount > 6
        ? "revealed-density-condensed"
        : "revealed-density-roomy";
  const wallTileCount = Math.min(player.hand.length, 18);
  return (
    <section
      className={`opponent opponent-${position} ${active ? "turn-active" : ""} ${dealer ? "dealer-seat" : ""}`}
      aria-current={active ? "true" : undefined}
    >
      <button className="seat-heading" type="button" onClick={onInspect}>
        {active ? (
          <span className="turn-beacon">
            <i aria-hidden="true" />
            Turn
          </span>
        ) : null}
        <strong>{player.name}</strong>
        <div className="seat-badges">
          {dealer ? (
            <span className="dealer-badge">
              Dealer{dealerStreak > 0 ? ` +${dealerStreak * 2}` : ""}
            </span>
          ) : null}
          {ready ? <span className="ready-badge">Ready</span> : null}
          {presence === "reconnecting" ? (
            <span className="reconnecting-badge">Reconnecting</span>
          ) : null}
          <span className="identity-badge">
            {player.controller === "human" ? "Human" : "AI"}
          </span>
          <span className="score-badge">{player.score} pts</span>
          <span>{player.wind}</span>
        </div>
      </button>
      <div className="seat-meta">
        <span>{difficulties[player.difficulty]}</span>
        <span>{player.score} pts</span>
      </div>
      <div className="opponent-rack">
        <span
          className="opponent-hand-count"
          aria-label={`${player.name} has ${player.hand.length} concealed tiles`}
        >
          <i aria-hidden="true" />
          {player.hand.length} tiles
        </span>
        <div
          className="opponent-wall-row"
          aria-label={`${player.name} has ${player.hand.length} concealed tiles`}
        >
          {Array.from({ length: wallTileCount }, (_, index) => (
            <i key={index} />
          ))}
        </div>
        {revealedTileCount > 0 ? (
          <div
            className={`opponent-revealed-strip ${revealedDensity}`}
            aria-label={`${player.name} revealed tiles`}
            data-revealed-tiles={revealedTileCount}
          >
            <SeatSets flowers={player.flowers} melds={player.melds} />
          </div>
        ) : null}
      </div>
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

function MahjongApp({
  auth,
  analyticsEnabled,
  onAnalyticsConsentChange,
  onOpenLearn,
}: {
  auth: ReturnType<typeof useAuth>;
  analyticsEnabled: boolean;
  onAnalyticsConsentChange: (enabled: boolean) => void;
  onOpenLearn: () => void;
}) {
  const restoredActiveSession = useMemo(loadActiveSession, []);
  const accountDisplayName = displayNameOf(auth.user);
  const signedInPlayerName = accountDisplayName || "Player";
  const [playMode, setPlayMode] = useState<"solo" | "online">(
    restoredActiveSession?.playMode ?? "solo",
  );
  const [guidanceMode, setGuidanceMode] = useState<GuidanceMode>(() => {
    const saved = loadGuidanceMode();
    return restoredActiveSession?.playMode === "online" && saved === "strategy"
      ? "off"
      : saved;
  });
  const [activeCoachLesson, setActiveCoachLesson] =
    useState<CoachLesson | null>(null);
  const [learnTopic, setLearnTopic] = useState<LearnTopic | null>(null);
  const [coachFocusTarget, setCoachFocusTarget] =
    useState<CoachTarget | null>(null);
  const [coachDetailsOpen, setCoachDetailsOpen] = useState(false);
  const [seenCoachLessons, setSeenCoachLessons] = useState<Set<string>>(
    () => new Set(),
  );
  const [hiddenCoachLessons, setHiddenCoachLessons] =
    useState<Set<string>>(loadHiddenLessons);
  const [coachViewportSupported, setCoachViewportSupported] = useState(
    coachViewportIsSupported,
  );
  const [connection, setConnection] = useState(() => ({
    roomId: restoredActiveSession?.roomId ?? createSoloRoomId(),
    playerIndex: restoredActiveSession?.playerIndex ?? 0,
    playerName: restoredActiveSession?.playerName ?? accountDisplayName,
    joined: Boolean(restoredActiveSession),
  }));
  const [occupiedSeats, setOccupiedSeats] = useState<number[]>([]);
  const [roomList, setRoomList] = useState<
    Array<{
      roomId: string;
      occupiedSeats: number[];
      playerCount: number;
      isFull: boolean;
    }>
  >([]);
  const [lobbySeatError, setLobbySeatError] = useState<string | null>(null);
  const [activeScenario, setActiveScenario] = useState<ScenarioSnapshot | null>(
    null,
  );
  const [scenarioFeedback, setScenarioFeedback] = useState<string | null>(null);
  const scenarioFileInputRef = useRef<HTMLInputElement | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<"sign-in" | "sign-up">(
    "sign-in",
  );

  const openAuth = (initialMode: "sign-in" | "sign-up") => {
    setAuthInitialMode(initialMode);
    setAuthOpen(true);
  };

  const accountControls = auth.user ? (
    <button
      className="secondary-button account-button"
      type="button"
      onClick={() => void auth.signOut()}
    >
      Sign out
    </button>
  ) : (
    <div className="account-actions">
      <button
        className="secondary-button account-button"
        type="button"
        onClick={() => {
          setAuthInitialMode("sign-in");
          setAuthOpen(true);
        }}
      >
        Sign in
      </button>
      <button
        className="full-width-button account-button"
        type="button"
        onClick={() => {
          setAuthInitialMode("sign-up");
          setAuthOpen(true);
        }}
      >
        Create account
      </button>
    </div>
  );

  useEffect(() => {
    if (!auth.user || !accountDisplayName) return;
    setConnection((current) =>
      current.playerName === accountDisplayName
        ? current
        : { ...current, playerName: accountDisplayName },
    );
  }, [accountDisplayName, auth.user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GUIDANCE_SETTING_KEY, guidanceMode);
  }, [guidanceMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(COACH_VIEWPORT_QUERY);
    const updateSupport = () => setCoachViewportSupported(media.matches);
    updateSupport();
    media.addEventListener("change", updateSupport);
    return () => media.removeEventListener("change", updateSupport);
  }, []);

  const changeGuidanceMode = (mode: GuidanceMode) => {
    const allowedMode =
      (playMode === "online" || !coachViewportSupported) && mode === "strategy"
        ? "off"
        : mode;
    setGuidanceMode(allowedMode);
    setActiveCoachLesson(null);
    setCoachFocusTarget(null);
    setSeenCoachLessons(new Set());
  };

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

  const isLocalReplay = Boolean(activeScenario) || playMode === "solo";
  const gameHook = useGame({
    mode: isLocalReplay ? "local" : "networked",
    serverUrl: DEFAULT_SERVER_URL,
    roomId: connection.roomId,
    playerIndex: connection.playerIndex,
    playerName: connection.playerName.trim() || "Player",
    enabled: !isLocalReplay && connection.joined,
    initialGame: activeScenario?.game,
    initialRules: activeScenario?.rules,
    initialHouseRules: activeScenario?.houseRules,
    pauseLocalAI: isLocalReplay && activeCoachLesson !== null,
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
    leaveRoom,
    readyNextHand,
    aiTakeoverSeat,
    playerIndex: assignedPlayerIndex,
  } = gameHook;
  const SELF =
    assignedPlayerIndex >= 0
      ? assignedPlayerIndex
      : (connection.playerIndex ?? 0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!connection.joined) {
      window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
      return;
    }
    if (assignedPlayerIndex < 0) return;
    const snapshot: SavedSession = {
      playMode,
      roomId: connection.roomId,
      playerIndex: assignedPlayerIndex,
      playerName: connection.playerName,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(snapshot));
  }, [assignedPlayerIndex, connection, playMode]);
  const leftSeat = (SELF + 3) % 4;
  const topSeat = (SELF + 2) % 4;
  const rightSeat = (SELF + 1) % 4;
  const seatName = (index: number) => {
    if (index === SELF) return "You";
    const player = game?.players[index];
    if (!player) return "";
    const raw = player.name?.trim();
    if (!raw || raw.toLowerCase() === "you") return player.wind;
    return raw;
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activityHistoryOpen, setActivityHistoryOpen] = useState(false);
  const [mobileActivityExpanded, setMobileActivityExpanded] = useState(true);
  const [inspectedSeat, setInspectedSeat] = useState<number | undefined>();
  const [choosingChi, setChoosingChi] = useState(false);
  const [choosingKong, setChoosingKong] = useState(false);
  const [selectedKongCode, setSelectedKongCode] = useState<
    string | undefined
  >();
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SOUND_SETTING_KEY) !== "false";
  });
  const previousTurnWasMine = useRef(false);
  const previousActionSeq = useRef<number | undefined>(undefined);
  const previousSoundRound = useRef<number | undefined>(undefined);
  const audioUnlocked = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousPresentationGame = useRef<Game | undefined>(undefined);
  const latestAnalyticsGame = useRef<Game | undefined>(undefined);
  const analyticsSessionKey = useRef<string | undefined>(undefined);
  const analyticsSessionStartedAt = useRef<number | undefined>(undefined);
  const analyticsHandKey = useRef<string | undefined>(undefined);
  const analyticsHandStartedAt = useRef<number | undefined>(undefined);
  const completedAnalyticsHandKey = useRef<string | undefined>(undefined);
  const winModalRef = useRef<HTMLElement | null>(null);
  const [tileFlight, setTileFlight] = useState<TileFlight | undefined>();
  const [showWinModal, setShowWinModal] = useState(false);
  const [winStage, setWinStage] = useState<0 | 1 | 2>(0);
  const [winReviewOpen, setWinReviewOpen] = useState(false);
  const [reviewWinnerIndex, setReviewWinnerIndex] = useState(0);
  const [scoreDeltas, setScoreDeltas] = useState<number[]>([0, 0, 0, 0]);
  const [animatedWinTotal, setAnimatedWinTotal] = useState(0);

  latestAnalyticsGame.current = game ?? undefined;

  const analyticsContext = () => ({
    game_mode: playMode,
    device_format: analyticsDeviceFormat(),
    round_number: game?.round ?? 0,
    dealer_streak: game?.dealerStreak ?? 0,
  });

  const getAudioContext = () => {
    if (!soundEnabled || !audioUnlocked.current) return null;
    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioContextClass) return null;
      audioContextRef.current = new AudioContextClass();
    }
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  const playGameSound = (sound: GameSound) => {
    const context = getAudioContext();
    if (context) playSynthSound(context, sound);
  };

  useEffect(() => {
    const unlockAudio = () => {
      audioUnlocked.current = true;
      getAudioContext();
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [soundEnabled]);

  useEffect(() => {
    window.localStorage.setItem(SOUND_SETTING_KEY, String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    if (!analyticsEnabled || !connection.joined || !game) {
      if (!connection.joined) {
        analyticsSessionKey.current = undefined;
        analyticsSessionStartedAt.current = undefined;
        analyticsHandKey.current = undefined;
        analyticsHandStartedAt.current = undefined;
        completedAnalyticsHandKey.current = undefined;
      }
      return;
    }

    const sessionKey = `${playMode}:${game.tableId}:${SELF}`;
    if (analyticsSessionKey.current === sessionKey) return;
    analyticsSessionKey.current = sessionKey;
    analyticsSessionStartedAt.current = Date.now();
    trackAnalyticsEvent("game_started", {
      ...analyticsContext(),
      human_player_count: game.players.filter(
        (player) => player.controller === "human",
      ).length,
    });
  }, [analyticsEnabled, connection.joined, game?.tableId, playMode, SELF]);

  useEffect(() => {
    if (!analyticsEnabled || !connection.joined || !game) return;

    const handKey = `${game.tableId}:${game.round}:${game.dealerStreak}`;
    if (analyticsHandKey.current !== handKey) {
      analyticsHandKey.current = handKey;
      analyticsHandStartedAt.current = Date.now();
      completedAnalyticsHandKey.current = undefined;
      trackAnalyticsEvent("hand_started", analyticsContext());
    }

    if (
      !game.winSummary ||
      completedAnalyticsHandKey.current === handKey
    ) {
      return;
    }

    completedAnalyticsHandKey.current = handKey;
    const analyticsWinners =
      game.winners ??
      (game.winSummary.winner === undefined ? [] : [game.winSummary.winner]);
    const selfSummary = game.winSummaries?.find(
      (summary) => summary.winner === SELF,
    );
    const result =
      game.winSummary.winner === undefined
        ? "draw"
        : analyticsWinners.includes(SELF)
          ? "win"
          : "loss";
    trackAnalyticsEvent("hand_completed", {
      ...analyticsContext(),
      result,
      win_method:
        game.winSummary.winner === undefined
          ? "draw"
          : /self-draw/i.test(game.winSummary.detail)
            ? "self_draw"
            : "discard",
      winner_count: analyticsWinners.length,
      points: selfSummary?.points ?? game.winSummary.points,
      total_payment: selfSummary?.total ?? game.winSummary.total,
      duration_seconds: Math.max(
        0,
        Math.round(
          (Date.now() - (analyticsHandStartedAt.current ?? Date.now())) / 1000,
        ),
      ),
    });
  }, [
    analyticsEnabled,
    connection.joined,
    game?.tableId,
    game?.round,
    game?.dealerStreak,
    game?.winSummary,
    playMode,
    SELF,
  ]);

  const coachHuman = game?.players[SELF];
  const coachCanSelfHu = Boolean(
    game &&
      coachHuman &&
      game.phase === "discard" &&
      game.turn === SELF &&
      isWinningHand(coachHuman.hand, coachHuman.melds.length),
  );
  const coachHumanKongs = coachHuman
    ? [
        ...new Set([
          ...concealedKongOptions(coachHuman.hand),
          ...addedKongOptions(coachHuman),
        ]),
      ]
    : [];
  const coachHumanIsWaiting = Boolean(
    game &&
      coachHuman &&
      game.phase === "discard" &&
      game.turn !== SELF &&
      waitCodesForHand(coachHuman.hand, coachHuman.melds.length).length > 0,
  );
  const coachIsSelfDiscardTurn =
    game?.phase === "discard" && game.turn === SELF;

  useEffect(() => {
    if (
      guidanceMode === "off" ||
      !coachViewportSupported ||
      !connection.joined ||
      !game ||
      !coachHuman ||
      game.phase === "round-over"
    ) {
      if (activeCoachLesson) setActiveCoachLesson(null);
      if (coachFocusTarget) setCoachFocusTarget(null);
      return;
    }

    const lessons: CoachLesson[] = [];
    const addLesson = (lesson: CoachLesson) => lessons.push(lesson);
    const rulesEyebrow = "Rules guide" as const;

    if (coachCanSelfHu) {
      addLesson({
        id: "rules-self-hu",
        eyebrow: rulesEyebrow,
        title: "Your hand is complete",
        body: "You drew the winning tile. Select Hu to finish the hand and collect payment from all three players.",
        target: "hu",
        learnTopic: "hu",
      });
    } else if (
      game.phase === "claim" &&
      game.pendingClaim?.claimer === SELF &&
      game.pendingClaim.canHu
    ) {
      addLesson({
        id: "rules-discard-hu",
        eyebrow: rulesEyebrow,
        title: "You can declare Hu",
        body: "This discard completes your hand. Hu has priority over every other claim, and payment comes from the discarding player.",
        target: "hu",
        learnTopic: "hu",
      });
    } else if (
      game.phase === "claim" &&
      game.pendingClaim?.claimer === SELF &&
      game.pendingClaim.canKong
    ) {
      addLesson({
        id: "rules-claim-gong",
        eyebrow: rulesEyebrow,
        title: "You can claim a Gong",
        body: "Claim the discard to reveal four matching tiles, then draw a replacement tile before discarding.",
        target: "gong",
        learnTopic: "gong",
      });
    } else if (
      game.phase === "claim" &&
      game.pendingClaim?.claimer === SELF &&
      game.pendingClaim.canPong
    ) {
      addLesson({
        id: "rules-pong",
        eyebrow: rulesEyebrow,
        title: "You can Pong",
        body: "A Pong uses this discard with two matching tiles from your hand. Any player may Pong, and the set is revealed.",
        target: "pong",
        learnTopic: "pong",
      });
    } else if (
      game.phase === "claim" &&
      game.pendingClaim?.claimer === SELF &&
      game.pendingClaim.canChi
    ) {
      addLesson({
        id: "rules-chi",
        eyebrow: rulesEyebrow,
        title: "You can Chi",
        body: "A Chi makes a three-tile sequence. You may only Chi the discard from the player immediately before you.",
        target: "chi",
        learnTopic: "chi",
      });
    }

    if (
      coachHumanKongs.length > 0 &&
      game.phase === "discard" &&
      game.turn === SELF
    ) {
      addLesson({
        id: "rules-hand-gong",
        eyebrow: rulesEyebrow,
        title: "A Gong is available",
        body: "You hold four matching tiles. Choose Gong, then decide whether to keep it concealed or reveal it before drawing a replacement.",
        target: "gong",
        learnTopic: "gong",
      });
    }

    if (coachIsSelfDiscardTurn && guidanceMode === "strategy") {
      const recommendation = recommendDiscard(
        coachHuman.hand,
        coachHuman.melds.length,
        [
          ...coachHuman.hand,
          ...game.players.flatMap((player) => [
            ...player.discards,
            ...player.flowers,
            ...player.melds.flatMap((meld) => meld.tiles),
          ]),
        ],
      );
      if (recommendation) {
        addLesson({
          id: `strategy-discard-${game.tableId}-${game.round}-${game.dealer}-${game.dealerStreak}`,
          eyebrow: "Strategy coach",
          title: `Consider discarding ${recommendation.tile.label}`,
          body: recommendation.reason,
          target: "suggested-tile",
          tileId: recommendation.tile.id,
          details: [
            recommendation.plan,
            recommendation.impact,
            recommendation.visibilityNote,
          ],
          alternatives: recommendation.alternatives.map((alternative) => ({
            tileId: alternative.tile.id,
            label: alternative.tile.label,
            reason: alternative.reason,
          })),
          learnTopic: "turn",
        });
      }
    }

    addLesson({
      id: "rules-goal",
      eyebrow: rulesEyebrow,
      title: "Build five sets and a pair",
      body: "A Taiwanese Mahjong hand normally wins with 17 tiles: five sets of three tiles plus one pair. A Gong uses four matching tiles and includes a replacement draw.",
      learnTopic: "objective",
    });

    if (coachHuman.flowers.length > 0) {
      addLesson({
        id: "rules-flowers",
        eyebrow: rulesEyebrow,
        title: "Flowers are bonus tiles",
        body: "Flowers are displayed outside your hand and replaced immediately. Matching flowers and complete flower groups can add points.",
      });
    }

    if (coachHumanIsWaiting) {
      addLesson({
        id: "rules-waiting",
        eyebrow: rulesEyebrow,
        title: "Your hand is waiting",
        body: "After your last discard, one or more tiles can now complete your hand. The red outlines show the groups those winning tiles support.",
      });
    }

    const availableLessons = lessons.filter(
      (lesson) =>
        !seenCoachLessons.has(lesson.id) && !hiddenCoachLessons.has(lesson.id),
    );
    if (
      activeCoachLesson &&
      availableLessons.some((lesson) => lesson.id === activeCoachLesson.id)
    ) {
      return;
    }

    setCoachFocusTarget(null);
    setActiveCoachLesson(availableLessons[0] ?? null);
  }, [
    SELF,
    activeCoachLesson,
    coachCanSelfHu,
    coachHuman,
    coachHumanIsWaiting,
    coachHumanKongs,
    coachIsSelfDiscardTurn,
    coachFocusTarget,
    coachViewportSupported,
    connection.joined,
    game,
    guidanceMode,
    hiddenCoachLessons,
    seenCoachLessons,
  ]);

  const dismissCoachLesson = (hidePermanently = false) => {
    if (!activeCoachLesson) return;
    const lessonId = activeCoachLesson.id;
    setSeenCoachLessons((current) => new Set(current).add(lessonId));
    if (hidePermanently) {
      setHiddenCoachLessons((current) => {
        const next = new Set(current).add(lessonId);
        window.localStorage.setItem(
          HIDDEN_LESSONS_KEY,
          JSON.stringify([...next]),
        );
        return next;
      });
    }
    setActiveCoachLesson(null);
    setCoachFocusTarget(null);
    setCoachDetailsOpen(false);
  };

  const showCoachTarget = () => {
    if (!activeCoachLesson?.target) return;
    setCoachFocusTarget(activeCoachLesson.target);
    if (activeCoachLesson.tileId) {
      setUiSelectedTileId(activeCoachLesson.tileId);
      selectTile(activeCoachLesson.tileId);
    }
  };

  useEffect(() => {
    setCoachDetailsOpen(false);
  }, [activeCoachLesson?.id]);

  useEffect(() => {
    if (!analyticsEnabled || !connection.joined || !game?.tableId) return;
    const heartbeat = window.setInterval(() => {
      const current = latestAnalyticsGame.current;
      if (!current || current.phase === "round-over") return;
      if (document.visibilityState !== "visible") return;
      trackAnalyticsEvent("game_heartbeat", {
        game_mode: playMode,
        device_format: analyticsDeviceFormat(),
        round_number: current.round,
        dealer_streak: current.dealerStreak,
        active_seconds: Math.max(
          0,
          Math.round(
            (Date.now() -
              (analyticsSessionStartedAt.current ?? Date.now())) /
              1000,
          ),
        ),
      });
    }, 60_000);
    return () => window.clearInterval(heartbeat);
  }, [analyticsEnabled, connection.joined, game?.tableId, playMode]);

  useEffect(() => {
    const latestAction = game?.actionLog.at(-1);
    if (!latestAction) return;
    if (
      previousActionSeq.current === undefined ||
      previousSoundRound.current !== game?.round
    ) {
      previousActionSeq.current = latestAction.seq;
      previousSoundRound.current = game?.round;
      return;
    }
    if (latestAction.seq <= previousActionSeq.current) return;
    previousActionSeq.current = latestAction.seq;
    if (latestAction.type === "discard") playGameSound("discard");
    if (latestAction.type === "kong") playGameSound("gong");
    if (latestAction.type === "score-round") playGameSound("hu");
    if (latestAction.type === "claim") {
      if (/gong/i.test(latestAction.description)) playGameSound("gong");
      else if (/pong/i.test(latestAction.description)) playGameSound("pong");
      else if (/chi/i.test(latestAction.description)) playGameSound("chi");
    }
  }, [game?.actionSeq, game?.round, soundEnabled]);

  useEffect(() => {
    const previous = previousPresentationGame.current;
    previousPresentationGame.current = game ?? undefined;
    if (!game) return;

    const reduceMotion = prefersReducedMotion();
    const timers: number[] = [];
    const schedule = (callback: () => void, delay: number) => {
      timers.push(window.setTimeout(callback, delay));
    };

    if (game.winSummary && !previous?.winSummary) {
      setWinReviewOpen(false);
      setReviewWinnerIndex(0);
      setScoreDeltas(
        game.players.map(
          (player, index) =>
            player.score - (previous?.players[index]?.score ?? player.score),
        ),
      );
      setAnimatedWinTotal(0);
      if (reduceMotion) {
        setShowWinModal(true);
        setWinStage(2);
      } else {
        setShowWinModal(false);
        setWinStage(0);
        schedule(() => setShowWinModal(true), 420);
        schedule(() => setWinStage(1), 920);
        schedule(() => setWinStage(2), 1420);
      }
    } else if (!game.winSummary) {
      setShowWinModal(false);
      setWinStage(0);
      setWinReviewOpen(false);
      setReviewWinnerIndex(0);
      setScoreDeltas([0, 0, 0, 0]);
      setAnimatedWinTotal(0);
    }

    if (
      !previous ||
      game.actionSeq <= previous.actionSeq ||
      game.round !== previous.round
    ) {
      return () => timers.forEach((timer) => window.clearTimeout(timer));
    }

    const newActions = game.actionLog.filter(
      (action) => action.seq > previous.actionSeq,
    );
    const claimAction = [...newActions]
      .reverse()
      .find((action) => action.type === "claim");
    const discardAction = [...newActions]
      .reverse()
      .find((action) => action.type === "discard");
    const gongAction = [...newActions]
      .reverse()
      .find((action) => action.type === "kong");

    let nextFlight: TileFlight | undefined;
    if (claimAction) {
      const claimed = claimedTileBetween(previous, game, claimAction.actor);
      if (claimed) {
        nextFlight = {
          id: `claim-${claimAction.seq}-${claimed.tile.id}`,
          tile: claimed.tile,
          kind: "claim",
          from: claimed.from,
          to: claimAction.actor,
        };
      }
    } else if (discardAction) {
      const winningTileId = game.winSummary?.winningTileId;
      const tile =
        game.lastDiscard?.tile ??
        game.activity?.tile ??
        game.players
          .flatMap((player) => player.hand)
          .find((candidate) => candidate.id === winningTileId);
      if (tile) {
        nextFlight = {
          id: `discard-${discardAction.seq}-${tile.id}`,
          tile,
          kind: "discard",
          from: discardAction.actor,
        };
      }
    } else if (gongAction) {
      const previousMeldIds = new Set(
        previous.players[gongAction.actor]?.melds.flatMap((meld) =>
          meld.tiles.map((tile) => tile.id),
        ) ?? [],
      );
      const tile = game.players[gongAction.actor]?.melds
        .flatMap((meld) => meld.tiles)
        .find((candidate) => !previousMeldIds.has(candidate.id));
      if (tile) {
        nextFlight = {
          id: `reveal-${gongAction.seq}-${tile.id}`,
          tile,
          kind: "reveal",
          from: gongAction.actor,
          to: gongAction.actor,
        };
      }
    }

    if (nextFlight && !reduceMotion) {
      setTileFlight(nextFlight);
      schedule(() => setTileFlight(undefined), 560);
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [game?.actionSeq, game?.round, Boolean(game?.winSummary)]);

  useEffect(() => {
    if (!showWinModal) return;
    const frame = window.requestAnimationFrame(() =>
      winModalRef.current?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [showWinModal]);

  useEffect(() => {
    if (!game?.winSummary || winStage < 2) {
      setAnimatedWinTotal(0);
      return;
    }
    const target = game.winSummary.total;
    if (target <= 0 || prefersReducedMotion()) {
      setAnimatedWinTotal(target);
      return;
    }

    const startedAt = window.performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 620);
      const eased = 1 - (1 - progress) ** 3;
      setAnimatedWinTotal(Math.round(target * eased));
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [game?.winSummary?.total, winStage]);

  useEffect(() => {
    const turnIsMine = Boolean(
      game &&
      game.phase !== "round-over" &&
      ((game.phase === "discard" && game.turn === SELF) ||
        (game.phase === "claim" && game.pendingClaim?.claimer === SELF)),
    );
    if (
      turnIsMine &&
      !previousTurnWasMine.current &&
      audioUnlocked.current &&
      soundEnabled
    ) {
      playGameSound("turn");
      navigator.vibrate?.([100, 45, 130]);
    }
    previousTurnWasMine.current = turnIsMine;
  }, [
    game?.phase,
    game?.turn,
    game?.pendingClaim?.claimer,
    SELF,
    soundEnabled,
  ]);
  const [uiSelectedTileId, setUiSelectedTileId] = useState<string | undefined>(
    undefined,
  );
  const human = game?.players[SELF];
  const humanName = human?.name.trim();
  const soloHumanName =
    humanName && humanName.toLowerCase() !== "you"
      ? humanName
      : connection.playerName.trim() || "Player";
  const humanDisplayName =
    playMode === "solo" ? soloHumanName : `${humanName || "You"} (You)`;
  const humanHandDensity =
    (human?.hand.length ?? 17) >= 16
      ? "human-hand-density-compact"
      : (human?.hand.length ?? 17) >= 13
        ? "human-hand-density-standard"
        : "human-hand-density-roomy";

  useEffect(() => {
    const requestedName = connection.playerName.trim();
    if (
      playMode !== "solo" ||
      !connection.joined ||
      activeScenario ||
      !requestedName ||
      !human ||
      human.name.trim().toLowerCase() !== "you"
    ) {
      return;
    }
    updatePlayerName(SELF, requestedName);
  }, [
    SELF,
    activeScenario,
    connection.joined,
    connection.playerName,
    human,
    playMode,
    updatePlayerName,
  ]);

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
  const roundWinSummaries = game?.winSummaries?.length
    ? game.winSummaries
    : game?.winSummary
      ? [game.winSummary]
      : [];
  const activeWinSummary =
    roundWinSummaries[Math.min(reviewWinnerIndex, roundWinSummaries.length - 1)] ??
    game?.winSummary;
  const winningPlayer =
    activeWinSummary?.winner === undefined
      ? undefined
      : game?.players[activeWinSummary.winner];
  const winningTile = activeWinSummary?.winningTileId
    ? [
        ...(winningPlayer?.hand ?? []),
        ...(winningPlayer?.melds.flatMap((meld) => meld.tiles) ?? []),
        ...(winningPlayer?.flowers ?? []),
        ...(game?.lastDiscard ? [game.lastDiscard.tile] : []),
      ].find((tile) => tile.id === activeWinSummary?.winningTileId)
    : undefined;
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
  const focusedActivityTile = isSelfClaimTurn
    ? game?.pendingClaim?.tile
    : activity.tile;
  const activityIsTurnCall = /is taking a turn\.?$/i.test(activity.text);
  const activityIndicatesSelfAction =
    activity.player === SELF &&
    /(choose a discard|is taking a turn|your turn)/i.test(activity.text);
  const showYourTurnInCenter =
    isSelfDiscardTurn || isSelfClaimTurn || activityIndicatesSelfAction;
  const rawActivityText = isSelfDiscardTurn
    ? "Your turn"
    : isSelfClaimTurn
      ? "Your turn: choose an action"
      : activityIsTurnCall && activity.player === SELF
        ? "Your turn"
        : playMode === "online" &&
            currentPhase === "claim" &&
            currentClaimer !== undefined
          ? `${seatName(currentClaimer)} is waiting to discard.`
          : activity.text;
  const activityDealer = game?.dealer;
  const activityText =
    playMode === "online" &&
    activityDealer !== undefined &&
    activityDealer !== SELF &&
    /you are dealer/i.test(rawActivityText)
      ? `${seatName(activityDealer)} is Dealer. The hand begins.`
      : rawActivityText;
  const centerStatusLabel =
    !activity.tile && showYourTurnInCenter
      ? isSelfClaimTurn
        ? "Action required"
        : "Your turn"
      : activity.tile
        ? `${seatName(activity.player)}'s discard`
        : "Table activity";
  const activityNoticeTone = showYourTurnInCenter
    ? "action"
    : /(point|score|bonus|wins?|collected all eight flowers)/i.test(
          activityText,
        )
      ? "score"
      : currentPhase === "claim"
        ? "decision"
        : "info";

  useEffect(() => {
    const requiresAttention = isSelfDiscardTurn || isSelfClaimTurn;
    setMobileActivityExpanded(true);
    if (requiresAttention) return;

    const timer = window.setTimeout(() => {
      setMobileActivityExpanded(false);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [
    game?.actionSeq,
    game?.round,
    isSelfDiscardTurn,
    isSelfClaimTurn,
  ]);

  const ruleRows = useMemo(() => [["Base win", "baseWin"]] as const, []);
  const activeRuleCount = houseRules.filter((rule) => rule.enabled).length;

  const [houseDraft, setHouseDraft] = useState({
    name: "",
    description: "",
    points: 1,
  });

  const createBugReport = async () => {
    if (!game) return;
    const snapshot = createScenarioSnapshot(
      game,
      rules,
      houseRules,
      `Bug report ${new Date().toLocaleString()}`,
      {
        mode: connection.joined ? "networked" : "local",
        roomId: connection.roomId,
        playerIndex: connection.playerIndex,
        playerName: connection.playerName.trim() || "Player",
        notes: "Prepared for Trello integration",
      },
    );
    saveScenarioSnapshot(snapshot);
    setActiveScenario(snapshot);

    let screenshotDataUrl: string | undefined;
    try {
      const screenshotTarget = document.querySelector(
        ".table",
      ) as HTMLElement | null;
      const canvas = await html2canvas(screenshotTarget ?? document.body, {
        backgroundColor: "#0f172a",
        logging: false,
        scale: 1.5,
        useCORS: true,
      });
      screenshotDataUrl = canvas.toDataURL("image/png");
    } catch {
      screenshotDataUrl = undefined;
    }

    const reportPayload = {
      title: `Bug report: ${snapshot.label}`,
      description: [
        "Automated gameplay scenario export",
        "",
        "The attached JSON contains the game state and action history needed to replay this issue.",
      ].join("\n"),
      snapshot,
      screenshot: screenshotDataUrl,
      metadata: {
        createdAt: snapshot.createdAt,
        mode: snapshot.metadata.mode,
        roomId: snapshot.metadata.roomId,
        playerIndex: snapshot.metadata.playerIndex,
        playerName: snapshot.metadata.playerName,
      },
    };

    try {
      const response = await fetch("/api/bug-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reportPayload),
      });
      const text = await response.text();
      let data: {
        ok?: boolean;
        cardUrl?: string;
        message?: string;
        cardId?: string;
      } | null = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      if (response.ok && data?.ok && data.cardUrl) {
        window.open(data.cardUrl, "_blank", "noopener,noreferrer");
        setScenarioFeedback(`Created Trello card. Opened ${data.cardUrl}.`);
        return;
      }

      const fallbackMessage =
        data?.message ?? (text || "Trello request failed");
      throw new Error(fallbackMessage);
    } catch (error) {
      const serialized = JSON.stringify(reportPayload, null, 2);
      const blob = new Blob([serialized], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${snapshot.id}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
      setScenarioFeedback(
        error instanceof Error
          ? error.message
          : "Unable to create Trello card. JSON downloaded instead.",
      );
    }
  };

  const exportCurrentScenario = () => {
    if (!game) return;
    const snapshot = createScenarioSnapshot(
      game,
      rules,
      houseRules,
      `Export ${new Date().toLocaleString()}`,
      {
        mode: connection.joined ? "networked" : "local",
        roomId: connection.roomId,
        playerIndex: connection.playerIndex,
        playerName: connection.playerName.trim() || "Player",
      },
    );
    const serialized = JSON.stringify(snapshot, null, 2);
    const blob = new Blob([serialized], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${snapshot.id}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
    setScenarioFeedback(`Exported ${snapshot.label} as JSON.`);
  };

  const importScenarioFromFile = async (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ScenarioSnapshot> & {
        snapshot?: Partial<ScenarioSnapshot>;
        metadata?: Partial<ScenarioSnapshot["metadata"]>;
        title?: string;
        description?: string;
      };

      const snapshotCandidate = parsed.snapshot?.game
        ? (parsed.snapshot as ScenarioSnapshot)
        : parsed.game
          ? (parsed as ScenarioSnapshot)
          : null;

      if (!snapshotCandidate?.game) {
        throw new Error("Invalid snapshot format");
      }

      const restored = restoreScenarioSnapshot({
        ...snapshotCandidate,
        label: snapshotCandidate.label || parsed.title || "Imported scenario",
        metadata: {
          ...(snapshotCandidate.metadata ?? {}),
          ...(parsed.metadata ?? {}),
          mode:
            snapshotCandidate.metadata?.mode ??
            parsed.metadata?.mode ??
            "local",
        },
      });

      saveScenarioSnapshot(restored);
      setActiveScenario(restored);
      setConnection((current) => ({
        ...current,
        joined: true,
        roomId: restored.metadata.roomId ?? current.roomId,
        playerIndex: restored.metadata.playerIndex ?? current.playerIndex,
        playerName: restored.metadata.playerName || current.playerName,
      }));
      setPlayMode(restored.metadata.mode === "networked" ? "online" : "solo");
      setScenarioFeedback(`Imported ${restored.label}`);
    } catch {
      setScenarioFeedback("Could not import scenario JSON.");
    } finally {
      event.target.value = "";
    }
  };

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
      ws.send(
        JSON.stringify({
          type: "request-room-list",
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
          rooms?: Array<{
            roomId: string;
            occupiedSeats: number[];
            playerCount: number;
            isFull: boolean;
          }>;
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
        if (msg.type === "room-list-update" && Array.isArray(msg.rooms)) {
          setRoomList(
            msg.rooms
              .map((room) => ({
                ...room,
                occupiedSeats: Array.isArray(room.occupiedSeats)
                  ? room.occupiedSeats.filter((seat) => seat >= 0 && seat <= 3)
                  : [],
              }))
              .sort((a, b) => a.roomId.localeCompare(b.roomId)),
          );
        }
      } catch {
        // Ignore malformed payloads.
      }
    };

    ws.onerror = () => {
      setLobbySeatError("Could not check room availability.");
    };

    return () => {
      window.clearInterval(pollTimer);
      if (ws.readyState === 0 || ws.readyState === 1) ws.close();
    };
  }, [connection.joined, connection.roomId]);

  useEffect(() => {
    if (connection.joined) return;
    if (!occupiedSeats.includes(connection.playerIndex)) return;
    if (playMode !== "online") return;

    const firstOpenSeat = [0, 1, 2, 3].find(
      (seat) => !occupiedSeats.includes(seat),
    );
    if (firstOpenSeat !== undefined) {
      setConnection((current) => ({ ...current, playerIndex: firstOpenSeat }));
    }
  }, [connection.joined, connection.playerIndex, occupiedSeats, playMode]);

  const seatOptions = [
    { value: 0, label: "East (seat 0)" },
    { value: 1, label: "South (seat 1)" },
    { value: 2, label: "West (seat 2)" },
    { value: 3, label: "North (seat 3)" },
  ].filter((option) => {
    if (playMode !== "online") return true;
    return !occupiedSeats.includes(option.value);
  });

  const availableSeatOptions =
    seatOptions.length > 0
      ? seatOptions
      : [
          {
            value: connection.playerIndex,
            label: `Seat ${connection.playerIndex + 1}`,
          },
        ];

  const joinOnlineRoom = (nextRoomId?: string) => {
    const roomId = (nextRoomId ?? connection.roomId).trim();
    if (!connection.playerName.trim()) {
      setLobbySeatError("Name required before joining or creating a room.");
      return;
    }
    if (!roomId) {
      setLobbySeatError("Room ID required.");
      return;
    }

    const roomInfo = roomList.find(
      (room) => room.roomId.trim().toLowerCase() === roomId.toLowerCase(),
    );
    if (roomInfo?.isFull) {
      setLobbySeatError("All seats in this room are currently occupied.");
      return;
    }

    const nextSeat = roomInfo
      ? ([0, 1, 2, 3].find((seat) => !roomInfo.occupiedSeats.includes(seat)) ??
        0)
      : 0;

    setLobbySeatError(null);
    setActiveCoachLesson(null);
    setCoachFocusTarget(null);
    setSeenCoachLessons(new Set());
    setActiveScenario(null);
    setScenarioFeedback(null);
    setConnection((current) => ({
      ...current,
      roomId,
      playerIndex: nextSeat,
      joined: true,
    }));
  };

  const hasOtherHumanPlayers = Boolean(
    game?.players.some(
      (player, index) => index !== SELF && player.controller === "human",
    ),
  );
  const shouldConfirmLeave =
    playMode === "solo" ||
    (playMode === "online" && connection.joined && !hasOtherHumanPlayers);

  const leaveCurrentGame = () => {
    if (shouldConfirmLeave) {
      const message =
        playMode === "solo"
          ? "Leaving this game will lose your current progress. Continue?"
          : "You are the last human in this room. Leaving will reset the room and you’ll lose your current progress. Continue?";
      if (!window.confirm(message)) {
        return;
      }
    }

    if (playMode === "online" && connection.joined) {
      leaveRoom();
    }
    setSettingsOpen(false);
    setInspectedSeat(undefined);
    setChoosingChi(false);
    setChoosingKong(false);
    setSelectedKongCode(undefined);
    setUiSelectedTileId(undefined);
    setActiveScenario(null);
    setScenarioFeedback(null);
    setConnection((current) => ({ ...current, joined: false }));
  };

  if (!connection.joined) {
    return (
      <main className="app-shell">
        <header className="topbar">
          <h1>Table One Mahjong</h1>
          <div className="round-status">
            <span>Multiplayer</span>
            <strong>Choose a room to join</strong>
          </div>
          {accountControls}
        </header>
        <section className="game-layout lobby-layout">
          <div className="lobby-entry-stack">
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
                  if (guidanceMode === "strategy") {
                    changeGuidanceMode("off");
                  }
                  setConnection((current) => ({
                    ...current,
                    roomId: "table-one",
                    playerIndex: 0,
                  }));
                }}
              >
                Shared room
              </button>
            </div>
            <div className="join-fields">
              <label className="lobby-name-field">
                <span>{auth.user ? "Account display name" : "Your name"}</span>
                <input
                  autoComplete="nickname"
                  maxLength={18}
                  placeholder={
                    auth.user ? "From your account" : "Enter your name"
                  }
                  readOnly={Boolean(auth.user)}
                  type="text"
                  value={auth.user ? signedInPlayerName : connection.playerName}
                  onChange={(event) =>
                    auth.user
                      ? undefined
                      : setConnection((current) => ({
                          ...current,
                          playerName: event.target.value,
                        }))
                  }
                />
              </label>
              <div className="seat-assignment-summary">
                <span>Your seat</span>
                <strong>
                  {playMode === "solo"
                    ? "East · 3 AI opponents"
                    : "Assigned randomly"}
                </strong>
              </div>
              <div className="guidance-picker">
                <label className="strategy-coach-toggle">
                  <span className="strategy-coach-copy">
                    <strong>Strategy Coach</strong>
                    <small>
                      {playMode === "online"
                        ? "Available in Solo vs AI"
                        : !coachViewportSupported
                          ? "Requires a larger screen"
                        : guidanceMode === "strategy"
                          ? "On"
                          : "Off"}
                    </small>
                  </span>
                  <span className="toggle-switch">
                    <input
                      aria-label="Strategy Coach"
                      role="switch"
                      type="checkbox"
                      checked={guidanceMode === "strategy"}
                      disabled={
                        playMode === "online" || !coachViewportSupported
                      }
                      onChange={(event) =>
                        changeGuidanceMode(
                          event.target.checked ? "strategy" : "off",
                        )
                      }
                    />
                    <span aria-hidden="true" />
                  </span>
                </label>
                <p>
                  Explains relevant rules and offers suggestions. Available on
                  laptop and desktop screens.
                </p>
              </div>
              {playMode === "online" ? (
                <>
                  <div
                    className="online-room-row"
                    style={{ gridColumn: "span 2" }}
                  >
                    <label>
                      <span>Room ID</span>
                      <input
                        type="text"
                        value={connection.roomId}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            joinOnlineRoom();
                          }
                        }}
                        onChange={(event) =>
                          setConnection((current) => ({
                            ...current,
                            roomId: event.target.value.replace(/\s+/g, "-"),
                          }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={!connection.roomId.trim()}
                      onClick={() => {
                        if (!connection.playerName.trim()) {
                          setLobbySeatError(
                            "Name required before joining or creating a room.",
                          );
                          return;
                        }

                        const roomId = connection.roomId.trim();
                        const exists = roomList.some(
                          (room) =>
                            room.roomId.trim().toLowerCase() ===
                            roomId.toLowerCase(),
                        );

                        if (exists) {
                          setLobbySeatError(
                            `Room "${roomId}" already exists. Join it instead or choose another room ID.`,
                          );
                          return;
                        }

                        setConnection((current) => ({
                          ...current,
                          roomId,
                          playerIndex: 0,
                        }));
                        joinOnlineRoom(roomId);
                      }}
                    >
                      Create room
                    </button>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.74rem",
                          fontWeight: 800,
                          color: "#666",
                        }}
                      >
                        Available rooms
                      </span>
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {roomList.length > 0 ? (
                        roomList.map((room) => (
                          <button
                            key={room.roomId}
                            type="button"
                            className="secondary-button"
                            style={{
                              justifyContent: "space-between",
                              width: "100%",
                              textAlign: "left",
                              opacity: room.isFull ? 0.65 : 1,
                              cursor: room.isFull ? "pointer" : "pointer",
                            }}
                            onClick={() => joinOnlineRoom(room.roomId)}
                          >
                            <span>{room.roomId}</span>
                            <span
                              style={{
                                fontSize: "0.8rem",
                                color: room.isFull ? "#b74b38" : "#4b5a4a",
                              }}
                            >
                              {room.playerCount}/4 seats
                            </span>
                          </button>
                        ))
                      ) : (
                        <div style={{ color: "#666", fontSize: "0.85rem" }}>
                          No active rooms right now. Create one to invite
                          friends.
                        </div>
                      )}
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.9rem", color: "#666" }}>
                    Press Enter or choose a room above to join.
                  </p>
                </>
              ) : null}
            </div>
            {playMode === "online" && lobbySeatError ? (
              <p style={{ fontSize: "0.9rem", color: "#a33" }}>
                {lobbySeatError}
              </p>
            ) : null}
            {playMode === "solo" ? (
              <button
                className="full-width-button"
                type="button"
                disabled={!connection.playerName.trim()}
                onClick={() => {
                  setActiveScenario(null);
                  setScenarioFeedback(null);
                  setActiveCoachLesson(null);
                  setCoachFocusTarget(null);
                  setSeenCoachLessons(new Set());
                  setConnection((current) => ({ ...current, joined: true }));
                }}
              >
                Start game
              </button>
            ) : null}
          </div>
          <button
            className="lobby-learn-link"
            type="button"
            onClick={onOpenLearn}
          >
            Learn how Taiwanese Mahjong works
          </button>
          </div>
        </section>
        {authOpen ? (
          <AuthScreen
            auth={auth}
            initialMode={authInitialMode}
            onClose={() => setAuthOpen(false)}
          />
        ) : null}
      </main>
    );
  }

  // Guard for networked mode (game may be null while connecting)
  if (!game || !human) {
    console.log("[App] Rendering loading fallback", {
      activeScenario: Boolean(activeScenario),
      joined: connection.joined,
      playMode,
      hasGame: Boolean(game),
      hasHuman: Boolean(human),
      playerIndex: connection.playerIndex,
      roomId: connection.roomId,
      gameHookConnected: gameHook.isConnected,
      error: gameHook.error,
    });
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
          {accountControls}
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
        {authOpen ? (
          <AuthScreen
            auth={auth}
            initialMode={authInitialMode}
            onClose={() => setAuthOpen(false)}
          />
        ) : null}
      </main>
    );
  }

  const coachActionClass = (target: CoachTarget) =>
    coachFocusTarget === target ? "coach-action-focus" : undefined;

  const claimActions =
    game.phase === "claim" && game.pendingClaim?.claimer === SELF ? (
      <>
        {!game.pendingClaim?.canHu && game.pendingClaim?.canPong ? (
          <button
            className={coachActionClass("pong")}
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
            className={coachActionClass("chi")}
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
            className={coachActionClass("hu")}
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
            className={coachActionClass("gong")}
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
            className={coachActionClass("hu")}
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
            className={coachActionClass("gong")}
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
      <section className="game-layout">
        <aside className="mobile-portrait-gate" aria-label="Landscape required">
          <span className="rotate-device-icon" aria-hidden="true">
            <i />
          </span>
          <strong>Rotate to play</strong>
          <p>Turn your phone sideways for the full table.</p>
        </aside>
        <section
          className={`table ${isSelfClaimTurn ? "claim-decision-active" : ""}`}
          aria-label="Mahjong table"
        >
          <div className="board-toolbar">
            <div className="toolbar-left">
              <div className="tiles-remaining">
                <span>Tiles</span>
                <strong>{game.wall.length}</strong>
              </div>
              <div className="round-indicator">
                <span>Round {game.round}</span>
                <strong>{dealerStatus}</strong>
              </div>
            </div>
            <div className="toolbar-right">
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
                <span className="gear-glyph" aria-hidden="true">⚙</span>
              </button>
            </div>
          </div>
          {tileFlight ? (
            <div
              className={`tile-flight tile-flight-${tileFlight.kind} flight-from-${visualRelativeSeat(tileFlight.from, SELF)} ${
                tileFlight.kind === "discard"
                  ? `flight-to-river-${visualRelativeSeat(tileFlight.from, SELF)}`
                  : `flight-to-seat-${visualRelativeSeat(tileFlight.to ?? tileFlight.from, SELF)}`
              }`}
              key={tileFlight.id}
              aria-hidden="true"
            >
              <div className={`tile ${tileFlight.tile.suit}`}>
                <TileFace tile={tileFlight.tile} />
              </div>
            </div>
          ) : null}
          {aiTakeoverSeat !== undefined ? (
            <div
              className="table-notice table-notice-floating notice-warning"
              role="status"
              aria-live="polite"
            >
              <span className="notice-kicker">Connection</span>
              <strong>{seatName(aiTakeoverSeat)} disconnected</strong>
              <small>AI has taken over this seat.</small>
            </div>
          ) : null}
          <Opponent
            player={{ ...game.players[topSeat], name: seatName(topSeat) }}
            active={game.turn === topSeat}
            presence={game.seatPresence?.[topSeat]}
            dealer={game.dealer === topSeat}
            dealerStreak={game.dealerStreak}
            ready={game.declaredReady?.includes(topSeat) ?? false}
            reveal={game.winners?.includes(topSeat) ?? game.winner === topSeat}
            position="top"
            onInspect={() => setInspectedSeat(topSeat)}
          />
          <div className="compact-opponents-board" aria-label="Opponents">
            {[leftSeat, topSeat, rightSeat].map((seat) => {
              const player = { ...game.players[seat], name: seatName(seat) };
              return (
                <CompactOpponentLane
                  key={seat}
                  player={player}
                  active={game.turn === seat}
                  dealer={game.dealer === seat}
                  dealerStreak={game.dealerStreak}
                  latestDiscardId={game.lastDiscard?.tile.id}
                  onInspect={() => setInspectedSeat(seat)}
                />
              );
            })}
          </div>
          <section
            className={`human-seat ${game.turn === SELF ? "turn-active" : ""} ${game.dealer === SELF ? "dealer-seat" : ""} ${activeCoachLesson ? "learning-active" : ""}`}
            aria-current={game.turn === SELF ? "true" : undefined}
          >
            <div className="human-profile">
              <button
                className="human-name"
                type="button"
                onClick={() => setInspectedSeat(SELF)}
              >
                {game.turn === SELF ? (
                  <span className="turn-beacon">
                    <i aria-hidden="true" />
                    Your turn
                  </span>
                ) : null}
                <strong>{humanDisplayName}</strong>
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
              </div>
            </div>
            <div
              className="compact-self-discard-lane"
            >
              <span className="compact-self-discard-label">Your discards</span>
              <DiscardRiver
                player={{ ...human, name: humanDisplayName }}
                latestDiscardId={game.lastDiscard?.tile.id}
                adaptive
              />
              <button
                className="compact-lane-inspect"
                type="button"
                aria-label={`Inspect your discard history, ${human.discards.length} tiles`}
                onClick={() => setInspectedSeat(SELF)}
              />
            </div>
            {!activeCoachLesson ? (
              <button
                className={`mobile-activity-ribbon notice-${activityNoticeTone} ${mobileActivityExpanded ? "is-expanded" : "is-compact"}`}
                aria-live="polite"
                type="button"
                onClick={() => setActivityHistoryOpen(true)}
              >
                <span>
                  {mobileActivityExpanded ? centerStatusLabel : "Activity"}
                </span>
                <strong>{activityText}</strong>
                {focusedActivityTile ? (
                  <span
                    className={`tile mobile-activity-tile ${focusedActivityTile.suit}`}
                    aria-label={focusedActivityTile.label}
                  >
                    <TileFace tile={focusedActivityTile} />
                  </span>
                ) : null}
                <i className="activity-open-mark" aria-hidden="true">
                  ›
                </i>
              </button>
            ) : null}
            {activeCoachLesson ? (
              <aside
                className={`learning-coach learning-coach-${guidanceMode} ${coachDetailsOpen ? "coach-expanded" : ""}`}
                aria-live="polite"
                aria-label={activeCoachLesson.eyebrow}
              >
                <div className="learning-coach-copy">
                  <span>{activeCoachLesson.eyebrow}</span>
                  <strong>{activeCoachLesson.title}</strong>
                  <p>{activeCoachLesson.body}</p>
                  {coachDetailsOpen && activeCoachLesson.details ? (
                    <div className="coach-details">
                      {activeCoachLesson.details.map((detail) => (
                        <p key={detail}>{detail}</p>
                      ))}
                      {activeCoachLesson.alternatives?.length ? (
                        <div className="coach-alternatives">
                          <span>Other reasonable choices</span>
                          {activeCoachLesson.alternatives.map((alternative) => (
                            <button
                              key={alternative.tileId}
                              type="button"
                              title={alternative.reason}
                              onClick={() => {
                                setUiSelectedTileId(alternative.tileId);
                                selectTile(alternative.tileId);
                              }}
                            >
                              {alternative.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="learning-coach-actions">
                  <button type="button" onClick={() => dismissCoachLesson()}>
                    Got it
                  </button>
                  {activeCoachLesson.target &&
                  (!["drawn-tile", "suggested-tile"].includes(
                    activeCoachLesson.target,
                  ) || activeCoachLesson.tileId) ? (
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={showCoachTarget}
                    >
                      Show me
                    </button>
                  ) : null}
                  {activeCoachLesson.details ? (
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => setCoachDetailsOpen((current) => !current)}
                    >
                      {coachDetailsOpen ? "Less" : "Why?"}
                    </button>
                  ) : null}
                  {activeCoachLesson.learnTopic ? (
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => setLearnTopic(activeCoachLesson.learnTopic!)}
                    >
                      Learn this concept
                    </button>
                  ) : null}
                  <button
                    className="coach-hide-action"
                    type="button"
                    onClick={() =>
                      dismissCoachLesson(
                        activeCoachLesson.eyebrow !== "Strategy coach",
                      )
                    }
                  >
                    {activeCoachLesson.eyebrow === "Strategy coach"
                      ? "Dismiss for this hand"
                      : "Don't show again"}
                  </button>
                </div>
              </aside>
            ) : null}
            <div
              className="human-revealed-shelf"
              aria-label="Your revealed tiles"
            >
              <div className="human-revealed-desktop">
                <SeatSets flowers={human.flowers} melds={human.melds} />
              </div>
              <div className="human-revealed-compact">
                <CompactSeatSets
                  player={{ ...human, name: humanDisplayName }}
                  onInspect={() => setInspectedSeat(SELF)}
                />
              </div>
            </div>
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
            <div className={`human-hand ${humanHandDensity}`}>
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
                  coachHighlighted={
                    coachFocusTarget !== null &&
                    tile.id === activeCoachLesson?.tileId
                  }
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
            presence={game.seatPresence?.[leftSeat]}
            dealer={game.dealer === leftSeat}
            dealerStreak={game.dealerStreak}
            ready={game.declaredReady?.includes(leftSeat) ?? false}
            reveal={game.winners?.includes(leftSeat) ?? game.winner === leftSeat}
            position="left"
            onInspect={() => setInspectedSeat(leftSeat)}
          />
          <div className="center-table">
            <TableDiscardGrid
              players={game.players}
              selfIndex={SELF}
              latestDiscardId={game.lastDiscard?.tile.id}
              onInspect={setInspectedSeat}
            />
            <div className="table-center-core">
              <button
                className={`center-activity table-notice table-notice-center notice-${activityNoticeTone}`}
                aria-live="polite"
                type="button"
                onClick={() => setActivityHistoryOpen(true)}
              >
                <span>
                  Round {game.round} · {centerStatusLabel}
                </span>
                <strong>{activityText}</strong>
              </button>
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
            presence={game.seatPresence?.[rightSeat]}
            dealer={game.dealer === rightSeat}
            dealerStreak={game.dealerStreak}
            ready={game.declaredReady?.includes(rightSeat) ?? false}
            reveal={game.winners?.includes(rightSeat) ?? game.winner === rightSeat}
            position="right"
            onInspect={() => setInspectedSeat(rightSeat)}
          />
        </section>
        <button
          className="game-learn-button"
          type="button"
          onClick={() => setLearnTopic("objective")}
        >
          Learn
        </button>
      </section>

      {learnTopic ? (
        <div className="modal-backdrop learn-overlay-backdrop" role="presentation">
          <section
            className="learn-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Learn Taiwanese Mahjong"
          >
            <LearningReference
              compact
              initialTopic={learnTopic}
              onClose={() => setLearnTopic(null)}
            />
          </section>
        </div>
      ) : null}

      {inspectedSeat !== undefined ? (
        <PlayerInspector
          player={{
            ...game.players[inspectedSeat],
            name: seatName(inspectedSeat),
          }}
          isSelf={inspectedSeat === SELF}
          dealer={game.dealer === inspectedSeat}
          ready={game.declaredReady?.includes(inspectedSeat) ?? false}
          reveal={game.winners?.includes(inspectedSeat) ?? game.winner === inspectedSeat}
          onClose={() => setInspectedSeat(undefined)}
        />
      ) : null}

      {activityHistoryOpen ? (
        <div
          className="modal-backdrop activity-history-backdrop"
          role="presentation"
        >
          <section
            className="activity-history-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-history-title"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Table activity</p>
                <h2 id="activity-history-title">Recent actions</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close activity history"
                onClick={() => setActivityHistoryOpen(false)}
              >
                ×
              </button>
            </div>
            <ol className="activity-history-list">
              {[...game.actionLog]
                .slice(-20)
                .reverse()
                .map((entry) => (
                  <li key={entry.seq}>
                    <span>{entry.type.replaceAll("-", " ")}</span>
                    <strong>{entry.description}</strong>
                  </li>
                ))}
            </ol>
          </section>
        </div>
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

            <div className="settings-quick-actions" aria-label="Game actions">
              <button
                className="settings-action settings-action-new"
                type="button"
                onClick={() => {
                  newHand(nextDealer, false);
                  setSettingsOpen(false);
                }}
              >
                <strong>New hand</strong>
                <span>Redeal the current table</span>
              </button>
              <button
                className="settings-action settings-action-leave"
                type="button"
                onClick={leaveCurrentGame}
              >
                <strong>Leave game</strong>
                <span>Return to the lobby</span>
              </button>
            </div>

            <div className="settings-scroll">
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
                <label className="sound-setting">
                  <strong>Game sounds</strong>
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(event) => setSoundEnabled(event.target.checked)}
                  />
                </label>
                <div className="in-game-guidance-setting">
                  <span>
                    <strong>Strategy Coach</strong>
                    <small>
                      {playMode === "online"
                        ? "Available in Solo vs AI"
                        : !coachViewportSupported
                          ? "Available on laptop and desktop screens."
                          : "Show rules guidance and private discard suggestions on every hand."}
                    </small>
                  </span>
                  <span className="guidance-setting-controls">
                    <label className="toggle-switch">
                      <input
                        aria-label="Strategy Coach"
                        role="switch"
                        type="checkbox"
                        checked={guidanceMode === "strategy"}
                        disabled={
                          playMode === "online" || !coachViewportSupported
                        }
                        onChange={(event) =>
                          changeGuidanceMode(
                            event.target.checked ? "strategy" : "off",
                          )
                        }
                      />
                      <span aria-hidden="true" />
                    </label>
                    {hiddenCoachLessons.size > 0 ? (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => {
                          setHiddenCoachLessons(new Set());
                          setSeenCoachLessons(new Set());
                          window.localStorage.removeItem(HIDDEN_LESSONS_KEY);
                        }}
                      >
                        Restore hidden tips
                      </button>
                    ) : null}
                  </span>
                </div>
                <label className="sound-setting">
                  <span>
                    <strong>Usage analytics</strong>
                    <small>No player names or room names are collected.</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={analyticsEnabled}
                    onChange={(event) =>
                      onAnalyticsConsentChange(event.target.checked)
                    }
                  />
                </label>
                </section>

                <details className="settings-disclosure rules-disclosure">
                  <summary>
                    <span className="settings-disclosure-copy">
                      <strong>Rules and scoring</strong>
                      <small>
                        Base {rules.baseWin} · {activeRuleCount} of{" "}
                        {houseRules.length} bonuses active
                      </small>
                    </span>
                  </summary>
                  <div className="settings-disclosure-body settings-section rules-section">
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
                  </div>
                </details>

                <details className="settings-disclosure support-disclosure">
                  <summary>
                    <span className="settings-disclosure-copy">
                      <strong>Support and diagnostics</strong>
                      <small>Report a problem or import a saved game state</small>
                    </span>
                  </summary>
                  <div className="settings-disclosure-body settings-section">
                    <p className="settings-note">
                      Create a Trello-ready bug report payload from the current
                      game state or download it as JSON.
                    </p>
                    <div className="house-rule-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={createBugReport}
                      >
                        Create Trello card
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={exportCurrentScenario}
                      >
                        Export JSON
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => scenarioFileInputRef.current?.click()}
                      >
                        Import JSON
                      </button>
                    </div>
                    <input
                      ref={scenarioFileInputRef}
                      accept="application/json"
                      hidden
                      onChange={importScenarioFromFile}
                      type="file"
                    />
                    {scenarioFeedback ? (
                      <p className="settings-note">{scenarioFeedback}</p>
                    ) : null}
                    {activeScenario ? (
                      <p className="settings-note">
                        Last prepared report: {activeScenario.label}
                      </p>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {game.winSummary && showWinModal ? (
        <div className="modal-backdrop win-backdrop" role="presentation">
          <section
            className={`win-modal win-stage-${winStage}`}
            ref={winModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="win-title"
            tabIndex={-1}
          >
            <div className="win-modal-scroll">
              <div className="win-announcement">
                <span className="win-call" aria-hidden="true">
                  {winningPlayer ? "HU" : "DRAW"}
                </span>
                <div>
                  <p className="eyebrow">Hand complete</p>
                  <h2 id="win-title">
                    {roundWinSummaries.length > 1
                      ? `${roundWinSummaries.map((summary) => summary.winner === SELF ? "You" : summary.winner === undefined ? "" : seatName(summary.winner)).filter(Boolean).join(" and ")} win`
                      : game.winSummary.winner === undefined
                      ? game.winSummary.title
                      : game.winSummary.winner === SELF
                        ? "You win"
                        : `${seatName(game.winSummary.winner)} wins`}
                  </h2>
                </div>
              </div>
              <p className="win-detail">{game.message}</p>
              {roundWinSummaries.length > 1 ? (
                <div className="winner-tabs" aria-label="Winning hands">
                  {roundWinSummaries.map((summary, index) => (
                    <button
                      className={reviewWinnerIndex === index ? "active" : ""}
                      key={summary.winner}
                      type="button"
                      onClick={() => setReviewWinnerIndex(index)}
                    >
                      {summary.winner === SELF
                        ? "Your hand"
                        : summary.winner === undefined
                          ? "Hand"
                          : `${seatName(summary.winner)}'s hand`}
                    </button>
                  ))}
                </div>
              ) : null}
              {winStage >= 1 && winningTile ? (
                <div className="winning-tile-focus" aria-label="Winning tile">
                  <span>Winning tile</span>
                  <TileView tile={winningTile} winning disabled />
                </div>
              ) : null}
              {winStage >= 2 && winningPlayer ? (
                <div className="win-total">
                  <span>{activeWinSummary?.points ?? 0} points</span>
                  <strong>
                    +{roundWinSummaries.length > 1
                      ? activeWinSummary?.total ?? 0
                      : animatedWinTotal} total
                  </strong>
                </div>
              ) : null}
              {winStage >= 1 && winningPlayer ? (
                <button
                  className="win-review-toggle"
                  type="button"
                  aria-expanded={winReviewOpen}
                  aria-controls="win-review-content"
                  onClick={() => setWinReviewOpen((open) => !open)}
                >
                  <span>Review hand and scoring</span>
                  <span aria-hidden="true">{winReviewOpen ? "−" : "+"}</span>
                </button>
              ) : null}
              <div
                className={`win-review-content ${winReviewOpen ? "is-open" : ""}`}
                id="win-review-content"
              >
                {winStage >= 1 &&
                winningPlayer &&
                activeWinSummary?.winner !== undefined ? (
                  <div className="winning-review-section">
                    <div
                      className="winning-hand-review"
                      aria-label={`${winningPlayer.name} revealed winning hand`}
                    >
                      <span>{seatName(activeWinSummary.winner)}'s hand</span>
                      <div className="winning-review-section">
                        <strong>Concealed tiles</strong>
                        <div className="winning-tile-row">
                          {winningPlayer.hand.map((tile) => (
                            <TileView
                              key={tile.id}
                              tile={tile}
                              winning={
                                tile.id === activeWinSummary?.winningTileId
                              }
                              disabled
                            />
                          ))}
                        </div>
                      </div>
                      {winningPlayer.melds.length > 0 ? (
                        <div className="winning-review-section">
                          <strong>Revealed sets</strong>
                          <div className="winning-meld-row">
                            {winningPlayer.melds.map((meld, index) => (
                              <MeldView
                                key={`${meld.type}-${index}`}
                                meld={meld}
                              />
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
                  </div>
                ) : null}
                {winStage >= 2 && winningPlayer ? (
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
                    {(activeWinSummary?.scoreItems ?? []).map((item) => (
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
                {winStage >= 2 &&
                scoreDeltas.some((delta) => delta !== 0) ? (
                  <div className="score-transfers" aria-label="Point transfers">
                    <strong>Point transfer</strong>
                    <div>
                      {scoreDeltas.map((delta, index) =>
                        delta !== 0 ? (
                          <span
                            className={delta > 0 ? "score-gain" : "score-loss"}
                            key={`${game.players[index].name}-${index}`}
                          >
                            <small>{seatName(index)}</small>
                            <b>
                              {delta > 0 ? "+" : ""}
                              {delta}
                            </b>
                          </span>
                        ) : null,
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {winStage >= 2 ? (
              <div className="win-modal-footer">
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
                      ? `${game.nextHandReady.length} of ${game.nextHandRequired?.length ?? 1} player${(game.nextHandRequired?.length ?? 1) === 1 ? "" : "s"} ready. Waiting for everyone else to select Next Hand.`
                      : "The next hand begins after every player selects Next Hand."}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
      {authOpen ? (
        <AuthScreen
          auth={auth}
          initialMode={authInitialMode}
          onClose={() => setAuthOpen(false)}
        />
      ) : null}
    </main>
  );
}

function AnalyticsConsentPrompt({
  onChoose,
}: {
  onChoose: (enabled: boolean) => void;
}) {
  return (
    <div className="analytics-consent-backdrop" role="presentation">
      <section
        className="analytics-consent-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-consent-title"
      >
        <div>
          <p className="eyebrow">Privacy choice</p>
          <h2 id="analytics-consent-title">Help improve Table One</h2>
          <p>
            Allow usage analytics so we can understand active players, game
            duration, and returning visits. Player names and room names are not
            sent.
          </p>
        </div>
        <div className="analytics-consent-actions">
          <button
            autoFocus
            className="analytics-consent-allow"
            type="button"
            onClick={() => onChoose(true)}
          >
            Yes, allow analytics
          </button>
          <button
            className="analytics-consent-decline"
            type="button"
            onClick={() => onChoose(false)}
          >
            No, not now
          </button>
        </div>
      </section>
    </div>
  );
}

function learnTile(code: string, copy: number) {
  return { ...tilePrototypeFromCode(code), id: `learn-${code}-${copy}` };
}

function LearningTileRow({
  codes,
  label,
}: {
  codes: string[];
  label: string;
}) {
  return (
    <div className="learn-tile-example" aria-label={label}>
      {codes.map((code, index) => (
        <TileView key={`${code}-${index}`} tile={learnTile(code, index)} disabled />
      ))}
    </div>
  );
}

function LearningReference({
  compact = false,
  initialTopic = "history",
  onClose,
}: {
  compact?: boolean;
  initialTopic?: LearnTopic;
  onClose?: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = contentRef.current?.querySelector<HTMLElement>(
      `[data-learn-topic="${initialTopic}"]`,
    );
    target?.scrollIntoView({ block: "start" });
  }, [initialTopic]);

  const jumpTo = (topic: LearnTopic) => {
    contentRef.current
      ?.querySelector<HTMLElement>(`[data-learn-topic="${topic}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className={compact ? "learn-reference compact" : "learn-reference"}>
      <header className="learn-header">
        <div>
          <p className="eyebrow">Table One Mahjong</p>
          <h1>Learn Taiwanese Mahjong</h1>
          <p>Build a winning 17-tile hand, one clear decision at a time.</p>
        </div>
        <button
          className="learn-close-button"
          type="button"
          aria-label={compact ? "Close Learn" : "Return to lobby"}
          onClick={onClose}
        >
          {compact ? "Close" : "Back to lobby"}
        </button>
      </header>

      <nav className="learn-nav" aria-label="Learning topics">
        {([
          ["objective", "Start here"],
          ["turn", "Your turn"],
          ["chi", "Chi"],
          ["pong", "Pong"],
          ["gong", "Gong"],
          ["hu", "Hu"],
          ["scoring", "Scoring"],
        ] as Array<[LearnTopic, string]>).map(([topic, label]) => (
          <button key={topic} type="button" onClick={() => jumpTo(topic)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="learn-content" ref={contentRef}>
        <section data-learn-topic="history">
          <p className="eyebrow">A brief history</p>
          <h2>A Taiwanese table tradition</h2>
          <p>
            Mahjong reached Taiwan from mainland China and developed a distinct
            16-tile style. Today it remains a social game of observation,
            probability, memory, and table conversation.
          </p>
        </section>

        <section data-learn-topic="objective">
          <p className="eyebrow">The objective</p>
          <h2>Complete five sets of three tiles and one pair</h2>
          <p>
            A standard winning hand has 17 tiles: five sets of three tiles plus
            one matching pair. A Gong uses four identical tiles and includes a
            replacement draw.
          </p>
          <LearningTileRow
            label="Example winning hand structure"
            codes={[
              "D2", "D3", "D4",
              "B3", "B4", "B5",
              "C6", "C7", "C8",
              "W1", "W1", "W1",
              "G2", "G2", "G2",
              "D9", "D9",
            ]}
          />
        </section>

        <section data-learn-topic="tiles">
          <p className="eyebrow">Know the tiles</p>
          <h2>Three numbered suits, honors, and flowers</h2>
          <p>
            Dots, Bamboo, and Characters run from one through nine. Winds and
            Dragons are honor tiles. Flowers are revealed immediately and
            replaced from the wall.
          </p>
          <LearningTileRow
            label="Dots, Bamboo, Characters, Wind, and Dragon tiles"
            codes={["D1", "D5", "B1", "B7", "C3", "C9", "W1", "G1"]}
          />
        </section>

        <section data-learn-topic="turn">
          <p className="eyebrow">The rhythm of play</p>
          <h2>Draw, evaluate, discard</h2>
          <p>
            On your turn, draw one tile and discard one tile. Play moves
            counterclockwise. Watch the most recent discards and revealed sets
            to judge which tiles may still be available.
          </p>
        </section>

        <section data-learn-topic="chi">
          <p className="eyebrow">Claiming a discard</p>
          <h2>Chi completes a numbered sequence</h2>
          <p>
            Claim the immediately previous player's discard to make three
            consecutive tiles in the same suit. Chi is lower priority than Hu,
            Pong, and Gong.
          </p>
          <LearningTileRow label="Chi with three, four, and five Dots" codes={["D3", "D4", "D5"]} />
        </section>

        <section data-learn-topic="pong">
          <p className="eyebrow">Claiming a discard</p>
          <h2>Pong makes three identical tiles</h2>
          <p>
            Any player may claim the latest discard to complete three matching
            tiles. The set is revealed, and the claiming player discards next.
          </p>
          <LearningTileRow label="Pong with three seven Bamboo tiles" codes={["B7", "B7", "B7"]} />
        </section>

        <section data-learn-topic="gong">
          <p className="eyebrow">Four of a kind</p>
          <h2>Gong reveals or conceals four identical tiles</h2>
          <p>
            A Gong uses four matching tiles. After declaring it, draw a
            replacement tile before discarding. Available Gong choices appear
            only when they are legal.
          </p>
          <LearningTileRow label="Gong with four Red Dragons" codes={["G1", "G1", "G1", "G1"]} />
        </section>

        <section data-learn-topic="hu">
          <p className="eyebrow">Winning</p>
          <h2>Hu completes your hand</h2>
          <p>
            Choose Hu when your drawn tile or another player's discard completes
            five sets of three tiles and a pair. More than one player may Hu on
            the same discard; the discarder pays each winner independently.
          </p>
          <LearningTileRow label="Pair of White Dragons completing a hand" codes={["G3", "G3"]} />
        </section>

        <section data-learn-topic="dealer">
          <p className="eyebrow">Dealer and rounds</p>
          <h2>The dealer continues after a win</h2>
          <p>
            When the dealer wins, or a hand ends with no playable tiles, the
            dealer continues and the consecutive-dealer bonus increases. If the
            dealer does not win, the deal moves to the next seat.
          </p>
        </section>

        <section data-learn-topic="scoring">
          <p className="eyebrow">Scoring basics</p>
          <h2>Base points plus the patterns you made</h2>
          <p>
            Every Hu begins with the table's base win. Enabled bonuses add points
            for patterns such as self-draw, flowers, dealer status, concealed
            sets, and higher-value hands. Open Settings to audit every enabled
            rule and its description.
          </p>
        </section>

        <section className="learn-practice" data-learn-topic="practice">
          <p className="eyebrow">Try it</p>
          <h2>Three quick checks</h2>
          <details>
            <summary>Who may Chi a discarded 5 Bamboo?</summary>
            <p>Only the next player in turn order, and only with a legal sequence such as 3-4-5 or 4-5-6.</p>
          </details>
          <details>
            <summary>What happens after a Gong?</summary>
            <p>The player draws a replacement tile, then chooses a discard.</p>
          </details>
          <details>
            <summary>Can two players Hu on the same discard?</summary>
            <p>Yes. Each eligible player chooses Hu or Pass, and the discarder pays every winner independently.</p>
          </details>
        </section>

        <footer className="learn-footer">
          <strong>English terms used at this table</strong>
          <p>Chi (吃), Pong (碰), Gong (槓), and Hu (胡).</p>
          <p>
            Rules vary by table. Table One follows its enabled scoring settings,
            which can be reviewed before or during play.
          </p>
        </footer>
      </div>
    </main>
  );
}

export default function Home() {
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState<"game" | "learn">(() =>
    typeof window !== "undefined" && window.location.pathname === "/learn"
      ? "learn"
      : "game",
  );
  const auth = useAuth();
  const [analyticsConsent, setAnalyticsConsentState] =
    useState<AnalyticsConsent>(() => getAnalyticsConsent());

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    const handleNavigation = () =>
      setPage(window.location.pathname === "/learn" ? "learn" : "game");
    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);

  useEffect(() => {
    if (analyticsConsent === "granted") initializeAnalytics();
  }, [analyticsConsent]);

  const updateAnalyticsConsent = (enabled: boolean) => {
    setAnalyticsConsent(enabled);
    setAnalyticsConsentState(enabled ? "granted" : "denied");
  };

  const navigate = (nextPage: "game" | "learn") => {
    window.history.pushState({}, "", nextPage === "learn" ? "/learn" : "/");
    setPage(nextPage);
  };

  if (!ready || auth.status === "loading") {
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

  if (page === "learn") {
    return <LearningReference onClose={() => navigate("game")} />;
  }

  return (
    <>
      <MahjongApp
        auth={auth}
        analyticsEnabled={analyticsConsent === "granted"}
        onAnalyticsConsentChange={updateAnalyticsConsent}
        onOpenLearn={() => navigate("learn")}
      />
      {analyticsConsent === null ? (
        <AnalyticsConsentPrompt onChoose={updateAnalyticsConsent} />
      ) : null}
    </>
  );
}
