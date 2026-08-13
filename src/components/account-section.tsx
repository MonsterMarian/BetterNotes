"use client";

import * as React from "react";
import { LogOut, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { usePrefs } from "@/components/providers/use-prefs";
import { useToast } from "@/components/providers/toast-provider";
import { setPrefs } from "@/lib/prefs";
import { currentAccount, pendingCount, signIn, signOut, signUp, type Account } from "@/lib/sync";
import { isSupabaseConfigured, setSupabaseUrl, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { plural } from "@/lib/utils";

/**
 * Adresa Supabase projektu.
 *
 * Ukazuje se jen dokud adresa není známá - typicky když ji build nedostal.
 * Bez tohohle pole by uživatel v Nastavení jen četl, že nic není nastavené,
 * a čekal na nový balík; adresa je krátká, takže se dá opsat i na telefonu.
 */
function ProjectUrlField({ onSaved }: { onSaved: () => void }) {
  const [url, setUrl] = React.useState("");

  return (
    <div className="flex flex-col gap-2.5">
      <Field
        label="Adresa Supabase projektu"
        hint="Najdeš ji v adresním řádku dashboardu: supabase.com/dashboard/project/abcdefgh → adresa je abcdefgh.supabase.co"
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="abcdefgh.supabase.co"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
      <Button
        size="sm"
        className="self-start bg-progress text-progress-foreground hover:bg-progress/90"
        disabled={!url.trim()}
        onClick={() => {
          setSupabaseUrl(url);
          onSaved();
        }}
      >
        Uložit
      </Button>
    </div>
  );
}

/**
 * Přihlášení k odesílání poznámek do počítače.
 *
 * Účet je jeden a používá se na obou stranách - v telefonu tady, na počítači
 * ve stahovacím skriptu. Podle něj databáze pozná, čí poznámky jsou; nic
 * jiného než tohle přihlášení je u sebe nedrží.
 */
export function AccountSection() {
  const { trashAfterSync } = usePrefs();
  const { toast } = useToast();

  const [account, setAccount] = React.useState<Account | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState<number | null>(null);
  // Zjišťuje se až v efektu: adresa bydlí v localStorage, který při
  // předgenerování stránky neexistuje.
  const [configured, setConfigured] = React.useState(false);

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    // Bez adresy se na klienta nesmí sáhnout - `createClient` s prázdnou
    // adresou spadne a shodil by celé Nastavení.
    if (!isSupabaseConfigured()) {
      setConfigured(false);
      setLoading(false);
      return;
    }
    setConfigured(true);
    const acc = await currentAccount();
    setAccount(acc);
    setPending(acc ? await pendingCount() : null);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!SUPABASE_ANON_KEY) {
    return (
      <p className="text-xs text-muted-foreground">
        Tahle verze appky nemá klíč k databázi - musí se vypéct do buildu.
        Postup je v README, sekce „Odeslání do počítače".
      </p>
    );
  }

  if (loading) return <div className="h-16 animate-pulse rounded-lg bg-muted/40" />;

  if (!configured) return <ProjectUrlField onSaved={() => void refresh()} />;

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
    void refresh();
    toast({ tone: "win", title: "Přihlášeno" });
  };

  if (account) {
    return (
      <div className="flex flex-col gap-2.5">
        <p className="text-xs text-muted-foreground">
          Přihlášen jako <span className="font-medium text-foreground">{account.email}</span>
        </p>

        <p className="text-xs text-muted-foreground">
          {pending === null
            ? "Frontu se nepovedlo načíst - jsi online?"
            : pending === 0
              ? "Fronta je prázdná, počítač má vše stažené."
              : `${pending} ${plural(pending, "poznámka čeká", "poznámky čekají", "poznámek čeká")} na stažení do počítače.`}
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={trashAfterSync}
            onChange={(e) => setPrefs({ trashAfterSync: e.target.checked })}
            className="size-4 accent-[var(--progress)]"
          />
          Po odeslání dát poznámku do koše
        </label>

        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={async () => {
            await signOut();
            void refresh();
          }}
        >
          <LogOut />
          Odhlásit
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs text-muted-foreground">
        Přihlas se stejným účtem, jaký má stahovací skript na počítači. Poznámka
        pak počká v databázi, dokud si ji počítač nevyzvedne — nemusí být
        zapnutý ani na stejné Wi-Fi.
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

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 bg-progress text-progress-foreground hover:bg-progress/90"
          disabled={busy || !email || !password}
          onClick={() => void submit("in")}
        >
          <Send />
          {busy ? "Moment…" : "Přihlásit"}
        </Button>
        <Button
          variant="secondary"
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
