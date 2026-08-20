import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const analytics = await readFile(
  new URL("../src/analytics.ts", import.meta.url),
  "utf8",
);
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
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
  /players\.map\(\(player, index\)[\s\S]*?discard-lane-\$\{relativeSeat\}[\s\S]*?<DiscardRiver[\s\S]*?player=\{player\}/,
  "All four players must render into the shared center discard field",
);
assert.doesNotMatch(
  app,
  /side-opponent-stack|opponent-table-zone opponent-discard-zone/,
  "Opponent discards and reveals must not use independent framed panels",
);
assert.match(
  app,
  /className="opponent-rack"[\s\S]*?className="opponent-wall-row"[\s\S]*?className=\{`opponent-revealed-strip/,
  "Opponent walls and revealed sets must share one compact seat rack",
);
assert.match(
  app,
  /revealedTileCount[\s\S]*?revealed-density-compact[\s\S]*?data-revealed-tiles=\{revealedTileCount\}/,
  "Opponent revealed sets must expose count-aware density for responsive sizing",
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
assert.doesNotMatch(
  app,
  /lobby-chat-panel|join-lobby-chat|submitLobbyChat|chatSocketRef/,
  "Archived multiplayer chat must not connect or occupy the active game UI",
);
assert.match(
  app,
  /discard-overflow-count[\s\S]*earlier discards/,
  "Compact rivers must preserve access to the full discard history",
);
assert.match(
  app,
  /className="compact-opponents-board"[\s\S]*\[leftSeat, topSeat, rightSeat\]\.map[\s\S]*<CompactOpponentLane/,
  "Constrained tables must present all three opponents in one consistent rail",
);
assert.match(
  app,
  /function CompactSeatSets[\s\S]*compact-flower-summary[\s\S]*player\.melds\.map/,
  "Compact revealed lanes must summarize flowers without hiding declared sets",
);
assert.match(
  app,
  /className="compact-self-discard-lane"[\s\S]*<DiscardRiver[\s\S]*player=\{\{ \.\.\.human/,
  "The player's three-tile discard lane must remain attached to the player dock",
);
assert.match(
  app,
  /className="mobile-portrait-gate"[\s\S]*Rotate to play[\s\S]*Turn your phone sideways/,
  "Portrait phones must explain the landscape requirement",
);
assert.match(
  css,
  /@media \(max-width: 1100px\)[\s\S]*\.table-discard-lane \.discard-river \.tile:nth-of-type\(n \+ 4\)[\s\S]*\.discard-overflow-count\s*\{\s*display:\s*grid;/,
  "Tablet and mobile rivers must prioritize the three newest discards",
);
assert.match(
  css,
  /Adaptive table composition[\s\S]*\.compact-opponents-board\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)[\s\S]*\.compact-discard-lane \.discard-river \.tile:nth-of-type\(n \+ 4\)/,
  "Adaptive opponent lanes must stay equal-width and show only the latest three discards",
);
assert.match(
  css,
  /\.human-hand \.tile\.drawn\s*\{[^}]*transform:\s*translateY\(-6px\);[^}]*animation:\s*none;[\s\S]*\.human-hand \.drawn-badge\s*\{[^}]*display:\s*none;/,
  "Compact hands must lift the drawn tile without covering its artwork",
);
assert.match(
  css,
  /\.claim-decision-active \.compact-discard-lane \.tile[\s\S]*opacity:\s*0\.2;[\s\S]*\.tile\.discard-latest[\s\S]*opacity:\s*1;[\s\S]*transform:\s*scale\(1\.12\)/,
  "Claim decisions must quiet unrelated table tiles and emphasize the offered discard",
);
assert.match(
  css,
  /@media \(orientation: portrait\) and \(min-width: 600px\) and \(max-width: 900px\)[\s\S]*\.mobile-activity-ribbon[\s\S]*display:\s*none;[\s\S]*\.center-table \.center-activity\s*\{[^}]*display:\s*grid;/,
  "Portrait tablets must retain table activity in the table center",
);
assert.match(
  css,
  /@media \(orientation: portrait\) and \(max-width: 599px\)[\s\S]*\.game-layout > \.table\s*\{[^}]*visibility:\s*hidden;[\s\S]*\.mobile-portrait-gate\s*\{[^}]*position:\s*fixed;[^}]*display:\s*grid;/,
  "Portrait phones must replace the unplayable table with a rotation gate",
);
assert.match(
  css,
  /@media \(orientation: landscape\) and \(max-width: 900px\) and \(max-height: 350px\)[\s\S]*grid-template-rows:\s*30px minmax\(56px, 1fr\) 0 193px;[\s\S]*\.center-table\s*\{[^}]*display:\s*none;/,
  "Short mobile browser viewports must reserve a fixed dock for the hand and actions",
);
assert.match(
  css,
  /\.tile-motion-draw[\s\S]*\.tile-motion-discard[\s\S]*\.meld-motion-enter[\s\S]*@keyframes tile-draw-enter/,
  "Draw, discard, and reveal changes must use restrained explanatory motion",
);
assert.match(
  app,
  /table-notice-floating notice-warning[\s\S]*notice-\$\{activityNoticeTone\}/,
  "Turn, claim, connection, and score events must share one notification system",
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
  /@media \(max-width: 900px\)[\s\S]*grid-template-areas:\s*"toolbar toolbar toolbar"\s*"top top top"\s*"left \. right"\s*"center center center"/,
  "Narrow layouts must place side opponents before the discard field",
);
assert.match(
  css,
  /\.opponent-top \.opponent-wall-row\s*\{[^}]*justify-self:\s*center;[^}]*justify-content:\s*center;[^}]*width:\s*min\(400px, 90%\);/s,
  "The opposing wall must remain centered and compact in narrow layouts",
);
assert.match(
  css,
  /\.hand-actions\s*\{[^}]*padding:[^}]*env\(safe-area-inset-bottom, 0px\)/s,
  "Compact action controls must leave space for mobile system gestures",
);
assert.doesNotMatch(
  app,
  /<span>\{human\.(?:flowers|hand)\.length\} (?:flowers|in hand)<\/span>/,
  "The human profile should show score without redundant flower and hand counters",
);
assert.match(
  app,
  /const humanDisplayName =\s*playMode === "solo" \? soloHumanName : `\$\{humanName \|\| "You"\} \(You\)`;[\s\S]*?<strong>\{humanDisplayName\}<\/strong>/,
  "Solo nameplates must show the player's name without a duplicate You label",
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
  /mobileActivityExpanded[\s\S]*setTimeout[\s\S]*2600[\s\S]*is-compact/,
  "Routine mobile activity must collapse after briefly surfacing the update",
);
assert.match(
  app,
  /Your name[\s\S]*className="guidance-picker"[\s\S]*Strategy Coach[\s\S]*disabled=\{playMode === "online"\}/,
  "The lobby must place its solo-only Strategy Coach control below the name field",
);
assert.doesNotMatch(
  app,
  /Learn rules/,
  "The retired Learn rules mode must not appear in the lobby or settings",
);
assert.match(
  app,
  /className=\{`learning-coach[\s\S]*Got it[\s\S]*Show me[\s\S]*Don't show again/,
  "Contextual lessons must provide clear, non-automatic teaching controls",
);
assert.match(
  css,
  /\.human-seat\.learning-active[\s\S]*grid-template-rows:[\s\S]*\.learning-coach[\s\S]*grid-row:\s*2;/,
  "Compact learning prompts must receive dedicated space above the playable hand",
);
assert.match(
  app,
  /pauseLocalAI:\s*isLocalReplay && activeCoachLesson !== null/,
  "Open solo lessons must pause AI play without pausing multiplayer",
);
assert.match(
  app,
  /className="opponent-hand-count"[\s\S]*player\.hand\.length[\s\S]*className="opponent-wall-row"/,
  "Compact seats must replace decorative walls with a useful tile count",
);
assert.match(
  css,
  /@media \(max-width: 1100px\)[\s\S]*\.opponent-wall-row[\s\S]*display:\s*none;[\s\S]*\.opponent-hand-count\s*\{[\s\S]*display:\s*inline-flex;/,
  "Small screens must hide decorative opponent walls and show tile counts",
);
assert.match(
  css,
  /@media \(max-width: 760px\) and \(orientation: portrait\)[\s\S]*grid-template-rows:\s*44px 70px 70px minmax\(140px, 1fr\)[\s\S]*\.opponent-hand-count\s*\{[^}]*display:\s*none;/s,
  "Portrait phones must trade opponent tile counts for more discard space",
);
assert.match(
  css,
  /@media \(max-width: 760px\) and \(orientation: portrait\)[\s\S]*\.opponent-left \.opponent-revealed-strip \.seat-sets-row,[\s\S]*?flex-direction:\s*row;[\s\S]*?\.human-hand-density-roomy \.tile\s*\{[^}]*max-width:\s*34px;[^}]*height:\s*48px;/s,
  "Portrait side seats must use horizontal reveals while sparse hands grow larger",
);
assert.match(
  app,
  /humanHandDensity[\s\S]*human-hand-density-compact[\s\S]*human-hand-density-standard[\s\S]*human-hand-density-roomy[\s\S]*className=\{`human-hand \$\{humanHandDensity\}`\}/,
  "The human hand must expose count-aware portrait sizing",
);
assert.doesNotMatch(
  app,
  /className="drawn-badge">New</,
  "The drawn marker must not cover the tile face with text",
);
assert.match(
  css,
  /\.drawn-badge\s*\{[^}]*top:\s*-5px;[^}]*left:\s*50%;[^}]*border-radius:\s*50%;[^}]*transform:\s*translateX\(-50%\);/s,
  "The drawn marker must sit above and centered on the tile",
);
assert.match(
  css,
  /@media \(max-width: 1100px\)[\s\S]*\.action-bar button\s*\{[^}]*min-height:\s*44px;/s,
  "Mobile action buttons must meet a comfortable touch-target height",
);
assert.match(
  app,
  /function PlayerInspector[\s\S]*player\.discards\.map[\s\S]*<SeatSets flowers=\{player\.flowers\} melds=\{player\.melds\}/,
  "The player inspector must retain complete discard and revealed-set history",
);
assert.match(
  analytics,
  /VITE_GA_MEASUREMENT_ID[\s\S]*G-R0N2WZD69E[\s\S]*getAnalyticsConsent\(\) !== "granted"/,
  "Google Analytics must use the configured property and remain gated by consent",
);
assert.match(
  html,
  /gtag\("consent", "default", \{[\s\S]*analytics_storage: "denied"[\s\S]*googletagmanager\.com\/gtag\/js\?id=G-R0N2WZD69E[\s\S]*gtag\("config", "G-R0N2WZD69E"/,
  "The shared page shell must install the Google tag after setting default consent",
);
assert.match(
  app,
  /trackAnalyticsEvent\("game_started"[\s\S]*trackAnalyticsEvent\("hand_completed"[\s\S]*trackAnalyticsEvent\("game_heartbeat"/,
  "Analytics must distinguish game starts, completed hands, and active play",
);
assert.match(
  app,
  /Usage analytics[\s\S]*No player names or room names are collected\./,
  "Players must be able to review and change analytics consent in Settings",
);
assert.match(
  app,
  /settings-quick-actions[\s\S]*New hand[\s\S]*Leave game[\s\S]*settings-scroll[\s\S]*Players and style/,
  "Settings must keep new-hand and leave-game actions above scrollable preferences",
);
assert.match(
  app,
  /<details className="settings-disclosure rules-disclosure">[\s\S]*Rules and scoring[\s\S]*activeRuleCount[\s\S]*Taiwanese scoring table/,
  "The full scoring table must start collapsed behind a useful rules summary",
);
assert.match(
  app,
  /<details className="settings-disclosure support-disclosure">[\s\S]*Support and diagnostics[\s\S]*Create Trello card/,
  "Developer reporting controls must remain available without dominating settings",
);
assert.match(
  css,
  /\.settings-modal\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\);[^}]*overflow:\s*hidden;[\s\S]*?\.settings-scroll\s*\{[^}]*overflow-y:\s*auto;/,
  "Settings header and quick actions must remain fixed while content scrolls",
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
  /Mobile play-and-inspect mode[\s\S]*@media \(max-width: 1100px\) and \(max-height: 600px\) and \(orientation: landscape\)\s*\{\s*\.table\s*\{[^}]*grid-template-areas:\s*"toolbar toolbar toolbar"\s*"top top top"\s*"left center right"\s*"human human human";[^}]*grid-template-rows:[^;]*minmax\(164px, 1\.45fr\);/,
  "The final mobile landscape override must explicitly reserve a visible player row",
);
assert.match(
  app,
  /className=\{`table \$\{isSelfClaimTurn \? "claim-decision-active" : ""\}`\}/,
  "A human claim decision must expose a dedicated table focus state",
);
assert.match(
  app,
  /const focusedActivityTile = isSelfClaimTurn\s*\? game\?\.pendingClaim\?\.tile\s*:\s*activity\.tile;[\s\S]*?<TileFace tile=\{focusedActivityTile\}/,
  "Claim prompts must feature the authoritative offered tile",
);
assert.match(
  css,
  /\.claim-decision-active \.table-discard-grid \.discard-river \.tile\s*\{[^}]*opacity:\s*0\.28;[^}]*filter:\s*saturate\(0\.35\);[\s\S]*?\.tile\.discard-latest\s*\{[^}]*opacity:\s*1;[^}]*filter:\s*none;/,
  "Claim decisions must soften the discard field while preserving the offered tile",
);
assert.match(
  css,
  /\.human-hand \.tile:disabled\s*\{[^}]*opacity:\s*1 !important;[^}]*filter:\s*none !important;/,
  "Disabled interaction states must not fade the player's hand on mobile Safari",
);
assert.match(
  css,
  /\.mobile-activity-ribbon\.is-expanded\s*\{[^}]*justify-items:\s*center;[^}]*text-align:\s*center;/,
  "Expanded mobile table activity must stay centered",
);
assert.match(
  css,
  /@media \(max-width: 1100px\) and \(max-height: 600px\) and \(orientation: landscape\)[\s\S]*?\.opponent-top \.seat-heading\s*\{[^}]*width:\s*clamp\(92px, 20vw, 150px\);/,
  "The top opponent nameplate must match the responsive side-seat width",
);
assert.match(
  css,
  /@media \(max-width: 1100px\) and \(max-height: 600px\) and \(orientation: landscape\)[\s\S]*?\.discard-lane-0\s*\{[^}]*display:\s*none;[\s\S]*?\.discard-lane-2\s*\{[^}]*width:\s*min\(280px, 96%\);/,
  "Short landscape screens must trade the player's discard lane for a visible top opponent river",
);
assert.match(
  css,
  /@media \(max-width: 760px\) and \(orientation: portrait\)[\s\S]*?\.human-hand \.tile\s*\{[^}]*flex:\s*1 1 0;[^}]*width:\s*auto;[^}]*touch-action:\s*manipulation;[\s\S]*?\.human-hand \.tile \+ \.tile\s*\{[^}]*margin-left:\s*0;/,
  "Portrait phones must expand the playable hand without overlapping touch targets",
);
assert.match(
  css,
  /@media \(max-width: 760px\) and \(orientation: portrait\)[\s\S]*?\.discard-lane-2\s*\{[^}]*width:\s*min\(230px, 96%\);[^}]*overflow:\s*visible;[\s\S]*?\.discard-lane-2 \.discard-river\s*\{[^}]*flex-wrap:\s*nowrap;/,
  "Portrait phones must keep the top opponent's recent discards visible",
);
assert.match(
  css,
  /@media \(max-width: 1100px\) and \(max-height: 600px\) and \(orientation: landscape\)[\s\S]*?\.discard-overflow-count\s*\{[^}]*width:\s*24px;[^}]*height:\s*32px;[\s\S]*?\.table-discard-lane \.discard-river\s*\{[^}]*flex-wrap:\s*nowrap;/,
  "Landscape discard counters must match tiles and remain on the same line",
);
assert.match(
  css,
  /@media \(max-width: 1100px\) and \(max-height: 600px\) and \(orientation: landscape\)[\s\S]*?\.opponent-left \.opponent-revealed-strip \.seat-sets-row,[\s\S]*?flex-direction:\s*row;[\s\S]*?\.revealed-density-compact\s*\{[^}]*--opponent-reveal-width:\s*14px;/,
  "Landscape side seats must use horizontal count-aware revealed rails",
);
assert.match(
  app,
  /className="analytics-consent-allow"[\s\S]*?onChoose\(true\)[\s\S]*?Yes, allow analytics[\s\S]*?className="analytics-consent-decline"[\s\S]*?onChoose\(false\)/,
  "The consent prompt must present the affirmative action first",
);
assert.match(
  css,
  /@media \(max-width: 1100px\)[\s\S]*?\.action-bar button\s*\{[^}]*flex:\s*0 0 clamp\(84px, 18vw, 112px\);[^}]*width:\s*clamp\(84px, 18vw, 112px\);/,
  "Compact action buttons must use equal responsive dimensions",
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
assert.match(
  app,
  /claimedTileBetween\(previous, game, claimAction\.actor\)[\s\S]*?tile-flight-\$\{tileFlight\.kind\}[\s\S]*?flight-to-river-/,
  "Discard and claim movement must be derived from authoritative game snapshots",
);
assert.match(
  app,
  /latest=\{tile\.id === latestDiscardId\}/,
  "Only the current table discard should receive the newest-discard emphasis",
);
assert.match(
  css,
  /\.tile-flight\s*\{[^}]*animation:\s*tile-flight-path[^}]*\}[\s\S]*@keyframes tile-flight-path/s,
  "Tiles must visibly travel between seats, rivers, and revealed sets",
);
assert.match(
  app,
  /game\.winSummary && showWinModal[\s\S]*?win-stage-\$\{winStage\}[\s\S]*?winStage >= 1[\s\S]*?winStage >= 2/,
  "The hand-complete experience must reveal the result in deliberate stages",
);
assert.match(
  app,
  /className="score-transfers"[\s\S]*?animatedWinTotal/,
  "The hand-complete experience must show point transfers and a counting total",
);
assert.match(
  css,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tile-flight\s*\{\s*display:\s*none;[\s\S]*?\.win-modal,/,
  "Motion polish must respect the player's reduced-motion preference",
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
