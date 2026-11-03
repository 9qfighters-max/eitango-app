// 保存データの移行とプロフィールの分離(js/store.js)のテスト。
// localStorage を直接触るので、実行前後で元の内容を退避・復元する。
import * as store from "../js/store.js";
import { makeSuite } from "./helper.js";

const KEY = "eitango-app-v1";

export async function run() {
  const { results, test, eq, ok } = makeSuite();
  const backup = localStorage.getItem(KEY);

  try {
    // ---- 移行: プロフィール導入前の形 → 「本人」プロフィール ----
    const old = {
      seedVersion: 2,
      progress: { w0001: { itemId: "w0001", stage: 3, dueDate: "2026-12-01", reviewCount: 3 } },
      readAloud: { p001: { listen: true, repeat: false, shadowing: false, recite: false } },
      userItems: [{ id: "u001", kind: "word", en: "test", ja: "試験", source: "user", tier: "B", order: 10001 }],
      settings: { newPerDay: 40, ttsRate: 0.6, examDate: "2027-03-03" },
      history: { "2026-11-01": { words: 5, phrases: 2 } },
      quizzes: [{ date: "2026-11-01", correct: 18, total: 20 }],
    };
    localStorage.setItem(KEY, JSON.stringify(old));
    await store.init();

    test("古い形は「本人」プロフィールへ移される", () => {
      eq(store.state.profiles.length, 1);
      eq(store.currentProfile().name, "本人");
    });

    test("移行しても進捗が消えない", () => {
      eq(store.progressOf("w0001").stage, 3);
      eq(store.readAloudOf("p001").listen, true);
      eq(store.state.history["2026-11-01"].words, 5);
      eq(store.state.quizzes.length, 1);
    });

    test("移行しても設定と追加語が残る", () => {
      eq(store.state.settings.newPerDay, 40);
      eq(store.state.settings.examDate, "2027-03-03");
      eq(store.state.userItems.length, 1);
      ok(store.state.words.some((w) => w.id === "u001"), "追加語が一覧に出る");
    });

    test("移行のときも古い速度 0.6 は 0.8 に丸められる", () => {
      eq(store.state.settings.ttsRate, 0.8);
    });

    // ---- プロフィールの分離(受け入れ基準10) ----
    const b = store.addProfile("きょうだい");

    test("プロフィールを追加できる", () => {
      eq(store.state.profiles.length, 2);
      eq(b.name, "きょうだい");
      ok(b.color !== store.state.profiles[0].color, "色が重ならない");
    });

    store.switchProfile(b.id);

    test("切り替えると相手の進捗が見えない", () => {
      eq(store.currentProfile().name, "きょうだい");
      eq(store.progressOf("w0001"), null, "本人の進捗");
      eq(store.readAloudOf("p001").listen, false, "本人の音読チェック");
      eq(store.state.quizzes.length, 0, "本人の小テスト結果");
      eq(Object.keys(store.state.history).length, 0, "本人の学習履歴");
    });

    test("切り替えると設定も別々", () => {
      eq(store.state.settings.newPerDay, 30, "既定値に戻る");
      eq(store.state.settings.examDate, null);
    });

    test("切り替えると相手の追加語が一覧から消える", () => {
      eq(store.state.userItems.length, 0);
      eq(store.state.words.some((w) => w.id === "u001"), false);
      eq(store.state.words.length, store.state.seedWordCount, "シードだけになる");
    });

    store.gradeItem("w0002", "ok");

    test("片方で学習しても、もう片方に影響しない", () => {
      eq(store.progressOf("w0002").stage, 1, "きょうだい側");
      const other = store.state.profiles[0];
      store.switchProfile(other.id);
      eq(store.progressOf("w0002"), null, "本人側には無い");
      eq(store.progressOf("w0001").stage, 3, "本人の進捗は残っている");
      ok(store.state.words.some((w) => w.id === "u001"), "本人の追加語は戻る");
    });

    test("最大5人まで", () => {
      while (store.state.profiles.length < store.MAX_PROFILES) {
        ok(store.addProfile("p" + store.state.profiles.length) !== null, "追加できる");
      }
      eq(store.state.profiles.length, store.MAX_PROFILES);
      eq(store.addProfile("6人目"), null, "6人目は追加できない");
    });

    test("最後の1人は削除できない", () => {
      const ids = store.state.profiles.map((p) => p.id);
      for (const id of ids.slice(1)) store.removeProfile(id);
      eq(store.state.profiles.length, 1);
      eq(store.removeProfile(store.state.profiles[0].id), false);
    });

    test("初期化は今のプロフィールだけ", () => {
      const first = store.state.profiles[0];
      const second = store.addProfile("のこす");
      store.switchProfile(second.id);
      store.gradeItem("w0003", "ok");
      store.switchProfile(first.id);
      store.resetAll();
      eq(store.progressOf("w0001"), null, "自分の進捗は消える");
      store.switchProfile(second.id);
      eq(store.progressOf("w0003").stage, 1, "相手の進捗は残る");
    });

    test("保存した形は再読み込みしても同じ", async () => {
      const name = store.currentProfile().name;
      const count = store.state.profiles.length;
      await store.init();
      eq(store.state.profiles.length, count);
      eq(store.currentProfile().name, name);
    });

  } finally {
    if (backup === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, backup);
    await store.init();
  }

  return results;
}
