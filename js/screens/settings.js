// 設定(SPEC §4.8)とバックアップ(§4.9)。
"use strict";

import * as store from "../store.js";
import * as tts from "../tts.js";
import { esc, toast, confirmDialog } from "../ui.js";
import { requestNotifyPermission, notifyState } from "../notify.js";
import * as audiopanel from "./audiopanel.js";

export function render(root, _params, go, rerender) {
  const s = store.state.settings;
  const voices = tts.voicesForPicker(s.ttsLang);
  const langs = [...new Set(voices.map((v) => v.lang.replace("_", "-")))];
  const hasGB = langs.some((l) => /^en-GB/i.test(l));
  const nState = notifyState();

  root.innerHTML = `
    <div class="section-title">学習量</div>
    <div class="card">
      <div class="row">
        <span class="grow"><span class="name">1日の新規単語数</span><span class="desc">10〜50語</span></span>
        <input class="numinput" type="number" id="newPerDay" min="10" max="50" step="5" value="${s.newPerDay}">
      </div>
      <div class="row">
        <span class="grow"><span class="name">1日の新規熟語数</span><span class="desc">5〜20個</span></span>
        <input class="numinput" type="number" id="newPhrasesPerDay" min="5" max="20" step="5" value="${s.newPhrasesPerDay}">
      </div>
    </div>
    <p class="note">復習は1日60語までで、超えた分は翌日に回ります。</p>

    <div class="section-title">入試日</div>
    <div class="card">
      <div class="row">
        <span class="grow"><span class="name">入試の日</span><span class="desc">ホームの残り日数に使います</span></span>
      </div>
      <div class="row"><input type="date" id="examDate" value="${esc(s.examDate || "")}"></div>
    </div>

    <div class="section-title">音声(読み上げ)</div>
    <div class="card">
      ${!tts.isSupported() ? `<div class="row"><span class="grow"><span class="desc">この端末のブラウザは読み上げに対応していません。</span></span></div>` : `
      <div class="row">
        <span class="grow"><span class="name">言語</span></span>
        <div class="seg" style="width:11rem">
          <button data-lang="en-US" class="${s.ttsLang === "en-US" ? "on" : ""}">en-US</button>
          <button data-lang="en-GB" class="${s.ttsLang === "en-GB" ? "on" : ""}" ${hasGB ? "" : "disabled title='この端末に en-GB の音声がありません'"}>en-GB</button>
        </div>
      </div>
      <div class="row">
        <span class="grow"><span class="name">速度</span></span>
        <div class="seg" style="width:9rem">
          ${tts.RATES.map((r) => `<button data-rate="${r}" class="${s.ttsRate === r ? "on" : ""}">${r.toFixed(1)}</button>`).join("")}
        </div>
      </div>
      <div class="row">
        <span class="grow"><span class="name">音声の種類</span>
          <span class="desc">${voices.length ? `${voices.length} 種類が利用できます` : "英語の音声が見つかりません"}</span></span>
      </div>
      <div class="row">
        <select id="voice">
          <option value="">端末におまかせ</option>
          ${voices.map((v) => `<option value="${esc(v.voiceURI)}" ${s.ttsVoiceId === v.voiceURI ? "selected" : ""}>${esc(v.name)}(${esc(v.lang)})</option>`).join("")}
        </select>
      </div>
      <div class="row"><button class="btn secondary" id="test">🔊 テスト再生</button></div>
      `}
    </div>
    ${tts.isSupported() && !voices.length ? `<div class="warn">英語の音声データが端末に見つかりません。<br>
      Android: 設定 → システム → 言語と入力 → 音声出力(音声データのインストール)<br>
      iPhone: 設定 → アクセシビリティ → 読み上げコンテンツ → 声 → English</div>` : ""}

    <div class="section-title">音声データ</div>
    <div class="card" id="audio-rows"></div>
    <p class="note">例文の音声です。まとめてダウンロードしておくと、オフラインでも音読できます。
      ダウンロードしなくても、音読セットを開いた分だけ取得されます。</p>

    <div class="section-title">リマインド通知</div>
    <div class="card">
      <div class="row">
        <span class="grow"><span class="name">通知の時刻</span><span class="desc">${esc(nState.label)}</span></span>
        <input class="numinput" type="time" id="notifyTime" value="${esc(s.notifyTime)}" style="width:7rem">
      </div>
      ${nState.canAsk ? `<div class="row"><button class="btn secondary" id="askNotify">通知を許可する</button></div>` : ""}
    </div>
    <p class="note">ブラウザのアプリは、閉じている間に通知を出せません。アプリを開いている間、設定した時刻を過ぎていて今日の学習が残っていれば通知します。</p>

    <div class="section-title">バックアップ(機種変更用)</div>
    <div class="card">
      <button class="row" id="export"><span class="grow"><span class="name">進捗を書き出す</span>
        <span class="desc">今のプロフィールの進捗をJSONで保存します</span></span><span class="chevron">›</span></button>
      <button class="row" id="copy"><span class="grow"><span class="name">進捗をコピーする</span>
        <span class="desc">クリップボードにJSONをコピーします</span></span><span class="chevron">›</span></button>
      <button class="row" id="import"><span class="grow"><span class="name">進捗を読み込む</span>
        <span class="desc">今のプロフィールのデータを置き換えます</span></span><span class="chevron">›</span></button>
    </div>
    <input type="file" id="file" accept="application/json,.json" style="display:none">

    <div class="section-title">データ</div>
    <div class="card">
      <button class="row" id="reset"><span class="grow"><span class="name" style="color:var(--red)">このプロフィールを初期化</span>
        <span class="desc">進捗・音読のチェック・設定・追加語を消します</span></span></button>
    </div>
    <p class="note">バックアップは今のプロフィール(${esc(store.currentProfile().name)})のぶんだけです。データはこの端末のブラウザ内だけに保存され、サーバーには何も送りません。</p>
    <p class="note">単語 ${store.state.words.length} 語 / 熟語 ${store.state.phrases.length} 個(データ版 v${store.state.seedVersion})</p>
  `;

  wire(root, rerender);
}

function wire(root, rerender) {
  const audioRows = root.querySelector("#audio-rows");
  if (audioRows) {
    audiopanel.state().then((st) => {
      if (!root.isConnected) return;
      audioRows.innerHTML = audiopanel.rowsHtml(st);
      audiopanel.wire(audioRows, rerender);
    });
  }

  const num = (id, min, max, key) => {
    const el = root.querySelector(`#${id}`);
    if (!el) return;
    el.onchange = () => {
      let v = Math.round(Number(el.value));
      if (!Number.isFinite(v)) v = store.state.settings[key];
      v = Math.min(max, Math.max(min, v));
      el.value = v;
      store.updateSettings({ [key]: v });
      toast("保存しました");
    };
  };
  num("newPerDay", 10, 50, "newPerDay");
  num("newPhrasesPerDay", 5, 20, "newPhrasesPerDay");

  const exam = root.querySelector("#examDate");
  exam.onchange = () => { store.updateSettings({ examDate: exam.value || null }); toast("保存しました"); };

  root.querySelectorAll("[data-lang]").forEach((b) => {
    if (b.disabled) return;
    b.onclick = () => { store.updateSettings({ ttsLang: b.dataset.lang, ttsVoiceId: null }); rerender(); };
  });
  root.querySelectorAll("[data-rate]").forEach((b) => {
    b.onclick = () => { store.updateSettings({ ttsRate: Number(b.dataset.rate) }); rerender(); };
  });
  const voice = root.querySelector("#voice");
  if (voice) voice.onchange = () => { store.updateSettings({ ttsVoiceId: voice.value || null }); toast("保存しました"); };

  const test = root.querySelector("#test");
  if (test) test.onclick = async () => {
    const s = store.state.settings;
    const r = await tts.speak("This is a test of the reading voice.", { lang: s.ttsLang, rate: s.ttsRate, voiceId: s.ttsVoiceId });
    if (r.error && r.error !== "timeout") toast("再生できませんでした。端末の音声データを確認してください。");
  };

  const time = root.querySelector("#notifyTime");
  time.onchange = () => { store.updateSettings({ notifyTime: time.value || "20:00" }); toast("保存しました"); };

  const ask = root.querySelector("#askNotify");
  if (ask) ask.onclick = async () => { await requestNotifyPermission(); rerender(); };

  root.querySelector("#export").onclick = () => {
    const json = store.exportData();
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eitango-${store.currentProfile().name}-${store.today()}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast("書き出しました");
  };

  root.querySelector("#copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(store.exportData());
      toast("クリップボードにコピーしました");
    } catch (e) {
      toast("コピーできませんでした");
    }
  };

  const file = root.querySelector("#file");
  root.querySelector("#import").onclick = () => file.click();
  file.onchange = async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const yes = await confirmDialog({
      title: "今のデータを置き換えますか？",
      message: "読み込むと、この端末の進捗・設定は上書きされます。",
      okLabel: "読み込む", danger: true,
    });
    file.value = "";
    if (!yes) return;
    try {
      store.importData(await f.text());
      toast("読み込みました。画面を更新します");
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      toast(e.message || "読み込めませんでした");
    }
  };

  root.querySelector("#reset").onclick = async () => {
    const yes = await confirmDialog({
      title: `${store.currentProfile().name} のデータを初期化しますか？`,
      message: "このプロフィールの進捗・音読のチェック・設定・追加語が消えます。ほかのプロフィールには影響しません。元に戻せません。",
      okLabel: "初期化する", danger: true,
    });
    if (!yes) return;
    store.resetAll();
    toast("初期化しました。画面を更新します");
    setTimeout(() => location.reload(), 800);
  };
}
