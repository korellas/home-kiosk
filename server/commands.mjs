import { invalid, rooms } from "./config.mjs";

export async function executeCommand(ha, config, command) {
  if (!ha.connected) throw Object.assign(new Error("Home Assistant 연결을 기다리고 있어요."), { status: 503 });
  if (!command || typeof command !== "object" || Array.isArray(command)) throw invalid("명령을 확인해 주세요.");
  const number = (v, min, max) => { if (!Number.isFinite(v) || v < min || v > max) throw invalid("지원 범위를 벗어난 값입니다."); return v; };
  const boolean = v => { if (typeof v !== "boolean") throw invalid("켜기·끄기 값을 확인해 주세요."); return v; };
  const device = (id) => {
    const e = id && ha.states[id];
    if (!e || e.state === "unavailable" || (e.state === "unknown" && !id.startsWith("scene."))) throw invalid("연결되지 않았거나 사용할 수 없는 기기입니다.");
    return e;
  };
  const call = (id, service, data = {}) => {
    device(id);
    return ha.request({ type: "call_service", domain: id.split(".")[0], service, target: { entity_id: id }, service_data: data });
  };
  const feature = (id, bit) => { if (!(Number(device(id).attributes?.supported_features) & bit)) throw invalid("이 기기가 지원하지 않는 기능입니다."); };
  const lights = room => {
    if (!rooms.includes(room)) throw invalid("공간을 확인해 주세요.");
    return (config.lights?.[room] || []).filter(id => ha.states[id] && !["unavailable", "unknown"].includes(ha.states[id].state));
  };
  const many = async (ids, service, data) => {
    if (!ids.length) throw invalid("제어할 조명이 없습니다. 연결 설정을 확인해 주세요.");
    await Promise.all(ids.map(id => call(id, service, data)));
  };
  switch (command.type) {
    case "room-power": return many(lights(command.room), boolean(command.on) ? "turn_on" : "turn_off");
    case "all-off": return many(rooms.flatMap(lights), "turn_off");
    case "light": {
      if (!lights(command.room).includes(command.id)) throw invalid("이 공간에 연결한 조명만 제어할 수 있어요.");
      const patch = command.patch;
      if (!patch || typeof patch !== "object" || Object.keys(patch).some(k => !["on", "brightness", "kelvin"].includes(k))) throw invalid("조명 설정을 확인해 주세요.");
      const e = device(command.id), data = {};
      if (patch.brightness !== undefined) {
        if (!(e.attributes?.supported_color_modes || []).some(mode => !["onoff", "unknown"].includes(mode))) throw invalid("밝기 조절을 지원하지 않는 조명이에요.");
        data.brightness_pct = number(patch.brightness, 0, 100);
      }
      if (patch.kelvin !== undefined) {
        if (!e.attributes?.supported_color_modes?.includes("color_temp")) throw invalid("색온도 조절을 지원하지 않는 조명이에요.");
        data.color_temp_kelvin = number(patch.kelvin, e.attributes.min_color_temp_kelvin || 2000, e.attributes.max_color_temp_kelvin || 6500);
      }
      const on = patch.on === undefined ? true : boolean(patch.on);
      return call(command.id, on ? "turn_on" : "turn_off", on ? data : {});
    }
    case "brightness": return many(lights(command.room).filter(id => ha.states[id].state === "on" && ha.states[id].attributes?.supported_color_modes?.some(mode => !["onoff", "unknown"].includes(mode))), "turn_on", { brightness_pct: number(command.value, 0, 100) });
    case "scene": {
      const id = config.scenes?.[command.room]?.[command.scene];
      if (!rooms.includes(command.room) || typeof id !== "string") throw invalid("이 장면을 연결 설정에서 선택해 주세요.");
      return call(id, "turn_on");
    }
    case "climate": {
      const id = config.climate_entity, e = device(id), p = command.patch;
      if (!p || typeof p !== "object" || Object.keys(p).some(k => !["on", "target", "mode", "fan"].includes(k))) throw invalid("냉난방 설정을 확인해 주세요.");
      if (p.mode !== undefined && !e.attributes.hvac_modes?.includes(p.mode)) throw invalid("지원하지 않는 냉난방 모드입니다.");
      if (p.fan !== undefined && !e.attributes.fan_modes?.includes(p.fan)) throw invalid("지원하지 않는 바람 모드입니다.");
      if (p.target !== undefined) { feature(id, 1); number(p.target, e.attributes.min_temp ?? 7, e.attributes.max_temp ?? 35); }
      if (p.on !== undefined) boolean(p.on);
      if (p.mode !== undefined) await call(id, "set_hvac_mode", { hvac_mode: p.mode });
      else if (p.on !== undefined) await call(id, p.on ? "turn_on" : "turn_off");
      if (p.target !== undefined) await call(id, "set_temperature", { temperature: p.target });
      if (p.fan !== undefined) await call(id, "set_fan_mode", { fan_mode: p.fan });
      return;
    }
    case "curtain": {
      const actions = { open: [1, "open_cover"], close: [2, "close_cover"], stop: [8, "stop_cover"] };
      const entry = actions[command.action];
      if (!entry) throw invalid("커튼 동작을 확인해 주세요.");
      feature(config.curtain_entity, entry[0]); return call(config.curtain_entity, entry[1]);
    }
    case "curtain-position": feature(config.curtain_entity, 4); return call(config.curtain_entity, "set_cover_position", { position: number(command.value, 0, 100) });
    case "ventilation": {
      const id = config.ventilation_entity, e = device(id);
      if (command.mode === "auto" && e.attributes.preset_modes?.includes("auto")) return call(id, "set_preset_mode", { preset_mode: "auto" });
      const speeds = { low: 33, medium: 66, high: 100 };
      if (!Object.hasOwn(speeds, command.mode)) throw invalid("지원하지 않는 환기 모드입니다.");
      feature(id, 1); return call(id, "set_percentage", { percentage: speeds[command.mode] });
    }
    case "media-play": feature(config.media_entity, boolean(command.playing) ? 16384 : 1); return call(config.media_entity, command.playing ? "media_play" : "media_pause");
    case "media-skip": {
      if (!["next", "previous"].includes(command.direction)) throw invalid("곡 이동 방향을 확인해 주세요.");
      feature(config.media_entity, command.direction === "next" ? 32 : 16);
      return call(config.media_entity, command.direction === "next" ? "media_next_track" : "media_previous_track");
    }
    case "media-volume": feature(config.media_entity, 4); return call(config.media_entity, "volume_set", { volume_level: number(command.value, 0, 100) / 100 });
    default: throw invalid("지원하지 않는 명령입니다.");
  }
}
