"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { ListSkeleton, NotesList } from "@/components/notes/notes-list";
import { useStore } from "@/components/providers/store-provider";

function HomeInner() {
  const tag = useSearchParams().get("tag");
  const { hydrated } = useStore();
  // Do načtení localStorage se schválně nekreslí prázdný stav: hláška
  // „zatím tu nic není" nad plným zápisníkem vypadá jako ztráta dat.
  if (!hydrated) return <ListSkeleton />;
  return <NotesList initialTag={tag} />;
}

/** `?tag=` z odkazu na štítek v poznámce; `useSearchParams` chce kvůli statickému exportu Suspense. */
export default function HomePage() {
  return (
    <React.Suspense fallback={<ListSkeleton />}>
      <HomeInner />
    </React.Suspense>
  );
}
