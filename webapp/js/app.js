// RECARO R7 — main orchestrator.
import { CONFIG } from "./config.js";
import { createSeat, PRESETS } from "./seat3d.js";
import { createVoice } from "./voice.js";
import { checkOllama, isAvailable, generatePlan, quickPlan, parseCommand, prewarm } from "./ollama.js";
import { setCaption, setListening, showToast, speak } from "./ui.js";
import { t, setUILang, applyI18n } from "./i18n.js";

CONFIG.flightHours = CONFIG.flight.totalHours;

const $ = (id) => document.getElementById(id);
let seat, voice, currentLang = "en-US";
let voiceEnabled = false, speechOn = false, dnd = false, readingLight = false, climateMode = "off";
let demoPaused = false, demoPausedAt = 0;   // "stop demo" — freezes the flight + suppresses pop-ups
const profile = { age: 68, pains: [], lang: currentLang, mode: "normal" };
let plan = null;
let uiMode = "normal";            // experience mode: "easy" | "normal" | "advanced"
let intakeEditing = false;        // intake popup re-opened from settings (vs first run)

// The assistant only speaks out loud when the passenger opts in (🔊 toggle).
function say(text) { if (speechOn) speak(text, currentLang); }

// ============================================================
// 1. INTRO VIDEO
// ============================================================
function initIntro() {
  const video = $("introVideo");
  const fallback = $("introFallback");
  const skip = $("skipBtn");

  let ended = false;
  let videoPlayed = false;
  const finish = () => { if (ended) return; ended = true; try { video.pause(); } catch {} closeIntro(); };

  // Try to load the prepared video; fall back to the animation if absent.
  video.src = CONFIG.introVideo;
  // Only auto-advance when a REAL video actually played to its end — a missing
  // file can fire "ended" immediately in some browsers, which we ignore.
  video.addEventListener("playing", () => { videoPlayed = true; });
  video.addEventListener("ended", () => { if (videoPlayed && video.duration > 0.5) finish(); });
  video.addEventListener("error", () => { video.style.display = "none"; });
  video.addEventListener("loadeddata", () => { fallback.style.display = "none"; video.play().catch(() => {}); });
  video.load();
  try { video.play().catch(() => {}); } catch {}

  skip.addEventListener("click", finish);
}

function closeIntro() {
  const intro = $("intro");
  intro.style.transition = "opacity .6s ease";
  intro.style.opacity = "0";
  setTimeout(() => { intro.remove(); openIntake(); }, 600);
}

// ============================================================
// 2. LANGUAGE
// ============================================================
function populateLangSelect(sel) {
  CONFIG.languages.forEach((l) => {
    const o = document.createElement("option");
    o.value = l.code; o.textContent = l.label; sel.appendChild(o);
  });
  sel.value = currentLang;
}

function setLanguage(code) {
  currentLang = code;
  profile.lang = code;
  if (voice) voice.setLang(code);
  for (const id of ["langSelect", "intakeLangSelect"]) {
    const sel = $(id); if (sel && sel.value !== code) sel.value = code;
  }
  setUILang(code);              // translates every data-i18n element + RTL
  refreshDynamicTexts();

  // Re-localise the plan: the rule plan rebuilds instantly; an AI plan is
  // regenerated in the background and swaps in when ready.
  if (plan) {
    plan = quickPlan(profile);
    renderPlan(plan);
    resyncSchedule();
    requestAIPlan();
  }
}

// Re-render texts that are built in JS rather than via data-i18n.
function refreshDynamicTexts() {
  if (seat) updateReadouts(seat.getState());
  setCompartmentState(compartmentItem, compartmentAlert);
  setCaption(t("caption_default"));
  $("speechToggle").textContent = speechOn ? "🔊" : "🔇";
}

// ============================================================
// 2b. EXPERIENCE MODE (Easy · Normal · Advanced)
// ============================================================
function applyMode(m) {
  uiMode = (m === "easy" || m === "advanced") ? m : "normal";
  profile.mode = uiMode;
  document.body.classList.remove("mode-easy", "mode-normal", "mode-advanced");
  document.body.classList.add("mode-" + uiMode);

  // Easy mode: voice is always on and obvious — there is no on/off toggle.
  if (uiMode === "easy" && voice && voice.supported) voiceEnabled = true;
  $("voiceToggle").classList.toggle("on", voiceEnabled);
  $("voiceToggle").setAttribute("aria-pressed", String(voiceEnabled));
  updateMicVisibility();

  // The Plan tab is gone in Easy — leave it if it's the open screen.
  if (uiMode === "easy") {
    const planBtn = document.querySelector('.tab[data-tab="plan"]');
    if (planBtn && planBtn.classList.contains("on")) switchTab("seat");
  }

  // Repaint controls that just became visible (sliders, intensity).
  if (seat) {
    updateReadouts(seat.getState());
    if ($("intensitySlider")) {
      const g = Math.round(seat.getMassageIntensity() * 100);
      $("intensitySlider").value = g; $("intensityVal").textContent = g + "%";
    }
  }
}

function updateMicVisibility() {
  const show = !!(voice && voice.supported) && (uiMode === "easy" || voiceEnabled);
  $("micBtn").classList.toggle("hidden", !show);
}

function switchTab(name) {
  const stage = $("stage");
  if (stage.classList.contains("rail")) { stage.classList.remove("rail"); $("panelCollapse").textContent = "›"; }
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x.dataset.tab === name));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.toggle("active", c.id === "tab-" + name));
}

// ============================================================
// 3. INTAKE POPUP
// ============================================================
// opts.edit = true when re-opened from the ⚙ settings button (the passenger may
// have developed discomfort mid-flight, or wants to switch mode). First run shows
// the dashboard + starts the flight; an edit just refreshes the plan in place.
function openIntake(opts = {}) {
  intakeEditing = !!opts.edit;
  const scrim = $("intakeScrim");
  const ageVal = $("ageVal");
  let age = profile.age || 68;
  ageVal.textContent = age;
  const ageOptions = [...document.querySelectorAll("#ageOptions .age-option")];
  const setAge = (a) => {
    age = Math.max(1, Math.min(120, a));
    let activeLabel = age;
    ageOptions.forEach((btn) => {
      const min = +btn.dataset.ageMin;
      const max = +btn.dataset.ageMax;
      const active = age >= min && age <= max;
      btn.classList.toggle("on", active);
      if (active) activeLabel = btn.textContent;
    });
    ageVal.textContent = activeLabel;
  };
  ageOptions.forEach((btn) => {
    btn.onclick = () => setAge(+btn.dataset.ageValue);
  });
  setAge(age);

  // Pain chips — pre-selected from the saved profile so an edit keeps prior choices.
  const wrap = $("painChips");
  const selected = new Set(profile.pains);
  wrap.innerHTML = "";
  CONFIG.painAreas.forEach((p) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "chip" + (selected.has(p.id) ? " on" : "");
    el.innerHTML = `<span class="ic">${p.icon}</span><span data-i18n="pain_${p.id}">${t("pain_" + p.id)}</span><span class="check">✓</span>`;
    el.onclick = () => {
      el.classList.toggle("on");
      if (selected.has(p.id)) selected.delete(p.id); else selected.add(p.id);
    };
    wrap.appendChild(el);
  });

  // Mode chooser — highlight current choice, track the pending selection.
  let chosenMode = profile.mode || "normal";
  const modeCards = document.querySelectorAll("#modeSelect .mode-card");
  modeCards.forEach((c) => {
    c.classList.toggle("on", c.dataset.mode === chosenMode);
    c.onclick = () => { chosenMode = c.dataset.mode; modeCards.forEach((x) => x.classList.toggle("on", x === c)); };
  });

  // Swap the copy + primary-button label between first-run and edit.
  $("intakeTitle").dataset.i18n = intakeEditing ? "intake_title_edit" : "intake_title";
  const intakeSub = document.querySelector("#intakeScrim .sub");
  if (intakeSub) intakeSub.dataset.i18n = intakeEditing ? "intake_sub_edit" : "intake_sub";
  $("intakeSubmit").dataset.i18n = intakeEditing ? "intake_save" : "intake_submit";
  applyI18n();

  scrim.classList.add("open");

  $("intakeSubmit").onclick = () => {
    profile.age = age;
    profile.pains = [...selected];
    profile.lang = currentLang;
    applyMode(chosenMode);

    // Rebuild the rule plan instantly; the AI plan refines it in the background.
    plan = quickPlan(profile);
    scrim.classList.remove("open");

    if (!intakeEditing) {
      showDashboard();
      renderPlan(plan);
      startFlight();
      const greet = plan.greeting || t("rp_greeting_nopain");
      setCaption(greet);
      say(greet);
    } else {
      renderPlan(plan);
      resyncSchedule();     // re-anchor the (possibly changed) schedule to the live clock
      const msg = t("profile_updated");
      setCaption(msg); say(msg);
    }
    intakeEditing = false;
    requestAIPlan();
  };
}

// Ask Ollama for the personalised plan in the current language; swap it in
// quietly when it arrives (the instant rule plan covers the meantime).
let aiPlanRequest = 0;
function requestAIPlan() {
  if (!isAvailable()) { $("planSource").textContent = t("plan_std"); return; }
  const req = ++aiPlanRequest;
  $("planSource").textContent = t("plan_refining");
  generatePlan(profile).then((aiPlan) => {
    if (req !== aiPlanRequest) return; // superseded (e.g. language changed)
    if (aiPlan && aiPlan.source === "ollama" && aiPlan.schedule?.length) {
      plan = aiPlan;
      renderPlan(plan);
      resyncSchedule();
      $("planSource").textContent = t("plan_by", { m: CONFIG.model.split(":")[0] });
    } else {
      $("planSource").textContent = t("plan_std");
    }
  });
}

// ============================================================
// 4. DASHBOARD SET-UP
// ============================================================
function showDashboard() { $("dashboard").classList.add("show"); seat.resize(); }

function initDashboard() {
  // Seat
  seat = createSeat($("seatCanvas"));
  seat.onUpdate(updateReadouts);
  updateReadouts(seat.getState());   // paint initial readouts

  // Presets
  const presetIcons = { upright: "🪑", relax: "🛋️", bed: "🛏️" };
  const prow = $("presetRow");
  Object.keys(PRESETS).forEach((name) => {
    const b = document.createElement("button");
    b.className = "preset"; b.dataset.preset = name;
    b.innerHTML = `<span class="ic">${presetIcons[name]}</span><span data-i18n="mode_${name}">${t("mode_" + name)}</span>`;
    b.onclick = () => { seat.applyPreset(name); setCaption(t("reply_" + (name === "bed" ? "bed" : name))); };
    prow.appendChild(b);
  });

  // Steppers (Normal)
  document.querySelectorAll("[data-ctrl]").forEach((btn) => {
    btn.onclick = () => seat.nudge(btn.dataset.ctrl, +btn.dataset.dir * 0.15);
  });

  // Precision sliders (Advanced) — set absolute targets as you drag.
  document.querySelectorAll("[data-slider]").forEach((sl) => {
    sl.addEventListener("input", () => seat.setTarget(sl.dataset.slider, sl.value / 100));
  });
  // Massage intensity (Advanced)
  $("intensitySlider").addEventListener("input", () => {
    const v = +$("intensitySlider").value;
    $("intensityVal").textContent = v + "%";
    seat.setMassageIntensity(v / 100);
  });
  // Save the current seat position as a reusable preset (Advanced)
  renderCustomPresets();
  $("savePresetBtn").onclick = saveCurrentPreset;

  // Massage buttons
  document.querySelectorAll("[data-massage]").forEach((btn) => {
    btn.onclick = () => {
      const z = btn.dataset.massage;
      const on = !seat.isMassageOn(z);
      seat.setMassage(z, on);
      setCaption(t(on ? "msg_massage_on" : "msg_massage_off", { zone: t("zone_" + z) }));
    };
  });

  // Seat climate
  document.querySelectorAll("#climateSeg button").forEach((btn) => {
    btn.onclick = () => setClimate(btn.dataset.climate, true);
  });

  // Back support — 3 fixed levels (None / Medium / Max) drive the lumbar; all modes.
  document.querySelectorAll("#backSeg button").forEach((btn) => {
    btn.onclick = () => seat.setTarget("lumbar", parseFloat(btn.dataset.back));
  });

  // Slide the seat pan + leg-rest forward, leaving the backrest put (Advanced toggle).
  $("slideFwdBtn").onclick = () => {
    const on = !seat.isSlideForward();
    seat.setSlideForward(on);
    $("slideFwdBtn").classList.toggle("on", on);
  };

  // Languages — topbar + intake selects stay in sync.
  populateLangSelect($("langSelect"));
  populateLangSelect($("intakeLangSelect"));
  $("langSelect").onchange = (e) => setLanguage(e.target.value);
  $("intakeLangSelect").onchange = (e) => setLanguage(e.target.value);

  // Re-open the comfort profile (age · discomfort · mode) at any time.
  $("settingsBtn").onclick = () => openIntake({ edit: true });
  // Stop/resume the demo (pauses pop-ups for live presentations) — all modes.
  $("demoToggle").onclick = () => setDemoPaused(!demoPaused);
  // While editing (not first run), allow dismissing the popup without changes.
  $("intakeScrim").addEventListener("click", (e) => {
    if (intakeEditing && e.target === $("intakeScrim")) { $("intakeScrim").classList.remove("open"); intakeEditing = false; }
  });
  document.addEventListener("keydown", (e) => {
    if (intakeEditing && e.key === "Escape") { $("intakeScrim").classList.remove("open"); intakeEditing = false; }
  });

  // Voice — strictly opt-in: nothing listens until the passenger turns it on.
  voice = createVoice({
    onListening: (on) => {
      $("micBtn").classList.toggle("live", on);
      // Fullscreen listening overlay — unmistakable feedback that the AI hears you.
      $("listenOverlay").classList.toggle("open", on);
      if (on) {
        $("listenHint").textContent = t("listen_hint", { ex: t("ex_bed") });
        setListening(true);
      }
    },
    onResult: handleCommand,
    onError: (err) => {
      if (err === "unsupported") setCaption(t("msg_voice_unsupported"));
      else if (err === "not-allowed" || err === "service-not-allowed") setCaption(t("msg_mic_blocked"));
      else if (err === "network") setCaption(t("msg_mic_network"));
      else if (err !== "no-speech" && err !== "aborted") setCaption(t("msg_mic_nothing"));
    },
  });
  voice.setLang(currentLang);
  $("micBtn").onclick = () => voice.toggle();
  $("listenOverlay").onclick = () => voice.stop();

  $("voiceToggle").onclick = () => {
    if (!voice.supported) { setCaption(t("msg_voice_unsupported")); return; }
    voiceEnabled = !voiceEnabled;
    $("voiceToggle").classList.toggle("on", voiceEnabled);
    $("voiceToggle").setAttribute("aria-pressed", String(voiceEnabled));
    updateMicVisibility();
    if (!voiceEnabled) voice.stop();
    setCaption(t(voiceEnabled ? "msg_voice_on" : "msg_voice_off"));
  };

  // Assistant voice replies (TTS) — also opt-in, silent by default.
  $("speechToggle").onclick = () => {
    speechOn = !speechOn;
    $("speechToggle").classList.toggle("on", speechOn);
    $("speechToggle").setAttribute("aria-pressed", String(speechOn));
    $("speechToggle").textContent = speechOn ? "🔊" : "🔇";
    if (!speechOn && window.speechSynthesis) speechSynthesis.cancel();
    setCaption(t(speechOn ? "msg_speech_on" : "msg_speech_off"));
    say(t("msg_speech_on"));
  };

  // Typed requests — the always-available alternative to dictation.
  $("cmdForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = $("cmdInput").value.trim();
    if (!text) return;
    $("cmdInput").value = "";
    handleCommand(text);
  });

  // Cabin & assistance
  $("lightBtn").onclick = () => setReadingLight(!readingLight);
  $("dndBtn").onclick = () => setDnd(!dnd);
  $("attendantBtn").onclick = callAttendant;

  // Screens: Plan ▸ Seat ▸ Help, plus collapse-to-rail for a full-bleed seat.
  const stage = $("stage");
  document.querySelectorAll(".tab").forEach((b) => { b.onclick = () => switchTab(b.dataset.tab); });
  $("panelCollapse").onclick = () => {
    const rail = stage.classList.toggle("rail");
    $("panelCollapse").textContent = rail ? "‹" : "›";
  };

  // Help screen: tapping an example command runs it for real.
  document.querySelectorAll(".say-chip").forEach((b) => {
    b.onclick = () => handleCommand(t(b.dataset.say));
  });

  initSensorDemo();
  setCaption(t("caption_default"));

  // AI status indicator + model pre-warm (so first command/plan is fast)
  checkOllama().then((ok) => {
    $("aiDot").className = "status-dot " + (ok ? "ok" : "off");
    $("aiLabel").textContent = ok ? `AI · ${CONFIG.model.split(":")[0]}` : "AI offline";
    if (ok) prewarm();
  });
}

// ============================================================
// 5. READOUTS / UI SYNC
// ============================================================
function updateReadouts(state) {
  const pct = (v) => Math.round(v * 100) + "%";
  $("reclineVal").textContent = pct(state.recline);
  $("headrestVal").textContent = pct(state.headrest);
  $("legrestVal").textContent = pct(state.legrest);

  // Massage button states
  document.querySelectorAll("[data-massage]").forEach((btn) => {
    btn.classList.toggle("on", state.massage[btn.dataset.massage] > 0);
  });

  // Keep the Advanced sliders in step with the live seat state.
  document.querySelectorAll("[data-slider]").forEach((sl) => {
    sl.value = Math.round((state[sl.dataset.slider] ?? 0) * 100);
  });

  // Back-support segment: highlight the closest of None / Medium / Max to the lumbar value.
  const closestBack = [0, 0.5, 1].reduce((a, b) => Math.abs(b - state.lumbar) < Math.abs(a - state.lumbar) ? b : a);
  document.querySelectorAll("#backSeg button").forEach((b) => {
    b.classList.toggle("on", parseFloat(b.dataset.back) === closestBack);
  });

  // Preset highlight + name (saved custom presets aren't in PRESETS — skip them)
  const near = (a, p) => Math.abs(a.recline - p.recline) < 0.08 && Math.abs(a.legrest - p.legrest) < 0.1;
  let modeName = t("mode_custom");
  document.querySelectorAll(".preset").forEach((b) => {
    const p = PRESETS[b.dataset.preset];
    if (!p) { b.classList.remove("on"); return; }
    const on = near(state, p);
    b.classList.toggle("on", on);
    if (on) modeName = t("mode_" + b.dataset.preset);
  });
  $("seatModeName").textContent = modeName;

  // Readout pills
  $("seatReadout").innerHTML = [
    [t("recline"), pct(state.recline)],
    [t("headrest"), pct(state.headrest)],
    [t("legrest"), pct(state.legrest)],
    [t("lumbar"), pct(state.lumbar)],
  ].map(([k, v]) => `<span class="readout-pill">${k} <b>${v}</b></span>`).join("");
}

// ============================================================
// 6. COMMAND HANDLING (voice or typed — same pipeline)
// ============================================================
async function handleCommand(text) {
  setCaption(text, true);
  const cmd = await parseCommand(text, currentLang);
  executeIntent(cmd.intent, cmd.zone);
  // Some intents announce themselves; don't double-announce those.
  if (intentSpeaksForItself(cmd.intent)) return;
  const reply = cmd.reply || defaultReply(cmd.intent, cmd.zone);
  setTimeout(() => { setCaption(reply); say(reply); }, 250);
}

const intentSpeaksForItself = (i) => i === "attendant" || i === "dnd_on" || i === "dnd_off";

function defaultReply(intent, zone) {
  if (intent === "massage_start") return t("reply_massage_start", { zone: t("zone_" + (zone || "back")) });
  const key = "reply_" + intent;
  const s = t(key);
  return s === key ? t("reply_unknown") : s;
}

function executeIntent(intent, zone) {
  switch (intent) {
    case "upright": seat.applyPreset("upright"); break;
    case "relax":   seat.applyPreset("relax"); break;
    case "bed":     seat.applyPreset("bed"); break;
    case "recline": seat.setTarget("recline", 0.6); break;
    case "headrest_up":   seat.nudge("headrest", 0.25); break;
    case "headrest_down": seat.nudge("headrest", -0.25); break;
    case "legrest_up":    seat.nudge("legrest", 0.3); break;
    case "legrest_down":  seat.nudge("legrest", -0.3); break;
    case "legrest_back":  seat.setTarget("legrest", -0.2); break;
    case "lumbar_more":   seat.nudge("lumbar", 0.25); break;
    case "lumbar_less":   seat.nudge("lumbar", -0.25); break;
    case "massage_start": seat.setMassage(zone || "back", true); break;
    case "massage_stop":  seat.setMassage("all", false); break;
    case "light_on":      setReadingLight(true); break;
    case "light_off":     setReadingLight(false); break;
    case "attendant":     callAttendant(); break;
    case "dnd_on":        setDnd(true); break;
    case "dnd_off":       setDnd(false); break;
    case "climate_warm":  setClimate("warm"); break;
    case "climate_cool":  setClimate("cool"); break;
    case "climate_off":   setClimate("off"); break;
    default: break; // help / unknown — reply only
  }
}

// ============================================================
// 7. CABIN & ASSISTANCE
// ============================================================
function setReadingLight(on) {
  readingLight = on;
  seat.setReadingLight(on);
  $("lightBtn").classList.toggle("on", on);
}

function setClimate(mode, announce = false) {
  climateMode = mode;
  seat.setClimate(mode);
  document.querySelectorAll("#climateSeg button").forEach((b) => {
    b.classList.toggle("on", b.dataset.climate === mode);
  });
  if (announce) { const msg = t("reply_climate_" + mode); setCaption(msg); say(msg); }
}

function setDnd(on) {
  dnd = on;
  $("dndBtn").classList.toggle("on", on);
  const msg = t(on ? "msg_dnd_on" : "msg_dnd_off");
  setCaption(msg); say(msg);
}

function callAttendant() {
  const b = $("attendantBtn");
  b.classList.add("on");
  setTimeout(() => b.classList.remove("on"), 10000);
  const msg = t("msg_attendant");
  setCaption(msg); say(msg);
  showToast({ icon: "🔔", title: t("attendant_title"), body: msg, timeout: 7000,
    actions: [{ label: t("thank_you"), primary: true }] });
}

// ============================================================
// 8. COMFORT PLAN TIMELINE
// ============================================================
function renderPlan(plan) {
  $("planIntro").textContent = plan.summary || plan.greeting || "";
  const tl = $("timeline");
  tl.innerHTML = "";
  plan.schedule.forEach((item, i) => {
    const el = document.createElement("div");
    el.className = "tl-item"; el.dataset.i = i;
    el.innerHTML = `
      <div class="when">${fmtHour(item.hour)} ${t("into_flight")}</div>
      <div class="what">${item.title}</div>
      <div class="why">${item.why || ""}</div>`;
    tl.appendChild(el);
  });
}

function fmtHour(h) {
  const m = Math.round(h * 60);
  return m < 60 ? `${m} ${t("min_suffix")}` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// ============================================================
// 9. FLIGHT SIMULATION
// ============================================================
let flightStart = 0, firedSchedule = new Set(), compartmentFired = false, flightTimer = 0;

function startFlight() {
  flightStart = performance.now();
  firedSchedule.clear();
  compartmentFired = false;
  // setInterval (not rAF): browsers pause rAF entirely in hidden tabs, which
  // would freeze the flight. The hour is wall-clock-derived, so this stays
  // accurate even when throttled.
  clearInterval(flightTimer);
  flightTimer = setInterval(flightTick, 300);

  // Simulate the passenger stowing an item after boarding — the pressure
  // sensor picks it up and the assistant acknowledges it quietly.
  setTimeout(() => {
    if (!compartmentItem && !demoPaused) {
      setCompartmentState(true);
      showToast({
        icon: "🧳", title: t("stowed_title"), body: t("stowed_body"),
        timeout: 7000, actions: [{ label: t("thank_you"), primary: true }],
      });
    }
  }, 6000);
}

// "Stop demo" — pause the simulated flight (clock + scheduled pop-ups) so the seat
// can be shown during a live presentation without interruptions. Resuming doesn't
// count the paused time, so the timeline picks up where it left off.
function setDemoPaused(on) {
  if (on === demoPaused) return;
  demoPaused = on;
  if (on) {
    demoPausedAt = performance.now();
    document.querySelectorAll(".toast").forEach((el) => el.remove());   // clear any open pop-ups
  } else if (demoPausedAt) {
    flightStart += performance.now() - demoPausedAt;
  }
  $("demoToggle").classList.toggle("paused", on);
  $("demoIcon").textContent = on ? "▶" : "⏸";
  $("demoLabel").dataset.i18n = on ? "demo_resume" : "demo_pause";
  $("demoLabel").textContent = t(on ? "demo_resume" : "demo_pause");
  const msg = t(on ? "msg_demo_paused" : "msg_demo_resumed");
  setCaption(msg); say(msg);
}

function currentFlightHour() {
  return Math.min(CONFIG.flight.totalHours, (performance.now() - flightStart) / 1000 / CONFIG.flight.secondsPerFlightHour);
}

// When the AI plan swaps in mid-flight, mark already-passed items as fired so
// they don't trigger retroactively.
function resyncSchedule() {
  const hour = currentFlightHour();
  firedSchedule = new Set();
  plan.schedule.forEach((item, i) => { if (hour >= item.hour) firedSchedule.add(i); });
  markTimeline(hour);
}

function flightTick() {
  if (demoPaused) return;   // demo stopped for a presentation — freeze clock + pop-ups
  const hour = currentFlightHour();
  const frac = hour / CONFIG.flight.totalHours;

  $("flightBar").style.width = (frac * 100) + "%";
  $("flightTime").textContent = `${Math.floor(hour)}h ${String(Math.round((hour % 1) * 60)).padStart(2, "0")}m`;
  $("phaseLabel").textContent =
    hour < 0.4 ? t("phase_takeoff") : hour >= CONFIG.flight.totalHours - 0.1 ? t("phase_arrival")
    : hour > 7.2 ? t("phase_descent") : t("phase_cruise");

  // Fire scheduled items
  if (plan) {
    plan.schedule.forEach((item, i) => {
      if (!firedSchedule.has(i) && hour >= item.hour) {
        firedSchedule.add(i);
        fireScheduleItem(item, i);
      }
    });
    markTimeline(hour);
  }

  // Pre-landing compartment reminder
  if (!compartmentFired && hour >= CONFIG.flight.landingReminderHour) {
    compartmentFired = true;
    compartmentReminder();
  }

  if (hour >= CONFIG.flight.totalHours) clearInterval(flightTimer);
}

function markTimeline(hour) {
  document.querySelectorAll(".tl-item").forEach((el) => {
    const item = plan.schedule[+el.dataset.i];
    el.classList.toggle("done", hour > item.hour + 0.05);
    el.classList.toggle("active", hour >= item.hour && hour <= item.hour + 0.4);
  });
}

function fireScheduleItem(item, i) {
  // Do-not-disturb: skip suggestions quietly (no movement, no voice, no toast).
  // The pre-landing compartment reminder is safety-relevant and bypasses this.
  if (dnd) return;
  askSuggestion(item);
}

function notify(icon, title, body) {
  setCaption(`${title}. ${body || ""}`);
  say(`${title}. ${body || ""}`);
  showToast({ icon, title, body, timeout: 7000,
    actions: [{ label: t("got_it"), primary: true }] });
}

function askMassage(item) {
  const zone = item.zone || "back";
  const q = t("ask_massage", { zone: t("zone_" + zone) });
  setCaption(`${item.title}. ${q}`);
  say(q);
  showToast({
    icon: "💆", title: item.title,
    body: `${item.why || ""} ${q}`,
    actions: [
      { label: t("yes_please"), primary: true, onClick: () => {
          seat.setMassage(zone, true);
          const r = t("msg_starting_massage", { zone: t("zone_" + zone) });
          setCaption(r); say(r);
        } },
      { label: t("not_now") },
    ],
  });
}

// Turn every scheduled AI plan step into a one-tap yes/no suggestion. The seat
// only moves after the passenger confirms.
function askSuggestion(item) {
  let question = "", action = null, icon = "💧";
  if (item.type === "preset") {
    icon = "🛋️"; action = () => seat.applyPreset(item.preset);
    question = t("easy_q_preset", { mode: t("mode_" + item.preset) });
  } else if (item.type === "set") {
    icon = "🎚️"; action = () => seat.setTarget(item.control, item.value);
    question = t("easy_q_set", { part: t(item.control) });
  } else if (item.type === "massage") {
    icon = "💆"; const zone = item.zone || "back";
    action = () => seat.setMassage(zone, true);
    question = t("ask_massage", { zone: t("zone_" + zone) });
  }

  setCaption(`${item.title}. ${question || item.why || ""}`);
  say(question || item.title);

  const body = [item.why, question].filter(Boolean).join(" ");
  const actions = action
    ? [ { label: t("yes_please"), primary: true, onClick: () => { action(); const r = t("easy_done"); setCaption(r); say(r); } },
        { label: t("not_now") } ]
    : [ { label: t("got_it"), primary: true } ];

  showToast({ icon, title: item.title, body, actions, timeout: 15000 });
}

// ============================================================
// 10. COMPARTMENT PRESSURE-SENSOR DEMO
// ============================================================
let compartmentItem = false, compartmentAlert = false;

function setCompartmentState(present, alert = false) {
  compartmentItem = present;
  compartmentAlert = alert && present;
  seat.setCompartment(present, compartmentAlert);
  $("sensorDot").className = "sensor-dot" + (present ? " on" : "");
  $("sensorText").textContent = t(present ? "stow_item" : "stow_empty");
  $("sensorDemo").textContent = t(present ? "stow_remove" : "stow_place");
}

function initSensorDemo() {
  $("sensorDemo").onclick = () => {
    const now = !compartmentItem;
    setCompartmentState(now);
    setCaption(t(now ? "msg_sensor_item" : "msg_sensor_empty"));
  };
}

function compartmentReminder() {
  if (!compartmentItem) return;   // nothing was left behind
  setCompartmentState(true, true);  // pulse the item in the 3D view
  const title = t("forget_title");
  const body = t("forget_body");
  setCaption(`${title}. ${body}`);
  say(`${t("before_landing")} ${body}`);
  showToast({
    icon: "🧳", title, body, alert: true,
    actions: [
      { label: t("ive_got_it"), primary: true, onClick: () => {
          setCompartmentState(false);
          const r = t("msg_farewell");
          setCaption(r); say(r);
        } },
      { label: t("remind_again"), onClick: () => setTimeout(compartmentReminder, 12000) },
    ],
  });
}

// ============================================================
// 11. CUSTOM SEAT PRESETS (Advanced — save your own positions)
// ============================================================
const CUSTOM_KEY = "r7_custom_presets";
let customPresets = loadCustomPresets();
function loadCustomPresets() { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || []; } catch { return []; } }
function persistCustomPresets() { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customPresets)); } catch {} }

function saveCurrentPreset() {
  const s = seat.getState();
  customPresets.push({ id: "c" + Date.now(), recline: s.recline, headrest: s.headrest, legrest: s.legrest, lumbar: s.lumbar });
  persistCustomPresets();
  renderCustomPresets();
  const msg = t("preset_saved"); setCaption(msg); say(msg);
}

// Render saved presets as extra chips in the preset row (with a small delete ✕).
function renderCustomPresets() {
  const prow = $("presetRow");
  if (!prow) return;
  prow.querySelectorAll(".preset.custom").forEach((el) => el.remove());
  customPresets.forEach((p, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "preset custom no-easy";
    b.innerHTML = `<button class="del" type="button" aria-label="Delete">✕</button>` +
      `<span class="ic">⭐</span><span>${t("my_preset")} ${i + 1}</span>`;
    b.onclick = (e) => {
      if (e.target.closest(".del")) {
        customPresets = customPresets.filter((x) => x.id !== p.id);
        persistCustomPresets(); renderCustomPresets();
        return;
      }
      for (const k of ["recline", "headrest", "legrest", "lumbar"]) seat.setTarget(k, p[k]);
      setCaption(`${t("my_preset")} ${i + 1}`);
    };
    prow.appendChild(b);
  });
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("mode-normal");   // baseline until the passenger chooses a mode
  initDashboard();   // build seat + controls (hidden until intake done)
  setUILang(currentLang);
  initIntro();
  // Demo console handle: tweak pacing live (R7.CONFIG.flight.secondsPerFlightHour = 30),
  // test commands without a mic (R7.command("make my bed")), or switch mode (R7.setMode("easy")).
  window.R7 = { CONFIG, get seat() { return seat; }, command: handleCommand, setLanguage,
    setMode: applyMode, get mode() { return uiMode; } };
});
