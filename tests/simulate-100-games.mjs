import assert from "node:assert/strict";

const SUITS = ["D", "B", "C"];
const DIFFICULTIES = ["balanced", "calm", "sharp", "balanced"];

function seededRandom(seed = 0x51a7c0de) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function makeWall(random) {
  const wall = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) wall.push(`${suit}${rank}`);
    }
  }
  for (const honor of ["W1", "W2", "W3", "W4", "G1", "G2", "G3"]) {
    for (let copy = 0; copy < 4; copy += 1) wall.push(honor);
  }
  for (let flower = 1; flower <= 8; flower += 1) wall.push(`F${flower}`);
  for (let index = wall.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [wall[index], wall[swap]] = [wall[swap], wall[index]];
  }
  return wall;
}

function countsFor(codes) {
  return codes.reduce((counts, code) => {
    counts[code] = (counts[code] ?? 0) + 1;
    return counts;
  }, {});
}

function canFormSets(counts) {
  const code = Object.keys(counts)
    .filter((key) => counts[key] > 0)
    .sort()[0];
  if (!code) return true;

  if (counts[code] >= 3) {
    counts[code] -= 3;
    if (canFormSets(counts)) return true;
    counts[code] += 3;
  }

  const suit = code[0];
  const rank = Number(code.slice(1));
  if (SUITS.includes(suit) && rank <= 7) {
    const second = `${suit}${rank + 1}`;
    const third = `${suit}${rank + 2}`;
    if ((counts[second] ?? 0) > 0 && (counts[third] ?? 0) > 0) {
      counts[code] -= 1;
      counts[second] -= 1;
      counts[third] -= 1;
      if (canFormSets(counts)) return true;
      counts[code] += 1;
      counts[second] += 1;
      counts[third] += 1;
    }
  }
  return false;
}

function isWin(hand, meldCount) {
  if (hand.length !== 2 + (5 - meldCount) * 3) return false;
  const counts = countsFor(hand);
  return Object.keys(counts).some((code) => {
    if (counts[code] < 2) return false;
    return canFormSets({ ...counts, [code]: counts[code] - 2 });
  });
}

function handProgress(hand) {
  const counts = countsFor(hand);
  const pairs = Object.values(counts).filter((count) => count >= 2).length;
  const triplets = Object.values(counts).filter((count) => count >= 3).length;
  const connected = hand.filter((code, index) => {
    if (!SUITS.includes(code[0])) return false;
    const rank = Number(code.slice(1));
    return hand.some(
      (candidate, candidateIndex) =>
        candidateIndex !== index &&
        candidate[0] === code[0] &&
        Math.abs(Number(candidate.slice(1)) - rank) <= 2,
    );
  }).length;
  return pairs * 3 + triplets * 6 + connected;
}

function chooseDiscard(hand, difficulty, random) {
  const weight = difficulty === "sharp" ? 1.35 : difficulty === "balanced" ? 0.88 : 0.45;
  return hand
    .map((code, index) => {
      const remaining = hand.filter((_, candidateIndex) => candidateIndex !== index);
      const same = remaining.filter((candidate) => candidate === code).length;
      const rank = Number(code.slice(1));
      const neighbors = SUITS.includes(code[0])
        ? remaining.filter((candidate) => candidate[0] === code[0] && Math.abs(Number(candidate.slice(1)) - rank) <= 2).length
        : 0;
      const noise = random() * (difficulty === "calm" ? 5 : difficulty === "balanced" ? 3 : 1);
      return { index, score: same * 4 + neighbors * 1.5 + noise - handProgress(remaining) * weight };
    })
    .sort((a, b) => a.score - b.score)[0].index;
}

function chiOptions(hand, discard) {
  if (!SUITS.includes(discard[0])) return [];
  const rank = Number(discard.slice(1));
  return [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ].flatMap(([first, second]) => {
    if (first < 1 || second > 9) return [];
    const firstCode = `${discard[0]}${first}`;
    const secondCode = `${discard[0]}${second}`;
    return hand.includes(firstCode) && hand.includes(secondCode) ? [[firstCode, secondCode]] : [];
  });
}

function removeCodes(hand, codes) {
  const next = [...hand];
  for (const code of codes) {
    const index = next.indexOf(code);
    assert.notEqual(index, -1);
    next.splice(index, 1);
  }
  return next;
}

function drawReplacement(state, playerIndex) {
  while (state.wall.length > 0) {
    const tile = state.wall.shift();
    if (tile.startsWith("F")) state.players[playerIndex].flowers.push(tile);
    else {
      state.players[playerIndex].hand.push(tile);
      return true;
    }
  }
  return false;
}

function callChance(difficulty, call, random) {
  const chances = {
    calm: { pong: 0.32, chi: 0.18 },
    balanced: { pong: 0.46, chi: 0.28 },
    sharp: { pong: 0.62, chi: 0.34 },
  };
  return random() < chances[difficulty][call];
}

function auditState(state) {
  const accounted =
    state.wall.length +
    state.discards.length +
    state.players.reduce(
      (sum, player) => sum + player.hand.length + player.flowers.length + player.melds.flat().length,
      0,
    );
  assert.equal(accounted, 144, "Every tile must remain accounted for");
  for (const player of state.players) {
    assert.ok(player.melds.length <= 5, "No player may expose more than five melds");
    assert.ok(player.hand.length <= 17 - player.melds.length * 3, "A concealed hand may not exceed its legal size");
  }
}

function playGame(gameIndex) {
  const random = seededRandom(0xabc000 + gameIndex);
  const state = {
    wall: makeWall(random),
    discards: [],
    players: DIFFICULTIES.map((difficulty) => ({ difficulty, hand: [], flowers: [], melds: [] })),
    turn: gameIndex % 4,
    turns: 0,
    maxDiscards: 0,
    maxMelds: 0,
  };

  state.players.forEach((player, index) => {
    const target = index === state.turn ? 17 : 16;
    while (player.hand.length < target && drawReplacement(state, index)) {}
  });

  while (state.wall.length > 0 && state.turns < 400) {
    state.turns += 1;
    const player = state.players[state.turn];
    if (isWin(player.hand, player.melds.length)) {
      return { winner: state.turn, source: "self-draw", ...state };
    }

    const discardIndex = chooseDiscard(player.hand, player.difficulty, random);
    const [discard] = player.hand.splice(discardIndex, 1);
    state.discards.push(discard);
    state.maxDiscards = Math.max(state.maxDiscards, state.discards.length);

    const claimOrder = [1, 2, 3].map((offset) => (state.turn + offset) % 4);
    const discardWinner = claimOrder.find((index) =>
      isWin([...state.players[index].hand, discard], state.players[index].melds.length),
    );
    if (discardWinner !== undefined) {
      state.players[discardWinner].hand.push(discard);
      state.discards.pop();
      return { winner: discardWinner, source: "discard", ...state };
    }

    let claimant;
    for (const index of claimOrder) {
      const candidate = state.players[index];
      if (candidate.hand.filter((code) => code === discard).length >= 2 && callChance(candidate.difficulty, "pong", random)) {
        candidate.hand = removeCodes(candidate.hand, [discard, discard]);
        candidate.melds.push([discard, discard, discard]);
        state.discards.pop();
        claimant = index;
        break;
      }
    }

    if (claimant === undefined) {
      const index = (state.turn + 1) % 4;
      const candidate = state.players[index];
      const options = chiOptions(candidate.hand, discard);
      if (options.length > 0 && callChance(candidate.difficulty, "chi", random)) {
        candidate.hand = removeCodes(candidate.hand, options[0]);
        candidate.melds.push([...options[0], discard]);
        state.discards.pop();
        claimant = index;
      }
    }

    if (claimant !== undefined) {
      state.turn = claimant;
    } else {
      state.turn = (state.turn + 1) % 4;
      if (!drawReplacement(state, state.turn)) break;
    }
    state.maxMelds = Math.max(state.maxMelds, ...state.players.map((candidate) => candidate.melds.length));
    auditState(state);
  }
  return { winner: undefined, source: "wall-draw", ...state };
}

const results = Array.from({ length: 100 }, (_, index) => playGame(index));
const summary = {
  games: results.length,
  wins: results.filter((game) => game.winner !== undefined).length,
  wallDraws: results.filter((game) => game.winner === undefined).length,
  selfDraws: results.filter((game) => game.source === "self-draw").length,
  discardWins: results.filter((game) => game.source === "discard").length,
  winsBySeat: [0, 1, 2, 3].map((seat) => results.filter((game) => game.winner === seat).length),
  averageTurns: Number((results.reduce((sum, game) => sum + game.turns, 0) / results.length).toFixed(1)),
  maxDiscards: Math.max(...results.map((game) => game.maxDiscards)),
  maxMelds: Math.max(...results.map((game) => game.maxMelds)),
};

console.log(JSON.stringify(summary, null, 2));

assert.equal(summary.games, 100);
assert.ok(summary.wins >= 55, "Bots should finish a healthy majority of hands");
assert.ok(Math.max(...summary.winsBySeat) - Math.min(...summary.winsBySeat) <= 18, "No seat should dominate the sample");
assert.ok(summary.maxMelds >= 3, "The simulation should exercise crowded meld layouts");
assert.ok(summary.maxDiscards >= 40, "The simulation should exercise long discard histories");
