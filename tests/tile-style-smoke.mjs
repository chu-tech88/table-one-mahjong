import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

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
  /\.table\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*minmax\(520px, 880px\)[^}]*minmax\(0, 1fr\)/s,
  "Wide tables must keep the play area centered within flexible outer margins",
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
