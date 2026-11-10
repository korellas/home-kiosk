import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { validateConfig, selectedEntities } from "./config.mjs";
import { executeCommand } from "./commands.mjs";
import { watchDoorbell } from "./doorbell.mjs";

const entity = (state, attributes = {}) => ({ state, attributes });
function fake() {
  const ha = new EventEmitter();
  ha.connected = true;
  ha.states = {
    "light.selected": entity("on", { supported_color_modes: ["color_temp"], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 }),
    "light.other": entity("on", { supported_color_modes: ["onoff"] }),
    "cover.selected": entity("open", { supported_features: 7 }),
    "climate.selected": entity("cool", { supported_features: 1, min_temp: 16, max_temp: 30, hvac_modes: ["cool", "off"], fan_modes: ["low", "high"] }),
    "media_player.selected": entity("playing", { supported_features: 16384 | 1 | 4 | 16 | 32 }),
    "event.entry": entity("unknown"), "tts.local": entity("unknown"), "scene.relax": entity("unknown"),
  };
  ha.calls = [];
  ha.request = async message => { ha.calls.push(message); };
  return ha;
}

test("settings accept chosen devices, preserve old bell settings, reject unknown keys and duplicate room assignment", () => {
  const ha = fake();
  assert.deepEqual(validateConfig({ doorbell_entity: "event.entry" }, ha.states), { doorbell_entity: "event.entry" });
  const config = validateConfig({ lights: { living: ["light.selected"] }, scenes: { living: { relax: "scene.relax" } }, local_sound: true, local_volume: 60, speaker_sound: true, speaker_entity: "media_player.selected", tts_entity: "tts.local" }, ha.states);
  assert.deepEqual(selectedEntities(config).sort(), ["light.selected", "scene.relax", "media_player.selected", "tts.local"].sort());
  assert.throws(() => validateConfig({ lights: { living: ["light.selected"], kitchen: ["light.selected"] } }, ha.states), /한 공간/);
  assert.throws(() => validateConfig({ speaker_sound: true }, ha.states), /모두 선택/);
  assert.throws(() => validateConfig({ climate_entity: "light.selected" }, ha.states), /선택/);
  assert.throws(() => validateConfig({ token: "not-allowed" }, ha.states), /지원하지/);
});

test("device commands cannot target unselected entities or request unsupported operations", async () => {
  const ha = fake(), config = { lights: { living: ["light.selected"] }, curtain_entity: "cover.selected", climate_entity: "climate.selected", media_entity: "media_player.selected", scenes: { living: { relax: "scene.relax" } } };
  await executeCommand(ha, config, { type: "light", room: "living", id: "light.selected", patch: { brightness: 40, kelvin: 3000 } });
  assert.deepEqual(ha.calls[0], { type: "call_service", domain: "light", service: "turn_on", target: { entity_id: "light.selected" }, service_data: { brightness_pct: 40, color_temp_kelvin: 3000 } });
  await executeCommand(ha, config, { type: "media-skip", direction: "next" });
  assert.equal(ha.calls.at(-1).service, "media_next_track");
  await executeCommand(ha, config, { type: "scene", room: "living", scene: "relax" });
  assert.equal(ha.calls.at(-1).target.entity_id, "scene.relax");
  const before = ha.calls.length;
  for (const command of [
    { type: "light", room: "living", id: "light.other", patch: { on: false } },
    { type: "light", room: "living", id: "light.selected", patch: { brightness: 101 } },
    { type: "curtain", action: "stop" },
    { type: "climate", patch: { mode: "heat", target: 25 } },
    { type: "media-volume", value: null },
    { type: "call_service", domain: "lock", service: "unlock" },
  ]) await assert.rejects(executeCommand(ha, config, command));
  assert.equal(ha.calls.length, before);
});

test("external doorbell sound runs once without browser clients and does not replay startup, config save or reconnect", async () => {
  const ha = fake();
  let config = { doorbell_entity: "event.entry", speaker_sound: true, speaker_entity: "media_player.selected", tts_entity: "tts.local", announcement: "방문 안내" };
  const errors = [], watcher = watchDoorbell(ha, () => config, error => errors.push(error));
  try {
    assert.equal(ha.calls.length, 0);
    ha.states["event.entry"].state = "2026-01-01T00:00:01Z"; ha.emit("change"); ha.emit("change");
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ha.calls.length, 1);
    assert.equal(ha.calls[0].domain, "tts");
    assert.equal(ha.calls[0].service_data.media_player_entity_id, "media_player.selected");
    watcher.reset(); assert.equal(ha.calls.length, 1);
    ha.connected = false; ha.emit("change");
    ha.states["event.entry"].state = "2026-01-01T00:00:02Z";
    ha.connected = true; ha.emit("change"); assert.equal(ha.calls.length, 1);
    config = { ...config, speaker_sound: false };
    ha.states["event.entry"].state = "2026-01-01T00:00:03Z"; ha.emit("change"); assert.equal(ha.calls.length, 1);
    assert.deepEqual(errors, [null]);
  } finally { watcher.close(); }
});
