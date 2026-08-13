/**
 * Připojení k Supabase.
 *
 * Adresa projektu a veřejný klíč se vypékají do buildu z `.env.local`
 * (viz `.env.local.example`). Do Nastavení se nezadávají schválně: klíč je
 * dlouhý JWT a opisovat ho prstem do telefonu je trest. Změna klíče znamená
 * nový build - ale ten se dá doručit jako živá aktualizace, takže se kvůli
 * tomu nemusí přeinstalovávat APK.
 *
 * Že je klíč zabalený v APK nevadí: `anon` klíč je veřejný z definice
 * a sám o sobě nedává přístup k ničemu. Data drží u sebe až RLS policy
 * v databázi (viz `supabase/schema.sql`), které pouštějí jen přihlášeného
 * uživatele k jeho vlastním řádkům.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Bez vyplněných údajů se odesílání v appce vůbec nenabízí. */
export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

export const NOTES_TABLE = "notes_outbox";
export const IMAGES_BUCKET = "note-images";

let client: SupabaseClient | null = null;

/**
 * Klient se vyrábí až při prvním použití a pak se drží.
 *
 * Ne na úrovni modulu: `createClient` sahá na `localStorage` kvůli uložené
 * relaci a modul se vyhodnocuje i při statickém exportu, kde žádný prohlížeč
 * není - build by na tom spadl.
 */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Appka nikdy neběží na adrese s přihlašovacím odkazem, takže není
        // co ze session vytahovat - a čtení URL by v WebView jen zdržovalo.
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** Hláška, kterou má smysl ukázat uživateli. */
export function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  // Supabase vrací anglické hlášky; ty tři nejčastější stojí za překlad,
  // protože každá znamená něco jiného a uživatel podle nich pozná, co dělat.
  if (/Invalid login credentials/i.test(message)) return "Špatný e-mail nebo heslo.";
  if (/Email not confirmed/i.test(message)) {
    return "E-mail není potvrzený - mrkni do schránky na odkaz od Supabase.";
  }
  if (/fetch|network|Failed to fetch/i.test(message)) {
    return "Nepovedlo se spojit se serverem. Je telefon online?";
  }
  return message.slice(0, 160);
}
