"use client";

import { useState } from "react";
import { LaunchAnimation } from "@/components/launch/launch-animation";

type LaunchDemoProps = {
  creativeIds: string[];
};

export function LaunchDemo({ creativeIds }: LaunchDemoProps) {
  const [open, setOpen] = useState(false);
  const enabled = creativeIds.length > 0;

  return (
    <>
      <button
        type="button"
        className="btn btn-launch"
        onClick={() => setOpen(true)}
        disabled={!enabled}
        title={enabled ? undefined : "Generá creativos primero"}
      >
        Launch to Meta
        <span className="kbd">⌘ ↵</span>
      </button>

      {open ? (
        <LaunchAnimation
          projectCreativeIds={creativeIds}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
