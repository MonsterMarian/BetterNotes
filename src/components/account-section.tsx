"use client";

import * as React from "react";
import { LogOut, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useStore } from "@/components/providers/store-provider";
import { useToast } from "@/components/providers/toast-provider";
import { syncStatusText, useSyncStatus } from "@/components/sync-status";
import { currentAccount, signIn, signOut, signUp, type Account } from "@/lib/sync";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/**
 * Účet: stejný jako v MicroWins. Přihlášený telefon si poznámky drží
 * i v databázi - nové a upravené se ukládají samy, smazané se mažou
 * a po přeinstalaci nebo na jiném telefonu se stáhnou zpátky.
 */
export function AccountSection() {
  const { toast } = useToast();
  const { syncNow } = useStore();
  const status = useSyncStatus();

  const [account, setAccount] = React.useState<Account | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    // Bez adresy se na klienta nesmí sáhnout - `createClient` s prázdnou
    // adresou spadne a shodil by celé Nastavení (I15).
    if (!isSupabaseConfigured()) return setLoading(false);
    setAccount(await currentAccount());
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <div className="h-16 animate-pulse rounded-lg bg-surface-high" />;

  const submit = async (mode: "in" | "up") => {
    setBusy(true);
    setError(null);
    const fail = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);

    if (fail) return setError(fail);

    if (mode === "up") {
      // Supabase umí mít zapnuté potvrzování e-mailu. Když je, účet vznikne,
      // ale relace ne - a bez téhle hlášky by to vypadalo, že se nic nestalo.
      const acc = await currentAccount();
      if (!acc) {
        toast({
          tone: "info",
          title: "Účet založen",
          description: "Potvrď e-mail odkazem ze schránky a pak se přihlas.",
        });
        return;
      }
    }

    setPassword("");
    // Po přihlášení hned stáhnout poznámky z účtu a nahrát ty z telefonu.
    syncNow();
    void refresh();
    toast({ tone: "success", title: "Přihlášeno" });
  };

  if (account) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body-md text-on-surface-variant">
          Přihlášen jako <span className="font-medium text-on-surface">{account.email}</span>
        </p>

        <p className={cn("text-body-md", status.kind === "error" ? "text-error" : "text-on-surface-variant")}>
          {syncStatusText(status)}
        </p>

        <p className="text-body-sm text-on-surface-variant">
          Nové a upravené poznámky se ukládají samy, smazané se smažou i v databázi. Na jiném
          telefonu nebo po přeinstalaci se po přihlášení stáhnou zpátky.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="tonal" size="sm" disabled={status.kind === "syncing"} onClick={syncNow}>
            <RefreshCw className={cn(status.kind === "syncing" && "animate-spin")} />
            Synchronizovat teď
          </Button>
          <Button
            variant="text"
            size="sm"
            onClick={async () => {
              await signOut();
              void refresh();
            }}
          >
            <LogOut />
            Odhlásit
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-md text-on-surface-variant">
        Přihlas se stejným účtem jako v MicroWins (účty jsou společné). Poznámky se pak
        samy ukládají do databáze a po přeinstalaci se stáhnou zpátky.
      </p>

      <Field label="E-mail">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="ty@example.com"
        />
      </Field>

      <Field label="Heslo">
        <Input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoCapitalize="off"
          placeholder="aspoň 6 znaků"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) void submit("in");
          }}
        />
      </Field>

      {error ? <p className="text-body-md text-error">{error}</p> : null}

      {/* Adresa je vidět schválně: když přihlášení hlásí, že se nepovedlo
          spojit se serverem, tohle je první věc, kterou je potřeba ověřit. */}
      <p className="text-body-sm text-on-surface-variant">
        Server: <span className="break-all font-mono">{supabaseUrl()}</span>
      </p>

      <div className="flex gap-2">
        <Button
          variant="filled"
          size="sm"
          className="flex-1"
          disabled={busy || !email || !password}
          onClick={() => void submit("in")}
        >
          <Send />
          {busy ? "Moment…" : "Přihlásit"}
        </Button>
        <Button
          variant="tonal"
          size="sm"
          disabled={busy || !email || !password}
          onClick={() => void submit("up")}
        >
          Založit účet
        </Button>
      </div>
    </div>
  );
}
