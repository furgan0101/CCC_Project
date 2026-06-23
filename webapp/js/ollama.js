// Ollama integration with a graceful rule-based fallback.
import { CONFIG } from "./config.js";
import { t } from "./i18n.js";

let available = false;

export async function checkOllama() {
  try {
    const r = await fetch(`${CONFIG.ollamaBase}/api/tags`, { method: "GET" });
    if (!r.ok) return false;
    const data = await r.json();
    available = Array.isArray(data.models) && data.models.length > 0;
    // prefer configured model if present, else first available
    if (available && !data.models.some((m) => m.name === CONFIG.model)) {
      CONFIG.model = data.models[0].name;
    }
    return available;
  } catch {
    available = false;
    return false;
  }
}

export function isAvailable() { return available; }

// Fire a tiny request so Ollama loads the model into memory ahead of time,
// making the first real plan / voice command much faster.
export async function prewarm() {
  if (!available) return;
  try {
    await fetch(`${CONFIG.ollamaBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CONFIG.model, stream: false, keep_alive: "30m",
        options: { num_predict: 1 },
        messages: [{ role: "user", content: "hi" }],
      }),
    });
  } catch { /* ignore */ }
}

// Instant, synchronous rule-based plan — used to show the dashboard with zero
// wait. The AI plan (generatePlan) can then swap in once it's ready.
export function quickPlan(profile) { return rulePlan(profile); }

async function chatJSON(system, user, { timeout = 60000 } = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(`${CONFIG.ollamaBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: CONFIG.model,
        format: "json",
        stream: false,
        options: { temperature: 0.6 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    const data = await r.json();
    const content = data?.message?.content || "";
    return JSON.parse(stripFences(content));
  } finally {
    clearTimeout(id);
  }
}

function stripFences(s) {
  const m = s.match(/\{[\s\S]*\}/);
  return m ? m[0] : s;
}

// ============ COMFORT PLAN ============
export async function generatePlan(profile) {
  const { age, pains, lang } = profile;
  if (available) {
    try {
      const sys =
        `You are RECARO's onboard cabin wellbeing assistant for business-class seniors. ` +
        `Design a personalised seat & gentle-movement plan for a ${CONFIG.flightHours || 8}-hour flight. ` +
        `Reply in the language with BCP-47 code "${lang}". ` +
        `Return ONLY JSON with this exact shape:\n` +
        `{"greeting": string (1 warm sentence), "summary": string (1 sentence about the plan), ` +
        `"schedule": [ {"hour": number 0-8, "title": short string, "why": one short sentence, ` +
        `"type": "preset"|"set"|"massage"|"note", ` +
        `"preset": "upright"|"relax"|"bed" (only if type=preset), ` +
        `"control": "recline"|"headrest"|"legrest"|"lumbar" (only if type=set), "value": number 0-1 (only if type=set), ` +
        `"zone": "back"|"lumbar"|"legs"|"all" (only if type=massage) } ] }\n` +
        `Make 5-7 schedule items spread across the flight. Be specific to the discomfort areas.`;
      const usr = `Passenger age: ${age}. Discomfort areas: ${pains.length ? pains.join(", ") : "none reported"}.`;
      const plan = await chatJSON(sys, usr, { timeout: 70000 });
      if (plan && Array.isArray(plan.schedule) && plan.schedule.length) {
        plan.source = "ollama";
        return normalizePlan(plan);
      }
    } catch (e) {
      console.warn("Ollama plan failed, using fallback:", e);
    }
  }
  return rulePlan(profile);
}

function normalizePlan(plan) {
  plan.schedule = plan.schedule
    .map((s) => ({
      hour: Math.max(0, Math.min(8, Number(s.hour) || 0)),
      title: String(s.title || "Comfort adjustment"),
      why: String(s.why || ""),
      type: s.type || "note",
      preset: s.preset, control: s.control, value: s.value, zone: s.zone,
    }))
    .sort((a, b) => a.hour - b.hour);
  return plan;
}

// ============ COMMAND PARSING ============
export async function parseCommand(text, lang) {
  if (available) {
    try {
      const sys =
        `You translate a spoken seat command (any language) into one JSON action. ` +
        `Valid intents: recline, upright, bed, relax, headrest_up, headrest_down, ` +
        `legrest_up, legrest_down, legrest_back, lumbar_more, lumbar_less, massage_start, massage_stop, ` +
        `light_on, light_off, attendant, dnd_on, dnd_off, climate_warm, climate_cool, climate_off, help, unknown. ` +
        `For massage include "zone": "back"|"lumbar"|"legs"|"all". ` +
        `"reply" is a short friendly confirmation SENTENCE written in the passenger's language ` +
        `(the language with code "${lang}") — never output the code itself. ` +
        `Return ONLY JSON: {"intent": string, "zone": string optional, "reply": string}.`;
      const out = await chatJSON(sys, `Command: "${text}"`, { timeout: 20000 });
      if (out && out.intent) {
        // Small models occasionally echo the language code or emit junk replies.
        if (!out.reply || out.reply.trim().length < 4 || /^[a-z]{2}([-_][A-Za-z]{2,4})?$/.test(out.reply.trim())) {
          out.reply = "";
        }
        return out;
      }
    } catch (e) {
      console.warn("Ollama command parse failed, using keywords:", e);
    }
  }
  return keywordCommand(text);
}

// ============ FALLBACKS ============
// Rule-based plan, fully localised through i18n keys so a language change
// can rebuild it instantly in the new language.
function rulePlan({ age, pains }) {
  const senior = age >= 65;
  const has = (p) => pains.includes(p);
  const item = (hour, key, extra) => ({ hour, title: t(`${key}_t`), why: t(`${key}_w`), ...extra });
  const sched = [];
  sched.push(item(0, "rp_start", { type: "preset", preset: "upright" }));

  if (has("lower_back")) {
    sched.push(item(0.5, "rp_lumbar", { type: "set", control: "lumbar", value: 0.7 }));
    sched.push(item(3, "rp_backmass", { type: "massage", zone: "lumbar" }));
  }
  if (has("neck_shoulders")) {
    sched.push(item(1, "rp_neck", { type: "set", control: "headrest", value: 0.8 }));
    sched.push(item(4.5, "rp_shouldermass", { type: "massage", zone: "back" }));
  }
  if (has("hips")) {
    sched.push(item(2, "rp_hips", { type: "preset", preset: "relax" }));
  }
  if (has("knees_legs")) {
    sched.push(item(1.5, "rp_legs", { type: "set", control: "legrest", value: 0.8 }));
    sched.push(item(5, "rp_legmass", { type: "massage", zone: "legs" }));
  }
  if (has("stiffness") || senior) {
    sched.push(item(2.5, "rp_stretch", { type: "preset", preset: "relax" }));
  }

  sched.push(item(5.5, "rp_bed", { type: "preset", preset: "bed" }));
  if (senior) sched.push(item(4, "rp_hydrate", { type: "note" }));
  sched.push(item(7, "rp_upright", { type: "preset", preset: "upright" }));

  const painText = pains.map((p) => t("pain_" + p).toLowerCase()).join(" " + t("and") + " ");
  return normalizePlan({
    source: "rules",
    greeting: pains.length ? t("rp_greeting", { pains: painText }) : t("rp_greeting_nopain"),
    summary: t("rp_summary"),
    schedule: sched,
  });
}

// Keyword fallback: returns the intent only — the caller supplies a localised
// reply, so this works in any UI language even without Ollama.
function keywordCommand(text) {
  const s = (text || "").toLowerCase();
  const any = (...w) => w.some((x) => s.includes(x));
  const zone = any("leg", "calf", "bein", "jambe", "pierna", "gamb", "腿", "脚", "पैर", "ساق") ? "legs"
    : any("lumbar", "lower back", "lende", "lombar", "腰", "कमर", "قطني") ? "lumbar"
    : any("back", "rück", "spalla", "dos", "espalda", "schiena", "背", "पीठ", "ظهر") ? "back" : "all";
  const off = any("off", "out", "stop", "aus", "apaga", "éteins", "spegni", "关", "बंद", "أطفئ", "消");

  if (any("flat", "bed", "lie", "sleep", "bett", "schlaf", "cama", "lit", "letto", "床", "बिस्तर", "سرير", "ベッド")) return { intent: "bed" };
  if (any("upright", "sit up", "up straight", "aufrecht", "sentar", "eretto", "droit", "直立", "सीधा", "مستقيم")) return { intent: "upright" };
  if (any("relax", "lounge", "entspann", "détente", "放松", "آرام", "リラックス")) return { intent: "relax" };
  if (any("warm", "heat", "heiz", "chaud", "calor", "cald", "加热", "गर्म", "دفّئ", "温め")) return { intent: off ? "climate_off" : "climate_warm" };
  if (any("cool", "cold", "kühl", "kalt", "froid", "frío", "fredd", "制冷", "ठंड", "برّد", "冷や")) return { intent: off ? "climate_off" : "climate_cool" };
  if (any("recline", "lean back", "zurücklehn", "incline", "倾斜", "झुक")) return { intent: "recline" };
  if (any("head", "kopf", "tête", "cabeza", "testa", "头枕", "सिर", "رأس", "ヘッド")) return { intent: any("down", "lower", "runter", "baja", "下") ? "headrest_down" : "headrest_up" };
  if (any("leg rest", "legrest", "footrest", "feet", "foot", "beinauflage", "repose", "腿托", "レッグ", "पैर", "ساق")) {
    if (any("back", "backward", "behind", "zurück", "arrière", "atrás", "indietro", "后", "後", "पीछे", "خلف")) return { intent: "legrest_back" };
    return { intent: any("down", "lower", "runter", "下", "baja", "नीचे") ? "legrest_down" : "legrest_up" };
  }
  if (any("lumbar support", "lordose", "lombaire", "腰托")) return { intent: any("less", "weniger", "menos", "弱") ? "lumbar_less" : "lumbar_more" };
  if (any("light", "lamp", "licht", "luz", "lumière", "lampe", "灯", "बत्ती", "ضوء", "読書灯")) return { intent: off ? "light_off" : "light_on" };
  if (any("attendant", "steward", "crew", "hostess", "azafata", "équipage", "乘务", "परिचारक", "مضيف", "乗務")) return { intent: "attendant" };
  if (any("not disturb", "n't disturb", "no disturb", "nicht stören", "no molestar", "ne pas déranger", "勿打扰", "परेशान", "إزعاج", "おやすみ")) {
    return { intent: off ? "dnd_off" : "dnd_on" };
  }
  if (any("stop", "halt", "stopp", "para", "ferma", "停", "रोको", "أوقف", "止め")) return { intent: "massage_stop" };
  if (any("massage", "knead", "按摩", "मसाज", "تدليك", "マッサージ")) return { intent: "massage_start", zone };
  if (any("help", "what can", "hilfe", "aide", "ayuda", "帮助", "मदद", "مساعدة")) return { intent: "help" };
  return { intent: "unknown" };
}
