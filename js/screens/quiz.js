// 小テスト(SPEC §4.6)。直近の △ とステージ1〜2の語から20問、英 → 日の4択。
// 結果はそのままステージの更新(✓ / △)に反映する。
"use strict";

import * as store from "../store.js";
import { esc, toast } from "../ui.js";

const SIZE = 20;
let quiz = null;

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function candidates() {
  const all = [...store.state.words, ...store.state.phrases];
  const pick = [];
  for (const item of all) {
    const p = store.progressOf(item.id);
    if (!p) continue;
    if (p.lastResult === "unsure" || p.stage === 1 || p.stage === 2) pick.push(item);
  }
  return pick;
}

function buildQuiz() {
  const pool = candidates();
  const questions = shuffle(pool).slice(0, SIZE).map((item) => {
    const sameKind = store.kindOf(item.id) === "phrase" ? store.state.phrases : store.state.words;
    const wrong = shuffle(sameKind.filter((x) => x.id !== item.id && x.ja !== item.ja)).slice(0, 3);
    return {
      item,
      choices: shuffle([item, ...wrong]).map((x) => ({ id: x.id, ja: x.ja })),
      answered: null,
    };
  });
  return { questions, index: 0, correct: 0, finished: false };
}

export function render(root) {
  if (!quiz || quiz.finished) quiz = buildQuiz();
  draw(root);
}

export function onLeave() {
  quiz = null;
}

function draw(root) {
  if (!quiz.questions.length) {
    root.innerHTML = `
      <div class="empty">
        <p style="font-size:2.5rem;margin:0 0 .5rem">📝</p>
        <p>まだ小テストに出せる語がありません。</p>
        <p class="note">△ をつけた語、またはステージ1〜2の語がたまると出題できます。<br>
        先に単語・熟語の学習を進めてください。</p>
      </div>`;
    return;
  }
  if (quiz.index >= quiz.questions.length) { drawResult(root); return; }

  const q = quiz.questions[quiz.index];
  const n = quiz.index + 1;
  root.innerHTML = `
    <div class="session-top">
      <span>${n} / ${quiz.questions.length}</span>
      <span class="bar" aria-hidden="true"><span style="width:${((n - 1) / quiz.questions.length) * 100}%"></span></span>
      <span>正解 ${quiz.correct}</span>
    </div>
    <div class="flashcard" style="min-height:8rem">
      <div class="${store.kindOf(q.item.id) === "phrase" ? "phrase-en" : "word"}">${esc(q.item.en)}</div>
      ${q.item.pos ? `<div class="pos">${esc(q.item.pos)}</div>` : ""}
    </div>
    <div id="choices">
      ${q.choices.map((c, i) => `<button class="choice" data-choice="${i}">${esc(c.ja)}</button>`).join("")}
    </div>
    <div id="after"></div>
  `;

  root.querySelectorAll("[data-choice]").forEach((b) => {
    b.onclick = () => answer(root, Number(b.dataset.choice));
  });
}

function answer(root, choiceIndex) {
  const q = quiz.questions[quiz.index];
  if (q.answered !== null) return;
  const chosen = q.choices[choiceIndex];
  const correct = chosen.id === q.item.id;
  q.answered = choiceIndex;
  if (correct) quiz.correct += 1;

  // 結果をステージに反映(正解 = ✓、不正解 = △)
  store.gradeItem(q.item.id, correct ? "ok" : "unsure");

  root.querySelectorAll("[data-choice]").forEach((b) => {
    const i = Number(b.dataset.choice);
    b.disabled = true;
    if (q.choices[i].id === q.item.id) b.classList.add("correct");
    else if (i === choiceIndex) b.classList.add("wrong");
  });

  const after = root.querySelector("#after");
  after.innerHTML = `
    <p class="note" style="text-align:center;font-size:.9rem">${correct ? "正解。ステージが1つ進みました。" : "不正解。ステージ1に戻して翌日もう一度出します。"}</p>
    <button class="btn" id="nextq">${quiz.index + 1 >= quiz.questions.length ? "結果を見る" : "次の問題"}</button>`;
  const next = root.querySelector("#nextq");
  next.onclick = () => { quiz.index += 1; draw(root); };
  next.focus();
}

function drawResult(root) {
  const total = quiz.questions.length;
  store.addQuizResult(quiz.correct, total);
  quiz.finished = true;
  const rate = Math.round((quiz.correct / total) * 100);
  const wrong = quiz.questions.filter((q) => q.choices[q.answered]?.id !== q.item.id);

  root.innerHTML = `
    <div class="hero">
      <div class="big">${quiz.correct}<span style="font-size:1.4rem;color:var(--sub)"> / ${total}</span></div>
      <div class="cap">正答率 ${rate}%</div>
    </div>
    ${wrong.length ? `
      <div class="section-title">まちがえた語(${wrong.length})</div>
      <div class="card">
        ${wrong.map((q) => `<div class="row"><span class="grow">
          <span class="name">${esc(q.item.en)}</span>
          <span class="desc">${esc(q.item.ja)}</span></span></div>`).join("")}
      </div>` : `<p class="note" style="text-align:center">全問正解です。`}
    <button class="btn" id="retry">もう一度</button>
  `;
  root.querySelector("#retry").onclick = () => { quiz = buildQuiz(); draw(root); if (!quiz.questions.length) toast("出題できる語がなくなりました"); };
}
