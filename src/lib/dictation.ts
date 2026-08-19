/**
 * Diktování poznámek hlasem - doprava zvuku, nic víc. Co se z nadiktovaných
 * slov stane za text, řeší `voice-commands.ts`.
 *
 * Dvě prostředí, jedno rozhraní. V telefonu jede systémový rozpoznávač přes
 * `@capacitor-community/speech-recognition` - `window.SpeechRecognition` je
 * funkce Chromu, ne WebView, takže v nativní appce prostě není. V prohlížeči
 * (vývoj na počítači) se sáhne po Web Speech API, pokud ho prohlížeč má.
 *
 * **Poslouchá se dokola.** Rozpoznávač na Androidu se po chvíli ticha vypne
 * sám a vrátí, co slyšel; voice mode ho hned nastartuje znovu a úseky skládá
 * za sebe. Volající proto dostává pokaždé **celý přepis od spuštění**, ne
 * poslední větu - text v poznámce se z něj pokaždé přepíše celý a nezáleží
 * na tom, kolikrát se rozpoznávač mezitím zakoktal.
 *
 * Konec poslouchání má jen tři důvody: uživatel ho zastaví, dlouho se nic
 * neříká, nebo se rozpoznávač pořád dokola vypíná hned po startu - to už
 * není pauza v řeči, ale porucha.
 */
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { isNative } from "./native";

/** Čeština - appka je česká a přepínat jazyk diktátu není co řešit. */
const LANGUAGE = "cs-CZ";

/** Pauza před dalším úsekem. Bez ní se Android rozpoznávač zakousne. */
const RESTART_MS = 350;

/** Úsek kratší než tohle a bez jediného slova je selhání, ne ticho. */
const TOO_QUICK_MS = 900;

/** Kolik takových selhání po sobě znamená, že poslouchání nemá cenu. */
const MAX_BROKEN = 4;

/** Po takhle dlouhém tichu se mikrofon vypne sám - ať nejede naprázdno. */
const QUIET_LIMIT_MS = 90_000;

export type DictationFailure = "denied" | "unavailable" | "error";

export interface DictationHandlers {
  /** Celý přepis od spuštění. Přichází při každém novém slově. */
  onTranscript: (spoken: string) => void;
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

/** Úseky se skládají mezerou - jsou to holá slova, věty z nich dělá až přepis. */
function join(before: string, next: string): string {
  if (!before) return next;
  if (!next) return before;
  return `${before} ${next}`;
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
    /** Uživatel stiskl Stop - další úsek už nezačne. */
    let closing = false;
    /** Hotové úseky a rozepsaný poslední. */
    let committed = "";
    let partial = "";
    let broken = 0;
    let segmentAt = Date.now();
    let heardAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const emit = () => handlers.onTranscript(join(committed, partial));

    const finish = (reason?: DictationFailure, message?: string) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      void SpeechRecognition.removeAllListeners();
      handlers.onEnd(reason, message);
    };

    const listen = () => {
      if (done || closing) return;
      segmentAt = Date.now();
      void SpeechRecognition.start({
        language: LANGUAGE,
        partialResults: true,
        // Systémové okno „Mluvte" by průběžné výsledky vypnulo a text by se
        // objevil až na konci - to je diktafon, ne psaní.
        popup: false,
        maxResults: 1,
      }).catch(failed);
    };

    /** Konec úseku: uložit, co zaznělo, a rozhodnout, jestli se pokračuje. */
    const segmentEnded = (message?: string) => {
      if (done) return;
      if (partial) {
        committed = join(committed, partial);
        partial = "";
        heardAt = Date.now();
      }
      if (closing) return finish();

      // Úsek, který skončil hned a beze slova, je porucha (obsazený mikrofon,
      // vypnutý rozpoznávač). Ticho trvá dýl, to se za poruchu nepočítá.
      broken = Date.now() - segmentAt < TOO_QUICK_MS ? broken + 1 : 0;
      if (broken >= MAX_BROKEN) {
        return finish("error", message ?? "Rozpoznávač se pořád vypíná.");
      }
      if (Date.now() - heardAt > QUIET_LIMIT_MS) return finish();

      timer = setTimeout(listen, RESTART_MS);
    };

    const failed = (e: unknown) => {
      const message = String(e).slice(0, 120);
      // Odepřený mikrofon nemá cenu zkoušet znovu; „neslyšel jsem" ano.
      if (/permission|denied/i.test(message)) {
        return finish("denied", "Bez přístupu k mikrofonu diktovat nejde.");
      }
      segmentEnded(message);
    };

    await SpeechRecognition.addListener("partialResults", (data) => {
      const text = data.matches?.[0];
      if (!text) return;
      partial = text;
      heardAt = Date.now();
      emit();
    });
    await SpeechRecognition.addListener("listeningState", (data) => {
      if (data.status === "stopped") segmentEnded();
    });

    listen();

    return {
      ok: true,
      stop: () => {
        closing = true;
        if (partial) {
          committed = join(committed, partial);
          partial = "";
          emit();
        }
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
  let closing = false;
  /** Co doběhlo v minulých bězích - po `onend` se výsledky resetují. */
  let committed = "";
  let partial = "";
  let broken = 0;
  let segmentAt = Date.now();
  let heardAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => handlers.onTranscript(join(committed, partial));

  const finish = (reason?: DictationFailure, message?: string) => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    handlers.onEnd(reason, message);
  };

  /** Vrátí chybu, když start neprošel; `null` znamená, že se poslouchá. */
  const listen = (): string | null => {
    if (done || closing) return null;
    segmentAt = Date.now();
    try {
      recognition.start();
      return null;
    } catch (e) {
      // Prohlížeč umí říct „už běžím" - to není důvod končit.
      return /already|invalid state/i.test(String(e)) ? null : String(e).slice(0, 120);
    }
  };

  const listenAgain = () => {
    const failure = listen();
    if (failure) finish("error", failure);
  };

  recognition.onresult = (event) => {
    let text = "";
    for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
    if (!text) return;
    partial = text;
    heardAt = Date.now();
    emit();
  };

  recognition.onerror = (event) => {
    const error = String(event.error ?? "");
    if (error === "not-allowed" || error === "service-not-allowed") {
      finish("denied", "Bez přístupu k mikrofonu diktovat nejde.");
      return;
    }
    // Zbytek („neslyšel jsem", přerušené spojení) uzavře `onend` a poslouchá
    // se dál - pauza v řeči nesmí voice mode vypnout.
  };

  recognition.onend = () => {
    if (done) return;
    if (partial) {
      committed = join(committed, partial);
      partial = "";
      heardAt = Date.now();
    }
    if (closing) return finish();

    broken = Date.now() - segmentAt < TOO_QUICK_MS ? broken + 1 : 0;
    if (broken >= MAX_BROKEN) return finish("error", "Rozpoznávač se pořád vypíná.");
    if (Date.now() - heardAt > QUIET_LIMIT_MS) return finish();

    timer = setTimeout(listenAgain, RESTART_MS);
  };

  // První start hlásí chybu návratovou hodnotou, ne přes `onEnd` - obrazovka
  // by o neúspěšném spuštění jinak dostala zprávu dvakrát.
  const failure = listen();
  if (failure) return { ok: false, reason: "error", message: failure };

  return {
    ok: true,
    stop: () => {
      closing = true;
      if (partial) {
        committed = join(committed, partial);
        partial = "";
        emit();
      }
      try {
        recognition.stop();
      } catch {
        // rozpoznávač už skončil sám
      }
      finish();
    },
  };
}
