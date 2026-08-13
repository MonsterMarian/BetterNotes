"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { NoteDetail } from "@/components/notes/note-detail";

/**
 * Detail jede přes `?id=`, ne přes dynamickou routu. Statický export (a tím
 * i APK) neumí předgenerovat cesty pro id, která vzniknou až v telefonu.
 */
function NotePageInner() {
  const id = useSearchParams().get("id") ?? "";
  return <NoteDetail noteId={id} />;
}

export default function NotePage() {
  return (
    <React.Suspense fallback={<div className="h-64 animate-pulse rounded-xl border bg-muted/40" />}>
      <NotePageInner />
    </React.Suspense>
  );
}
