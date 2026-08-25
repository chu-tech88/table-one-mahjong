import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";

const TEST_TIMEOUT_MS = 8000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForMessage(ws, predicate, timeoutMs = TEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for websocket message"));
    }, timeoutMs);

    const onMessage = (raw) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (predicate(parsed)) {
          cleanup();
          resolve(parsed);
        }
      } catch {
        // Ignore malformed payloads.
      }
    };

    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket closed while waiting for message"));
    };

    const onError = (err) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onError);
    };

    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.on("error", onError);
  });
}

function connectClient(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Timed out connecting to ${url}`));
    }, TEST_TIMEOUT_MS);

    ws.once("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.once("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function send(ws, payload) {
  ws.send(JSON.stringify(payload));
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = spawn(
      process.execPath,
      ["--import", "tsx", "server/game-server.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          WS_PORT: String(port),
          DISCONNECT_GRACE_MS: "300",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const timeout = setTimeout(() => {
      cleanup();
      server.kill("SIGTERM");
      reject(new Error("Timed out starting multiplayer server"));
    }, TEST_TIMEOUT_MS);

    const onStdout = (chunk) => {
      const text = chunk.toString();
      if (
        text.includes(`Listening on ws://localhost:${port}`) ||
        text.includes(`WebSocket listening on ws://localhost:${port}`)
      ) {
        cleanup();
        resolve(server);
      }
    };

    const onExit = (code) => {
      cleanup();
      reject(new Error(`Server exited early with code ${code ?? "null"}`));
    };

    const onStderr = (chunk) => {
      const text = chunk.toString();
      if (text.includes("EADDRINUSE")) {
        cleanup();
        reject(new Error(`Port ${port} already in use`));
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      server.stdout.off("data", onStdout);
      server.stderr.off("data", onStderr);
      server.off("exit", onExit);
    };

    server.stdout.on("data", onStdout);
    server.stderr.on("data", onStderr);
    server.on("exit", onExit);
  });
}

async function main() {
  const port = 18080 + Math.floor(Math.random() * 1000);
  const url = `ws://127.0.0.1:${port}`;
  const roomId = `smoke-${Date.now()}`;

  let server;
  let ws0;
  let ws1;
  let wsConflict;
  let wsResume;
  let wsLateResume;
  let wsAutoClients = [];
  let wsAutoFull;

  try {
    server = await startServer(port);

    const autoRoomId = `${roomId}-automatic`;
    const assignedSeats = [];
    for (let index = 0; index < 4; index += 1) {
      const automaticClient = await connectClient(url);
      wsAutoClients.push(automaticClient);
      const autoJoin = waitForMessage(
        automaticClient,
        (msg) => msg.type === "room-joined" && msg.roomId === autoRoomId,
      );
      send(automaticClient, {
        type: "join-room",
        roomId: autoRoomId,
        playerName: `Auto Seat ${index + 1}`,
      });
      assignedSeats.push((await autoJoin).playerIndex);
    }
    assert.deepEqual(
      [...assignedSeats].sort((a, b) => a - b),
      [0, 1, 2, 3],
      "Automatic assignment should fill each seat exactly once",
    );

    wsAutoFull = await connectClient(url);
    const fullRoomRejection = waitForMessage(
      wsAutoFull,
      (msg) => msg.type === "action-rejected" && msg.reason.includes("is full"),
    );
    send(wsAutoFull, {
      type: "join-room",
      roomId: autoRoomId,
      playerName: "Fifth Player",
    });
    await fullRoomRejection;
    wsAutoClients.forEach((client) => client.close());
    wsAutoClients = [];
    wsAutoFull.close();
    wsAutoFull = undefined;

    ws0 = await connectClient(url);
    ws1 = await connectClient(url);

    const joined0Promise = waitForMessage(
      ws0,
      (msg) => msg.type === "room-joined" && msg.playerIndex === 0,
    );
    const joined1Promise = waitForMessage(
      ws1,
      (msg) => msg.type === "room-joined" && msg.playerIndex === 1,
    );
    const state0Promise = waitForMessage(
      ws0,
      (msg) =>
        msg.type === "game-state-update" &&
        msg.game.players[1].name === "Partner",
    );
    const state1Promise = waitForMessage(
      ws1,
      (msg) => msg.type === "game-state-update",
    );
    const settingsUpdatePromise = waitForMessage(
      ws1,
      (msg) =>
        msg.type === "game-state-update" &&
        msg.game.rules.baseWin === 7 &&
        msg.game.houseRules[0].enabled === false,
    );
    send(ws0, {
      type: "join-room",
      roomId,
      playerIndex: 0,
      playerName: "Eric",
    });
    send(ws1, {
      type: "join-room",
      roomId,
      playerIndex: 1,
      playerName: "Partner",
    });

    const joined0 = await joined0Promise;
    const joined1 = await joined1Promise;
    const state0 = await state0Promise;
    const state1 = await state1Promise;

    assert.ok(joined0.playerId && joined0.resumeToken);
    assert.ok(joined1.playerId && joined1.resumeToken);
    assert.equal(state0.roomInstanceId, joined0.roomInstanceId);
    assert.ok(state0.stateVersion >= joined0.stateVersion);

    assert.equal(
      state0.game.tableId,
      state1.game.tableId,
      "Both clients should receive same room state",
    );
    assert.equal(state0.game.turn, 0, "Initial dealer turn should be seat 0");
    assert.equal(state0.game.players[0].name, "Eric");
    assert.equal(state1.game.players[1].name, "Partner");
    assert.equal(state1.game.players[0].controller, "human");
    assert.equal(state1.game.players[2].controller, "ai");
    assert.ok(
      state1.game.players.every((player) => player.difficulty === "balanced"),
      "Every seat should begin a new room at Balanced difficulty",
    );
    assert.equal(state0.game.houseRules.length, 68);

    send(ws0, {
      type: "player-action",
      playerIndex: 0,
      action: {
        type: "update-table-rules",
        rules: { baseWin: 7 },
        houseRules: state0.game.houseRules.map((rule, index) => ({
          ...rule,
          enabled: index !== 0,
        })),
      },
    });
    const settingsUpdate = await settingsUpdatePromise;
    assert.equal(settingsUpdate.game.rules.baseWin, 7);

    wsConflict = await connectClient(url);
    const rejectionPromise = waitForMessage(
      wsConflict,
      (msg) =>
        msg.type === "action-rejected" &&
        typeof msg.reason === "string" &&
        msg.reason.includes("reserved"),
    );
    send(wsConflict, {
      type: "join-room",
      roomId,
      playerIndex: 1,
      playerName: "Conflict",
    });
    const rejection = await rejectionPromise;
    assert.ok(
      rejection.reason.includes("reserved"),
      "Joining a reserved seat without its resume token should be rejected",
    );

    const tileId = state0.game.players[0].hand[0]?.id;
    assert.ok(tileId, "Seat 0 should have a discardable tile");

    const post0Promise = waitForMessage(
      ws0,
      (msg) =>
        msg.type === "game-state-update" &&
        msg.game.actionSeq > state0.game.actionSeq,
    );
    const post1Promise = waitForMessage(
      ws1,
      (msg) =>
        msg.type === "game-state-update" &&
        msg.game.actionSeq > state0.game.actionSeq,
    );
    send(ws0, {
      type: "player-action",
      playerIndex: 0,
      actionId: "smoke-discard-1",
      action: { type: "discard", tileId },
    });

    const post0 = await post0Promise;
    const post1 = await post1Promise;

    assert.equal(
      post0.game.actionSeq,
      post1.game.actionSeq,
      "Discard update should broadcast to all joined clients",
    );

    const duplicateResponsePromise = waitForMessage(
      ws0,
      (msg) => msg.type === "game-state-update",
    );
    send(ws0, {
      type: "player-action",
      playerIndex: 0,
      actionId: "smoke-discard-1",
      action: { type: "discard", tileId },
    });
    const duplicateResponse = await duplicateResponsePromise;
    assert.equal(
      duplicateResponse.game.actionSeq,
      post0.game.actionSeq,
      "A duplicate action ID must not execute the action twice",
    );
    assert.equal(
      duplicateResponse.stateVersion,
      post0.stateVersion,
      "A duplicate action must not create a new authoritative state version",
    );

    const replacedSocket = ws1;
    const replacement = await connectClient(url);
    const replacementJoinedPromise = waitForMessage(
      replacement,
      (msg) => msg.type === "room-joined" && msg.playerIndex === 1,
    );
    const replacementStatePromise = waitForMessage(
      replacement,
      (msg) =>
        msg.type === "game-state-update" &&
        msg.game.seatPresence?.[1] === "connected",
    );
    const replacedClosedPromise = new Promise((resolve) =>
      replacedSocket.once("close", resolve),
    );
    send(replacement, {
      type: "join-room",
      roomId,
      playerIndex: 1,
      playerName: "Partner",
      playerId: joined1.playerId,
      resumeToken: joined1.resumeToken,
    });
    await replacementJoinedPromise;
    await replacementStatePromise;
    await replacedClosedPromise;
    ws1 = replacement;
    await delay(350);
    const fencedStatePromise = waitForMessage(
      ws0,
      (msg) => msg.type === "game-state-update",
    );
    send(ws0, { type: "request-state" });
    const fencedState = await fencedStatePromise;
    assert.equal(fencedState.game.seatPresence?.[1], "connected");
    assert.equal(fencedState.game.players[1].controller, "human");
    assert.match(
      post0.game.actionLog.find((action) => action.type === "discard")
        ?.description ?? "",
      /^Eric discards .+\.$/,
      "Opponent activity should identify the player and discarded tile",
    );

    const reconnectingStatePromise = waitForMessage(
      ws0,
      (msg) =>
        msg.type === "game-state-update" &&
        msg.game.seatPresence?.[1] === "reconnecting" &&
        msg.game.players[1].controller === "human",
    );
    const takeoverNoticePromise = waitForMessage(
      ws0,
      (msg) =>
        msg.type === "player-disconnected" &&
        msg.playerIndex === 1 &&
        msg.aiTakeover === true,
    );
    const takeoverStatePromise = waitForMessage(
      ws0,
      (msg) =>
        msg.type === "game-state-update" &&
        msg.game.seatPresence?.[1] === "ai" &&
        msg.game.players[1].controller === "ai",
    );
    ws1.close();
    await reconnectingStatePromise;
    await takeoverNoticePromise;
    await takeoverStatePromise;

    wsLateResume = await connectClient(url);
    const lateResumeJoinedPromise = waitForMessage(
      wsLateResume,
      (msg) => msg.type === "room-joined" && msg.playerIndex === 1,
    );
    const lateResumeStatePromise = waitForMessage(
      wsLateResume,
      (msg) =>
        msg.type === "game-state-update" &&
        msg.game.seatPresence?.[1] === "connected",
    );
    send(wsLateResume, {
      type: "join-room",
      roomId,
      playerIndex: 1,
      playerName: "Partner",
      playerId: joined1.playerId,
      resumeToken: joined1.resumeToken,
    });
    await lateResumeJoinedPromise;
    await lateResumeStatePromise;

    ws0.close();
    await delay(120);
    wsResume = await connectClient(url);
    const resumedStatePromise = waitForMessage(
      wsResume,
      (msg) => msg.type === "game-state-update",
    );
    send(wsResume, {
      type: "join-room",
      roomId,
      playerIndex: 0,
      playerName: "Eric",
      playerId: joined0.playerId,
      resumeToken: joined0.resumeToken,
    });
    const resumed = await resumedStatePromise;
    assert.ok(
      resumed.game.actionSeq >= post0.game.actionSeq,
      "An unexpected disconnect must preserve room scores and round progress for reconnection",
    );
    assert.equal(resumed.game.rules.baseWin, 7);

    const leaveRoomId = `${roomId}-leave`;
    const wsLeave = await connectClient(url);
    const leaveJoinPromise = waitForMessage(
      wsLeave,
      (msg) => msg.type === "game-state-update",
    );
    send(wsLeave, {
      type: "join-room",
      roomId: leaveRoomId,
      playerIndex: 0,
      playerName: "Leaver",
    });
    await leaveJoinPromise;

    send(wsLeave, { type: "leave-room" });
    await delay(120);

    const wsFresh = await connectClient(url);
    const freshJoinPromise = waitForMessage(
      wsFresh,
      (msg) => msg.type === "game-state-update",
    );
    send(wsFresh, {
      type: "join-room",
      roomId: leaveRoomId,
      playerIndex: 0,
      playerName: "Fresh",
    });
    const freshState = await freshJoinPromise;
    assert.ok(
      freshState.game.actionSeq < post0.game.actionSeq,
      "An intentionally emptied room should start a fresh hand for the next player",
    );
    assert.equal(
      freshState.game.turn,
      0,
      "A fresh room should begin with a new dealer turn",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          roomId,
          server: url,
          actionSeq: post0.game.actionSeq,
          message: "Multiplayer smoke test passed",
        },
        null,
        2,
      ),
    );
  } finally {
    ws0?.close();
    ws1?.close();
    wsConflict?.close();
    wsResume?.close();
    wsLateResume?.close();
    wsAutoClients.forEach((client) => client.close());
    wsAutoFull?.close();
    if (server) {
      server.kill("SIGTERM");
      await delay(150);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
