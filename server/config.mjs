export const rooms = ["living", "kitchen", "dining"];
export const entityFields = {
  doorbell_entity: ["event", "binary_sensor"], camera_entity: ["camera"],
  climate_entity: ["climate"], curtain_entity: ["cover"], ventilation_entity: ["fan"],
  media_entity: ["media_player"], weather_entity: ["weather"],
  indoor_entity: ["sensor"], humidity_entity: ["sensor"], indoor_pm25_entity: ["sensor"],
  outdoor_pm25_entity: ["sensor"], co2_entity: ["sensor"],
  speaker_entity: ["media_player"], tts_entity: ["tts"],
};
export function invalid(message) { const error = new Error(message); error.status = 400; return error; }
export function validateConfig(value, states) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("설정을 확인해 주세요.");
  const allowed = [...Object.keys(entityFields), "lights", "scenes", "local_sound", "local_volume", "speaker_sound", "announcement"];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw invalid("지원하지 않는 설정입니다.");
  const next = {};
  const entity = (id, domains) => {
    if (typeof id !== "string" || !domains.includes(id.split(".")[0]) || !Object.hasOwn(states, id)) throw invalid("목록에 있는 기기를 선택해 주세요.");
    return id;
  };
  for (const [key, domains] of Object.entries(entityFields)) if (value[key]) next[key] = entity(value[key], domains);
  for (const field of ["lights", "scenes"]) {
    if (value[field] === undefined) continue;
    const mapping = value[field];
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || Object.keys(mapping).some(room => !rooms.includes(room))) throw invalid("공간 설정을 확인해 주세요.");
    next[field] = {};
    for (const [room, entries] of Object.entries(mapping)) {
      if (field === "lights") {
        if (!Array.isArray(entries) || entries.length > 64) throw invalid("공간별 조명을 선택해 주세요.");
        next.lights[room] = [...new Set(entries.map(id => entity(id, ["light"])) )];
      } else {
        const names = room === "living" ? ["relax", "daily", "bright", "tv"] : room === "kitchen" ? ["daily", "bright", "ambient"] : ["meal", "bright", "night"];
        if (!entries || typeof entries !== "object" || Array.isArray(entries) || Object.keys(entries).some(name => !names.includes(name))) throw invalid("장면 설정을 확인해 주세요.");
        next.scenes[room] = Object.fromEntries(Object.entries(entries).filter(([,id]) => id).map(([name,id]) => [name,entity(id,["scene"])]));
      }
    }
    if (field === "lights") {
      const all = Object.values(next.lights).flat();
      if (new Set(all).size !== all.length) throw invalid("같은 조명은 한 공간에만 연결해 주세요.");
    }
  }
  for (const key of ["local_sound", "speaker_sound"]) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== "boolean") throw invalid("소리 켜기 설정을 확인해 주세요.");
      next[key] = value[key];
    }
  }
  if (value.local_volume !== undefined) {
    if (!Number.isFinite(value.local_volume) || value.local_volume < 0 || value.local_volume > 100) throw invalid("음량은 0부터 100 사이로 설정해 주세요.");
    next.local_volume = value.local_volume;
  }
  if (value.announcement !== undefined) {
    if (typeof value.announcement !== "string" || value.announcement.length > 200) throw invalid("안내 문구는 200자 이내로 입력해 주세요.");
    next.announcement = value.announcement.trim();
  }
  if (next.speaker_sound && (!next.speaker_entity || !next.tts_entity)) throw invalid("외부 스피커와 음성 엔진을 모두 선택해 주세요.");
  return next;
}
export function selectedEntities(config) {
  return [...new Set([
    ...Object.keys(entityFields).map(key => config[key]).filter(Boolean),
    ...Object.values(config.lights || {}).flat(),
    ...Object.values(config.scenes || {}).flatMap(room => Object.values(room)),
  ])];
}
// Only attributes used by the dashboard cross the server/browser boundary.
export const stateAttributes = ["friendly_name", "supported_features", "supported_color_modes", "brightness", "color_temp_kelvin", "min_color_temp_kelvin", "max_color_temp_kelvin", "current_temperature", "temperature", "min_temp", "max_temp", "target_temp_step", "hvac_modes", "fan_mode", "fan_modes", "current_position", "percentage", "preset_mode", "preset_modes", "media_title", "media_artist", "volume_level", "media_duration", "media_position", "unit_of_measurement", "device_class"];
