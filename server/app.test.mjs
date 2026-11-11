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
  registries = {
    "config/area_registry/list": [{ area_id: "living", name: "거실" }, { area_id: "bedroom", name: "침실" }],
    "config/device_registry/list": [{ id: "ac", name: "에어컨", name_by_user: "거실 에어컨", area_id: "living", identifiers: ["private-device-id"] }],
    "config/entity_registry/list": [
      { entity_id: "light.private", device_id: "ac", area_id: "bedroom" },
      { entity_id: "sensor.temperature", device_id: "ac", area_id: null },
      { entity_id: "sensor.hidden", hidden_by: "user" },
      { entity_id: "sensor.disabled", disabled_by: "user" },
    ],
  };
  calls = [];
  async request(message) {
    if (message.type === "call_service") { this.calls.push(message); return; }
    if (this.registries[message.type]) return this.registries[message.type];
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

test("diagnostics require debug mode, an ingress administrator and same-origin POST", async () => {
  const dir = await mkdtemp(join(tmpdir(), "home-kiosk-diagnostics-"));
  const headers = { "X-Remote-User-Id": "admin", "Content-Type": "application/json", "X-Home-Kiosk": "settings" };
  try {
    for (const enabled of [false, true]) {
      let calls = 0;
      const app = await createApp({ ha: new FakeHA(), dataDir: dir, frontendDir: dir, ingressAddress: "127.0.0.1", diagnostics: enabled ? async () => { calls++; return { gpu: "test" }; } : undefined });
      app.server.listen(0, "127.0.0.1");
      await new Promise(resolve => app.server.once("listening", resolve));
      const url = `http://127.0.0.1:${app.server.address().port}/api/diagnostics`;
      try {
        assert.equal((await fetch(url, { method: "POST", headers: { ...headers, "X-Remote-User-Id": "viewer" }, body: "{}" })).status, enabled ? 403 : 404);
        assert.equal((await fetch(url, { method: "POST", headers: { ...headers, "Sec-Fetch-Site": "cross-site" }, body: "{}" })).status, enabled ? 403 : 404);
        assert.equal(calls, 0);
        assert.equal((await fetch(url, { method: "POST", headers, body: "{}" })).status, enabled ? 200 : 404);
        assert.equal(calls, enabled ? 1 : 0);
      } finally { await app.close(); }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test("entity choices inherit device areas, respect entity overrides and omit registry secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "home-kiosk-choices-"));
  const ha = new FakeHA();
  ha.states["sensor.temperature"] = { state: "25", attributes: { friendly_name: "온도", device_class: "temperature", unit_of_measurement: "°C", private_attribute: "secret" } };
  ha.states["sensor.hidden"] = { state: "1", attributes: {} };
  ha.states["sensor.disabled"] = { state: "2", attributes: {} };
  const app = await createApp({ ha, dataDir: dir, frontendDir: dir, ingressAddress: "127.0.0.1" });
  app.server.listen(0, "127.0.0.1");
  await new Promise(resolve => app.server.once("listening", resolve));
  const url = `http://127.0.0.1:${app.server.address().port}/api/entities`;
  try {
    const headers = { "X-Remote-User-Id": "admin" };
    const catalog = await (await fetch(url, { headers })).json();
    assert.deepEqual(catalog.areas, [{ id: "living", name: "거실" }, { id: "bedroom", name: "침실" }]);
    const temperature = catalog.entities.find(e => e.id === "sensor.temperature");
    assert.equal(temperature.area_id, "living");
    assert.equal(temperature.device_name, "거실 에어컨");
    assert.equal(temperature.device_class, "temperature");
    assert.equal(temperature.unit, "°C");
    assert.equal(catalog.entities.find(e => e.id === "light.private").area_id, "bedroom");
    assert.equal(catalog.entities.find(e => e.id === "camera.entry").area_id, null);
    assert.equal(catalog.entities.some(e => ["sensor.hidden", "sensor.disabled"].includes(e.id)), false);
    assert.doesNotMatch(JSON.stringify(catalog), /camera-secret|private-device-id|private_attribute|access_token/);
    // A registry failure must be reported instead of presenting an empty successful list.
    ha.registries["config/area_registry/list"] = undefined;
    assert.equal((await fetch(url, { headers })).status, 503);
    assert.equal((await fetch(url, { headers: { "X-Remote-User-Id": "viewer" } })).status, 403);
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
