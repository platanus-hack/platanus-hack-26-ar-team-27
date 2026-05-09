"use client";
import { AGENT_ICONS, AGENT_LABELS, AGENT_LIST, type AgentName } from "./AgentIcons";

interface PhaseRibbonProps {
  activeIdx: number;
  doneIdx: number;
}

export default function PhaseRibbon({ activeIdx, doneIdx }: PhaseRibbonProps) {
  return (
    <div className="ribbon">
      {AGENT_LIST.map((agent, i) => {
        const state = i < doneIdx ? "done" : i === activeIdx ? "active" : "idle";
        const Icon = AGENT_ICONS[agent];
        return (
          <div
            key={agent}
            className={`ribbon-step agent-${agent} ${state === "done" ? "is-done" : ""} ${state === "active" ? "is-active" : ""}`}
          >
            <span className="step-n">0{i + 1}</span>
            <span className="step-name">{AGENT_LABELS[agent]}</span>
            {state === "active" && <span className="pulse" />}
            <span className="step-meta">
              {state === "done" ? "✓" : state === "active" ? "live" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
