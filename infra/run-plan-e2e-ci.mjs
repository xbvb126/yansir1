import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isExpectedApi, isExpectedWeb } from "./service-readiness.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmShell = process.platform === "win32";
const apiBaseUrl = normalizeBase(process.env.E2E_API_BASE_URL || "http://127.0.0.1:3101/api");
const webBaseUrl = normalizeWebBase(process.env.E2E_WEB_BASE_URL || "http://127.0.0.1:3200/yansir/");
const started = [];

try {
  await ensureApi();
  await ensureWeb();
  await run("plan E2E tests", ["run", "test:e2e:plans", "-w", "apps/api"]);
} finally {
  await stopStartedProcesses();
}

async function ensureApi() {
  const healthUrl = `${apiBaseUrl}/health`;
  if (await isExpectedApi(healthUrl)) {
    console.log(`Reusing API at ${healthUrl}`);
    return;
  }

  const url = new URL(apiBaseUrl);
  ensureLocalUrl(url, "E2E_API_BASE_URL");
  const port = url.port || "3101";
  start("API server", ["run", "start", "-w", "apps/api"], {
    API_PORT: port,
    NODE_ENV: process.env.NODE_ENV || "test"
  });
  await waitFor(isExpectedApi, healthUrl, "API health");
}

async function ensureWeb() {
  if (await isExpectedWeb(webBaseUrl)) {
    console.log(`Reusing web preview at ${webBaseUrl}`);
    return;
  }

  const url = new URL(webBaseUrl);
  ensureLocalUrl(url, "E2E_WEB_BASE_URL");
  const port = url.port || "3200";
  start("web preview", ["run", "preview", "-w", "apps/web", "--", "--host", url.hostname, "--port", port, "--strictPort"], {
    WEB_PORT: port,
    VITE_BASE_PATH: url.pathname
  });
  await waitFor(isExpectedWeb, webBaseUrl, "web preview");
}

function start(label, args, extraEnv = {}) {
  console.log(`Starting ${label}...`);
  const child = spawn(npmCommand, args, {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
    shell: npmShell,
    detached: process.platform !== "win32"
  });
  const entry = { label, child, stopping: false };
  started.push(entry);
  child.once("exit", (code, signal) => {
    if (entry.stopping) {
      return;
    }
    if (code !== null && code !== 0) {
      console.error(`${label} exited early with code ${code}`);
    } else if (signal) {
      console.error(`${label} exited early with signal ${signal}`);
    }
  });
}

async function run(label, args) {
  console.log(`Running ${label}...`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
      shell: npmShell
    });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) {
    throw new Error(`${label} failed with exit code ${code}`);
  }
}

async function waitFor(check, url, label) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await check(url)) {
      console.log(`${label} is ready at ${url}`);
      return;
    }
    await delay(500);
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

async function stopStartedProcesses() {
  await Promise.all(started.reverse().map((entry) => stopProcess(entry)));
}

async function stopProcess(entry) {
  const { label, child } = entry;
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  console.log(`Stopping ${label}...`);
  entry.stopping = true;
  terminateProcessTree(child);
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3000).then(() => {
      if (child.exitCode === null && child.signalCode === null) {
        terminateProcessTree(child, "SIGKILL");
      }
    })
  ]);
}

function terminateProcessTree(child, signal = "SIGTERM") {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

function ensureLocalUrl(url, envName) {
  const host = url.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error(`${envName} points to ${url.origin}; start that service before running E2E tests.`);
  }
}

function normalizeBase(baseUrl) {
  return baseUrl.replace(/\/$/, "");
}

function normalizeWebBase(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
