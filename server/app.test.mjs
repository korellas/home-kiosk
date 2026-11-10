import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "./app.mjs";

class FakeHA extends EventEmitter {
  connected = true;
  states = {
    "event.entry": { state: "unknown", attributes: { friendly_name: "내부 초인종" } },
    "binary_sensor.back": { state: "off", attributes: { friendly_name: "뒤쪽 호출" } },
    "camera.entry": { state: "idle", attributes: { access_token: "camera-secret", entity_picture: "/api/camera_proxy/camera.entry?token=camera-secret" } },
    "light.private": { state: "on", attributes: {} },
  };
  users = [{ id: "admin", is_active: true, group_ids: ["system-admin"] }, { id: "viewer", is_active: true, group_ids: ["system-users"] }];
  calls = [];
  async request(message) {
    if (message.type === "call_service") { this.calls.push(message); return; }
    assert.equal(message.type, "config/auth/list");
    if (!this.connected) throw new Error("offline");
    return this.users;
  }
  async camera(entity) {
    assert.equal(entity, "camera.entry");
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
  }
}

test("standalone app protects settings, persists selections and filters its camera and state API", async () => {
  const dir = await mkdtemp(join(tmpdir(), "home-kiosk-server-"));
  await writeFile(join(dir, "index.html"), "<html>local dashboard</html>");
  const ha = new FakeHA();
  // A loopback test peer represents the Supervisor proxy only in this test.
  const app = await createApp({ ha, dataDir: dir, frontendDir: dir, ingressAddress: "127.0.0.1" });
  app.server.listen(0, "127.0.0.1");
  await new Promise((resolve) => app.server.once("listening", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const headers = { "X-Remote-User-Id": "admin", "Content-Type": "application/json", "X-Home-Kiosk": "settings" };
  try {
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(`${base}/api/session`)).status, 200);
    assert.equal((await fetch(`${base}/api/entities`, { headers: { "X-Remote-User-Id": "viewer" } })).status, 403);
    assert.equal((await fetch(`${base}/api/entities`, { headers })).status, 200);
    const config = { doorbell_entity: "event.entry", camera_entity: "camera.entry" };
    assert.equal((await fetch(`${base}/api/settings`, { method: "PUT", headers: { ...headers, "X-Remote-User-Id": "viewer" }, body: JSON.stringify(config) })).status, 403);
    assert.equal((await fetch(`${base}/api/settings`, { method: "PUT", headers, body: JSON.stringify({ doorbell_entity: "light.private" }) })).status, 400);
    assert.equal((await fetch(`${base}/api/settings`, { method: "PUT", headers, body: JSON.stringify(config) })).status, 200);
    assert.deepEqual(JSON.parse(await readFile(join(dir, "connection.json"), "utf8")), config);
    const event = await fetch(`${base}/api/events`);
    const reader = event.body.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    assert.match(first, /event.entry/);
    assert.doesNotMatch(first, /camera-secret|access_token|light.private/);
    await reader.cancel();
    assert.equal((await fetch(`${base}/api/camera`)).headers.get("content-type"), "image/jpeg");
    assert.equal((await fetch(`${base}/api/camera?entity_id=camera.other`)).status, 400);
    assert.equal((await fetch(`${base}/api/settings`, { method: "PUT", headers: { ...headers, "Sec-Fetch-Site": "cross-site" }, body: "{}" })).status, 403);
    ha.users[0].group_ids = ["system-users"];
    assert.equal((await fetch(`${base}/api/settings`, { method: "PUT", headers, body: "{}" })).status, 403);
    ha.connected = false;
    ha.emit("change");
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(`${base}/api/session`, { headers })).status, 503);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("physical kiosk cannot edit settings and untrusted peers cannot spoof Ingress headers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "home-kiosk-security-"));
  const app = await createApp({ ha: new FakeHA(), dataDir: dir, frontendDir: dir });
  try {
    const fakeRequest = (address) => ({ socket: { remoteAddress: address }, headers: { "x-remote-user-id": "admin" } });
    assert.equal(await app.canConfigure(fakeRequest("127.0.0.1")), false);
    assert.equal(await app.canConfigure(fakeRequest("203.0.113.42")), false);
    assert.equal(await app.canConfigure(fakeRequest("172.30.32.2")), true);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

test("physical controls are restricted to selected devices and settings remain admin-only", async () => {
  const dir = await mkdtemp(join(tmpdir(), "home-kiosk-controls-"));
  await writeFile(join(dir, "connection.json"), JSON.stringify({ lights: { living: ["light.private"] } }));
  const ha = new FakeHA(), app = await createApp({ ha, dataDir: dir, frontendDir: dir });
  app.server.listen(0, "127.0.0.1");
  await new Promise(resolve => app.server.once("listening", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const headers = { "Content-Type": "application/json", "X-Home-Kiosk": "settings" };
  const command = { type: "room-power", room: "living", on: false };
  try {
    assert.equal((await fetch(`${base}/api/command`, { method: "POST", headers, body: JSON.stringify(command) })).status, 200);
    assert.equal(ha.calls.length, 1);
    assert.deepEqual(ha.calls[0].target, { entity_id: "light.private" });
    assert.equal((await fetch(`${base}/api/command`, { method: "POST", headers: { ...headers, "Sec-Fetch-Site": "cross-site" }, body: JSON.stringify(command) })).status, 403);
    assert.equal((await fetch(`${base}/api/command`, { method: "POST", headers, body: JSON.stringify({ type: "light", room: "living", id: "light.unselected", patch: { on: false } }) })).status, 400);
    assert.equal((await fetch(`${base}/api/settings`, { method: "PUT", headers, body: "{}" })).status, 403);
    assert.equal((await fetch(`${base}/api/test-sound`, { method: "POST", headers, body: "{}" })).status, 403);
    assert.equal(ha.calls.length, 1);
    assert.equal((await (await fetch(`${base}/api/session`)).json()).local_display, true);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
