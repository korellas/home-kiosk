export async function announce(ha, config) {
  if (!config.speaker_sound) return;
  if (!ha.connected) throw new Error("Home Assistant에 연결되지 않았어요.");
  return ha.request({ type: "call_service", domain: "tts", service: "speak", target: { entity_id: config.tts_entity }, service_data: { media_player_entity_id: config.speaker_entity, message: config.announcement || "방문자가 왔어요.", cache: true } });
}

export function watchDoorbell(ha, getConfig, report) {
  let id, previous, ready = false;
  const changed = () => {
    const config = getConfig();
    if (id !== config.doorbell_entity) { id = config.doorbell_entity; ready = false; previous = undefined; }
    const state = id && ha.states[id]?.state;
    if (!ha.connected || !state || state === "unavailable") { ready = false; return; }
    const binary = id.startsWith("binary_sensor.");
    const pressed = ready && state !== previous && (binary ? state === "on" : Number.isFinite(Date.parse(state)));
    previous = state;
    ready = !binary || ["on", "off"].includes(state);
    if (pressed && config.speaker_sound) void announce(ha, config).then(() => report(null)).catch(() => report("외부 스피커 알림을 재생하지 못했어요. 소리 설정에서 테스트해 주세요."));
  };
  ha.on("change", changed);
  changed();
  return { reset() { ready = false; changed(); }, close() { ha.off("change", changed); } };
}
