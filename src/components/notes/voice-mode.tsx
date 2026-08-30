"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CircleHelp, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useBackLayer } from "@/components/providers/use-app-back";
import { useToast } from "@/components/providers/toast-provider";
import { startDictation, type DictationStart } from "@/lib/dictation";
import { tapFeedback } from "@/lib/native";
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
 *
 * Že se poslouchá, musí být vidět i po zavření klávesnice, proto lišta dole
 * přes celou obrazovku. Zpět (tlačítko i gesto) ji zavře jako první vrstvu -
 * odchod z poznámky s běžícím mikrofonem by byl nepříjemný překvapák.
 *
 * Tlačítko je vidět vždycky. Dotaz „umí tenhle telefon diktovat?" uměl
 * odpovědět ne i tam, kde diktování šlo (starší APK bez pluginu, rozpoznávač,
 * co se hlásí až po prvním spuštění) - a mikrofon pak z poznámky beze slova
 * zmizel. Radši ho nabídnout a při nezdaru říct proč: chybí oprávnění, telefon
 * rozpoznávač nemá, appka je stará. Diktování je pohodlí navíc, ne podmínka
 * psaní.
 */
export function VoiceMode({
  text,
  at,
  onChange,
}: {
  text: string;
  /** Kam v textu diktát patří; null = na konec. */
  at: number | null;
  onChange: (text: string) => void;
}) {
  const { toast } = useToast();
  const [listening, setListening] = React.useState(false);
  const [caps, setCaps] = React.useState<CapsMode>("none");
  /** Poslední napsaná slova - zpětná vazba, když je poznámka odscrollovaná. */
  const [heard, setHeard] = React.useState("");
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const session = React.useRef<DictationStart | null>(null);
  /** Text a místo vložení zmrazené při spuštění - viz komentář u komponenty. */
  const base = React.useRef<{ text: string; at: number }>({ text: "", at: 0 });

  React.useEffect(() => setMounted(true), []);

  // Odchod z poznámky uprostřed diktování nesmí nechat mikrofon běžet.
  React.useEffect(() => () => session.current?.stop?.(), []);

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
    session.current?.stop?.();
    session.current = null;
    setListening(false);
    setCaps("none");
  }, []);

  useBackLayer(listening, stop);

  const start = async () => {
    const cut = at === null || at < 0 || at > text.length ? text.length : at;
    base.current = { text, at: cut };
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
        onChange(`${head}${gap}${written.text}${tail}`);
        setCaps(written.caps);
        setHeard(written.text);
        // „Konec diktování" - řečený příkaz vypne mikrofon, ať se nemusí sahat
        // na telefon uprostřed věty.
        if (written.stop) stop();
      },
      onEnd: (reason, message) => {
        session.current = null;
        setListening(false);
        setCaps("none");
        if (!reason) return;
        toast({
          tone: "warn",
          title: reason === "denied" ? "Mikrofon není povolený" : "Diktování skončilo",
          description: message,
        });
      },
    });

    if (!res.ok) {
      toast({
        tone: "warn",
        title: res.reason === "denied" ? "Mikrofon není povolený" : "Diktování nejde spustit",
        description: res.message,
      });
      return;
    }

    void tapFeedback();
    session.current = res;
    setListening(true);
  };

  return (
    <>
      <Button
        variant={listening ? "destructive" : "secondary"}
        className={cn("flex-1", listening && "animate-pulse")}
        aria-pressed={listening}
        onClick={() => (listening ? stop() : void start())}
      >
        {listening ? <Square /> : <Mic />}
        {listening ? "Zastavit" : "Diktovat"}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Hlasové příkazy"
        title="Hlasové příkazy"
        onClick={() => setHelpOpen(true)}
      >
        <CircleHelp />
      </Button>

      {mounted && listening
        ? createPortal(
            <div className="fixed inset-x-0 bottom-0 z-[60] border-t bg-card/95 px-4 pb-[calc(0.75rem+var(--mw-safe-bottom))] pt-3 shadow-lg backdrop-blur">
              <div className="mx-auto flex max-w-md items-center gap-3">
                <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                  <span className="absolute inset-0 animate-ping rounded-full bg-destructive/20" />
                  <Mic className="size-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-xs font-medium">
                    Poslouchám…
                    {caps !== "none" ? (
                      <span className="rounded-full bg-mark px-2 py-0.5 text-[0.65rem] font-semibold text-mark-foreground">
                        {caps === "all" ? "VELKÁ PÍSMENA" : "Velké písmeno"}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {heard ? preview(heard) : "Mluv, text se píše rovnou do poznámky."}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Hlasové příkazy"
                  onClick={() => setHelpOpen(true)}
                >
                  <CircleHelp />
                </Button>
                <Button variant="destructive" onClick={stop}>
                  <Square />
                  Konec
                </Button>
              </div>
            </div>,
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
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.group}
              </h3>
              {group.items.map((item) => (
                <div key={item.say} className="flex items-baseline justify-between gap-3 text-sm">
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
