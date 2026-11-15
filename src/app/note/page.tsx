"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { NoteDetail } from "@/components/notes/note-detail";

/**
 * Detail jede přes `?id=`, ne přes dynamickou routu. Statický export (a tím
 * i APK) neumí předgenerovat cesty pro id, která vzniknou až v telefonu.
 *
 * `new=1` - čerstvě založená poznámka, rovnou se píše; `voice=1` spustí
 * diktát; `photo=camera|gallery` rovnou fotí.
 */
function NotePageInner() {
  const searchParams = useSearchParams();
  const photo = searchParams.get("photo");
  return (
    <NoteDetail
      noteId={searchParams.get("id") ?? ""}
      autoVoice={searchParams.get("voice") === "1"}
      autoPhoto={photo === "camera" || photo === "gallery" ? photo : null}
      isNew={searchParams.get("new") === "1"}
    />
  );
}

export default function NotePage() {
  return (
    <React.Suspense fallback={<div className="mx-auto mt-24 h-64 max-w-2xl animate-pulse rounded-xl bg-surface-high" />}>
      <NotePageInner />
    </React.Suspense>
  );
}
