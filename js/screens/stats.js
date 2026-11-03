// 進捗・統計と弱点リスト(SPEC §4.7)。
"use strict";

import { addDays } from "../srs.js";
import * as store from "../store.js";
import { esc, pct, tierLabel } from "../ui.js";

const DAYS = 14;

export function render(root, _params, go) {
  const s = store.stats();
  const today = store.today();

  const series = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const h = store.state.history[d] || { words: 0, phrases: 0 };
    series.push({ date: d, words: h.words || 0, phrases: h.phrases || 0 });
  }
  const max = Math.max(1, ...series.map((x) => x.words + x.phrases));
  const weak = store.weakList();

  root.innerHTML = `
    <div class="statgrid">
      <div class="box"><div class="v">${s.streak}<span style="font-size:.9rem">日</span></div><div class="k">連続学習</div></div>
      <div class="box"><div class="v">${pct(s.wordRetention)}</div><div class="k">単語の定着</div></div>
      <div class="box"><div class="v">${pct(s.phraseRetention)}</div><div class="k">熟語の定着</div></div>
    </div>

    <div class="section-title">この2週間の学習語数</div>
    <div class="card card-pad">
      <div class="chart" role="img" aria-label="日別の学習語数">
        ${series.map((x) => {
          const t = x.words + x.phrases;
          const hw = (x.words / max) * 100;
          const hp = (x.phrases / max) * 100;
          return `<div class="col" title="${x.date} ${t}語">
            <div class="stack">
              ${x.phrases ? `<div class="p" style="height:${hp}%"></div>` : ""}
              ${x.words ? `<div class="w" style="height:${hw}%"></div>` : ""}
            </div>
            <div class="lbl">${Number(x.date.slice(8, 10))}</div>
          </div>`;
        }).join("")}
      </div>
      <div class="legend">
        <span><i style="background:var(--accent)"></i>単語</span>
        <span><i style="background:var(--teal)"></i>熟語</span>
      </div>
    </div>

    <div class="section-title">優先度別の定着率</div>
    <div class="card card-pad">
      ${["A", "B", "C"].map((tier) => {
        const b = s.byTier[tier];
        return `
          <div style="display:flex;justify-content:space-between;font-size:.9rem;margin:.5rem 0 .3rem">
            <span><span class="pill ${tier}">${tierLabel(tier)}</span> ${b.done} / ${b.total}</span>
            <span>${pct(b.rate)}</span>
          </div>
          <div class="bar"><span style="width:${pct(b.rate)}"></span></div>`;
      }).join("")}
    </div>

    <div class="section-title">弱点リスト(直近が △ の語 ${weak.length} 件)</div>
    <div class="card">
      ${weak.length === 0
        ? `<div class="empty">△ をつけた語はありません。</div>`
        : weak.slice(0, 100).map(({ item, progress }) => `
          <div class="row">
            <span class="stagedot active">S${progress.stage}</span>
            <span class="grow"><span class="name">${esc(item.en)}</span>
            <span class="desc">${esc(item.ja)} ・ 次回 ${esc(progress.dueDate || "なし")}</span></span>
          </div>`).join("")}
    </div>

    <div class="section-title">語数</div>
    <div class="card">
      <div class="row"><span class="grow"><span class="name">単語</span>
        <span class="desc">シード ${store.state.seedWordCount} 語 + 追加 ${store.state.words.length - store.state.seedWordCount} 語</span></span>
        <span>${store.state.words.length}</span></div>
      <div class="row"><span class="grow"><span class="name">熟語</span>
        <span class="desc">シード ${store.state.seedPhraseCount} 個 + 追加 ${store.state.phrases.length - store.state.seedPhraseCount} 個</span></span>
        <span>${store.state.phrases.length}</span></div>
      <div class="row"><span class="grow"><span class="name">データ版</span>
        <span class="desc">vocab_seed.json</span></span><span>v${store.state.seedVersion}</span></div>
    </div>

    <button class="btn secondary" id="toquiz">小テストを受ける</button>
  `;
  root.querySelector("#toquiz").onclick = () => go("quiz");
}
