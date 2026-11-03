// 単語・熟語の一覧、検索、絞り込み、ユーザー追加語(SPEC §4.2)。
"use strict";

import * as store from "../store.js";
import * as audio from "../audio.js";
import * as tts from "../tts.js";
import { esc, openModal, confirmDialog, toast, stageLabel, tierLabel, highlightIdiom } from "../ui.js";

const filters = { kind: "word", tier: "", day: "", stage: "", query: "" };

export function render(root, params, go) {
  if (params && params.kind) filters.kind = params.kind;
  draw(root, go);
}

function matches(item) {
  const p = store.progressOf(item.id);
  if (filters.tier && item.tier !== filters.tier) return false;
  if (filters.day && String(item.day) !== filters.day) return false;
  if (filters.stage !== "") {
    if (filters.stage === "none" && p) return false;
    if (filters.stage !== "none" && (!p || String(p.stage) !== filters.stage)) return false;
  }
  if (filters.query) {
    const q = filters.query.toLowerCase();
    const hay = [item.en, item.ja, ...(item.meanings || []), item.example || ""].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function draw(root, go) {
  const isWord = filters.kind === "word";
  const items = (isWord ? store.state.words : store.state.phrases)
    .slice()
    .sort((a, b) => a.order - b.order);
  const shown = items.filter(matches);
  const days = [...new Set(store.state.words.map((w) => w.day).filter((d) => d > 0))].sort((a, b) => a - b);

  root.innerHTML = `
    <div class="seg" style="margin-bottom:.7rem" role="group" aria-label="種類">
      <button data-kind="word" class="${isWord ? "on" : ""}">単語</button>
      <button data-kind="phrase" class="${!isWord ? "on" : ""}">熟語</button>
    </div>

    <input type="text" id="q" placeholder="英語・日本語で検索" value="${esc(filters.query)}"
           autocapitalize="none" autocomplete="off" style="margin-bottom:.6rem">

    <div class="filters">
      <select id="tier" aria-label="優先度">
        <option value="">優先度</option>
        <option value="A" ${filters.tier === "A" ? "selected" : ""}>A 基本</option>
        <option value="B" ${filters.tier === "B" ? "selected" : ""}>B 頻出</option>
        <option value="C" ${filters.tier === "C" ? "selected" : ""}>C 発展</option>
      </select>
      ${isWord ? `
      <select id="day" aria-label="学習日">
        <option value="">学習日</option>
        ${days.map((d) => `<option value="${d}" ${filters.day === String(d) ? "selected" : ""}>${d}日目</option>`).join("")}
      </select>` : ""}
      <select id="stage" aria-label="ステージ">
        <option value="">ステージ</option>
        <option value="none" ${filters.stage === "none" ? "selected" : ""}>未学習</option>
        ${[0, 1, 2, 3, 4, 5].map((s) => `<option value="${s}" ${filters.stage === String(s) ? "selected" : ""}>S${s}${s === 5 ? "(卒業)" : ""}</option>`).join("")}
      </select>
    </div>

    <div class="btn-row" style="margin-bottom:1rem">
      <button class="btn" id="start">今日の学習</button>
      <button class="btn secondary" id="add">＋ 追加</button>
    </div>

    <div class="section-title">${shown.length} 件 / 全 ${items.length} 件</div>
    <div class="card" id="list">
      ${shown.length === 0 ? `<div class="empty">該当する語がありません。</div>`
        : shown.slice(0, 400).map((item) => rowHtml(item)).join("")}
    </div>
    ${shown.length > 400 ? `<p class="note">多いため先頭400件まで表示しています。検索で絞り込んでください。</p>` : ""}
  `;

  wire(root, go);
}

function rowHtml(item) {
  const p = store.progressOf(item.id);
  const st = stageLabel(p);
  const isUser = item.source === "user";
  return `
    <button class="row" data-item="${esc(item.id)}">
      <span class="stagedot ${st.cls}">${st.text}</span>
      <span class="grow listitem" style="flex-direction:column;align-items:flex-start;gap:.1rem">
        <span class="en">${esc(item.en)}</span>
        <span class="ja">${esc(item.ja)}</span>
      </span>
      ${isUser ? `<span class="pill user">追加</span>` : `<span class="pill ${item.tier}">${tierLabel(item.tier)}</span>`}
    </button>`;
}

function wire(root, go) {
  root.querySelectorAll("[data-kind]").forEach((b) => {
    b.onclick = () => { filters.kind = b.dataset.kind; filters.day = ""; draw(root, go); };
  });

  const q = root.querySelector("#q");
  q.oninput = () => {
    filters.query = q.value;
    const list = root.querySelector("#list");
    const items = (filters.kind === "word" ? store.state.words : store.state.phrases)
      .slice().sort((a, b) => a.order - b.order).filter(matches);
    list.innerHTML = items.length === 0
      ? `<div class="empty">該当する語がありません。</div>`
      : items.slice(0, 400).map(rowHtml).join("");
    root.querySelector(".section-title").textContent =
      `${items.length} 件 / 全 ${(filters.kind === "word" ? store.state.words : store.state.phrases).length} 件`;
    bindRows(root);
  };

  ["tier", "day", "stage"].forEach((key) => {
    const sel = root.querySelector(`#${key}`);
    if (sel) sel.onchange = () => { filters[key] = sel.value; draw(root, go); };
  });

  root.querySelector("#start").onclick = () => go(filters.kind === "word" ? "words" : "phrases");
  root.querySelector("#add").onclick = () => openAddDialog(root, go);
  bindRows(root);
}

function bindRows(root) {
  root.querySelectorAll("[data-item]").forEach((b) => {
    b.onclick = () => showDetail(b.dataset.item, root);
  });
}

function showDetail(id, root) {
  const item = store.itemById(id);
  if (!item) return;
  const p = store.progressOf(id);
  const isPhrase = store.kindOf(id) === "phrase";
  const rows = [];
  if (isPhrase) {
    rows.push(`<label>意味</label><div>${esc(item.ja)}</div>`);
    if (item.example) rows.push(`<label>例文</label><div class="example">${highlightIdiom(item.example, item.en)}</div>`);
    if (item.category) rows.push(`<label>分類</label><div>${esc(item.category)}</div>`);
  } else {
    rows.push(`<label>意味</label><div>${esc(item.ja)}${item.pos ? `(${esc(item.pos)})` : ""}</div>`);
    if (item.meanings?.length) rows.push(`<label>主な意味</label><div>${item.meanings.map(esc).join(" / ")}</div>`);
    if (item.antonyms?.length) rows.push(`<label>反意語</label><div>${item.antonyms.map(esc).join(", ")}</div>`);
    if (item.derived?.length) rows.push(`<label>派生語</label><div>${item.derived.map(esc).join(", ")}</div>`);
    if (item.day) rows.push(`<label>学習日</label><div>${item.day}日目</div>`);
  }
  rows.push(`<label>優先度</label><div>${item.tier} ${tierLabel(item.tier)}</div>`);
  rows.push(`<label>ステージ</label><div>${p ? `S${p.stage}${p.stage >= 5 ? "(卒業)" : ""} ・ 次回 ${p.dueDate || "なし"} ・ ${p.reviewCount}回` : "未学習"}</div>`);

  openModal(`
    <h2>${esc(item.en)}</h2>
    ${rows.join("")}
    <div class="btns">
      ${(tts.isSupported() || (isPhrase && item.example)) ? `<button class="btn secondary" data-speak>🔊 発音</button>` : ""}
      <button class="btn" data-close>閉じる</button>
    </div>
    ${item.source === "user" ? `<button class="btn danger" data-del style="margin-top:.7rem">この追加語を削除</button>` : ""}
  `, (modal, close) => {
    modal.querySelector("[data-close]").onclick = close;
    const sp = modal.querySelector("[data-speak]");
    if (sp) sp.onclick = () => {
      const s = store.state.settings;
      if (isPhrase && item.example) {
        audio.play(item, s.ttsRate);          // 熟語の例文は同梱音声
      } else {
        tts.speak(item.en.replace(/[~〜]/g, ""), { lang: s.ttsLang, rate: s.ttsRate, voiceId: s.ttsVoiceId });
      }
    };
    const del = modal.querySelector("[data-del]");
    if (del) del.onclick = async () => {
      close();
      const yes = await confirmDialog({
        title: "この追加語を削除しますか？",
        message: `${item.en} と、その進捗を消します。`,
        okLabel: "削除", danger: true,
      });
      if (yes) { store.removeUserItem(id); toast("削除しました"); draw(root, () => {}); }
    };
  });
}

function openAddDialog(root, go) {
  openModal(`
    <h2>語を追加</h2>
    <p>教科書や過去問で出会った語を足せます。</p>
    <label for="a-kind">種類</label>
    <select id="a-kind">
      <option value="word">単語</option>
      <option value="phrase">熟語</option>
    </select>
    <label for="a-en">英語</label>
    <input type="text" id="a-en" autocapitalize="none" autocomplete="off" spellcheck="false">
    <label for="a-ja">意味</label>
    <input type="text" id="a-ja">
    <div id="a-extra"></div>
    <label for="a-tier">優先度</label>
    <select id="a-tier">
      <option value="A">A 基本</option>
      <option value="B" selected>B 頻出</option>
      <option value="C">C 発展</option>
    </select>
    <div class="btns">
      <button class="btn secondary" data-cancel>キャンセル</button>
      <button class="btn" data-save>追加</button>
    </div>
  `, (modal, close) => {
    const kindSel = modal.querySelector("#a-kind");
    const extra = modal.querySelector("#a-extra");
    const renderExtra = () => {
      extra.innerHTML = kindSel.value === "word"
        ? `<label for="a-pos">品詞(任意)</label><input type="text" id="a-pos" placeholder="動 / 名 / 形 …">`
        : `<label for="a-ex">例文(任意・読み上げに使います)</label><input type="text" id="a-ex" autocapitalize="none" spellcheck="false">`;
    };
    renderExtra();
    kindSel.onchange = renderExtra;
    modal.querySelector("[data-cancel]").onclick = close;
    modal.querySelector("[data-save]").onclick = () => {
      const en = modal.querySelector("#a-en").value.trim();
      const ja = modal.querySelector("#a-ja").value.trim();
      if (!en || !ja) { toast("英語と意味を入力してください"); return; }
      store.addUserItem({
        kind: kindSel.value,
        en, ja,
        tier: modal.querySelector("#a-tier").value,
        pos: modal.querySelector("#a-pos")?.value || "",
        example: modal.querySelector("#a-ex")?.value || "",
      });
      close();
      toast("追加しました");
      filters.kind = kindSel.value;
      draw(root, go);
    };
  });
}
