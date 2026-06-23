// Central configuration for the RECARO R7 seat experience.
export const CONFIG = {
  // Ollama model to use. Proxied through the local server at /ollama.
  // qwen2.5:3b is fast and supports JSON/structured output well.
  model: "qwen2.5:3b",
  ollamaBase: "/ollama",

  // Intro video. Drop your own file at webapp/assets/intro.mp4
  // If missing, an elegant animated fallback plays instead.
  introVideo: "assets/intro.mp4",

  // Compressed "flight" for demo purposes. Real flights would use the
  // actual remaining flight time. Here 1 demo-hour = a few seconds.
  // secondsPerFlightHour controls how fast the simulated clock runs.
  flight: {
    totalHours: 8,
    secondsPerFlightHour: 13,  // 8h flight ≈ 105s demo (raise for a slower demo)
    landingReminderHour: 7.4,  // when the compartment reminder fires
  },

  // Pain areas offered in the intake popup (the "5 predefined options").
  painAreas: [
    { id: "lower_back", label: "Lower back", icon: "🦴" },
    { id: "neck_shoulders", label: "Neck & shoulders", icon: "💆" },
    { id: "hips", label: "Hips", icon: "🦵" },
    { id: "knees_legs", label: "Knees & legs", icon: "🦿" },
    { id: "stiffness", label: "General stiffness", icon: "🌀" },
  ],

  // Languages offered for the voice agent (Web Speech API locales).
  languages: [
    { code: "en-US", label: "English" },
    { code: "de-DE", label: "Deutsch" },
    { code: "es-ES", label: "Español" },
    { code: "fr-FR", label: "Français" },
    { code: "it-IT", label: "Italiano" },
    { code: "ar-SA", label: "العربية" },
    { code: "zh-CN", label: "中文" },
    { code: "hi-IN", label: "हिन्दी" },
    { code: "ja-JP", label: "日本語" },
  ],
};

// RECARO palette pulled from the reference renders.
export const PALETTE = {
  fabric:   0x5d6e90, // muted steel-blue seat fabric
  fabricLo: 0x44506b,
  leather:  0xc2a378, // tan headrest / accents
  shell:    0xc3c7cc, // silver shell
  shellLo:  0x9aa0a6,
  wood:     0x6b4a2e, // veneer table
  cabin:    0x14161b, // dark cabin
  trim:     0x2a2e36,
  accent:   0xd8c4a0, // warm highlight
  massage:  0xe0a85a, // massage zone glow
};
