/**
 * Diktování poznámek hlasem.
 *
 * Dvě prostředí, jedno rozhraní. V telefonu jede systémový rozpoznávač přes
 * `@capacitor-community/speech-recognition` - `window.SpeechRecognition` je
 * funkce Chromu, ne WebView, takže v nativní appce prostě není. V prohlížeči
 * (vývoj na počítači) se sáhne po Web Speech API, pokud ho prohlížeč má.
 *
 * Rozpoznávač hlásí průběžné výsledky: text v poznámce se přepisuje, dokud
 * mluvčí neskončí. Poslední průběžný výsledek je zároveň ten konečný -
 * Android po chvíli ticha poslouchání sám ukončí.
 */
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { isNative } from "./native";

/** Čeština - appka je česká a přepínat jazyk diktátu není co řešit. */
const LANGUAGE = "cs-CZ";

export type DictationFailure = "denied" | "unavailable" | "error";

export interface DictationHandlers {
  /** Průběžný přepis - přepisuje se, dokud mluvčí nedomluví. */
  onPartial: (text: string) => void;
  /** Poslouchání skončilo. `reason` je vyplněné, jen když to skončilo špatně. */
  onEnd: (reason?: DictationFailure, message?: string) => void;
}

export interface DictationStart {
  ok: boolean;
  reason?: DictationFailure;
  message?: string;
  /** Ukončí poslouchání. U neúspěšného startu chybí. */
  stop?: () => void;
}

/** Umí tohle zařízení vůbec diktovat? Podle toho se ukáže tlačítko mikrofonu. */
export async function isDictationAvailable(): Promise<boolean> {
  if (isNative()) {
    try {
      const res = await SpeechRecognition.available();
      return res.available === true;
    } catch {
      return false;
    }
  }
  return webRecognizer() !== null;
}

type WebRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function webRecognizer(): (new () => WebRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => WebRecognition;
    webkitSpeechRecognition?: new () => WebRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export async function startDictation(handlers: DictationHandlers): Promise<DictationStart> {
  return isNative() ? startNative(handlers) : startWeb(handlers);
}

async function startNative(handlers: DictationHandlers): Promise<DictationStart> {
  try {
    const available = await SpeechRecognition.available();
    if (!available.available) {
      return { ok: false, reason: "unavailable", message: "Telefon nemá rozpoznávač řeči." };
    }

    // Oprávnění se ptá až tady, ne při otevření poznámky: dotaz na mikrofon
    // dává smysl ve chvíli, kdy o něj uživatel sám požádal.
    let status = await SpeechRecognition.checkPermissions();
    if (status.speechRecognition !== "granted") {
      status = await SpeechRecognition.requestPermissions();
    }
    if (status.speechRecognition !== "granted") {
      return {
        ok: false,
        reason: "denied",
        message: "Bez přístupu k mikrofonu diktovat nejde.",
      };
    }

    await SpeechRecognition.removeAllListeners();

    let done = false;
    const finish = (reason?: DictationFailure, message?: string) => {
      if (done) return;
      done = true;
      void SpeechRecognition.removeAllListeners();
      handlers.onEnd(reason, message);
    };

    await SpeechRecognition.addListener("partialResults", (data) => {
      const text = data.matches?.[0];
      if (text) handlers.onPartial(text);
    });
    await SpeechRecognition.addListener("listeningState", (data) => {
      // Android přestane poslouchat sám po chvíli ticha - obrazovka to musí
      // vědět, jinak by tlačítko dál tvrdilo, že se nahrává.
      if (data.status === "stopped") finish();
    });

    void SpeechRecognition.start({
      language: LANGUAGE,
      partialResults: true,
      // Systémové okno „Mluvte" by průběžné výsledky vypnulo a text by se
      // objevil až na konci - to je diktafon, ne psaní.
      popup: false,
      maxResults: 1,
    }).catch((e: unknown) => finish("error", String(e).slice(0, 120)));

    return {
      ok: true,
      stop: () => {
        void SpeechRecognition.stop().catch(() => {});
        finish();
      },
    };
  } catch (e) {
    return { ok: false, reason: "error", message: String(e).slice(0, 120) };
  }
}

function startWeb(handlers: DictationHandlers): DictationStart {
  const Recognizer = webRecognizer();
  if (!Recognizer) {
    return {
      ok: false,
      reason: "unavailable",
      message: "Tenhle prohlížeč diktování neumí.",
    };
  }

  const recognition = new Recognizer();
  recognition.lang = LANGUAGE;
  recognition.continuous = true;
  recognition.interimResults = true;

  let done = false;
  const finish = (reason?: DictationFailure, message?: string) => {
    if (done) return;
    done = true;
    handlers.onEnd(reason, message);
  };

  recognition.onresult = (event) => {
    let text = "";
    for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
    if (text) handlers.onPartial(text);
  };
  recognition.onerror = (event) => {
    const denied = event.error === "not-allowed" || event.error === "service-not-allowed";
    finish(
      denied ? "denied" : "error",
      denied ? "Bez přístupu k mikrofonu diktovat nejde." : String(event.error ?? ""),
    );
  };
  recognition.onend = () => finish();

  try {
    recognition.start();
  } catch (e) {
    return { ok: false, reason: "error", message: String(e).slice(0, 120) };
  }

  return {
    ok: true,
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // rozpoznávač už skončil sám
      }
      finish();
    },
  };
}
