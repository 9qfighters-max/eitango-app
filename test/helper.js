// テスト用の小さな道具。各テストファイルが使う。
"use strict";

export function makeSuite() {
  const results = [];
  const test = (name, fn) => {
    try { fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, message: e.message }); }
  };
  const eq = (actual, expected, label = "") => {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${label} 期待 ${b} / 実際 ${a}`);
  };
  const ok = (cond, label = "") => {
    if (!cond) throw new Error(`${label} が真ではない`);
  };
  return { results, test, eq, ok };
}
