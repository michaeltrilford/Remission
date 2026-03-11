import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SESSIONS_DIR = path.join(ROOT, ".remission", "sessions");
const APP_DIR = path.join(ROOT, "review-app");
const BUILD_DIR = path.join(ROOT, ".review-build");
const HOST = process.env.REMISSION_REVIEW_HOST || "127.0.0.1";
const PORT = Number(process.env.REMISSION_REVIEW_PORT || 1300);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": CONTENT_TYPES[".json"] });
  response.end(JSON.stringify(payload));
}

function sendFile(response, filePath) {
  const ext = path.extname(filePath);
  const contentType = CONTENT_TYPES[ext] || "text/plain; charset=utf-8";
  response.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(response);
}

function safeSessionPath(sessionId) {
  if (!/^[a-zA-Z0-9._:-]+$/.test(sessionId)) {
    return "";
  }

  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function listSessions() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(SESSIONS_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), "utf8")))
    .map((session) => ({
      id: session.id,
      topic: session.topic,
      createdAt: session.createdAt,
      hypothesisCount: session.result?.hypotheses?.length ?? 0
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function readSession(sessionId) {
  const filePath = safeSessionPath(sessionId);
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function serveApp(response) {
  sendFile(response, path.join(APP_DIR, "index.html"));
}

function buildReviewApp() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  buildSync({
    entryPoints: [path.join(APP_DIR, "app.jsx")],
    outfile: path.join(BUILD_DIR, "app.js"),
    bundle: true,
    platform: "browser",
    format: "iife",
    sourcemap: false,
    target: ["es2020"]
  });
}

buildReviewApp();

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === "/api/sessions") {
    sendJson(response, 200, { sessions: listSessions() });
    return;
  }

  if (url.pathname.startsWith("/api/session/")) {
    const sessionId = decodeURIComponent(url.pathname.replace("/api/session/", ""));
    const session = readSession(sessionId);

    if (!session) {
      sendJson(response, 404, { error: "Session not found" });
      return;
    }

    sendJson(response, 200, session);
    return;
  }

  if (url.pathname === "/app.js") {
    sendFile(response, path.join(BUILD_DIR, "app.js"));
    return;
  }

  if (url.pathname === "/styles.css") {
    sendFile(response, path.join(APP_DIR, "styles.css"));
    return;
  }

  if (url.pathname === "/" || url.pathname.startsWith("/session/")) {
    serveApp(response);
    return;
  }

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Not found");
});

server.listen(PORT, HOST, () => {
  console.log(`Remission review app running at http://${HOST}:${PORT}`);
});
