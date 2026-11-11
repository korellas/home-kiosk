import assert from "node:assert/strict";
import test from "node:test";
import { filterEntityChoices } from "./entityChoices.ts";

const entities = [
  { id: "sensor.temperature", name: "온도", domain: "sensor", state: "25", area_id: "living", device_name: "환경 센서", device_class: "temperature" },
  { id: "sensor.humidity", name: "습도", domain: "sensor", state: "50", area_id: "living", device_class: "humidity" },
  { id: "sensor.other", name: "온도", domain: "sensor", state: "24", area_id: "bedroom", device_class: "temperature" },
  { id: "sensor.unclassified", name: "미분류", domain: "sensor", state: "20", area_id: null },
  { id: "light.ceiling", name: "조명", domain: "light", state: "off", area_id: "living" },
];

test("choices use area, domain, device class and device name rather than entity name guesses", () => {
  assert.deepEqual(filterEntityChoices(entities, { domains: ["sensor"], area: "living", deviceClass: "temperature", query: "환경" }).map(e => e.id), ["sensor.temperature"]);
  assert.deepEqual(filterEntityChoices(entities, { domains: ["sensor"], area: "", query: "" }).map(e => e.id), ["sensor.unclassified"]);
  assert.equal(filterEntityChoices(entities, { domains: ["sensor"], area: "*", query: "" }).length, 4);
});

test("existing selections remain visible outside filters so they can be changed or removed", () => {
  assert.deepEqual(filterEntityChoices(entities, { domains: ["sensor"], area: "living", deviceClass: "humidity", query: "검색 결과 없음", selectedIds: ["sensor.other"] }).map(e => e.id), ["sensor.other"]);
});
