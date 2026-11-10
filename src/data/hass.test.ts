import assert from "node:assert/strict";
import test from "node:test";
import { createHassAdapter } from "./hass.ts";
import type { HassEntity, HomeAssistant } from "./hass.ts";

function entity(state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return { state, attributes };
}
function hass(states: Record<string, HassEntity>, connected = true): HomeAssistant {
  return { states, connected };
}

test("selected event entity rings on a new call, without replaying startup history", async () => {
  const adapter = createHassAdapter();
  const config = { doorbell_entity: "event.chosen_doorbell" };
  adapter.update(hass({ "event.chosen_doorbell": entity("2026-11-10T09:00:00Z") }), config);
  assert.equal(adapter.getSnapshot().door.ringing, false);
  adapter.update(hass({ "event.other_doorbell": entity("2026-11-10T09:01:00Z"), "event.chosen_doorbell": entity("2026-11-10T09:00:00Z") }), config);
  assert.equal(adapter.getSnapshot().door.ringing, false);
  adapter.update(hass({ "event.chosen_doorbell": entity("2026-11-10T09:02:00Z") }), config);
  assert.equal(adapter.getSnapshot().door.ringing, true);
  assert.equal(adapter.getSnapshot().door.events.length, 1);
  await adapter.execute({ type: "door-dismiss" });
  adapter.update(hass({ "event.chosen_doorbell": entity("2026-11-10T09:02:00Z") }), config);
  assert.equal(adapter.getSnapshot().door.ringing, false);
  assert.equal(adapter.getSnapshot().door.missedCalls, 0);
});

test("an event entity with no prior calls still detects its very first press", () => {
  const adapter = createHassAdapter();
  const config = { doorbell_entity: "event.new_doorbell" };
  adapter.update(hass({ "event.new_doorbell": entity("unknown") }), config);
  assert.equal(adapter.getSnapshot().door.available, true);
  assert.equal(adapter.getSnapshot().door.ringing, false);
  adapter.update(hass({ "event.new_doorbell": entity("2026-11-10T09:00:00Z") }), config);
  assert.equal(adapter.getSnapshot().door.ringing, true);
});

test("binary sensor requires a new press after dismissal and can be replaced in settings", async () => {
  const adapter = createHassAdapter();
  let config = { doorbell_entity: "binary_sensor.front_bell" };
  adapter.update(hass({ "binary_sensor.front_bell": entity("off") }), config);
  adapter.update(hass({ "binary_sensor.front_bell": entity("on") }), config);
  assert.equal(adapter.getSnapshot().door.ringing, true);
  await adapter.execute({ type: "door-dismiss" });
  adapter.update(hass({ "binary_sensor.front_bell": entity("on") }), config);
  assert.equal(adapter.getSnapshot().door.ringing, false);
  config = { doorbell_entity: "binary_sensor.back_bell" };
  adapter.update(hass({ "binary_sensor.back_bell": entity("off") }), config);
  adapter.update(hass({ "binary_sensor.back_bell": entity("on") }), config);
  assert.equal(adapter.getSnapshot().door.ringing, true);
});

test("disconnect keeps the display state and reconnect does not replay an old event", () => {
  const adapter = createHassAdapter();
  const config = { doorbell_entity: "event.bell" };
  adapter.update(hass({ "event.bell": entity("2026-11-10T09:00:00Z") }), config);
  adapter.update(hass({}, false), config);
  assert.equal(adapter.getSnapshot().connection, "offline");
  assert.equal(adapter.getSnapshot().door.available, false);
  adapter.update(hass({ "event.bell": entity("2026-11-10T09:10:00Z") }), config);
  assert.equal(adapter.getSnapshot().connection, "online");
  assert.equal(adapter.getSnapshot().door.ringing, false);
  adapter.update(hass({ "event.bell": entity("unavailable") }), config);
  assert.equal(adapter.getSnapshot().door.available, false);
  assert.equal(adapter.getSnapshot().door.ringing, false);
});

test("camera uses only the selected HA proxy and unconfigured controls cannot simulate success", async () => {
  const adapter = createHassAdapter();
  const config = { camera_entity: "camera.entry" };
  adapter.update(hass({ "camera.entry": entity("idle", { entity_picture: "/api/camera_proxy/camera.entry?token=example" }) }), config);
  assert.equal(adapter.getSnapshot().door.cameraUrl, "/api/camera_proxy/camera.entry?token=example");
  adapter.update(hass({ "camera.entry": entity("idle", { entity_picture: "https://external.invalid/picture.jpg" }) }), config);
  assert.equal(adapter.getSnapshot().door.cameraUrl, null);
  assert.equal(adapter.getSnapshot().environment.indoor, null);
  assert.deepEqual(adapter.getSnapshot().rooms.living.lights, []);
  await assert.rejects(adapter.execute({ type: "all-off" }), /연동/);
  adapter.dispose();
});

test("standalone camera uses its own Ingress-relative proxy without sharing HA image tokens", () => {
  const adapter = createHassAdapter("/api/hassio_ingress/example/api/camera");
  adapter.update(hass({ "camera.selected": entity("idle") }), { camera_entity: "camera.selected" });
  assert.equal(adapter.getSnapshot().door.cameraUrl, "/api/hassio_ingress/example/api/camera");
  adapter.update(hass({ "camera.selected": entity("unavailable") }), { camera_entity: "camera.selected" });
  assert.equal(adapter.getSnapshot().door.cameraUrl, null);
});
