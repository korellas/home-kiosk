import { EventEmitter } from "node:events";

const REQUEST_TIMEOUT_MS = 10_000;
const RECONNECT_DELAY_MS = 3_000;
const HEARTBEAT_MS = 30_000;

export class HomeAssistantClient extends EventEmitter {
  connected = false;
  states = {};
  #token;
  #base;
  #WebSocket;
  #socket;
  #stopped = true;
  #reconnect;
  #heartbeat;
  #handshake;
  #pending = new Map();
  #nextId = 0;

  constructor({ token, baseUrl = "http://supervisor/core/", WebSocketImpl = WebSocket }) {
    super();
    this.#token = token;
    this.#base = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    this.#WebSocket = WebSocketImpl;
  }

  start() {
    if (!this.#stopped) return;
    this.#stopped = false;
    if (this.#token) this.#connect();
  }

  #connect() {
    const url = new URL("websocket", this.#base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = this.#socket = new this.#WebSocket(url);
    this.#handshake = setTimeout(() => socket.close(), REQUEST_TIMEOUT_MS);
    socket.addEventListener("message", ({ data }) => {
      let message;
      try { message = JSON.parse(data); } catch { socket.close(); return; }
      if (message.type === "auth_required") {
        socket.send(JSON.stringify({ type: "auth", access_token: this.#token }));
      } else if (message.type === "auth_ok") {
        clearTimeout(this.#handshake);
        void this.#initialize(socket);
      } else if (message.type === "auth_invalid") {
        socket.close();
      } else if (message.type === "result" || message.type === "pong") {
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        this.#pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.success === false) pending.reject(new Error("Home Assistant 요청을 처리하지 못했습니다."));
        else pending.resolve(message.result);
      } else if (message.type === "event" && message.event?.data?.entity_id) {
        const { entity_id, new_state } = message.event.data;
        if (new_state) this.states[entity_id] = new_state;
        else delete this.states[entity_id];
        if (this.connected) this.emit("change", entity_id);
      }
    });
    socket.addEventListener("error", () => socket.close());
    socket.addEventListener("close", () => {
      clearTimeout(this.#handshake);
      clearInterval(this.#heartbeat);
      this.connected = false;
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Home Assistant 연결이 끊겼습니다."));
      }
      this.#pending.clear();
      this.emit("change");
      if (!this.#stopped) this.#reconnect = setTimeout(() => this.#connect(), RECONNECT_DELAY_MS);
    });
  }

  async #initialize(socket) {
    try {
      // Subscribe before the initial snapshot so later state changes are not lost.
      await this.request({ type: "subscribe_events", event_type: "state_changed" });
      const states = await this.request({ type: "get_states" });
      if (socket !== this.#socket || this.#stopped) return;
      this.states = Object.fromEntries(states.map((entity) => [entity.entity_id, entity]));
      this.connected = true;
      this.emit("change");
      this.#heartbeat = setInterval(() => {
        void this.request({ type: "ping" }).catch(() => socket.close());
      }, HEARTBEAT_MS);
    } catch { socket.close(); }
  }

  request(message) {
    const socket = this.#socket;
    if (!socket || socket.readyState !== 1) return Promise.reject(new Error("Home Assistant 연결을 기다리고 있습니다."));
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error("Home Assistant 응답 시간이 초과되었습니다."));
      }, REQUEST_TIMEOUT_MS);
      this.#pending.set(id, { resolve, reject, timer });
      try { socket.send(JSON.stringify({ ...message, id })); }
      catch { clearTimeout(timer); this.#pending.delete(id); reject(new Error("Home Assistant에 요청하지 못했습니다.")); }
    });
  }

  camera(entityId) {
    return fetch(new URL(`api/camera_proxy/${entityId}`, this.#base), {
      headers: { Authorization: `Bearer ${this.#token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#reconnect);
    clearTimeout(this.#handshake);
    clearInterval(this.#heartbeat);
    this.#socket?.close();
  }
}
