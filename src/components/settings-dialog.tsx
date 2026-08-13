"use client";

import * as React from "react";
import { Download, Moon, RefreshCw, Sun, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { useStore } from "@/components/providers/store-provider";
import { usePrefs } from "@/components/providers/use-prefs";
import { useToast } from "@/components/providers/toast-provider";
import { applySettings, exportBackup, pickBackupFile, restoreBackup } from "@/lib/backup";
import { applyTheme, currentTheme, setPrefs, type Theme } from "@/lib/prefs";
import { normalizeEndpoint } from "@/lib/sync";
import {
  checkForUpdate,
  currentBundleVersion,
  pendingBundleVersion,
  revertToBundled,
} from "@/lib/live-update";
import { isNative, syncStatusBar } from "@/lib/native";
import { noteCount } from "@/lib/notes";
import { cn, plural } from "@/lib/utils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("dark");
  React.useEffect(() => setTheme(currentTheme()), []);

  const pick = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
    void syncStatusBar(next === "dark");
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          { id: "light", label: "Světlé", icon: Sun },
          { id: "dark", label: "Tmavé", icon: Moon },
        ] as const
      ).map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={theme === id}
          onClick={() => pick(id)}
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors hover:bg-accent",
            theme === id && "ring-2 ring-ring",
          )}
        >
          <Icon className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Živé aktualizace. V prohlížeči nemá co nasazovat, takže se nezobrazí. */
function UpdateSection() {
  const { toast } = useToast();
  const [checking, setChecking] = React.useState(false);
  const [current, setCurrent] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);

  React.useEffect(() => {
    setCurrent(currentBundleVersion());
    setPending(pendingBundleVersion());
  }, []);

  const check = async () => {
    setChecking(true);
    const res = await checkForUpdate();
    setChecking(false);
    setPending(pendingBundleVersion());

    if (res.kind === "downloaded") {
      toast({
        tone: "win",
        title: `Stažena verze ${res.version}`,
        description: "Nasadí se při dalším otevření appky.",
      });
    } else if (res.kind === "up-to-date") {
      toast({ tone: "info", title: "Máš nejnovější verzi." });
    } else if (res.kind === "failed") {
      toast({ tone: "warn", title: "Kontrola selhala", description: res.message });
    }
  };

  return (
    <Section title="Aktualizace">
      <p className="text-xs text-muted-foreground">
        Verze <span className="tabular">{current ?? "—"}</span>
        {pending ? (
          <>
            {" · "}připravena <span className="tabular">{pending}</span>, nasadí se po restartu
          </>
        ) : null}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" disabled={checking} onClick={() => void check()}>
          <RefreshCw className={cn(checking && "animate-spin")} />
          {checking ? "Hledám…" : "Zkontrolovat"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          title="Vrátí verzi zabalenou v APK - záchrana, když se stažená verze chová divně."
          onClick={() => void revertToBundled()}
        >
          Zpět na verzi z APK
        </Button>
      </div>
    </Section>
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
  const { syncEndpoint, trashAfterSync } = usePrefs();
  const { toast } = useToast();
  const [endpoint, setEndpoint] = React.useState(syncEndpoint);
  const [native, setNative] = React.useState(false);
  const [working, setWorking] = React.useState(false);

  React.useEffect(() => setNative(isNative()), []);
  // Dialog se odmontovává, takže se pole při každém otevření srovná se stavem.
  React.useEffect(() => {
    if (open) setEndpoint(syncEndpoint);
  }, [open, syncEndpoint]);

  const saveEndpoint = () => {
    const value = endpoint.trim() ? normalizeEndpoint(endpoint) : "";
    setPrefs({ syncEndpoint: value });
    setEndpoint(value);
  };

  const doExport = async () => {
    setWorking(true);
    try {
      await exportBackup(state);
    } catch (e) {
      toast({ tone: "warn", title: "Záloha selhala", description: String(e).slice(0, 120) });
    } finally {
      setWorking(false);
    }
  };

  const doImport = async () => {
    const text = await pickBackupFile();
    if (!text) return;
    setWorking(true);
    try {
      const res = await restoreBackup(text);
      replace(res.state);
      applySettings(res.settings);
      toast({
        tone: "win",
        title: "Záloha načtena",
        description: `${res.state.notes.length} ${plural(res.state.notes.length, "poznámka", "poznámky", "poznámek")}, ${res.images} ${plural(res.images, "fotka", "fotky", "fotek")}.`,
      });
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

  const count = noteCount(state);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nastavení">
      <div className="flex flex-col gap-4">
        <Section title="Vzhled">
          <ThemeToggle />
        </Section>

        <Section title="Odesílání do počítače">
          <Field
            label="Adresa počítače"
            hint="Nech prázdné, když funkci nechceš. Server je pár řádků v tools/sync-server.mjs."
          >
            <Input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              onBlur={saveEndpoint}
              placeholder="192.168.1.10:4545"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={trashAfterSync}
              onChange={(e) => setPrefs({ trashAfterSync: e.target.checked })}
              className="size-4 accent-[var(--progress)]"
            />
            Po odeslání dát poznámku do koše
          </label>
        </Section>

        <Section title="Data">
          <p className="text-xs text-muted-foreground">
            {count} {plural(count, "poznámka", "poznámky", "poznámek")} v telefonu. Nikam se
            neposílají a nikde není účet - záloha je jediná pojistka.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={working}
              onClick={() => void doExport()}
            >
              <Download />
              Zálohovat
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              disabled={working}
              onClick={() => void doImport()}
            >
              <Upload />
              Načíst zálohu
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Načtení zálohy přepíše všechny poznámky v telefonu.
          </p>
        </Section>

        {native ? <UpdateSection /> : null}
      </div>
    </Dialog>
  );
}
