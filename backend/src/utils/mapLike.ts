// backend/src/utils/mapLike.ts


export type MapLike<V> = Map<string, V> | Record<string, V> | null | undefined;

function isMap<V>(m: MapLike<V>): m is Map<string, V> {
  return (
    !!m &&
    typeof (m as any).get === "function" &&
    typeof (m as any).set === "function"
  );
}


export function mapLikeHas<V>(m: MapLike<V>, key: string): boolean {
  if (!m) return false;
  if (isMap(m)) {
    if (typeof (m as any).has === "function") return (m as any).has(key);
    return typeof (m as any).get === "function" ? (m as any).get(key) !== undefined : false;
  }
  return Object.prototype.hasOwnProperty.call(m, key);
}

export function mapLikeGet<V>(m: MapLike<V>, key: string): V | undefined {
  if (!m) return undefined;
  if (isMap(m)) return m.get(key);
  return (m as Record<string, V>)[key];
}

export function mapLikeSet<V>(
  m: MapLike<V>,
  key: string,
  value: V
): Exclude<MapLike<V>, null | undefined> {
  if (m && isMap(m)) {
    m.set(key, value);
    return m;
  }
  const obj: Record<string, V> =
    m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, V>) : {};
  obj[key] = value;
  return obj;
}

export function mapLikeGetNumber(m: MapLike<unknown>, key: string, fallback = 0): number {
  const v = mapLikeGet(m, key);
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
