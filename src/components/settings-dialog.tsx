"use client";

import * as React from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { AccountSection } from "@/components/account-section";
import { useStore } from "@/components/providers/store-provider";
import { usePrefs } from "@/components/providers/use-prefs";
import { useToast } from "@/components/providers/toast-provider";
import { applySettings, exportBackup, pickBackupFile, restoreBackup } from "@/lib/backup";
import { formatStamp } from "@/lib/date";
import { setPrefs } from "@/lib/prefs";
import { isSupabaseConfigured } from "@/lib/supabase";
import { plural } from "@/lib/utils";

const TAGLINE = "Bez účtu. Bez limitů. Tvoje data zůstávají v telefonu.";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-title-sm text-primary">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-lg text-on-surface">{label}</p>
      {children}
    </div>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { state, replace } = useStore();
  const prefs = usePrefs();
  const { toast } = useToast();
  // Adresa Supabase bydlí v localStorage, při předgenerování stránky není známá.
  const [configured, setConfigured] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [confirmRestore, setConfirmRestore] = React.useState(false);

  React.useEffect(() => {
    setConfigured(isSupabaseConfigured());
  }, []);

  const doExport = async () => {
    setWorking(true);
    try {
      await exportBackup(state);
      toast({ tone: "success", title: "Záloha připravena" });
    } catch (e) {
      toast({ tone: "warn", title: "Záloha selhala", description: String(e).slice(0, 120) });
    } finally {
      setWorking(false);
    }
  };

  const doImport = async () => {
    setConfirmRestore(false);
    const text = await pickBackupFile();
    if (!text) return;
    setWorking(true);
    try {
      const res = await restoreBackup(text);
      replace(res.state);
      applySettings(res.settings);
      const n = res.state.notes.length;
      toast({ tone: "success", title: `Obnoveno: ${n} ${plural(n, "poznámka", "poznámky", "poznámek")}` });
      onOpenChange(false);
    } catch (e) {
      toast({
        tone: "warn",
        title: "Soubor se nepodařilo přečíst",
        description: String(e).slice(0, 120),
      });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nastavení" variant="fullscreen">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pt-2">
        <Section title="Vzhled">
          <Row label="Písmo poznámek">
            <Segmented
              aria-label="Písmo poznámek"
              value={prefs.editorFont}
              options={[
                { id: "sans", label: "Bezpatkové" },
                { id: "serif", label: "Patkové" },
              ]}
              onChange={(editorFont) => setPrefs({ editorFont })}
            />
          </Row>
          <Row label="Zobrazení">
            <Segmented
              aria-label="Zobrazení"
              value={prefs.view}
              options={[
                { id: "list", label: "Seznam" },
                { id: "grid", label: "Mřížka" },
              ]}
              onChange={(view) => setPrefs({ view })}
            />
          </Row>
        </Section>

        <Section title="Psaní">
          <Switch
            label="Hotové úkoly přesouvat dolů"
            checked={prefs.sinkChecked}
            onCheckedChange={(sinkChecked) => setPrefs({ sinkChecked })}
          />
          <Switch
            label="Vibrace"
            description="Jemná odezva při mazání, zaškrtnutí a výběru"
            checked={prefs.haptics}
            onCheckedChange={(haptics) => setPrefs({ haptics })}
          />
        </Section>

        <Section title="Záloha">
          <p className="text-body-md text-on-surface-variant">
            {prefs.lastBackupAt
              ? `Poslední záloha: ${formatStamp(prefs.lastBackupAt)}`
              : "Zatím jsi nezálohoval."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="filled" disabled={working} onClick={() => void doExport()}>
              <Download />
              Zálohovat teď
            </Button>
            <Button variant="outline" disabled={working} onClick={() => setConfirmRestore(true)}>
              <Upload />
              Obnovit ze zálohy
            </Button>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Poznámky jsou jen v tomhle telefonu. Odinstalováním appky zmizí, záloha je jediná pojistka.
          </p>
        </Section>

        {configured ? (
          <Section title="Odeslat do počítače">
            <AccountSection />
          </Section>
        ) : null}

        <Section title="O aplikaci">
          <div className="flex flex-col gap-1">
            <p className="text-body-lg text-on-surface">
              BetterNotes <span className="tabular">{process.env.NEXT_PUBLIC_BUNDLE_VERSION ?? ""}</span>
            </p>
            <p className="text-body-md text-on-surface-variant">{TAGLINE}</p>
          </div>
        </Section>
      </div>

      <Dialog
        open={confirmRestore}
        onOpenChange={setConfirmRestore}
        variant="center"
        title="Obnovit ze zálohy?"
        description="Současné poznámky se nahradí obsahem zálohy."
        footer={
          <>
            <Button variant="text" onClick={() => setConfirmRestore(false)}>
              Zrušit
            </Button>
            <Button variant="filled" onClick={() => void doImport()}>
              Obnovit
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
