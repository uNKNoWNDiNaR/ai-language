"use strict";
// backend/src/utils/mapLike.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapLikeHas = mapLikeHas;
exports.mapLikeGet = mapLikeGet;
exports.mapLikeSet = mapLikeSet;
exports.mapLikeGetNumber = mapLikeGetNumber;
function isMap(m) {
    return (!!m &&
        typeof m.get === "function" &&
        typeof m.set === "function" &&
        typeof m.has === "function");
}
function mapLikeHas(m, key) {
    if (!m)
        return false;
    if (isMap(m))
        return m.has(key);
    return Object.prototype.hasOwnProperty.call(m, key);
}
function mapLikeGet(m, key) {
    if (!m)
        return undefined;
    if (isMap(m))
        return m.get(key);
    return m[key];
}
function mapLikeSet(m, key, value) {
    if (m && isMap(m)) {
        m.set(key, value);
        return m;
    }
    const obj = m && typeof m === "object" && !Array.isArray(m) ? m : {};
    obj[key] = value;
    return obj;
}
function mapLikeGetNumber(m, key, fallback = 0) {
    const v = mapLikeGet(m, key);
    if (typeof v === "number")
        return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
