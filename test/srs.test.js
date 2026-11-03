// 復習ロジック(js/srs.js)のテスト。
// node が無い環境なので test.html をブラウザで開いて実行する。
import * as srs from "../js/srs.js";
import { makeSuite } from "./helper.js";

const { results, test, eq, ok } = makeSuite();

const TODAY = "2026-11-03";

// ---- 日付ユーティリティ ----

test("addDays は月をまたいでも正しい", () => {
  eq(srs.addDays("2026-11-30", 1), "2026-12-01");
  eq(srs.addDays("2027-03-01", -1), "2027-02-28");
  eq(srs.addDays("2028-02-28", 1), "2028-02-29", "うるう年");
});

test("diffDays は日数の差を返す", () => {
  eq(srs.diffDays("2026-11-10", "2026-11-03"), 7);
  eq(srs.diffDays("2026-11-03", "2026-11-10"), -7);
  eq(srs.diffDays(TODAY, TODAY), 0);
});

test("toDateStr はローカル時刻の年月日を返す", () => {
  eq(srs.toDateStr(new Date(2026, 10, 3, 23, 59)), "2026-11-03");
  eq(srs.toDateStr(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
});

// ---- 新規語 ----

test("新規語はステージ0・当日が期限", () => {
  const p = srs.newProgress("w001", TODAY, "iso");
  eq(p.stage, 0);
  eq(p.dueDate, TODAY);
  eq(p.introducedOn, TODAY);
  eq(p.reviewCount, 0);
  eq(p.lastResult, null);
});

// ---- SPEC §4.3 の間隔表 ----

test("✓ を押すとステージが上がり 0→1日,1→3日,2→7日,3→30日 後になる", () => {
  let p = srs.newProgress("w001", TODAY, "iso");
  p = srs.grade(p, "ok", TODAY, "iso");
  eq([p.stage, p.dueDate], [1, "2026-11-04"], "stage0→1");

  p = srs.grade(p, "ok", "2026-11-04", "iso");
  eq([p.stage, p.dueDate], [2, "2026-11-07"], "stage1→2 は3日後");

  p = srs.grade(p, "ok", "2026-11-07", "iso");
  eq([p.stage, p.dueDate], [3, "2026-11-14"], "stage2→3 は7日後");

  p = srs.grade(p, "ok", "2026-11-14", "iso");
  eq([p.stage, p.dueDate], [4, "2026-12-14"], "stage3→4 は30日後");
});

test("ステージ4で ✓ を押すと卒業(stage5・期限なし)", () => {
  let p = { itemId: "w001", stage: 4, dueDate: TODAY, lastResult: "ok", reviewCount: 4, introducedOn: "2026-10-01" };
  p = srs.grade(p, "ok", TODAY, "iso");
  eq(p.stage, 5);
  eq(p.dueDate, null);
  ok(srs.isGraduated(p), "卒業判定");
  ok(!srs.isDue(p, TODAY), "卒業した語は出題されない");
});

test("△ はステージ1に戻り翌日に出る", () => {
  let p = { itemId: "w001", stage: 4, dueDate: TODAY, lastResult: "ok", reviewCount: 4, introducedOn: "2026-10-01" };
  p = srs.grade(p, "unsure", TODAY, "iso");
  eq(p.stage, 1);
  eq(p.dueDate, "2026-11-04");
  eq(p.lastResult, "unsure");
  eq(p.reviewCount, 5, "回数は加算される");
});

test("grade は元の進捗を書き換えない(純粋)", () => {
  const p = srs.newProgress("w001", TODAY, "iso");
  const before = JSON.stringify(p);
  srs.grade(p, "ok", TODAY, "iso");
  eq(JSON.stringify(p), before);
});

// ---- セッションの組み立て ----

const items = [
  { id: "a1", tier: "A", order: 1 },
  { id: "a2", tier: "A", order: 2 },
  { id: "b1", tier: "B", order: 150 },
  { id: "c1", tier: "C", order: 300 },
];

test("新規は A → B → C の順、order 順に出る", () => {
  const s = srs.selectSession({ items: [...items].reverse(), progress: {}, today: TODAY, newPerDay: 4 });
  eq(s.news.map((i) => i.id), ["a1", "a2", "b1", "c1"]);
  eq(s.reviews, []);
});

test("1日の新規語数で打ち切られる", () => {
  const s = srs.selectSession({ items, progress: {}, today: TODAY, newPerDay: 2 });
  eq(s.news.map((i) => i.id), ["a1", "a2"]);
});

test("今日すでに出した新規語の分だけ枠が減る", () => {
  const progress = { a1: srs.newProgress("a1", TODAY, "iso") };
  const s = srs.selectSession({ items, progress, today: TODAY, newPerDay: 2 });
  eq(s.newQuota, 1);
  eq(s.news.map((i) => i.id), ["a2"]);
  eq(s.reviews.map((i) => i.id), ["a1"], "未回答の新規語は復習側に残る");
});

test("別の種類(熟語)の新規枠を食わない", () => {
  // progress は単語と熟語で共通なので、items に無い語の分は数えてはいけない
  const progress = {
    x1: { itemId: "x1", stage: 0, dueDate: TODAY, reviewCount: 0, introducedOn: TODAY },
    x2: { itemId: "x2", stage: 0, dueDate: TODAY, reviewCount: 0, introducedOn: TODAY },
  };
  const s = srs.selectSession({ items, progress, today: TODAY, newPerDay: 4 });
  eq(s.newQuota, 4);
  eq(s.news.map((i) => i.id), ["a1", "a2", "b1", "c1"]);
});

test("期限が来た復習が新規より先に出る(期限が古い順)", () => {
  const progress = {
    a2: { itemId: "a2", stage: 2, dueDate: TODAY, reviewCount: 2, introducedOn: "2026-10-01" },
    b1: { itemId: "b1", stage: 1, dueDate: "2026-10-28", reviewCount: 1, introducedOn: "2026-10-01" },
    c1: { itemId: "c1", stage: 3, dueDate: "2026-11-30", reviewCount: 3, introducedOn: "2026-10-01" },
  };
  const s = srs.selectSession({ items, progress, today: TODAY, newPerDay: 10 });
  eq(s.reviews.map((i) => i.id), ["b1", "a2"], "期限切れの古い順");
  eq(s.news.map((i) => i.id), ["a1"], "未学習の語だけが新規");
  eq(s.dueTotal, 2);
});

test("復習は1日60語まで。超えた分は overflow で翌日に回る", () => {
  const many = Array.from({ length: 70 }, (_, i) => ({ id: `w${i}`, tier: "A", order: i + 1 }));
  const progress = {};
  for (const it of many) {
    progress[it.id] = { itemId: it.id, stage: 1, dueDate: "2026-10-01", reviewCount: 1, introducedOn: "2026-09-01" };
  }
  const s = srs.selectSession({ items: many, progress, today: TODAY, newPerDay: 30 });
  eq(s.reviews.length, 60);
  eq(s.dueTotal, 70);
  eq(s.overflow, 10);
  eq(s.news.length, 0, "未学習の語が無ければ新規は0");
});

test("卒業した語はセッションに出ない", () => {
  const progress = {
    a1: { itemId: "a1", stage: 5, dueDate: null, reviewCount: 5, introducedOn: "2026-09-01" },
  };
  const s = srs.selectSession({ items, progress, today: TODAY, newPerDay: 10 });
  ok(!s.reviews.some((i) => i.id === "a1"), "復習に入らない");
  ok(!s.news.some((i) => i.id === "a1"), "新規に入らない");
});

// ---- 統計 ----

test("定着率はステージ5の語数÷全語数", () => {
  const list = [
    { stage: 5 }, { stage: 5 }, { stage: 3 }, { stage: 1 },
  ];
  eq(srs.retention(list, 10), 0.2);
  eq(srs.retention([], 10), 0);
  eq(srs.retention(list, 0), 0, "全語数0でも落ちない");
});

test("連続学習日数", () => {
  eq(srs.streak(["2026-11-03", "2026-11-02", "2026-11-01"], TODAY), 3);
  eq(srs.streak(["2026-11-02", "2026-11-01"], TODAY), 2, "今日まだなら前日から数える");
  eq(srs.streak(["2026-11-01"], TODAY), 0, "2日空いたら途切れる");
  eq(srs.streak([], TODAY), 0);
  eq(srs.streak(["2026-11-03"], TODAY), 1);
});

// ---- 学習計画(SPEC §4.2) ----

test("30語/日なら1,652語を一周するのに56日(SPECの例)", () => {
  const plan = srs.studyPlan({ totalItems: 1652, introduced: 0, newPerDay: 30, today: TODAY });
  eq(plan.remaining, 1652);
  eq(plan.daysToFinish, 56);
  eq(plan.finishDate, srs.addDays(TODAY, 56));
});

test("学習済みの分だけ残りが減る", () => {
  const plan = srs.studyPlan({ totalItems: 1652, introduced: 452, newPerDay: 30, today: TODAY });
  eq(plan.remaining, 1200);
  eq(plan.daysToFinish, 40);
});

test("入試日が未設定なら残り日数は出さない", () => {
  const plan = srs.studyPlan({ totalItems: 1652, introduced: 0, newPerDay: 30, today: TODAY });
  eq(plan.daysToExam, null);
  eq(plan.onTime, null);
  eq(plan.suggestedPerDay, null);
});

test("間に合うときは復習に使える日数を出す", () => {
  // 入試まで120日、一周56日 → 残り64日を復習に充てられる
  const plan = srs.studyPlan({
    totalItems: 1652, introduced: 0, newPerDay: 30,
    today: TODAY, examDate: srs.addDays(TODAY, 120),
  });
  eq(plan.daysToExam, 120);
  eq(plan.onTime, true);
  eq(plan.reviewDays, 64);
  eq(plan.suggestedPerDay, null, "間に合うなら提案しない");
});

test("間に合わないときは必要な語数を提案する", () => {
  // 入試まで40日、1日30語では56日かかる → 1652/40 = 41.3 → 5語刻みで45
  const plan = srs.studyPlan({
    totalItems: 1652, introduced: 0, newPerDay: 30,
    today: TODAY, examDate: srs.addDays(TODAY, 40),
  });
  eq(plan.onTime, false);
  eq(plan.suggestedPerDay, 45);
  eq(plan.achievable, true);
});

test("1日50語でも間に合わないときは、そう分かる", () => {
  const plan = srs.studyPlan({
    totalItems: 1652, introduced: 0, newPerDay: 30,
    today: TODAY, examDate: srs.addDays(TODAY, 20),
  });
  eq(plan.onTime, false);
  eq(plan.achievable, false, "1652/20 = 83語/日 は上限50を超える");
  eq(plan.suggestedPerDay, 50, "提案は上限で止める");
});

test("全部学習済みなら今日で一周が終わっている", () => {
  const plan = srs.studyPlan({
    totalItems: 1652, introduced: 1652, newPerDay: 30,
    today: TODAY, examDate: srs.addDays(TODAY, 10),
  });
  eq(plan.remaining, 0);
  eq(plan.daysToFinish, 0);
  eq(plan.finishDate, TODAY);
  eq(plan.onTime, true);
  eq(plan.reviewDays, 10);
});

test("入試日が過ぎていても落ちない", () => {
  const plan = srs.studyPlan({
    totalItems: 1652, introduced: 100, newPerDay: 30,
    today: TODAY, examDate: srs.addDays(TODAY, -5),
  });
  eq(plan.examPassed, true);
  eq(plan.onTime, false);
  eq(plan.suggestedPerDay, null, "過ぎていたら提案しない");
});

test("新規語数が0でも落ちない", () => {
  const plan = srs.studyPlan({ totalItems: 100, introduced: 0, newPerDay: 0, today: TODAY });
  eq(plan.daysToFinish, 100, "1語/日として計算する");
});

export { results };
