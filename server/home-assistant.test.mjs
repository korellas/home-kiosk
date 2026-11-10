import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { HomeAssistantClient } from "./home-assistant.mjs";

class FakeSocket extends EventTarget {
  static instances = [];
  readyState = 1;
  sent = [];
  constructor() {
    super();
    FakeSocket.instances.push(this);
    queueMicrotask(() => this.receive({ type: "auth_required" }));
  }
  receive(data) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) })); }
  send(raw) {
    const message = JSON.parse(raw);
    this.sent.push(message);
    queueMicrotask(() => {
      if (message.type === "auth") this.receive({ type: "auth_ok" });
      else this.receive({ type: "result", id: message.id, success: true, result: message.type === "get_states" ? [{ entity_id: "event.entry", state: "unknown", attributes: {} }] : null });
    });
  }
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
}

test("HA bridge authenticates, subscribes and applies state events without exposing credentials", async () => {
  const client = new HomeAssistantClient({ token: "test-supervisor-secret", WebSocketImpl: FakeSocket });
  try {
    const connected = once(client, "change");
    client.start();
    await connected;
    assert.equal(client.connected, true);
    assert.equal(client.states["event.entry"].state, "unknown");
    const socket = FakeSocket.instances.at(-1);
    assert.deepEqual(socket.sent[0], { type: "auth", access_token: "test-supervisor-secret" });
    assert.ok(socket.sent.some((message) => message.type === "subscribe_events" && message.event_type === "state_changed"));
    socket.receive({ type: "event", event: { data: { entity_id: "event.entry", new_state: { state: "2026-11-10T10:00:00Z", attributes: {} } } } });
    assert.equal(client.states["event.entry"].state, "2026-11-10T10:00:00Z");
    assert.doesNotMatch(JSON.stringify(client), /test-supervisor-secret/);
    socket.close();
    assert.equal(client.connected, false);
    assert.equal(client.states["event.entry"].state, "2026-11-10T10:00:00Z");
  } finally { client.stop(); }
});
