import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" };
class HTTPError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const peer = (request) => request.socket.remoteAddress?.replace(/^::ffff:/, "");
const local = (request) => ["127.0.0.1", "::1"].includes(peer(request));

export async function createApp({ ha, dataDir, frontendDir, ingressAddress = "172.30.32.2" }) {
  const root = resolve(frontendDir);
  const configFile = join(dataDir, "connection.json");
  let config;
  try { config = JSON.parse(await readFile(configFile, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; config = {}; }
  const clients = new Set();
  const ingress = (request) => peer(request) === ingressAddress;
  const json = (response, status, value) => {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    response.end(JSON.stringify(value));
  };
  const snapshot = () => ({
    connected: ha.connected,
    config,
    states: Object.fromEntries(Object.values(config).filter(Boolean).flatMap((id) => {
      const entity = ha.states[id];
      return entity ? [[id, { state: entity.state, attributes: { friendly_name: entity.attributes?.friendly_name } }]] : [];
    })),
  });
  const broadcast = () => {
    const event = `data: ${JSON.stringify(snapshot())}\n\n`;
    for (const response of clients) response.write(event);
  };
  ha.on("change", broadcast);
  const heartbeat = setInterval(() => {
    for (const response of clients) response.write(": heartbeat\n\n");
  }, 15_000);

  async function canConfigure(request) {
    if (!ingress(request)) return false;
    const id = request.headers["x-remote-user-id"];
    if (!id) return false;
    if (!ha.connected) throw new HTTPError(503, "Home Assistant 연결을 기다리고 있습니다.");
    const users = await ha.request({ type: "config/auth/list" });
    return users.some((user) => user.id === id && user.is_active && (user.is_owner || user.group_ids.includes("system-admin")));
  }
  async function admin(request) {
    if (!await canConfigure(request)) throw new HTTPError(403, "설정은 Home Assistant 관리자로 접속해서 변경해 주세요.");
  }

  const server = createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'");
    try {
      if (!ingress(request) && !local(request)) throw new HTTPError(403, "Home Assistant를 통해 접속해 주세요.");
      const url = new URL(request.url, "http://internal");
      if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ready: true });
      if (request.method === "GET" && url.pathname === "/api/session") return json(response, 200, { can_configure: await canConfigure(request) });
      if (request.method === "GET" && url.pathname === "/api/entities") {
        await admin(request);
        return json(response, 200, Object.entries(ha.states).filter(([id]) => ["event", "binary_sensor", "camera"].includes(id.split(".")[0])).map(([id, entity]) => ({ id, name: entity.attributes?.friendly_name || id, domain: id.split(".")[0] })).sort((a, b) => a.name.localeCompare(b.name)));
      }
      if (request.method === "PUT" && url.pathname === "/api/settings") {
        await admin(request);
        if (request.headers["sec-fetch-site"] === "cross-site" || request.headers["x-home-kiosk"] !== "settings" || request.headers["content-type"] !== "application/json") throw new HTTPError(403, "같은 앱의 설정 화면에서 요청해 주세요.");
        let body = "";
        for await (const chunk of request) {
          body += chunk;
          if (Buffer.byteLength(body) > 4096) throw new HTTPError(413, "설정이 너무 큽니다.");
        }
        let next;
        try { next = JSON.parse(body); } catch { throw new HTTPError(400, "올바른 설정을 입력해 주세요."); }
        if (!next || typeof next !== "object" || Array.isArray(next) || Object.keys(next).some((key) => !["doorbell_entity", "camera_entity"].includes(key))) throw new HTTPError(400, "지원하지 않는 설정입니다.");
        for (const [key, domains] of [["doorbell_entity", ["event", "binary_sensor"]], ["camera_entity", ["camera"]]]) {
          const id = next[key];
          if (!id) { delete next[key]; continue; }
          if (typeof id !== "string" || !domains.includes(id.split(".")[0]) || !Object.hasOwn(ha.states, id)) throw new HTTPError(400, "목록에 있는 엔티티를 선택해 주세요.");
        }
        await mkdir(dataDir, { recursive: true });
        const temporary = `${configFile}.${randomUUID()}.tmp`;
        try { await writeFile(temporary, JSON.stringify(next), { mode: 0o600 }); await rename(temporary, configFile); }
        finally { await rm(temporary, { force: true }); }
        config = next;
        broadcast();
        return json(response, 200, { saved: true });
      }
      if (request.method === "GET" && url.pathname === "/api/events") {
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
        response.write(`data: ${JSON.stringify(snapshot())}\n\n`);
        clients.add(response);
        response.on("close", () => clients.delete(response));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/camera") {
        if (url.searchParams.has("entity_id")) throw new HTTPError(400, "설정에서 선택한 카메라만 볼 수 있습니다.");
        if (!config.camera_entity || !ha.connected) throw new HTTPError(503, "카메라 연결을 기다리고 있습니다.");
        const upstream = await ha.camera(config.camera_entity);
        if (!upstream.ok || !upstream.headers.get("content-type")?.startsWith("image/")) throw new HTTPError(502, "카메라 이미지를 불러오지 못했습니다.");
        response.writeHead(200, { "Content-Type": upstream.headers.get("content-type"), "Cache-Control": "no-store" });
        await pipeline(Readable.fromWeb(upstream.body), response);
        return;
      }
      if (url.pathname.startsWith("/api/") || !["GET", "HEAD"].includes(request.method)) throw new HTTPError(404, "페이지를 찾을 수 없습니다.");
      const path = resolve(root, `.${decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)}`);
      if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) throw new HTTPError(404, "페이지를 찾을 수 없습니다.");
      response.writeHead(200, { "Content-Type": MIME[extname(path)] || "application/octet-stream", "Cache-Control": "no-cache" });
      if (request.method === "HEAD") response.end();
      else await pipeline(createReadStream(path), response);
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const status = error.status || (error.code === "ENOENT" ? 404 : 503);
      json(response, status, { message: error instanceof HTTPError ? error.message : "일시적으로 요청을 처리하지 못했습니다." });
    }
  });

  return {
    server,
    canConfigure,
    async close() {
      clearInterval(heartbeat);
      ha.off("change", broadcast);
      for (const response of clients) response.end();
      server.closeAllConnections();
      if (server.listening) await new Promise((resolveClose) => server.close(resolveClose));
    },
  };
}
