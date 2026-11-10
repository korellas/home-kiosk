import assert from "node:assert/strict";
import { test } from "node:test";
import { createDemoAdapter } from "./demo.ts";

test("scene, individual light, and room brightness stay in sync", async () => {
  const home = createDemoAdapter();
  await home.execute({ type: "scene", room: "living", scene: "tv" });
  let room = home.getSnapshot().rooms.living;
  assert.equal(room.scene, "tv");
  assert.deepEqual(
    room.lights.map((l) => l.on),
    [false, true, false, true],
  );
  await home.execute({
    type: "light",
    room: "living",
    id: "living-main",
    patch: { on: true },
  });
  assert.equal(home.getSnapshot().rooms.living.scene, null);
  await home.execute({ type: "brightness", room: "living", value: 55 });
  room = home.getSnapshot().rooms.living;
  assert.ok(
    room.lights
      .filter((l) => l.on && l.dimmable)
      .every((l) => l.brightness === 55),
  );
  assert.equal(room.lights.find((l) => l.id === "living-rail")?.on, false);
  home.dispose();
});

test("room power and all-off use the same confirmed light state", async () => {
  const home = createDemoAdapter();
  await home.execute({ type: "room-power", room: "dining", on: true });
  assert.ok(home.getSnapshot().rooms.dining.lights.every((l) => l.on));
  await home.execute({ type: "all-off" });
  assert.ok(
    Object.values(home.getSnapshot().rooms).every((r) =>
      r.lights.every((l) => !l.on),
    ),
  );
  home.dispose();
});

test("subscribers see immutable snapshots and can unsubscribe", async () => {
  const home = createDemoAdapter();
  const before = home.getSnapshot();
  assert.equal(before, home.getSnapshot());
  let calls = 0;
  const unsubscribe = home.subscribe(() => calls++);
  await home.execute({ type: "climate", patch: { target: 26 } });
  assert.equal(before.climate.target, 25);
  assert.equal(home.getSnapshot().climate.target, 26);
  assert.equal(calls, 1);
  unsubscribe();
  await home.execute({ type: "climate", patch: { target: 27 } });
  assert.equal(calls, 1);
  home.dispose();
});

test("invalid numeric commands reject without mutating state", async () => {
  const home = createDemoAdapter();
  const before = home.getSnapshot();
  await assert.rejects(
    home.execute({ type: "climate", patch: { target: 99 } }),
  );
  await assert.rejects(
    home.execute({ type: "brightness", room: "living", value: NaN }),
  );
  assert.equal(home.getSnapshot(), before);
  home.dispose();
});

test("stopping a moving curtain preserves the last reported position", async () => {
  const home = createDemoAdapter();
  await home.execute({ type: "curtain", action: "close" });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(home.getSnapshot().curtain.direction, -1);
  assert.ok((home.getSnapshot().curtain.position ?? 100) < 100);
  await home.execute({ type: "curtain", action: "stop" });
  const stopped = home.getSnapshot().curtain.position;
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(home.getSnapshot().curtain.position, stopped);
  assert.equal(home.getSnapshot().curtain.direction, 0);
  home.dispose();
});
