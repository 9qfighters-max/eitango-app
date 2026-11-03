// 復習スケジュール(SPEC §4.3)。
// このファイルには副作用のない純粋関数だけを置く(test/srs.test.js でテストする)。
"use strict";

export const STAGE_MAX = 5;                              // 5 = 卒業(定着)
export const INTERVAL_DAYS = [0, 1, 3, 7, 30, null];     // 添字 = ステージ
export const REVIEW_CAP = 60;                            // 1日の復習上限
const TIER_RANK = { A: 0, B: 1, C: 2 };

// ---- 日付(すべて端末のローカル時刻で "YYYY-MM-DD" 文字列として扱う) ----

export function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateStr(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(dateStr, days) {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

// a - b を日数で返す(a が後なら正)
export function diffDays(a, b) {
  const ms = parseDateStr(a).getTime() - parseDateStr(b).getTime();
  return Math.round(ms / 86400000);
}

// ---- 進捗(Progress) ----

export function newProgress(itemId, today, nowIso) {
  return {
    itemId,
    stage: 0,
    dueDate: today,              // ステージ0は当日に出す
    lastResult: null,
    reviewCount: 0,
    introducedOn: today,         // 1日の新規語数を数えるために持つ
    updatedAt: nowIso || new Date().toISOString(),
  };
}

// 自己採点の結果を進捗に反映する。
//   ✓(ok)     … ステージを1つ上げ、次回日 = today + 間隔[新ステージ]
//   △(unsure) … ステージ1に戻し、翌日もう一度出す
export function grade(progress, result, today, nowIso) {
  const stage = result === "ok" ? Math.min(progress.stage + 1, STAGE_MAX) : 1;
  const interval = INTERVAL_DAYS[stage];
  return {
    ...progress,
    stage,
    dueDate: interval === null ? null : addDays(today, interval),
    lastResult: result,
    reviewCount: (progress.reviewCount || 0) + 1,
    updatedAt: nowIso || new Date().toISOString(),
  };
}

export function isGraduated(progress) {
  return !!progress && progress.stage >= STAGE_MAX;
}

export function isDue(progress, today) {
  if (!progress || isGraduated(progress)) return false;
  return !!progress.dueDate && progress.dueDate <= today;
}

// ---- 今日のセッションを組む(SPEC §4.2「期限の復習 → 新規」) ----

function compareByPriority(a, b) {
  return (TIER_RANK[a.tier] - TIER_RANK[b.tier]) || (a.order - b.order);
}

export function selectSession({ items, progress, today, newPerDay, reviewCap = REVIEW_CAP }) {
  const sorted = [...items].sort(compareByPriority);
  const dueList = [];
  const freshList = [];

  for (const item of sorted) {
    const p = progress[item.id];
    if (!p) { freshList.push(item); continue; }
    if (isGraduated(p)) continue;
    if (isDue(p, today)) dueList.push(item);
  }

  // 期限切れが古いものから。同じ期限なら優先度順。
  dueList.sort((a, b) => {
    const da = progress[a.id].dueDate;
    const db = progress[b.id].dueDate;
    if (da !== db) return da < db ? -1 : 1;
    return compareByPriority(a, b);
  });

  // 今日すでに出した新規数は、この items(単語なら単語だけ)の中で数える。
  // progress は単語と熟語で1つなので、絞らないと枠を食い合う。
  const ids = new Set(sorted.map((i) => i.id));
  const introducedToday = Object.values(progress)
    .filter((p) => p.introducedOn === today && ids.has(p.itemId)).length;
  const newQuota = Math.max(0, newPerDay - introducedToday);

  return {
    reviews: dueList.slice(0, reviewCap),
    news: freshList.slice(0, newQuota),
    dueTotal: dueList.length,
    overflow: Math.max(0, dueList.length - reviewCap),   // 翌日に回る分
    newQuota,
  };
}

// ---- 統計 ----

// 定着率 = ステージ5の語数 ÷ 全語数
export function retention(progressList, totalItems) {
  if (!totalItems) return 0;
  const done = progressList.filter(isGraduated).length;
  return done / totalItems;
}

// 連続学習日数。今日まだ学習していなければ前日から数える。
export function streak(studiedDates, today) {
  const set = studiedDates instanceof Set ? studiedDates : new Set(studiedDates);
  let cursor = set.has(today) ? today : addDays(today, -1);
  if (!set.has(cursor)) return 0;
  let count = 0;
  while (set.has(cursor)) {
    count += 1;
    cursor = addDays(cursor, -1);
  }
  return count;
}

// ---- 学習計画(SPEC §4.2) ----
// 入試日と1日の新規語数から、一周の終了予定日と復習に使える日数を出す。
// 間に合わないときは、1日あたり何語にすれば間に合うかを返す。

export function studyPlan({
  totalItems,
  introduced,
  newPerDay,
  today,
  examDate = null,
  maxPerDay = 50,
}) {
  const remaining = Math.max(0, (totalItems || 0) - (introduced || 0));
  const perDay = Math.max(1, newPerDay || 1);
  const daysToFinish = Math.ceil(remaining / perDay);
  const finishDate = addDays(today, daysToFinish);

  if (!examDate) {
    return {
      remaining, daysToFinish, finishDate,
      daysToExam: null, reviewDays: null, onTime: null,
      examPassed: false, suggestedPerDay: null, achievable: null,
    };
  }

  const daysToExam = diffDays(examDate, today);
  const examPassed = daysToExam < 0;
  const onTime = !examPassed && daysToFinish <= daysToExam;
  const reviewDays = daysToExam - daysToFinish;

  let suggestedPerDay = null;
  let achievable = null;
  if (!onTime && !examPassed && remaining > 0) {
    const needed = Math.ceil(remaining / Math.max(1, daysToExam));
    achievable = needed <= maxPerDay;
    // 設定は5語刻みなので、切り上げて合わせる
    suggestedPerDay = Math.min(maxPerDay, Math.ceil(needed / 5) * 5);
  }

  return {
    remaining, daysToFinish, finishDate,
    daysToExam, reviewDays, onTime, examPassed,
    suggestedPerDay, achievable,
  };
}
