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
  app,
  /players\.map\(\(player, index\)[\s\S]*?discard-lane-\$\{relativeSeat\}[\s\S]*?<DiscardRiver player=\{player\}/,
  "All four players must render into the shared center discard field",
);
assert.doesNotMatch(
  app,
  /side-opponent-stack|opponent-table-zone opponent-discard-zone/,
  "Opponent discards and reveals must not use independent framed panels",
);
assert.match(
  app,
  /className="opponent-rack"[\s\S]*?className="opponent-wall-row"[\s\S]*?className="opponent-revealed-strip"/,
  "Opponent walls and revealed sets must share one compact seat rack",
);
assert.match(
  css,
  /\.human-seat \.seat-sets-row\s*\{[^}]*justify-content:\s*center;/s,
  "The human player's revealed sets must remain centered",
);
assert.match(
  app,
  /className="human-revealed-shelf"[\s\S]*?<SeatSets flowers=\{human\.flowers\} melds=\{human\.melds\}/,
  "The human player's revealed tiles must use a dedicated shelf",
);
assert.match(
  css,
  /\.human-revealed-shelf\s*\{[^}]*overflow:\s*hidden;[^}]*contain:\s*layout paint;/s,
  "The revealed shelf must not overlap the playable hand",
);
assert.match(
  css,
  /\.table\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*clamp\(600px, 48vw, 900px\)[^}]*minmax\(0, 1fr\)/s,
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
  /discard-overflow-count[\s\S]*earlier discards/,
  "Compact rivers must preserve access to the full discard history",
);
assert.match(
  css,
  /@media \(max-width: 900px\)[\s\S]*\.table-discard-lane \.discard-river \.tile:nth-of-type\(n \+ 5\)[\s\S]*\.discard-overflow-count\s*\{\s*display:\s*grid;/,
  "Tablet and mobile rivers must prioritize the four newest discards",
);
assert.match(
  css,
  /\.tile-motion-draw[\s\S]*\.tile-motion-discard[\s\S]*\.meld-motion-enter[\s\S]*@keyframes tile-draw-enter/,
  "Draw, discard, and reveal changes must use restrained explanatory motion",
);
assert.match(
  app,
  /table-notice-floating notice-warning[\s\S]*notice-\$\{activityNoticeTone\}[\s\S]*notice-count/,
  "Turn, claim, connection, score, and chat events must share one notification system",
);
assert.match(
  app,
  /game\.winSummary\.winner === SELF[\s\S]*?"You win"[\s\S]*?seatName\(game\.winSummary\.winner\)/,
  "The hand-complete title must be relative to the viewer's assigned seat",
);
assert.match(
  app,
  /soundPatterns:[\s\S]*discard:[\s\S]*chi:[\s\S]*pong:[\s\S]*gong:[\s\S]*hu:[\s\S]*turn:[\s\S]*navigator\.vibrate/,
  "Discard, Chi, Pong, Gong, Hu, and turn transitions need distinct audio cues",
);
assert.match(
  app,
  /turn:[\s\S]*volume:\s*0\.105[\s\S]*playGameSound\("turn"\)/,
  "The player's turn cue must be the most prominent sound",
);
assert.match(
  app,
  /SOUND_SETTING_KEY[\s\S]*checked=\{soundEnabled\}[\s\S]*setSoundEnabled/,
  "Players must be able to disable game sounds",
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
  /\.discard-lane-0,\s*\.discard-lane-2\s*\{[^}]*width:\s*min\(680px, 92%\);/s,
  "Opposing discard lanes must share consistent center-field sizing",
);
assert.match(
  css,
  /@media \(max-width: 900px\)[\s\S]*grid-template-areas:\s*"toolbar toolbar toolbar"\s*"top top top"\s*"center center center"\s*"left \. right"/,
  "Tablet and mobile side opponents must use the compact table geometry",
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
assert.match(
  css,
  /\.opponent-revealed-strip \.seat-sets-row,[\s\S]*?align-items:\s*flex-end;/s,
  "Opponent flowers and melds must share a common tile baseline",
);
assert.match(
  app,
  /className=\{`mobile-activity-ribbon[\s\S]*?centerStatusLabel[\s\S]*?activityText/,
  "Compact layouts must retain the table activity status near the player's hand",
);
assert.match(
  app,
  /setActivityHistoryOpen\(true\)[\s\S]*?activity-history-panel[\s\S]*?game\.actionLog[\s\S]*?slice\(-20\)/,
  "The activity hub must provide recent table history on demand",
);
assert.match(
  css,
  /\.human-revealed-shelf\s*\{[^}]*align-items:\s*flex-end;[^}]*border-bottom:[^}]*overflow:\s*hidden;[^}]*contain:\s*layout paint;/s,
  "The human revealed tray must be separated from and contained above the playable hand",
);
assert.match(
  css,
  /\.human-seat \.seat-sets-row\s*\{[^}]*width:\s*max-content;[^}]*max-width:\s*100%;[^}]*background:\s*transparent;/s,
  "The human revealed tray should remain compact and centered",
);
assert.match(
  css,
  /\.opponent-left \.opponent-revealed-strip \.flower-row,[\s\S]*?\.opponent-right \.opponent-revealed-strip \.meld div\s*\{[^}]*flex-direction:\s*column;/s,
  "Side-seat flowers and melds must use space-saving vertical rails",
);
assert.match(
  css,
  /\.center-activity\.table-notice\s*\{[^}]*box-shadow:\s*none;/s,
  "The table activity control must not show an inconsistent inset accent",
);
assert.match(
  css,
  /\.human-hand\s*\{[^}]*padding-top:\s*14px;[^}]*overflow:\s*visible;/s,
  "The playable hand must reserve visible clearance for raised tiles",
);
assert.match(
  css,
  /@media \(max-width: 1100px\) and \(max-height: 600px\) and \(orientation: landscape\)[\s\S]*?grid-template-areas:\s*"toolbar toolbar toolbar"\s*"top top top"\s*"left center right"\s*"human human human";/,
  "Short landscape screens must keep the player hand in the visible table grid",
);
assert.match(
  css,
  /\.table-discard-grid\s*\{[^}]*grid-template-areas:\s*"top top top"\s*"left \. right"\s*"bottom bottom bottom";/s,
  "North and south discard lanes must expand across the available center field",
);
assert.match(
  css,
  /\.table\s*\{[^}]*--side-wall-width:\s*clamp\(20px, 1\.35vw, 28px\);[^}]*--side-wall-height:\s*clamp\(12px, 1vw, 18px\);/s,
  "Side walls must scale up responsively on laptop and desktop screens",
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
