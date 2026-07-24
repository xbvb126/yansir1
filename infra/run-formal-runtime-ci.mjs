import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { loadLocalEnv } from "./env-loader.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadLocalEnv(rootDir);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for formal runtime readiness verification");
}

const websocket = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await once(websocket, "listening");
const websocketAddress = websocket.address();
if (typeof websocketAddress === "string") throw new Error("unexpected WebSocket server address");

const apiPort = await reservePort();
const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
  cwd: rootDir,
  env: {
    ...process.env,
    API_PORT: String(apiPort),
    STRATEGY_FORMAL_SYMBOLS: "BTCUSDT",
    BINANCE_REALTIME_STREAM_URL: `ws://127.0.0.1:${websocketAddress.port}/stream`,
    STRATEGY_GLOBAL_SCAN_ENABLED: "false",
    FORMAL_STRATEGY_VERSION: process.env.FORMAL_STRATEGY_VERSION || "pine-v6-ci"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let logs = "";
child.stdout.on("data", (chunk) => { logs = appendLog(logs, chunk); });
child.stderr.on("data", (chunk) => { logs = appendLog(logs, chunk); });

try {
  const healthUrl = `http://127.0.0.1:${apiPort}/api/health`;
  const health = await waitForFormalReadiness(healthUrl, child);
  if (health.database?.connected !== true || health.database?.mode !== "postgres") {
    throw new Error(`runtime database is not connected: ${JSON.stringify(health.database)}`);
  }
  if (health.formalSignals?.ready !== true) {
    throw new Error(`formalSignals.ready !== true: ${JSON.stringify(health.formalSignals)}`);
  }
  console.log(JSON.stringify({
    ready: true,
    database: health.database,
    formalSignals: {
      ready: health.formalSignals.ready,
      reason: health.formalSignals.reason,
      queue: health.formalSignals.queue,
      matchQueue: health.formalSignals.matchQueue,
      deliveryQueue: health.formalSignals.deliveryQueue
    }
  }, null, 2));
} catch (error) {
  throw new Error(`${error instanceof Error ? error.message : String(error)}\nAPI output:\n${logs}`);
} finally {
  const childExit = child.exitCode !== null ? Promise.resolve() : once(child, "exit");
  const websocketClosed = new Promise((resolve) => websocket.close(resolve));
  child.kill();
  await Promise.allSettled([childExit, websocketClosed]);
}

async function waitForFormalReadiness(url, apiChild) {
  const deadline = Date.now() + 60_000;
  let latest = null;
  while (Date.now() < deadline) {
    if (apiChild.exitCode !== null) throw new Error(`API exited with code ${apiChild.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) {
        latest = await response.json();
        if (latest.database?.connected !== true) {
          throw new Error(`database.connected is not true: ${JSON.stringify(latest.database)}`);
        }
        if (latest.formalSignals?.ready === true) return latest;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("database.connected is not true")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`formal runtime readiness timed out; latest health: ${JSON.stringify(latest)}`);
}

async function reservePort() {
  const { createServer } = await import("node:net");
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (typeof address === "string") throw new Error("unexpected TCP server address");
  server.close();
  await once(server, "close");
  return address.port;
}

function appendLog(current, chunk) {
  return `${current}${String(chunk)}`.slice(-20_000);
}
