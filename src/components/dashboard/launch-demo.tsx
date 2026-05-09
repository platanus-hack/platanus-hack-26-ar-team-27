"use client";

import { useState } from "react";
import { LaunchAnimation } from "@/components/launch/launch-animation";
import { Button } from "@/components/ui/button";

type LaunchDemoProps = {
  creativeIds: string[];
};

export function LaunchDemo({ creativeIds }: LaunchDemoProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={creativeIds.length === 0}
        title={creativeIds.length === 0 ? "Genera creativos primero" : undefined}
      >
        Launch to Meta
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-6">
          <div className="w-full max-w-xl space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-100">Launch mock</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-slate-400 transition hover:text-slate-100"
              >
                Cerrar
              </button>
            </div>

            <LaunchAnimation
              projectCreativeIds={creativeIds}
              onCancelled={() => setOpen(false)}
              onCompleted={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
