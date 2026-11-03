// 音読・リスニング練習(SPEC §4.5)。セット(10文)単位で4つのモードを練習する。
// セット選択 → モード選択 → 再生画面、の3画面を内部で切り替える。
"use strict";

import * as store from "../store.js";
import * as audio from "../audio.js";
import * as audiocache from "../audiocache.js";
import * as tts from "../tts.js";
import { esc, highlightIdiom, toast } from "../ui.js";

const MODES = [
  { key: "listen", num: "①", name: "聞く", desc: "1文ずつ読み上げて、自動で次へ進みます。" },
  { key: "repeat", num: "②", name: "リピート", desc: "読み上げ → 無音(文の長さ+1秒) → 次へ。無音の間にまねして声に出します。" },
  { key: "shadowing", num: "③", name: "シャドーイング", desc: "ほぼ切れ目なく連続再生します。重ねて声に出します。" },
  { key: "recite", num: "④", name: "暗唱", desc: "日本語の意味だけを見て英文を言い、答え合わせをします。" },
];

let view = "sets";
let setNo = null;
let mode = null;
let player = null;
let root = null;

export function render(container) {
  root = container;
  audio.useSettings(store.state.settings);
  draw();
}

export function onLeave() {
  stopPlayback();
  view = "sets";
  setNo = null;
  mode = null;
  player = null;
}

function draw() {
  if (view === "sets") drawSets();
  else if (view === "modes") drawModes();
  else drawPlayer();
}

// ---- セットの一覧 ----

function setsOf(no) {
  return store.state.phrases
    .filter((p) => p.readAloudSet === no && p.example)
    .sort((a, b) => a.readAloudOrder - b.readAloudOrder);
}

function allSetNumbers() {
  const nums = new Set(store.state.phrases.filter((p) => p.readAloudSet > 0).map((p) => p.readAloudSet));
  return [...nums].sort((a, b) => a - b);
}

function setDone(no, modeKey) {
  const list = setsOf(no);
  return list.length > 0 && list.every((p) => store.readAloudOf(p.id)[modeKey]);
}

export function nextIncompleteSet() {
  for (const no of allSetNumbers()) {
    if (!MODES.every((m) => setDone(no, m.key))) return no;
  }
  return null;
}

function drawSets() {
  const nums = allSetNumbers();
  const voiceWarning = audio.manifestFailed()
    ? `<div class="warn">同梱の音声データ(audio/manifest.json)を読み込めませんでした。
       例文は端末の読み上げで再生します。</div>`
    : "";

  root.innerHTML = `
    ${voiceWarning}
    <p class="note" style="margin-bottom:.8rem">1セット10文です。①〜④のモードごとに進み具合を保存します。</p>
    <div class="setgrid">
      ${nums.map((no) => {
        const marks = MODES.map((m) => setDone(no, m.key)
          ? `<span class="d">${m.num}</span>` : `<span>${m.num}</span>`).join("");
        return `<button class="setbtn" data-set="${no}">
          <div class="n">${no}</div><div class="m">${marks}</div></button>`;
      }).join("")}
    </div>
    <p class="note">緑の番号は、そのセットでそのモードを最後まで終えたしるしです。</p>
  `;
  root.querySelectorAll("[data-set]").forEach((b) => {
    b.onclick = () => {
      setNo = Number(b.dataset.set);
      // このセットぶん(20ファイル・約0.2MB)だけ静かに取っておく
      audiocache.prefetchSet(setsOf(setNo), audio.allClips());
      view = "modes";
      draw();
    };
  });
}

// ---- モードの選択 ----

function drawModes() {
  const list = setsOf(setNo);
  root.innerHTML = `
    <button class="btn secondary" id="back" style="margin-bottom:1rem">← セット一覧</button>
    <div class="section-title">セット ${setNo}(${list.length}文)</div>
    <div class="card">
      ${MODES.map((m) => {
        const done = setDone(setNo, m.key);
        return `<button class="row" data-mode="${m.key}">
          <span class="modebtn"><span class="num ${done ? "done" : ""}">${done ? "✓" : m.num}</span></span>
          <span class="grow"><span class="name">${esc(m.name)}</span><span class="desc">${esc(m.desc)}</span></span>
          <span class="chevron">›</span>
        </button>`;
      }).join("")}
    </div>
    <div class="section-title">このセットの例文</div>
    <div class="card">
      ${list.map((p) => `<div class="row"><span class="grow">
        <span class="name">${highlightIdiom(p.example, p.en)}</span>
        <span class="desc">${esc(p.en)} … ${esc(p.ja)}</span></span></div>`).join("")}
    </div>
  `;
  root.querySelector("#back").onclick = () => { view = "sets"; draw(); };
  root.querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.mode;
      player = {
        list: setsOf(setNo),
        index: 0,
        playing: false,
        state: "idle",     // idle | speaking | silent | done
        showJa: mode === "recite" ? true : false,
        showEn: mode !== "recite",
        revealed: false,
        token: 0,
      };
      view = "player";
      draw();
    };
  });
}

// ---- 再生画面 ----

function stopPlayback() {
  if (player) { player.playing = false; player.token += 1; player.state = "idle"; }
  audio.stop();
}

function markDone(phraseId) {
  store.setReadAloud(phraseId, mode, true);
}

function currentRate() {
  return store.state.settings.ttsRate;
}

// ①②③の自動再生ループ
async function runLoop() {
  const myToken = ++player.token;
  player.playing = true;

  while (player.playing && player.token === myToken && player.index < player.list.length) {
    const phrase = player.list[player.index];
    player.state = "speaking";
    drawPlayerBody();

    const result = await audio.play(phrase, currentRate());
    if (player.token !== myToken) return;
    if (result.cancelled) return;
    if (result.usedTts && result.error === "unsupported") {
      toast("この文の音声が無く、読み上げも使えません");
      player.playing = false; player.state = "idle"; drawPlayerBody(); return;
    }
    markDone(phrase.id);

    // モードごとの間(SPEC §4.5)
    let gap = 400;
    if (mode === "repeat") gap = result.ms + 1000;   // 文の長さ + 1秒
    else if (mode === "shadowing") gap = 300;
    player.state = mode === "repeat" ? "silent" : "speaking";
    drawPlayerBody();

    const waited = await audio.wait(gap);
    if (waited.cancelled || player.token !== myToken) return;

    if (player.index >= player.list.length - 1) break;
    player.index += 1;
    drawPlayerBody();
  }

  if (player.token === myToken) {
    player.playing = false;
    player.state = "done";
    drawPlayerBody();
  }
}

function drawPlayer() {
  const m = MODES.find((x) => x.key === mode);
  root.innerHTML = `
    <button class="btn secondary" id="back" style="margin-bottom:.8rem">← モード選択</button>
    <div class="section-title">セット ${setNo} ・ ${m.num} ${esc(m.name)}</div>
    <div id="pbody"></div>
  `;
  root.querySelector("#back").onclick = () => { stopPlayback(); view = "modes"; draw(); };
  drawPlayerBody();
}

function drawPlayerBody() {
  const body = root.querySelector("#pbody");
  if (!body) return;
  const phrase = player.list[player.index];
  const n = player.index + 1;
  const total = player.list.length;
  const s = store.state.settings;

  const stateText = {
    idle: "停止中",
    speaking: "再生中…",
    silent: "どうぞ(声に出してまねしてください)",
    done: "このセットは終わりです",
  }[player.state];

  const sentenceHtml = mode === "recite"
    ? `
      <div class="idiom">${esc(phrase.en)}</div>
      <div class="ja">${esc(phrase.ja)}</div>
      ${player.revealed ? `<div class="en" style="margin-top:1rem">${highlightIdiom(phrase.example, phrase.en)}</div>` : ""}
    `
    : `
      ${player.showEn ? `<div class="en">${highlightIdiom(phrase.example, phrase.en)}</div>` : `<div class="ja">(テキストは非表示)</div>`}
      ${player.showJa ? `<div class="ja">${esc(phrase.en)} … ${esc(phrase.ja)}</div>` : ""}
    `;

  body.innerHTML = `
    <div class="player">
      <div class="session-top">
        <span>${n} / ${total}</span>
        <span class="bar" aria-hidden="true"><span style="width:${(n / total) * 100}%"></span></span>
      </div>
      <div class="sentence">${sentenceHtml}</div>
      <div class="state ${player.state}" role="status">${esc(stateText)}</div>

      ${mode === "recite" ? reciteControls(player.revealed) : autoControls(player.playing)}

      <div class="section-title" style="text-align:left">速度(次の文から反映)</div>
      <div class="seg" role="group" aria-label="速度">
        ${tts.RATES.map((r) => `<button data-rate="${r}" class="${s.ttsRate === r ? "on" : ""}">${r.toFixed(1)}倍</button>`).join("")}
      </div>

      <div class="card" style="margin-top:1rem">
        ${mode !== "recite" ? `
        <div class="row"><span class="grow"><span class="name">英文のテキストを表示</span></span>
          <button class="switch ${player.showEn ? "on" : ""}" id="toggleEn" role="switch" aria-checked="${player.showEn}" aria-label="英文のテキストを表示"></button></div>
        <div class="row"><span class="grow"><span class="name">熟語と日本語の意味を表示</span></span>
          <button class="switch ${player.showJa ? "on" : ""}" id="toggleJa" role="switch" aria-checked="${player.showJa}" aria-label="熟語と日本語の意味を表示"></button></div>
        ` : ""}
        <div class="row"><span class="grow"><span class="name">音声</span>
          <span class="desc">${audio.hasClip(phrase.id)
            ? `同梱音声(${esc(audio.variantForRate(s.ttsRate))}) / ${s.ttsRate.toFixed(1)}倍`
            : "この文は端末の読み上げ"}</span></span></div>
      </div>
      <p class="note">画面を閉じている間の再生には対応していません(ブラウザの制限)。画面を表示したまま練習してください。</p>
    </div>
  `;
  wirePlayer(body, phrase);
}

function autoControls(playing) {
  return `
    <div class="pcontrols">
      <button class="pbtn" id="prev" aria-label="前の文" ${player.index === 0 ? "disabled" : ""}>⏮</button>
      <button class="pbtn main" id="play" aria-label="${playing ? "一時停止" : "再生"}">${playing ? "⏸" : "▶"}</button>
      <button class="pbtn" id="next" aria-label="次の文" ${player.index >= player.list.length - 1 ? "disabled" : ""}>⏭</button>
      <button class="pbtn" id="again" aria-label="この文をもう一度">🔁</button>
    </div>`;
}

function reciteControls(revealed) {
  return `
    <div class="pcontrols">
      <button class="pbtn" id="prev" aria-label="前の文" ${player.index === 0 ? "disabled" : ""}>⏮</button>
      <button class="pbtn" id="again" aria-label="例文を聞く">🔊</button>
      <button class="pbtn" id="next" aria-label="次の文" ${player.index >= player.list.length - 1 ? "disabled" : ""}>⏭</button>
    </div>
    ${revealed ? `
      <div class="btn-row" style="margin-bottom:1rem">
        <button class="btn orange" id="r-unsure">△ あやふや</button>
        <button class="btn green" id="r-ok">✓ 言えた</button>
      </div>` : `
      <button class="btn" id="reveal" style="margin-bottom:1rem">答えを見る</button>`}
  `;
}

function wirePlayer(body, phrase) {
  const play = body.querySelector("#play");
  if (play) {
    play.onclick = () => {
      if (player.playing) { stopPlayback(); drawPlayerBody(); }
      else { if (player.state === "done") player.index = 0; runLoop(); }
    };
  }

  const prev = body.querySelector("#prev");
  if (prev) prev.onclick = () => {
    const wasPlaying = player.playing;
    stopPlayback();
    player.index = Math.max(0, player.index - 1);
    player.revealed = false;
    drawPlayerBody();
    if (wasPlaying) runLoop();
  };

  const next = body.querySelector("#next");
  if (next) next.onclick = () => {
    const wasPlaying = player.playing;
    stopPlayback();
    player.index = Math.min(player.list.length - 1, player.index + 1);
    player.revealed = false;
    drawPlayerBody();
    if (wasPlaying) runLoop();
  };

  const again = body.querySelector("#again");
  if (again) again.onclick = async () => {
    const wasPlaying = player.playing;
    stopPlayback();
    player.state = "speaking";
    drawPlayerBody();
    await audio.play(phrase, currentRate());
    if (!player) return;
    player.state = "idle";
    drawPlayerBody();
    if (wasPlaying) runLoop();
  };

  body.querySelectorAll("[data-rate]").forEach((b) => {
    b.onclick = () => {
      store.updateSettings({ ttsRate: Number(b.dataset.rate) });
      drawPlayerBody();           // 再生中の文は止めない(次の文から反映)
    };
  });

  const tEn = body.querySelector("#toggleEn");
  if (tEn) tEn.onclick = () => { player.showEn = !player.showEn; drawPlayerBody(); };
  const tJa = body.querySelector("#toggleJa");
  if (tJa) tJa.onclick = () => { player.showJa = !player.showJa; drawPlayerBody(); };

  const reveal = body.querySelector("#reveal");
  if (reveal) reveal.onclick = async () => {
    player.revealed = true;
    drawPlayerBody();
    await audio.play(phrase, currentRate());
    if (player) { player.state = "idle"; drawPlayerBody(); }
  };

  const rOk = body.querySelector("#r-ok");
  if (rOk) rOk.onclick = () => reciteGrade(true);
  const rUnsure = body.querySelector("#r-unsure");
  if (rUnsure) rUnsure.onclick = () => reciteGrade(false);
}

function reciteGrade(ok) {
  const phrase = player.list[player.index];
  store.setReadAloud(phrase.id, "recite", ok);
  player.revealed = false;
  if (player.index >= player.list.length - 1) {
    player.state = "done";
    toast("このセットの暗唱は終わりです");
  } else {
    player.index += 1;
  }
  drawPlayerBody();
}
