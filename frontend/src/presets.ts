import type { AppParams, PresetMap } from "./types";

const LS_KEY = "lsystem_presets_v1";

function loadPresetMap(): PresetMap {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePresetMap(map: PresetMap) {
  localStorage.setItem(LS_KEY, JSON.stringify(map));
}

export function getPresetPayload(params: AppParams) {
  const { resultInfo, resultText, ...rest } = params;
  return rest;
}

export function listPresetNames(): string[] {
  return Object.keys(loadPresetMap()).sort((a, b) => a.localeCompare(b, "ja"));
}

export function savePresetToLocal(name: string, params: AppParams) {
  const map = loadPresetMap();
  map[name] = { savedAt: Date.now(), data: getPresetPayload(params) };
  savePresetMap(map);
}

export function loadPresetFromLocal(name: string, params: AppParams): boolean {
  const map = loadPresetMap();
  const entry = map[name];
  if (!entry) return false;
  Object.assign(params, entry.data);
  return true;
}

export function deletePresetFromLocal(name: string) {
  const map = loadPresetMap();
  delete map[name];
  savePresetMap(map);
}
