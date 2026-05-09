"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { StreamArtifact } from "@/components/agents/use-agent-stream";

type ArtifactEmergenceProps = {
  artifacts: StreamArtifact[];
};

export function ArtifactEmergence({ artifacts }: ArtifactEmergenceProps) {
  return (
    <div className="pointer-events-none relative h-14 overflow-hidden">
      <AnimatePresence>
        {artifacts.slice(-4).map((artifact) => (
          <motion.div
            key={artifact.id}
            layoutId={`artifact-${artifact.id}`}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full border border-slate-700 bg-slate-900/90 px-3 py-1 text-xs text-slate-200"
          >
            {`${artifact.type}: ${artifact.ref}`}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
