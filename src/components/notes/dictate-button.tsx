"use client";

import * as React from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import { isDictationAvailable, startDictation, type DictationStart } from "@/lib/dictation";
import { tapFeedback } from "@/lib/native";
import { cn } from "@/lib/utils";

/**
 * Diktování do poznámky.
 *
 * Nadiktovaný kus se vkládá tam, kde byl kurzor, a při každém průběžném
 * výsledku se přepíše - text tedy roste přímo v poznámce, ne v okně vedle.
 * Proto se drží `base`: původní text bez diktátu, do kterého se poslední
 * přepis pokaždé vloží znovu. Bez toho by se každá průběžná verze v poznámce
 * naskládala za sebe.
 *
 * Když se řeč rozpoznat nedá (chybí oprávnění, telefon rozpoznávač nemá),
 * appka to řekne a nic víc - diktování je pohodlí navíc, ne podmínka psaní.
 */
export function DictateButton({
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
  const [available, setAvailable] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const session = React.useRef<DictationStart | null>(null);
  /** Text a místo vložení zmrazené při spuštění - viz komentář u komponenty. */
  const base = React.useRef<{ text: string; at: number }>({ text: "", at: 0 });

  React.useEffect(() => {
    let cancelled = false;
    void isDictationAvailable().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Odchod z poznámky uprostřed diktování nesmí nechat mikrofon běžet.
  React.useEffect(() => () => session.current?.stop?.(), []);

  const stop = () => {
    session.current?.stop?.();
    session.current = null;
    setListening(false);
  };

  const start = async () => {
    const cut = at === null || at < 0 || at > text.length ? text.length : at;
    base.current = { text, at: cut };

    const res = await startDictation({
      onPartial: (spoken) => {
        const { text: original, at: cursor } = base.current;
        const head = original.slice(0, cursor);
        const tail = original.slice(cursor);
        // Mezera před diktátem, aby se nová věta nenalepila na předchozí slovo.
        const gap = head && !/\s$/.test(head) ? " " : "";
        onChange(`${head}${gap}${spoken}${tail}`);
      },
      onEnd: (reason, message) => {
        session.current = null;
        setListening(false);
        if (!reason) return;
        toast({
          tone: "warn",
          title: reason === "denied" ? "Mikrofon není povolený" : "Diktování nejde spustit",
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

  if (!available) return null;

  return (
    <Button
      variant={listening ? "destructive" : "secondary"}
      className={cn("flex-1", listening && "animate-pulse")}
      aria-pressed={listening}
      onClick={() => (listening ? stop() : void start())}
    >
      {listening ? <Square /> : <Mic />}
      {listening ? "Zastavit" : "Diktovat"}
    </Button>
  );
}
