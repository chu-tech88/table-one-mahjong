import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function connectClient(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Timed out connecting to ${url}`));
    }, 5000);

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

function waitForMessage(ws, predicate, timeoutMs = 5000) {
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

async function main() {
  const port = 19080 + Math.floor(Math.random() * 1000);
  const url = `ws://127.0.0.1:${port}`;
  const roomId = `chat-${Date.now()}`;

  const server = spawn(
    process.execPath,
    ["--import", "tsx", "server/game-server.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, WS_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    await delay(1000);
    const wsA = await connectClient(url);
    const wsB = await connectClient(url);

    wsA.send(
      JSON.stringify({
        type: "join-room",
        roomId,
        playerIndex: 0,
        playerName: "A",
      }),
    );
    wsB.send(
      JSON.stringify({
        type: "join-room",
        roomId,
        playerIndex: 1,
        playerName: "B",
      }),
    );

    await waitForMessage(wsA, (msg) => msg.type === "game-state-update");
    await waitForMessage(wsB, (msg) => msg.type === "game-state-update");

    wsA.send(
      JSON.stringify({
        type: "join-lobby-chat",
        roomId,
        playerIndex: 0,
        playerName: "A",
      }),
    );
    wsB.send(
      JSON.stringify({
        type: "join-lobby-chat",
        roomId,
        playerIndex: 1,
        playerName: "B",
      }),
    );
    await delay(50);

    wsA.send(
      JSON.stringify({
        type: "lobby-chat",
        roomId,
        text: "hello room",
        playerIndex: 0,
        playerName: "A",
      }),
    );

    const received = await waitForMessage(
      wsB,
      (msg) => msg.type === "lobby-chat-message",
    );
    assert.equal(received.message?.text, "hello room");
    assert.equal(received.message?.playerName, "A");
  } finally {
    server.kill("SIGTERM");
    await delay(200);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
