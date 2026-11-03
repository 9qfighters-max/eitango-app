// ホーム画面(SPEC §4.1)。今日のタスクを1画面にまとめる。
"use strict";

import { selectSession, studyPlan } from "../srs.js";
import * as store from "../store.js";
import { esc, pct, toast } from "../ui.js";
import { nextIncompleteSet } from "./readaloud.js";
import * as audiopanel from "./audiopanel.js";
import * as profiles from "./profiles.js";

function todaysTasks() {
  const today = store.today();
  const words = selectSession({
    items: store.state.words,
    progress: store.state.progress,
    today,
    newPerDay: store.state.settings.newPerDay,
  });
  const phrases = selectSession({
    items: store.state.phrases,
    progress: store.state.progress,
    today,
    newPerDay: store.state.settings.newPhrasesPerDay,
  });
  return { words, phrases, set: nextIncompleteSet() };
}

export function render(root, _params, go, rerender) {
  const t = todaysTasks();
  const s = store.stats();
  const h = store.state.history[store.today()] || { words: 0, phrases: 0 };
  const doneToday = (h.words || 0) + (h.phrases || 0);

  const plan = studyPlan({
    totalItems: store.state.words.length,
    introduced: store.introducedCount("word"),
    newPerDay: store.state.settings.newPerDay,
    today: store.today(),
    examDate: store.state.settings.examDate,
  });

  const wordTotal = t.words.reviews.length + t.words.news.length;
  const phraseTotal = t.phrases.reviews.length + t.phrases.news.length;

  root.innerHTML = `
    ${profiles.barHtml()}

    <div class="hero">
      <div class="big">${doneToday}</div>
      <div class="cap">今日の学習 ${doneToday} 語</div>
    </div>

    <div class="statgrid">
      <div class="box"><div class="v">${s.streak}<span style="font-size:.9rem">日</span></div><div class="k">連続学習</div></div>
      <div class="box"><div class="v">${pct(s.wordRetention)}</div><div class="k">単語の定着</div></div>
      <div class="box">
        <div class="v">${s.daysToExam === null ? "—" : s.daysToExam}${s.daysToExam === null ? "" : '<span style="font-size:.9rem">日</span>'}</div>
        <div class="k">入試まで</div>
      </div>
    </div>
    ${planHtml(plan, store.state.settings.newPerDay)}

    <div id="audio-slot"></div>

    <div class="section-title">今日のタスク</div>

    <button class="task ${wordTotal === 0 ? "done" : ""}" data-go="words" aria-label="単語の学習を始める">
      <span class="ico">📖</span>
      <span class="grow">
        <span class="t">単語</span>
        <span class="s">${wordTotal === 0 ? "今日の分は終わりました"
          : `復習 ${t.words.reviews.length} 語 ・ 新規 ${t.words.news.length} 語`}</span>
      </span>
      <span class="chevron">›</span>
    </button>

    <button class="task ${phraseTotal === 0 ? "done" : ""}" data-go="phrases" aria-label="熟語の学習を始める">
      <span class="ico">🔗</span>
      <span class="grow">
        <span class="t">熟語</span>
        <span class="s">${phraseTotal === 0 ? "今日の分は終わりました"
          : `復習 ${t.phrases.reviews.length} 個 ・ 新規 ${t.phrases.news.length} 個`}</span>
      </span>
      <span class="chevron">›</span>
    </button>

    <button class="task ${t.set === null ? "done" : ""}" data-go="readaloud" aria-label="音読の練習を始める">
      <span class="ico">🎧</span>
      <span class="grow">
        <span class="t">音読</span>
        <span class="s">${t.set === null ? "すべてのセットを終えました" : `セット ${t.set}(10文)`}</span>
      </span>
      <span class="chevron">›</span>
    </button>

    <button class="task" data-go="quiz" aria-label="小テストを始める">
      <span class="ico">📝</span>
      <span class="grow">
        <span class="t">小テスト</span>
        <span class="s">${quizHint()}</span>
      </span>
      <span class="chevron">›</span>
    </button>

    <div class="section-title">まず優先度A(基本)から</div>
    <div class="card card-pad">
      <div style="display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:.3rem">
        <span><span class="pill A">基本</span> 学習した語</span>
        <span>${s.byTier.A.started} / ${s.byTier.A.total}</span>
      </div>
      <div class="bar"><span style="width:${pct(s.byTier.A.startedRate)};background:var(--green)"></span></div>
      <div style="display:flex;justify-content:space-between;font-size:.9rem;margin:.8rem 0 .3rem">
        <span>そのうち定着(ステージ5)</span>
        <span>${s.byTier.A.done} / ${s.byTier.A.total}</span>
      </div>
      <div class="bar"><span style="width:${pct(s.byTier.A.rate)}"></span></div>
      <p class="note" style="margin-left:0">優先度Aを先に終えると、入試でよく出る語を取りこぼしにくくなります。</p>
    </div>

    <div class="section-title">定着率</div>
    <div class="card card-pad">
      <div style="display:flex;justify-content:space-between;font-size:.9rem;margin-bottom:.3rem">
        <span>単語 ${store.state.words.length} 語</span><span>${pct(s.wordRetention)}</span>
      </div>
      <div class="bar"><span style="width:${pct(s.wordRetention)}"></span></div>
      <div style="display:flex;justify-content:space-between;font-size:.9rem;margin:.8rem 0 .3rem">
        <span>熟語 ${store.state.phrases.length} 個</span><span>${pct(s.phraseRetention)}</span>
      </div>
      <div class="bar"><span style="width:${pct(s.phraseRetention)};background:var(--teal)"></span></div>
      <p class="note" style="margin-left:0">定着率は、ステージ5(卒業)まで進んだ語の割合です。</p>
    </div>

    ${t.words.overflow > 0 ? `<div class="warn">期限切れの復習が ${t.words.dueTotal} 語あります。今日は60語まで出し、残りは翌日に回します。</div>` : ""}
  `;

  root.querySelectorAll("[data-go]").forEach((b) => {
    b.onclick = () => go(b.dataset.go);
  });

  profiles.wireBar(root, go, () => { if (rerender) rerender(); });

  const apply = root.querySelector("#apply-plan");
  if (apply) apply.onclick = () => {
    store.updateSettings({ newPerDay: Number(apply.dataset.per) });
    toast(`1日の新規単語数を ${apply.dataset.per} 語にしました`);
    if (rerender) rerender();
  };

  // 音声データのカード(未取得のときだけ出る)
  const slot = root.querySelector("#audio-slot");
  audiopanel.state().then((st) => {
    if (!root.isConnected) return;
    slot.innerHTML = audiopanel.cardHtml(st);
    audiopanel.wire(slot, () => { if (rerender) rerender(); });
  });
}

function quizHint() {
  const last = store.state.quizzes[store.state.quizzes.length - 1];
  if (!last) return "△ とステージ1〜2の語から20問";
  return `前回 ${last.correct} / ${last.total} 正解(${esc(last.date)})`;
}

// 学習計画(SPEC §4.2)。入試日が入っていないときは入力をうながす。
function planHtml(plan, newPerDay) {
  if (plan.daysToExam === null) {
    return `<p class="note" style="margin-top:-.5rem;margin-bottom:1rem">
      入試日を設定(右上の⚙)に入れると、一周の終了予定と復習に使える日数が出ます。</p>`;
  }
  if (plan.examPassed) {
    return `<div class="card card-pad" style="margin-bottom:1rem">
      <div class="name" style="font-weight:600">入試日を過ぎています</div>
      <p class="note" style="margin:.3rem 0 0">設定で入試日を直せます。</p></div>`;
  }
  if (plan.remaining === 0) {
    return `<div class="card card-pad" style="margin-bottom:1rem">
      <div class="name" style="font-weight:600">単語は一周しました</div>
      <p class="note" style="margin:.3rem 0 0">入試まで ${plan.daysToExam} 日。あとは復習にあてられます。</p></div>`;
  }

  const common = `1日 ${newPerDay} 語なら、残り ${plan.remaining} 語を <strong>${plan.daysToFinish} 日</strong>で一周します(${esc(plan.finishDate)})。`;

  if (plan.onTime) {
    return `<div class="card card-pad" style="margin-bottom:1rem">
      <div class="name" style="font-weight:600">学習計画</div>
      <p class="note" style="margin:.3rem 0 0">${common}<br>
        入試まで ${plan.daysToExam} 日なので、<strong>復習に ${plan.reviewDays} 日</strong>使えます。</p>
    </div>`;
  }

  if (plan.achievable) {
    return `<div class="warn" style="margin-bottom:1rem">
      <strong>このままだと一周が間に合いません。</strong><br>
      ${common}入試まで ${plan.daysToExam} 日です。<br>
      1日 ${plan.suggestedPerDay} 語にすると間に合います。
      <button class="btn" id="apply-plan" data-per="${plan.suggestedPerDay}"
        style="margin-top:.6rem">1日 ${plan.suggestedPerDay} 語にする</button>
    </div>`;
  }

  return `<div class="warn" style="margin-bottom:1rem">
    <strong>残り ${plan.daysToExam} 日では全部は一周できません。</strong><br>
    1日 ${plan.suggestedPerDay} 語(上限)にしても ${Math.ceil(plan.remaining / plan.suggestedPerDay)} 日かかります。
    優先度A(基本)から順に出るので、<strong>上から取りこぼさずに進める</strong>のが近道です。
    <button class="btn" id="apply-plan" data-per="${plan.suggestedPerDay}"
      style="margin-top:.6rem">1日 ${plan.suggestedPerDay} 語にする</button>
  </div>`;
}
