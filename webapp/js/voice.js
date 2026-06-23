// Multilingual voice agent built on the Web Speech API.
// Recognition (speech-to-text) here; synthesis lives in ui.js (speak()).

export function createVoice({ onResult, onListening, onError }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;
  let recog = null;
  let listening = false;
  let lang = "en-US";

  if (supported) {
    recog = new SR();
    recog.continuous = false;
    recog.interimResults = false;
    recog.maxAlternatives = 1;

    recog.onstart = () => { listening = true; onListening && onListening(true); };
    recog.onend = () => { listening = false; onListening && onListening(false); };
    recog.onerror = (e) => {
      listening = false;
      onListening && onListening(false);
      onError && onError(e.error);
    };
    recog.onresult = (e) => {
      const text = e.results[0][0].transcript.trim();
      onResult && onResult(text);
    };
  }

  return {
    supported,
    setLang(code) { lang = code; if (recog) recog.lang = code; },
    isListening: () => listening,
    toggle() {
      if (!supported) { onError && onError("unsupported"); return; }
      if (listening) { try { recog.stop(); } catch {} }
      else {
        recog.lang = lang;
        // Pause any assistant speech so it isn't transcribed
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        try { recog.start(); } catch (e) { onError && onError(String(e)); }
      }
    },
    stop() { if (recog && listening) { try { recog.stop(); } catch {} } },
  };
}
