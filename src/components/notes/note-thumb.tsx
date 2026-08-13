"use client";

import * as React from "react";
import { ImageOff } from "lucide-react";
import { readImage } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * Fotka z úložiště. Bajty se načítají až v komponentě, protože stav appky
 * drží jen jméno souboru - obrázky v base64 uvnitř stavu by localStorage
 * přeplnily po pár fotkách.
 *
 * Načtení je asynchronní, takže se nejdřív ukáže tichý obdélník. Bez něj by
 * seznam po každém otevření poskočil, jak by se karty rozrůstaly.
 */
export function NoteThumb({
  name,
  className,
  alt = "Fotka v poznámce",
}: {
  name: string;
  className?: string;
  alt?: string;
}) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setMissing(false);
    void readImage(name).then((data) => {
      if (cancelled) return;
      if (data) setSrc(data);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (missing) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-md border bg-muted/40 text-muted-foreground",
          className,
        )}
        title="Fotka v telefonu chybí"
      >
        <ImageOff className="size-4" />
      </div>
    );
  }

  if (!src) return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;

  // Statický export bez optimalizace obrázků - <img> je tu na místě,
  // next/image by k data URL stejně nic nepřidal.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={cn("rounded-md object-cover", className)} />;
}
