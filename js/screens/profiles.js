// 家族プロフィールの選択・追加・削除(SPEC §4.10、画面9)。
"use strict";

import * as store from "../store.js";
import { esc, openModal, confirmDialog, toast } from "../ui.js";

export function avatarHtml(profile, size = "2.2rem") {
  const initial = (profile.name || "?").trim().slice(0, 1);
  return `<span class="avatar" style="background:${esc(profile.color)};width:${size};height:${size}"
    aria-hidden="true">${esc(initial)}</span>`;
}

export function render(root, _params, go, rerender) {
  const profiles = store.state.profiles;
  const currentId = store.state.currentProfileId;

  root.innerHTML = `
    <p class="note" style="margin-bottom:.8rem">
      家族それぞれの学習データを分けて持てます(最大${store.MAX_PROFILES}人)。
      進捗・設定・追加した語はプロフィールごとに別々です。単語と熟語のデータは共通です。
    </p>

    <div class="card">
      ${profiles.map((p) => `
        <button class="row" data-switch="${esc(p.id)}">
          ${avatarHtml(p)}
          <span class="grow">
            <span class="name">${esc(p.name)}</span>
            <span class="desc">${p.id === currentId ? "使用中" : "タップで切り替え"}</span>
          </span>
          ${p.id === currentId ? `<span class="pill A">現在</span>` : `<span class="chevron">›</span>`}
        </button>`).join("")}
    </div>

    <div class="btn-row" style="margin-bottom:1rem">
      <button class="btn" id="add" ${profiles.length >= store.MAX_PROFILES ? "disabled" : ""}>＋ 追加</button>
      <button class="btn secondary" id="edit">編集</button>
    </div>
    ${profiles.length >= store.MAX_PROFILES ? `<p class="note">プロフィールは${store.MAX_PROFILES}人までです。</p>` : ""}
    <p class="note">データはこの端末の中だけに保存されます。ほかのプロフィールの学習内容は見えません。</p>
  `;

  root.querySelectorAll("[data-switch]").forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.switch;
      if (id === currentId) { openEdit(id, rerender); return; }
      store.switchProfile(id);
      toast(`${store.currentProfile().name} に切り替えました`);
      go("home");
    };
  });

  root.querySelector("#add").onclick = () => openAdd(rerender);
  root.querySelector("#edit").onclick = () => openEdit(currentId, rerender);
}

function colorPicker(selected) {
  return `<div class="colorrow">
    ${store.PROFILE_COLORS.map((c) => `
      <button type="button" class="colordot ${c === selected ? "on" : ""}" data-color="${c}"
        style="background:${c}" aria-label="色"></button>`).join("")}
  </div>`;
}

function wireColors(modal) {
  let picked = modal.querySelector(".colordot.on")?.dataset.color || store.PROFILE_COLORS[0];
  modal.querySelectorAll("[data-color]").forEach((b) => {
    b.onclick = () => {
      picked = b.dataset.color;
      modal.querySelectorAll("[data-color]").forEach((x) => x.classList.toggle("on", x === b));
    };
  });
  return () => picked;
}

function openAdd(rerender) {
  openModal(`
    <h2>プロフィールを追加</h2>
    <label for="p-name">名前</label>
    <input type="text" id="p-name" maxlength="12" placeholder="例: はると">
    <label>色</label>
    ${colorPicker(null)}
    <div class="btns">
      <button class="btn secondary" data-cancel>キャンセル</button>
      <button class="btn" data-save>追加</button>
    </div>
  `, (modal, close) => {
    const getColor = wireColors(modal);
    modal.querySelector("[data-cancel]").onclick = close;
    modal.querySelector("[data-save]").onclick = () => {
      const name = modal.querySelector("#p-name").value.trim();
      if (!name) { toast("名前を入力してください"); return; }
      const p = store.addProfile(name, getColor());
      close();
      if (!p) { toast(`プロフィールは${store.MAX_PROFILES}人までです`); return; }
      toast("追加しました");
      rerender();
    };
    modal.querySelector("#p-name").focus();
  });
}

function openEdit(id, rerender) {
  const p = store.state.profiles.find((x) => x.id === id);
  if (!p) return;
  const canDelete = store.state.profiles.length > 1;

  openModal(`
    <h2>プロフィールを編集</h2>
    <label for="p-name">名前</label>
    <input type="text" id="p-name" maxlength="12" value="${esc(p.name)}">
    <label>色</label>
    ${colorPicker(p.color)}
    <div class="btns">
      <button class="btn secondary" data-cancel>キャンセル</button>
      <button class="btn" data-save>保存</button>
    </div>
    ${canDelete
      ? `<button class="btn danger" data-del style="margin-top:.7rem">このプロフィールを削除</button>`
      : `<p class="note" style="text-align:center;margin-top:.7rem">最後の1人は削除できません。</p>`}
  `, (modal, close) => {
    const getColor = wireColors(modal);
    modal.querySelector("[data-cancel]").onclick = close;
    modal.querySelector("[data-save]").onclick = () => {
      const name = modal.querySelector("#p-name").value.trim();
      if (!name) { toast("名前を入力してください"); return; }
      store.renameProfile(id, name, getColor());
      close();
      toast("保存しました");
      rerender();
    };
    const del = modal.querySelector("[data-del]");
    if (del) del.onclick = async () => {
      close();
      const yes = await confirmDialog({
        title: `${p.name} を削除しますか？`,
        message: "このプロフィールの進捗・音読のチェック・設定・追加した語がすべて消えます。元に戻せません。",
        okLabel: "削除", danger: true,
      });
      if (!yes) return;
      store.removeProfile(id);
      toast("削除しました");
      rerender();
    };
  });
}

// ホーム上部の切り替えバー。タップで一覧を出し、すぐ切り替えられる。
export function barHtml() {
  const p = store.currentProfile();
  if (!p) return "";
  return `
    <button class="profilebar" id="profilebar" aria-label="プロフィールを切り替え">
      ${avatarHtml(p, "2rem")}
      <span class="grow">${esc(p.name)}</span>
      <span class="chevron">⌄</span>
    </button>`;
}

export function wireBar(root, go, rerender) {
  const bar = root.querySelector("#profilebar");
  if (!bar) return;
  bar.onclick = () => {
    const currentId = store.state.currentProfileId;
    openModal(`
      <h2>プロフィール</h2>
      <div class="card" style="margin:0 0 .8rem">
        ${store.state.profiles.map((p) => `
          <button class="row" data-pick="${esc(p.id)}">
            ${avatarHtml(p)}
            <span class="grow"><span class="name">${esc(p.name)}</span></span>
            ${p.id === currentId ? `<span class="pill A">現在</span>` : ""}
          </button>`).join("")}
      </div>
      <button class="btn secondary" data-manage>プロフィールを管理</button>
    `, (modal, close) => {
      modal.querySelectorAll("[data-pick]").forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.pick;
          close();
          if (id === currentId) return;
          store.switchProfile(id);
          toast(`${store.currentProfile().name} に切り替えました`);
          rerender();
        };
      });
      modal.querySelector("[data-manage]").onclick = () => { close(); go("profiles"); };
    });
  };
}
