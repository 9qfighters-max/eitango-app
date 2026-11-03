// 単語セッション・熟語セッション(SPEC §4.2 / §4.4)。
// 表 → 裏 → 自己採点(✓ / △)の繰り返し。期限の復習を先に、そのあと新規。
"use strict";

import { selectSession } from "../srs.js";
import * as store from "../store.js";
import * as audio from "../audio.js";
import * as tts from "../tts.js";
import { esc, highlightIdiom, toast, tierLabel } from "../ui.js";

let session = null;

function buildSession(kind) {
  const items = kind === "phrase" ? store.state.phrases : store.state.words;
  const newPerDay = kind === "phrase"
    ? store.state.settings.newPhrasesPerDay
    : store.state.settings.newPerDay;
  const picked = selectSession({
    items,
    progress: store.state.progress,
    today: store.today(),
    newPerDay,
  });
  return {
    kind,
    queue: [...picked.reviews, ...picked.news],
    newIds: new Set(picked.news.map((i) => i.id)),
    index: 0,
    revealed: false,
    direction: kind === "word" ? "en2ja" : "en2ja",
    spellChecked: null,
    spellInput: "",
    counts: { ok: 0, unsure: 0 },
    overflow: picked.overflow,
  };
}

export function render(root, { kind = "word" } = {}) {
  if (!session || session.kind !== kind || session.finished) {
    session = buildSession(kind);
  }
  draw(root);
}

export function onLeave() {
  audio.stop();
  session = null;
}

function draw(root) {
  if (!session.queue.length) {
    root.innerHTML = `
      <div class="empty">
        <p style="font-size:2.5rem;margin:0 0 .5rem">🎉</p>
        <p>今日の${session.kind === "phrase" ? "熟語" : "単語"}は終わりました。</p>
        <p class="note">期限の来た復習と新規の割り当てが、どちらも残っていません。</p>
      </div>`;
    return;
  }
  if (session.index >= session.queue.length) { drawFinish(root); return; }

  const item = session.queue[session.index];
  if (session.newIds.has(item.id)) store.introduce(item.id);

  const total = session.queue.length;
  const n = session.index + 1;
  const isNew = session.newIds.has(item.id);
  const canSpeak = tts.isSupported();
  const ja2en = session.direction === "ja2en" && session.kind === "word";

  root.innerHTML = `
    <div class="session-top">
      <span>${n} / ${total}</span>
      <span class="bar" aria-hidden="true"><span style="width:${((n - 1) / total) * 100}%"></span></span>
      <span>${isNew ? "新規" : "復習"}</span>
    </div>

    ${session.kind === "word" ? `
      <div class="seg" style="margin-bottom:.8rem" role="group" aria-label="出題方向">
        <button data-dir="en2ja" class="${session.direction === "en2ja" ? "on" : ""}">英 → 日</button>
        <button data-dir="ja2en" class="${session.direction === "ja2en" ? "on" : ""}">日 → 英(つづり)</button>
      </div>` : ""}

    <div class="flashcard" id="card" role="button" tabindex="0"
         aria-label="カード。タップで${session.revealed ? "次へ" : "答えを見る"}">
      <span class="pill ${item.tier} tier">${tierLabel(item.tier)}</span>
      ${canSpeak ? `<button class="speak" id="speak" aria-label="発音を聞く">🔊</button>` : ""}
      ${front(item, ja2en)}
      ${session.revealed ? back(item, ja2en) : `<div class="tap-hint">タップして答えを見る</div>`}
    </div>

    ${ja2en && !session.revealed ? `
      <div class="spell-wrap">
        <input type="text" id="spell" placeholder="つづりを入力" autocapitalize="none"
               autocomplete="off" autocorrect="off" spellcheck="false" inputmode="latin">
      </div>` : ""}

    ${ja2en && session.revealed && session.spellChecked ? `
      <div class="spell-judge ${session.spellChecked === "good" ? "good" : "bad"}">
        ${session.spellChecked === "good"
          ? "つづり 正解"
          : `入力: ${esc(session.spellInput)} → 正しくは <b>${esc(item.en)}</b>`}
      </div>` : ""}

    ${session.revealed ? `
      <div class="btn-row">
        <button class="btn orange" id="unsure">△ あやふや</button>
        <button class="btn green" id="ok">✓ 覚えた</button>
      </div>
      <p class="note">✓ は次の間隔へ進み、△ はステージ1に戻って翌日もう一度出ます。</p>
    ` : `
      <button class="btn" id="reveal">答えを見る</button>
    `}

    ${session.overflow > 0 ? `<p class="note">期限切れが多いため、今日は60語までにしています(残り ${session.overflow} 語は翌日)。</p>` : ""}
  `;

  wire(root, item, ja2en, canSpeak);
}

function front(item, ja2en) {
  if (item.example !== undefined && item.readAloudSet !== undefined) {
    // 熟語
    return `<div class="phrase-en">${esc(item.en)}</div>
            ${item.category ? `<div class="pos">${esc(item.category)}</div>` : ""}`;
  }
  if (ja2en) {
    return `<div class="answer">${esc(item.ja)}</div>
            ${item.pos ? `<div class="pos">${esc(item.pos)}</div>` : ""}`;
  }
  return `<div class="word">${esc(item.en)}</div>
          ${item.pos ? `<div class="pos">${esc(item.pos)}</div>` : ""}`;
}

function back(item, ja2en) {
  const isPhrase = item.example !== undefined && item.readAloudSet !== undefined;
  if (isPhrase) {
    return `<div class="detail">
      <dl>
        <dt>意味</dt><dd class="answer" style="font-size:1.25rem">${esc(item.ja)}</dd>
        ${item.example ? `<dt>例文</dt><dd class="example">${highlightIdiom(item.example, item.en)}
          <button class="hbtn" id="speakex" aria-label="例文を聞く" style="min-width:2.5rem">🔊</button>
        </dd>` : ""}
      </dl>
    </div>`;
  }
  const rows = [];
  if (!ja2en) rows.push(`<dt>意味</dt><dd class="answer" style="font-size:1.4rem">${esc(item.ja)}</dd>`);
  else rows.push(`<dt>つづり</dt><dd class="answer" style="font-size:1.4rem">${esc(item.en)}</dd>`);
  if (item.meanings && item.meanings.length) {
    rows.push(`<dt>主な意味</dt><dd>${item.meanings.map(esc).join(" / ")}</dd>`);
  }
  if (item.antonyms && item.antonyms.length) {
    rows.push(`<dt>反意語</dt><dd>${item.antonyms.map(esc).join(", ")}</dd>`);
  }
  if (item.derived && item.derived.length) {
    rows.push(`<dt>派生語</dt><dd>${item.derived.map(esc).join(", ")}</dd>`);
  }
  return `<div class="detail"><dl>${rows.join("")}</dl></div>`;
}

// 見出し語(単語・熟語そのもの)の発音。生成済み音声が無いので端末の読み上げを使う(SPEC §4.5.1)。
function speakItem(item) {
  const s = store.state.settings;
  const text = isPhrase(item) ? item.en.replace(/[~〜]/g, "") : item.en;
  tts.speak(text, { lang: s.ttsLang, rate: s.ttsRate, voiceId: s.ttsVoiceId }).then((r) => {
    if (r.error === "unsupported" || (r.error && !r.ms)) toast("この端末では読み上げが使えません");
  });
}

function isPhrase(item) {
  return item.example !== undefined && item.readAloudSet !== undefined;
}

function wire(root, item, ja2en, canSpeak) {
  const dirBtns = root.querySelectorAll("[data-dir]");
  dirBtns.forEach((b) => {
    b.onclick = () => {
      session.direction = b.dataset.dir;
      session.revealed = false;
      session.spellChecked = null;
      session.spellInput = "";
      draw(root);
    };
  });

  const speakBtn = root.querySelector("#speak");
  if (speakBtn) speakBtn.onclick = (e) => { e.stopPropagation(); speakItem(item); };

  const speakEx = root.querySelector("#speakex");
  if (speakEx) {
    speakEx.onclick = (e) => {
      e.stopPropagation();
      audio.play(item, store.state.settings.ttsRate);   // 例文は同梱音声
    };
  }

  const reveal = () => {
    if (session.revealed) return;
    const input = root.querySelector("#spell");
    if (input) {
      const typed = input.value.trim().toLowerCase().replace(/\s+/g, " ");
      const answer = item.en.trim().toLowerCase();
      session.spellInput = input.value.trim();
      session.spellChecked = typed === answer ? "good" : typed ? "bad" : null;
    }
    session.revealed = true;
    audio.stop();
    draw(root);
    if (canSpeak) speakItem(item);   // 裏を見たら発音も聞かせる
  };

  const card = root.querySelector("#card");
  if (card) {
    card.onclick = () => { if (!session.revealed) reveal(); };
    card.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); reveal(); } };
  }

  const revealBtn = root.querySelector("#reveal");
  if (revealBtn) revealBtn.onclick = reveal;

  const spell = root.querySelector("#spell");
  if (spell) {
    spell.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); reveal(); } };
    spell.focus();
  }

  const grade = (result) => {
    store.gradeItem(item.id, result);
    session.counts[result === "ok" ? "ok" : "unsure"] += 1;
    session.index += 1;
    session.revealed = false;
    session.spellChecked = null;
    session.spellInput = "";
    audio.stop();
    draw(root);
  };
  const okBtn = root.querySelector("#ok");
  if (okBtn) okBtn.onclick = () => grade("ok");
  const unsureBtn = root.querySelector("#unsure");
  if (unsureBtn) unsureBtn.onclick = () => grade("unsure");
}

function drawFinish(root) {
  session.finished = true;
  const { ok, unsure } = session.counts;
  root.innerHTML = `
    <div class="empty">
      <p style="font-size:2.8rem;margin:0 0 .5rem">🎉</p>
      <p style="font-size:1.15rem;color:var(--text)">お疲れさま！ ${ok + unsure} 語を学習しました。</p>
    </div>
    <div class="statgrid">
      <div class="box"><div class="v" style="color:var(--green)">${ok}</div><div class="k">✓ 覚えた</div></div>
      <div class="box"><div class="v" style="color:var(--orange)">${unsure}</div><div class="k">△ あやふや</div></div>
      <div class="box"><div class="v">${ok + unsure}</div><div class="k">合計</div></div>
    </div>
    <button class="btn" id="again">もう一度セッションを組む</button>
    <p class="note">△ の語は翌日、✓ の語はステージに応じた日にまた出てきます。</p>
  `;
  root.querySelector("#again").onclick = () => {
    session = buildSession(session.kind);
    draw(root);
  };
}
