import type { PlantParams } from "./studio-state.ts";

export interface Population {
  count: number;
  matrices: Float32Array;
  thickness: Float32Array;
}
export interface NativeGeometry {
  branchMesh: {
    position: Float32Array;
    normal: Float32Array;
    uv: Float32Array;
    thickness: Float32Array;
    index: Uint32Array;
  };
  branchInstances: Population & { shape: Float32Array };
  leaves: Population;
  flowers: Population;
  buds: Population;
  meta: {
    version: number;
    vertices: number;
    indices: number;
    instances: number;
    branches: number;
    leaves: number;
    flowers: number;
    buds: number;
    symbolCount: number;
    preview: string;
    generationLimit: number;
    engineMs: number;
  };
}
export function decodeGeometry(buffer: ArrayBuffer): NativeGeometry {
  const view = new DataView(buffer);
  if (buffer.byteLength < 8 || view.getUint32(0, true) !== 0x32524d4b)
    throw new Error("計算結果の形式が不正です。");
  const length = view.getUint32(4, true);
  if (length % 4 || length > 16384 || 8 + length > buffer.byteLength)
    throw new Error("計算結果のヘッダーが不正です。");
  const meta: NativeGeometry["meta"] = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 8, length)),
  );
  if (
    meta.version !== 2 ||
    ![
      meta.vertices,
      meta.indices,
      meta.instances,
      meta.branches,
      meta.leaves,
      meta.flowers,
      meta.buds,
      meta.symbolCount,
      meta.generationLimit,
    ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    meta.instances > meta.branches ||
    meta.branches > 20000 ||
    meta.leaves + meta.flowers + meta.buds > 30000 ||
    meta.vertices > 2_000_000 ||
    meta.indices > 5_000_000 ||
    meta.symbolCount > 250000 ||
    meta.generationLimit > 16 ||
    typeof meta.preview !== "string" ||
    meta.preview.length > 1000 ||
    !Number.isFinite(meta.engineMs)
  )
    throw new Error("計算結果が上限を超えています。");
  const expected =
    8 +
    length +
    (meta.vertices * 9 +
      meta.indices +
      meta.instances * 19 +
      (meta.leaves + meta.flowers + meta.buds) * 17) *
      4;
  if (buffer.byteLength !== expected)
    throw new Error("計算データが途中で切れています。");
  let offset = 8 + length;
  const floats = (count: number) => {
    const a = new Float32Array(buffer, offset, count);
    offset += count * 4;
    return a;
  };
  const branchMesh = {
    position: floats(meta.vertices * 3),
    normal: floats(meta.vertices * 3),
    uv: floats(meta.vertices * 2),
    thickness: floats(meta.vertices),
    index: new Uint32Array(buffer, offset, meta.indices),
  };
  offset += meta.indices * 4;
  const branchInstances = {
    count: meta.instances,
    matrices: floats(meta.instances * 16),
    shape: floats(meta.instances * 2),
    thickness: floats(meta.instances),
  };
  const population = (count: number) => ({
    count,
    matrices: floats(count * 16),
    thickness: floats(count),
  });
  return {
    meta,
    branchMesh,
    branchInstances,
    leaves: population(meta.leaves),
    flowers: population(meta.flowers),
    buds: population(meta.buds),
  };
}
export function geometryKey(params: PlantParams): string {
  const {
    branchColor,
    leafColor,
    flowerColor,
    budColor,
    leafTextureKey,
    needleLength,
    initLength,
    initThickness,
    ...geometry
  } = params;
  return JSON.stringify(geometry);
}
let cached: { key: string; data: NativeGeometry } | null = null;
export async function requestGeometry(
  params: PlantParams,
  signal?: AbortSignal,
  full = false,
): Promise<NativeGeometry> {
  const key = geometryKey(params);
  if (!full && cached?.key === key) return cached.data;
  const response = await fetch(
    full ? "/api/tree/export" : "/api/tree/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal,
    },
  );
  if (!response.ok) {
    let error = "樹木を計算できませんでした。";
    try {
      const result = await response.json();
      if (typeof result.error === "string") error = result.error;
    } catch {
      /* proxy or static server */
    }
    throw new Error(error);
  }
  if (
    !response.headers.get("content-type")?.includes("application/octet-stream")
  )
    throw new Error(
      "Rustバックエンドに接続できません。起動状態を確認してください。",
    );
  const data = decodeGeometry(await response.arrayBuffer());
  if (!full && !signal?.aborted) cached = { key, data };
  return data;
}
