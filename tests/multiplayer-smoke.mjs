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
      "npx",
      ["tsx", "server/game-server.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, WS_PORT: String(port) },
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
      if (text.includes(`Listening on ws://localhost:${port}`)) {
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

  try {
    server = await startServer(port);

    ws0 = await connectClient(url);
    ws1 = await connectClient(url);

    send(ws0, { type: "join-room", roomId, playerIndex: 0 });
    send(ws1, { type: "join-room", roomId, playerIndex: 1 });

    const state0 = await waitForMessage(ws0, (msg) => msg.type === "game-state-update");
    const state1 = await waitForMessage(ws1, (msg) => msg.type === "game-state-update");

    assert.equal(state0.game.tableId, state1.game.tableId, "Both clients should receive same room state");
    assert.equal(state0.game.turn, 0, "Initial dealer turn should be seat 0");

    wsConflict = await connectClient(url);
    send(wsConflict, { type: "join-room", roomId, playerIndex: 1 });
    const rejection = await waitForMessage(
      wsConflict,
      (msg) => msg.type === "action-rejected" && typeof msg.reason === "string" && msg.reason.includes("already taken"),
    );
    assert.ok(rejection.reason.includes("already taken"), "Joining occupied seat should be rejected");

    const tileId = state0.game.players[0].hand[0]?.id;
    assert.ok(tileId, "Seat 0 should have a discardable tile");

    send(ws0, {
      type: "player-action",
      playerIndex: 0,
      action: { type: "discard", tileId },
    });

    const post0 = await waitForMessage(
      ws0,
      (msg) => msg.type === "game-state-update" && msg.game.actionSeq > state0.game.actionSeq,
    );
    const post1 = await waitForMessage(
      ws1,
      (msg) => msg.type === "game-state-update" && msg.game.actionSeq >= post0.game.actionSeq,
    );

    assert.equal(post0.game.actionSeq, post1.game.actionSeq, "Discard update should broadcast to all joined clients");

    console.log(JSON.stringify({
      ok: true,
      roomId,
      server: url,
      actionSeq: post0.game.actionSeq,
      message: "Multiplayer smoke test passed",
    }, null, 2));
  } finally {
    ws0?.close();
    ws1?.close();
    wsConflict?.close();

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
