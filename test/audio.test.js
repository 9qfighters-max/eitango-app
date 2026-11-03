// 同梱音声(js/audio.js と audio/manifest.json)のテスト。
// データを読むので非同期。run() を呼ぶと結果が返る。
import * as audio from "../js/audio.js";
import { makeSuite } from "./helper.js";

export async function run() {
  const { results, test, eq } = makeSuite();

  const [seed, manifest] = await Promise.all([
    fetch("../vocab_seed.json").then((r) => r.json()),
    fetch("../audio/manifest.json").then((r) => r.json()).catch(() => null),
  ]);
  await audio.init();

  test("manifest.json が読める", () => {
    eq(manifest !== null, true, "読み込み");
    eq(typeof manifest.clips, "object", "clips");
  });

  test("すべての熟語に音声がある", () => {
    const missing = seed.phrases.filter((p) => !manifest.clips[p.id]).map((p) => p.id);
    eq(missing, [], "音声が無い熟語");
  });

  test("余分な音声が無い", () => {
    const ids = new Set(seed.phrases.map((p) => p.id));
    const extra = Object.keys(manifest.clips).filter((id) => !ids.has(id));
    eq(extra, [], "熟語に無い音声");
  });

  // 例文を直したのに音声を作り直し忘れる事故を、ここで止める
  test("manifest の text が例文と全件一致する", () => {
    const diff = seed.phrases
      .filter((p) => (manifest.clips[p.id]?.text || "").trim() !== p.example.trim())
      .map((p) => `${p.id}: 例文「${p.example}」/ 音声「${manifest.clips[p.id]?.text}」`);
    eq(diff, [], "文と音声のずれ");
  });

  test("速度でファイルの種類が切り替わる", () => {
    eq(audio.variantForRate(1.0), "normal");
    eq(audio.variantForRate(0.8), "slow");
    eq(audio.variantForRate(0.6), "slow", "旧0.6は0.8に丸められるので slow");
  });

  test("urlFor は速度に応じたパスを返す", () => {
    eq(audio.urlFor("p001", 1.0), "./audio/normal/p001.mp3");
    eq(audio.urlFor("p001", 0.8), "./audio/slow/p001.mp3");
  });

  test("音声が無いIDは null(読み上げにフォールバックする)", () => {
    eq(audio.urlFor("u001", 1.0), null);
    eq(audio.hasClip("u001"), false);
  });

  test("clips の件数が熟語の数と同じ", () => {
    eq(audio.clipCount(), seed.phrases.length);
  });

  return results;
}
