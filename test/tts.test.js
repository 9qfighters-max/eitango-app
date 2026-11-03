// 音読の速度(js/tts.js)のテスト。
import * as tts from "../js/tts.js";
import { makeSuite } from "./helper.js";

const { results, test, eq } = makeSuite();

test("採用する速度は 0.8 と 1.0 の2段階", () => {
  eq(tts.RATES, [0.8, 1.0]);
  eq(tts.DEFAULT_RATE, 0.8);
});

test("以前の版の 0.6 は 0.8 に繰り上がる", () => {
  eq(tts.normalizeRate(0.6), 0.8);
});

test("0.8 と 1.0 はそのまま", () => {
  eq(tts.normalizeRate(0.8), 0.8);
  eq(tts.normalizeRate(1.0), 1.0);
});

test("未設定や不正な値は既定の 0.8", () => {
  eq(tts.normalizeRate(undefined), 0.8, "undefined");
  eq(tts.normalizeRate(null), 0.8, "null");
  eq(tts.normalizeRate("はやい"), 0.8, "文字列");
  eq(tts.normalizeRate(NaN), 0.8, "NaN");
});

test("範囲外の数値は近いほうに寄せる", () => {
  eq(tts.normalizeRate(0.1), 0.8, "遅すぎる値");
  eq(tts.normalizeRate(2.0), 1.0, "速すぎる値");
});

export { results };
