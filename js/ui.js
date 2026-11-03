// 画面づくりの小さな道具。
"use strict";

export function esc(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function pct(ratio) {
  return `${Math.round((ratio || 0) * 100)}%`;
}

// 例文の中の熟語部分を太字にする(SPEC §4.4)。"~" や "A" は語をまたぐので語幹だけを探す。
export function highlightIdiom(example, idiom) {
  const safe = esc(example);
  const core = String(idiom || "")
    .replace(/[~〜]/g, " ")
    .replace(/\bA\b|\bB\b|\.\.\./g, " ")
    .replace(/[?!.]/g, " ")
    .trim();
  if (!core) return safe;
  const words = core.split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return safe;
  const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+\\w*\\s*");
  try {
    return safe.replace(new RegExp(pattern, "i"), (m) => `<b>${m}</b>`);
  } catch (e) {
    return safe;
  }
}

let toastTimer = null;
export function toast(message, ms = 2000) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  clearTimeout(toastTimer);
  const div = document.createElement("div");
  div.className = "toast";
  div.setAttribute("role", "status");
  div.textContent = message;
  document.body.appendChild(div);
  toastTimer = setTimeout(() => div.remove(), ms);
}

// 確認ダイアログ。Promise<boolean> を返す。
export function confirmDialog({ title, message, okLabel = "OK", cancelLabel = "キャンセル", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>${esc(title)}</h2>
        ${message ? `<p>${esc(message)}</p>` : ""}
        <div class="btns">
          <button class="btn secondary" data-no>${esc(cancelLabel)}</button>
          <button class="btn ${danger ? "danger" : ""}" data-yes>${esc(okLabel)}</button>
        </div>
      </div>`;
    const close = (value) => { overlay.remove(); resolve(value); };
    overlay.querySelector("[data-no]").onclick = () => close(false);
    overlay.querySelector("[data-yes]").onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    document.body.appendChild(overlay);
  });
}

// 任意の内容のモーダル。html を渡し、開いた要素を受け取って自分で配線する。
export function openModal(html, wire) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => overlay.remove();
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.body.appendChild(overlay);
  if (wire) wire(overlay.querySelector(".modal"), close);
  return close;
}

export function stageLabel(progress) {
  if (!progress) return { text: "未", cls: "" };
  if (progress.stage >= 5) return { text: "済", cls: "s5" };
  return { text: `S${progress.stage}`, cls: "active" };
}

export function tierLabel(tier) {
  return { A: "基本", B: "頻出", C: "発展" }[tier] || tier;
}
