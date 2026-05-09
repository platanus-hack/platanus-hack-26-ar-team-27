"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type DmPanelProps = {
  initialMessage: string;
  followUpMessage: string;
};

export function DmPanel({ initialMessage, followUpMessage }: DmPanelProps) {
  const [tab, setTab] = useState<"initial" | "follow_up">("initial");
  const text = tab === "initial" ? initialMessage : followUpMessage;

  return (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("initial")}
          className={tab === "initial" ? "text-cyan-200" : "text-slate-400"}
        >
          Initial
        </button>
        <button
          type="button"
          onClick={() => setTab("follow_up")}
          className={tab === "follow_up" ? "text-cyan-200" : "text-slate-400"}
        >
          Follow-up
        </button>
      </div>
      <p className="text-sm text-slate-200">{text}</p>
      {tab === "follow_up" ? (
        <p className="text-xs text-slate-500">Enviar 3-5 dias despues del initial si no responde.</p>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
        }}
      >
        Copiar
      </Button>
    </div>
  );
}
