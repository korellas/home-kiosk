import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "./app.mjs";

class Response extends EventEmitter {
  chunks = [];
  setHeader() {}
  writeHead() { this.headersSent = true; }
  write(chunk) { this.chunks.push(chunk); return true; }
  end() { this.emit("close"); }
}

test("SSE only sends changed dashboard state, while retaining removals and connection changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "home-kiosk-events-"));
  await writeFile(join(dir, "connection.json"), JSON.stringify({ lights: { living: ["light.selected"] } }));
  const ha = new EventEmitter();
  ha.connected = true;
  ha.states = { "light.selected": { state: "on", attributes: { brightness: 100 } } };
  const app = await createApp({ ha, dataDir: dir, frontendDir: dir });
  const response = new Response();
  try {
    app.server.emit("request", { method: "GET", url: "/api/events", socket: { remoteAddress: "127.0.0.1" }, headers: {} }, response);
    assert.equal(response.chunks.length, 1);
    for (let i = 0; i < 100; i++) {
      ha.states["sensor.unselected"] = { state: String(i), attributes: {} };
      ha.emit("change", "sensor.unselected");
    }
    assert.equal(response.chunks.length, 1, "unselected device traffic must stay off the dashboard stream");
    ha.states["light.selected"].attributes.last_seen = "changed metadata";
    ha.emit("change", "light.selected");
    assert.equal(response.chunks.length, 1, "attributes outside the dashboard projection do not change the payload");
    ha.states["light.selected"].attributes.brightness = 200;
    ha.emit("change", "light.selected");
    assert.equal(response.chunks.length, 2);
    assert.match(response.chunks.at(-1), /"brightness":200/);
    delete ha.states["light.selected"];
    ha.emit("change", "light.selected");
    assert.equal(response.chunks.length, 3);
    assert.match(response.chunks.at(-1), /"states":\{\}/);
    ha.connected = false;
    ha.emit("change");
    assert.equal(response.chunks.length, 4);
    assert.match(response.chunks.at(-1), /"connected":false/);
    ha.connected = true;
    ha.emit("change");
    assert.equal(response.chunks.length, 5);
    response.end();
    ha.states["light.selected"] = { state: "off", attributes: {} };
    ha.emit("change", "light.selected");
    const reconnected = new Response();
    app.server.emit("request", { method: "GET", url: "/api/events", socket: { remoteAddress: "127.0.0.1" }, headers: {} }, reconnected);
    assert.match(reconnected.chunks[0], /"state":"off"/);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
