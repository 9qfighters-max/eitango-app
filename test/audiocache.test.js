// 音声のダウンロード(js/audiocache.js)のうち、副作用のない部分のテスト。
import * as ac from "../js/audiocache.js";
import { makeSuite } from "./helper.js";

export async function run() {
  const { results, test, eq } = makeSuite();

  const [seed, manifest] = await Promise.all([
    fetch("../vocab_seed.json").then((r) => r.json()),
    fetch("../audio/manifest.json").then((r) => r.json()),
  ]);
  const clips = manifest.clips;

  test("まとめてダウンロードは normal と slow の両方を対象にする", () => {
    const urls = ac.allUrls(clips);
    eq(urls.length, seed.phrases.length * 2, "件数");
    eq(urls.filter((u) => u.includes("/normal/")).length, seed.phrases.length, "normal");
    eq(urls.filter((u) => u.includes("/slow/")).length, seed.phrases.length, "slow");
    eq(urls.every((u) => u.startsWith("./audio/")), true, "パスの形");
  });

  test("音読セット1つぶんは20ファイル(10文 × normal/slow)", () => {
    const set1 = seed.phrases.filter((p) => p.readAloudSet === 1);
    eq(set1.length, 10, "セット1の文数");
    eq(ac.urlsForSet(set1, clips).length, 20);
  });

  test("最後のセットは端数でも取り違えない", () => {
    const last = Math.max(...seed.phrases.map((p) => p.readAloudSet));
    const set = seed.phrases.filter((p) => p.readAloudSet === last);
    eq(ac.urlsForSet(set, clips).length, set.length * 2);
  });

  test("音声が無い語はURLを作らない(読み上げに回る)", () => {
    const userPhrase = [{ id: "u001", readAloudSet: 0 }];
    eq(ac.urlsForSet(userPhrase, clips), []);
  });

  // 回線の判定は、できる端末でだけ出す
  test("データセーバーがオンなら注意する", () => {
    eq(ac.connectionWarning({ saveData: true }), "データセーバーがオンになっています。");
  });

  test("モバイル回線と分かるときだけ注意する", () => {
    eq(ac.connectionWarning({ saveData: false, type: "cellular" }), "モバイル通信で接続しているようです。");
    eq(ac.connectionWarning({ saveData: false, type: "wifi" }), null, "Wi-Fi なら出さない");
  });

  test("回線が分からない端末(iOS Safari など)では何も出さない", () => {
    eq(ac.connectionWarning(null), null, "APIなし");
    eq(ac.connectionWarning({ saveData: false, effectiveType: "4g" }), null, "type が取れない");
  });

  test("容量の目安を出せる", () => {
    eq(ac.approxMb(792), "8.7");
  });

  return results;
}
