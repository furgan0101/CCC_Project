// Small UI helpers: captions and toast prompts.
import { t } from "./i18n.js";

const captionEl = () => document.getElementById("captionText");

export function setCaption(text, isUser = false) {
  const el = captionEl();
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("user", isUser);
  el.classList.remove("listening");
}

export function setListening(on) {
  const el = captionEl();
  if (!el) return;
  if (on) {
    el.textContent = t("listening");
    el.classList.add("listening");
    el.classList.remove("user");
  }
}

/**
 * Show a toast prompt.
 * opts: { icon, title, body, alert, actions: [{label, primary, onClick}], timeout }
 * Returns a function that dismisses it.
 */
export function showToast(opts) {
  const wrap = document.getElementById("toastWrap");
  const el = document.createElement("div");
  el.className = "toast" + (opts.alert ? " alert" : "");

  const actions = (opts.actions || [])
    .map((a, i) => `<button class="btn ${a.primary ? "btn-primary" : "btn-ghost"}" data-i="${i}">${a.label}</button>`)
    .join("");

  el.innerHTML = `
    <div class="t-head"><span class="t-ic">${opts.icon || "✦"}</span><span class="t-title">${opts.title}</span></div>
    <div class="t-body">${opts.body || ""}</div>
    ${actions ? `<div class="t-actions">${actions}</div>` : ""}
  `;

  const dismiss = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 400);
  };

  el.querySelectorAll(".t-actions .btn").forEach((b) => {
    b.addEventListener("click", () => {
      const a = opts.actions[+b.dataset.i];
      dismiss();
      a.onClick && a.onClick();
    });
  });

  wrap.appendChild(el);
  if (opts.timeout) setTimeout(dismiss, opts.timeout);
  return dismiss;
}

// Speech synthesis (the assistant's voice).
let voicesReady = false;
if ("speechSynthesis" in window) {
  speechSynthesis.onvoiceschanged = () => { voicesReady = true; };
}

export function speak(text, lang = "en-US") {
  if (!("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.96;   // slightly slower — clearer for seniors
    u.pitch = 1.0;
    const voices = speechSynthesis.getVoices();
    const match = voices.find((v) => v.lang === lang) || voices.find((v) => v.lang.startsWith(lang.split("-")[0]));
    if (match) u.voice = match;
    speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}
