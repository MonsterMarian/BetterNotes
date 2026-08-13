"use client";

import * as React from "react";
import { NotesList } from "@/components/notes/notes-list";
import { useStore } from "@/components/providers/store-provider";

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-10 animate-pulse rounded-md border bg-muted/40" />
      <div className="h-28 animate-pulse rounded-xl border bg-muted/40" />
      <div className="h-28 animate-pulse rounded-xl border bg-muted/40" />
      <div className="h-28 animate-pulse rounded-xl border bg-muted/40" />
    </div>
  );
}

export default function HomePage() {
  const { hydrated } = useStore();
  // Do načtení localStorage se schválně nekreslí prázdný stav: hláška
  // „zatím tu nic není" nad plným zápisníkem vypadá jako ztráta dat.
  if (!hydrated) return <Skeleton />;
  return <NotesList />;
}
