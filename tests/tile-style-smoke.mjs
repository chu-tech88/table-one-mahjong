import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const server = await readFile(new URL("../server/game-server.ts", import.meta.url), "utf8");

assert.match(
  css,
  /\.tile\s*\{[^}]*container-type:\s*inline-size;/s,
  "Tile artwork must scale from the tile container",
);
assert.match(
  css,
  /\.tile\s*>\s*\.tile-face\s*\{[^}]*height:\s*calc\(100% - var\(--tile-base-depth\)\)/s,
  "Tile faces must exclude the raised tile base from their centering area",
);
assert.match(
  css,
  /\.opponent-discard-zone \.discard-river\s*\{[^}]*flex-wrap:\s*nowrap;/s,
  "Opponent discard rivers must stay in one scrollable row",
);
assert.match(
  css,
  /\.side-opponent-stack\s*\{[^}]*grid-template-rows:[^}]*minmax\([^}]*minmax\(/s,
  "Side opponents must stack discard and revealed zones vertically",
);
assert.match(
  css,
  /\.human-seat \.seat-sets-row\s*\{[^}]*justify-content:\s*center;/s,
  "The human player's revealed sets must remain centered",
);
assert.match(
  css,
  /\.table\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*minmax\(520px, 560px\)[^}]*minmax\(0, 1fr\)/s,
  "Wide tables must keep the play area centered within flexible outer margins",
);
assert.match(
  css,
  /\.tile \.dot-1\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*grid-template-rows:\s*1fr;[^}]*padding:\s*0;/s,
  "One dot must use a dedicated full-face centering grid",
);
assert.match(
  css,
  /\.tile \.bamboo-bird-face img\s*\{[^}]*object-fit:\s*cover;/s,
  "One bamboo must use the supplied bird image as a fitted tile asset",
);
assert.match(
  css,
  /\.tile \.bamboo-stick\s*\{[^}]*align-self:\s*stretch;[^}]*height:\s*auto;[^}]*linear-gradient\(180deg,/s,
  "Numbered bamboo segments must paint directly onto a stretched grid item",
);
assert.match(
  css,
  /\.tile \.bamboo-stick b\s*\{[^}]*display:\s*none;/s,
  "Numbered bamboo must not depend on nested percentage height sizing",
);
assert.match(
  app,
  /function BambooFace[\s\S]*<svg viewBox="0 0 100 100"[\s\S]*<rect[^>]*fill="#147d5b"/,
  "Numbered bamboo must render as Safari-safe inline SVG artwork",
);
assert.match(
  app,
  /7:\s*\[\s*\[50, 18\][\s\S]*\[23, 50\][\s\S]*\[77, 82\]/,
  "Seven bamboo must use the traditional 1-3-3 arrangement",
);
assert.match(
  app,
  /function FlowerFace[\s\S]*flower-illustration-face[\s\S]*<svg viewBox="0 0 100 120"/,
  "Flower tiles must use botanical artwork instead of character-only faces",
);
assert.match(
  app,
  /function FlowerArtwork[\s\S]*rank === 1[\s\S]*rank === 2[\s\S]*rank === 3[\s\S]*rank === 4[\s\S]*rank === 5[\s\S]*rank === 6[\s\S]*rank === 7[\s\S]*winter-artwork/,
  "All eight flower and season tiles must have distinct traditional artwork",
);
assert.match(
  css,
  /\.lobby-chat-panel\s*\{[^}]*top:\s*clamp\([^;]+;[^}]*right:\s*clamp\(/s,
  "Multiplayer chat must be anchored beneath the upper-right toolbar",
);
assert.match(
  app,
  /game\.winSummary\.winner === SELF[\s\S]*?"You win"[\s\S]*?seatName\(game\.winSummary\.winner\)/,
  "The hand-complete title must be relative to the viewer's assigned seat",
);
assert.match(
  app,
  /AudioContext[\s\S]*?navigator\.vibrate/,
  "A turn transition must provide audible and mobile haptic feedback",
);
assert.match(
  css,
  /\.tile\.winning-tile\s*\{[^}]*border-color:\s*#c92f39;[^}]*box-shadow:/s,
  "The winning tile must be clearly highlighted in the hand summary",
);
assert.match(
  css,
  /\.opponent\.turn-active \.seat-heading,\s*\.human-seat\.turn-active \.human-name\s*\{[^}]*border-color:\s*#ffdc45;[^}]*box-shadow:/s,
  "Every active seat must use the same nameplate turn treatment",
);
assert.doesNotMatch(
  css,
  /\.turn-bar-anchor|\.human-seat\.turn-active\s*\{[^}]*border|\.human-seat\.turn-active\s*\{[^}]*box-shadow:/s,
  "Turn indicators must not decorate or cover tile surfaces",
);
assert.match(
  css,
  /\.discard-lane-0\s*\{[^}]*width:\s*var\(--info-zone-width\);/s,
  "The human discard pile must share the opponent information width",
);
assert.match(
  css,
  /@media \(max-width: 760px\)[\s\S]*grid-template-areas:\s*"toolbar toolbar toolbar"\s*"top top top"\s*"center center center"\s*"left \. right"/,
  "Mobile side opponents must appear below the top opponent information",
);
assert.doesNotMatch(
  app,
  /<span>Seat<\/span>[\s\S]*?<select/,
  "The multiplayer lobby should not ask players to select a seat",
);
assert.match(
  server,
  /visible\.pendingClaim = undefined;[\s\S]*?is waiting to discard\./,
  "Other players must not receive the active player's claim options",
);
assert.match(
  server,
  /DISCONNECT_GRACE_MS[\s\S]*?"30000"[\s\S]*?seatPresence\[playerIndex\] = "reconnecting"/,
  "Disconnected multiplayer seats must receive a 30-second reconnecting grace period",
);
assert.match(
  app,
  /playMode === "online"[\s\S]*?currentPhase === "claim"[\s\S]*?is waiting to discard\./,
  "Online table activity must use neutral claim language",
);
assert.doesNotMatch(
  app,
  /event\.target\.value\.replace\([^\n]+\)\s*\|\|\s*"table-one"/,
  "Clearing the room name should leave the field empty",
);

const obsoleteContextOverrides = [
  ".human-hand .dot-pip",
  ".discard-river .dot-pip",
  ".meld .dot-pip",
  ".human-hand .bamboo-stick",
  ".discard-river .bamboo-stick",
  ".modal-backdrop .tile:not(.large) .dot-pip",
];

for (const selector of obsoleteContextOverrides) {
  assert.equal(
    css.includes(selector),
    false,
    `Tile artwork sizing must not be overridden by context: ${selector}`,
  );
}

console.log("Tile style smoke test passed");
