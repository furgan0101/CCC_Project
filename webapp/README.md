# RECARO R7 — Seat Experience

An onboard touchscreen experience for the redesigned RECARO R7 business-class
seat. Built for seniors: large touch targets, high contrast, voice-first, and a
calm luxury-cabin aesthetic using the RECARO palette (steel-blue fabric, tan
leather, silver shell, wood veneer).

## What it does

1. **Intro video** — plays your prepared film fullscreen with an elegant **Skip**
   button. Drop your file at `assets/intro.mp4`. If it's missing, an animated
   brand placeholder shows instead.
2. **Comfort intake** — a popup asks the passenger's **age** and **5 pain areas**.
3. **AI wellbeing plan** — Ollama (on-device) designs a personalised schedule of
   seat adjustments and massages across the flight. If Ollama is offline, a
   built-in rule engine produces a comparable plan, so the demo never breaks.
4. **Live 3D seat** (Three.js) — recline, headrest, leg-rest, lumbar and three
   massage zones animate in real time. Drag to rotate, scroll to zoom.
   Three real **UNO seat CAD poses** are used — `assets/uno_seat.obj` (upright),
   `assets/uno_rest.glb` (rest), `assets/uno_sleep.glb` (sleep, a true flat
   bed). Recline picks the pose and adjacent poses cross-fade, so there is no
   mesh cutting and nothing ever tears. While the models load (or if any is
   missing) a built-in procedural seat shows instead.
5. **Requests by text or voice** — type a request in the bar at the bottom
   (always available), or switch dictation on with the **🎤** toggle —
   voice is strictly opt-in and never listens until enabled. The assistant's
   spoken replies are also opt-in (**🔇/🔊** toggle, silent by default).
   Commands are parsed by Ollama (any language) with a keyword fallback,
   e.g. *"make my bed", "raise the headrest", "start a back massage",
   "call the attendant", "warm my seat", "do not disturb"*.
6. **Full internationalisation** — switching language (in the intake popup or
   the top bar) translates the **entire experience**: every label, the comfort
   plan, assistant replies, toasts, and the spoken voice (matching TTS voice
   per language). English, Deutsch, Español, Français, Italiano, العربية
   (with RTL layout), 中文, हिन्दी, 日本語.
7. **Cabin & assistance** — reading light (lights up in the 3D scene),
   do-not-disturb (holds all plan suggestions except the safety-relevant
   landing reminder), call-attendant, and **seat climate** (❄/○/☀ — tints the
   3D seat cushions cool blue or warm amber).
8. **Multi-screen layout** — the 3D seat is the permanent centerpiece; the side
   panel switches between three screens: **📋 Plan** (cabin assistant timeline),
   **🎚 Seat** (adjustments, climate, massage, cabin), and **❔ Help** (tappable
   example voice commands that run for real, plus usage tips). The › button
   folds the panel into a slim icon rail for a full-bleed seat view; tapping
   any icon brings it back. Everything fits 1280×800+ with no scrollbars.
9. **Listening overlay** — when the microphone is active, a fullscreen overlay
   with a pulsing gold orb, radiating rings, and equalizer bars makes it
   unmistakable that the assistant is listening (tap anywhere to cancel).
10. **Scheduled care** — the assistant applies adjustments on a timeline and
   **asks permission** before starting massages.
11. **Compartment sensor demo** — a simulated pressure sensor in the side
   stowage registers an item shortly after boarding (visible in the 3D seat and
   in the *Stowage sensor* readout; toggle it manually with **Place/Remove
   item**). Before landing, if the item is still there, the seat glows the
   compartment and prompts the passenger to collect it.

## Run it

Requires Python 3 (already on this machine) and, optionally, Ollama running
locally with a model such as `qwen2.5:3b` or `llama3.1`.

```powershell
cd webapp
python server.py            # then open http://localhost:8000
```

The server also proxies Ollama at `/ollama`, so browser calls are same-origin
(no CORS setup needed). Change the model or flight timing in `js/config.js`.

### Run with Docker

From the repository root:

```powershell
docker compose up --build
```

Open `http://localhost:8000`. Compose starts both the web client and Ollama,
pulls `qwen2.5:3b` on the first run, and stores models in the persistent
`ollama-data` volume.

To use a different model, set `OLLAMA_MODEL` for the model-pull service and
update `model` in `js/config.js`.

> Voice input needs Chrome or Edge and microphone permission. Everything else
> works in any modern browser.

## Tuning for a live demo

`js/config.js`:
- `model` — which Ollama model to use.
- `flight.secondsPerFlightHour` — how fast the simulated clock runs (default
  makes an 8-hour flight take ~72 seconds so the whole journey is demoable).
- `flight.landingReminderHour` — when the compartment reminder fires.
- `painAreas`, `languages` — the intake options and voice languages.
