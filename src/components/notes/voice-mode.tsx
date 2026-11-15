"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FloatingToolbar, ToolbarButton } from "@/components/ui/floating-toolbar";
import { useBackLayer } from "@/components/providers/use-app-back";
import { useToast } from "@/components/providers/toast-provider";
import { startDictation, type DictationStart } from "@/lib/dictation";
import { haptic } from "@/lib/native";
import {
  startsSentence,
  transcribe,
  VOICE_COMMAND_HELP,
  type CapsMode,
} from "@/lib/voice-commands";
import { cn } from "@/lib/utils";

/**
 * Voice mode - poznámka se píše mluvením.
 *
 * Text vzniká rovnou v poznámce, ne v okně vedle: mikrofon jede pořád,
 * rozpoznávač hlásí každé nové slovo a poznámka se z celého přepisu pokaždé
 * složí znovu. Proto se při spuštění zmrazí `base` - původní text a místo
 * kurzoru. Bez toho by se každá průběžná verze v poznámce naskládala za sebe.
 * Ze stejného důvodu je editor během diktování jen ke čtení: co by se napsalo
 * prsty, další přepis by přemazal.
 *
 * Že se poslouchá, musí být vidět i po zavření klávesnice, proto výrazná
 * plovoucí lišta dole. Zpět (tlačítko i gesto) ji zavře jako první vrstvu -
 * odchod z poznámky s běžícím mikrofonem by byl nepříjemný překvapák.
 *
 * Spouští se z lišty editoru (přes `ref`) nebo samo z `?voice=1`. Dotaz
 * „umí tenhle telefon diktovat?" se předem neklade: uměl odpovědět ne i tam,
 * kde diktování šlo. Radši ho nabídnout a při nezdaru říct proč.
 */
export interface VoiceModeHandle {
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
  isListening: () => boolean;
}

/** Jak dlouho po posledním slově se sloupečky ještě hýbou. */
const PULSE_MS = 600;

export function VoiceMode({
  text,
  caretRef,
  onChange,
  autoStart,
  onListeningChange,
  ref,
}: {
  text: string;
  /**
   * Kam v textu diktát patří; null = na konec. Ref, ne číslo: kurzor se
   * hýbe bez překreslení a diktát musí sednout tam, kde je teď (I11).
   */
  caretRef: React.RefObject<number | null>;
  onChange: (text: string) => void;
  /** Automaticky spustit diktování po otevření (např. přes FAB z hlavní obrazovky). */
  autoStart?: boolean;
  /** Změna stavu nahrávání pro okolní komponenty (editor jen ke čtení, lišta). */
  onListeningChange?: (listening: boolean) => void;
  ref?: React.Ref<VoiceModeHandle>;
}) {
  const { toast } = useToast();
  const [listening, setListeningState] = React.useState(false);
  const [caps, setCaps] = React.useState<CapsMode>("none");
  /** Poslední napsaná slova - zpětná vazba, když je poznámka odscrollovaná. */
  const [heard, setHeard] = React.useState("");
  /** Počítadlo přepisů - sloupečky se hýbou s každým slovem, není to měřič hlasitosti. */
  const [pulse, setPulse] = React.useState(0);
  const [active, setActive] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const session = React.useRef<DictationStart | null>(null);
  const idle = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Text a místo vložení zmrazené při spuštění - viz komentář u komponenty. */
  const base = React.useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const latestProps = React.useRef({ text, onChange, onListeningChange });
  latestProps.current = { text, onChange, onListeningChange };

  const setListening = React.useCallback((value: boolean) => {
    setListeningState(value);
    latestProps.current.onListeningChange?.(value);
  }, []);

  React.useEffect(() => setMounted(true), []);

  // Odchod z poznámky uprostřed diktování nesmí nechat mikrofon běžet.
  React.useEffect(
    () => () => {
      session.current?.stop?.();
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );

  // Lišta překrývá spodek stránky - bez odsazení by pod ní zůstal schovaný
  // konec poznámky, tedy zrovna to, co se právě diktuje.
  React.useEffect(() => {
    if (!listening) return;
    const previous = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "5.5rem";
    return () => {
      document.body.style.paddingBottom = previous;
    };
  }, [listening]);

  const stop = React.useCallback(() => {
    const wasRunning = session.current !== null;
    session.current?.stop?.();
    session.current = null;
    setListening(false);
    setCaps("none");
    if (wasRunning) haptic("success");
  }, [setListening]);

  useBackLayer(listening, stop);

  const start = React.useCallback(async () => {
    const currentText = latestProps.current.text;
    const currentAt = caretRef.current;
    const cut = currentAt === null || currentAt < 0 || currentAt > currentText.length ? currentText.length : currentAt;
    base.current = { text: currentText, at: cut };
    setHeard("");
    setCaps("none");

    const res = await startDictation({
      onTranscript: (spoken) => {
        const { text: original, at: cursor } = base.current;
        const head = original.slice(0, cursor);
        const tail = original.slice(cursor);
        const written = transcribe(spoken, { sentenceStart: startsSentence(head) });
        // Mezera před diktátem, aby se nová věta nenalepila na předchozí slovo.
        const gap = head && written.text && !/\s$/.test(head) ? " " : "";
        latestProps.current.onChange(`${head}${gap}${written.text}${tail}`);
        setCaps(written.caps);
        setHeard(written.text);
        setPulse((p) => p + 1);
        setActive(true);
        if (idle.current) clearTimeout(idle.current);
        idle.current = setTimeout(() => setActive(false), PULSE_MS);
        // „Konec diktování" - řečený příkaz vypne mikrofon, ať se nemusí sahat
        // na telefon uprostřed věty.
        if (written.stop) stop();
      },
      onEnd: (reason, message) => {
        session.current = null;
        setListening(false);
        setCaps("none");
        if (!reason) {
          // Vypnutí po dlouhém tichu - bez hlášky by to vypadalo jako porucha.
          if (message) toast({ title: "Diktování skončilo", description: message });
          return;
        }
        haptic("error");
        toast({
          tone: "warn",
          title: reason === "denied" ? "Mikrofon není povolený" : "Diktování skončilo",
          description: message,
        });
      },
    });

    if (!res.ok) {
      haptic("error");
      toast({
        tone: "warn",
        title: res.reason === "denied" ? "Mikrofon není povolený" : "Diktování nejde spustit",
        description: res.message,
      });
      return;
    }

    haptic("press");
    session.current = res;
    setListening(true);
  }, [stop, setListening, toast, caretRef]);

  const toggle = React.useCallback(() => {
    if (listening) stop();
    else void start();
  }, [listening, start, stop]);

  React.useImperativeHandle(
    ref,
    () => ({
      start,
      stop,
      toggle,
      isListening: () => listening,
    }),
    [start, stop, toggle, listening],
  );

  // Pojistka se zapíše až při skutečném spuštění: StrictMode efekt hned
  // odmontuje a časovač zruší, takže zápis předem by start zablokoval (I9).
  const hasAutoStarted = React.useRef(false);
  React.useEffect(() => {
    if (!autoStart || hasAutoStarted.current) return;
    const t = setTimeout(() => {
      hasAutoStarted.current = true;
      void start();
    }, 200);
    return () => clearTimeout(t);
  }, [autoStart, start]);

  return (
    <>
      {mounted && listening
        ? createPortal(
            <FloatingToolbar vibrant>
              <div className="flex min-w-0 flex-1 items-center gap-3 pl-3">
                <span aria-hidden className="flex h-6 items-center gap-[3px]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full bg-on-primary-container transition-[height] duration-150"
                      style={{ height: active ? `${30 + ((pulse * 7 + i * 13) % 5) * 17}%` : "20%" }}
                    />
                  ))}
                </span>

                <div className="flex min-w-0 max-w-64 flex-1 flex-col text-on-primary-container">
                  <p className="flex items-center gap-2 text-label-md">
                    Poslouchám…
                    {caps !== "none" ? (
                      <span className="rounded-full bg-highlight px-2 text-label-sm text-on-highlight">
                        {caps === "all" ? "VELKÁ PÍSMENA" : "Velké písmeno"}
                      </span>
                    ) : null}
                  </p>
                  <p className={cn("truncate text-body-sm", heard && "italic")}>
                    {heard ? preview(heard) : "Mluv, text se píše rovnou do poznámky."}
                  </p>
                </div>
              </div>

              <ToolbarButton icon={<CircleHelp />} label="Hlasové příkazy" onClick={() => setHelpOpen(true)} />
              <Button variant="filled" className="mr-2 shrink-0" onClick={stop}>
                Hotovo
              </Button>
            </FloatingToolbar>,
            document.body,
          )
        : null}

      <Dialog
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title="Hlasové příkazy"
        description="Řekni je uprostřed věty a napíšou se jako znak, ne jako slovo."
      >
        <div className="flex flex-col gap-4">
          {VOICE_COMMAND_HELP.map((group) => (
            <div key={group.group} className="flex flex-col gap-1">
              <h3 className="text-title-sm text-primary">{group.group}</h3>
              {group.items.map((item) => (
                <div key={item.say} className="flex items-baseline justify-between gap-3 text-body-md">
                  <span className="min-w-0 truncate">„{item.say}“</span>
                  <span className="shrink-0 font-medium">{item.shows}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Dialog>
    </>
  );
}

/** Poslední kus napsaného textu na jeden řádek lišty. */
function preview(written: string): string {
  const line = written.replace(/\s+/g, " ").trimEnd();
  return line.length > 48 ? `…${line.slice(-48)}` : line;
}
