"use client";
import { useEffect, useRef } from "react";
import type { LogEntry, ArtifactEntry } from "@/lib/types";

interface ConsoleProps {
  logs: LogEntry[];
  artifacts: ArtifactEntry[];
}

export default function Console({ logs, artifacts }: ConsoleProps) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.length]);

  return (
    <div className="console">
      <div className="console-main">
        <div className="console-head">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="kicker">event log</span>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--research)", boxShadow: "0 0 8px var(--research)" }} />
          </div>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--fg-3)" }}>
            {logs.length} eventos
          </span>
        </div>
        <div className="log" ref={logRef}>
          {logs.map((l, i) => (
            <div className="row" key={i}>
              <span className="ts">{l.ts}</span>
              <span className={`tag-${l.agent}`}>[{l.agent}]</span>
              <span className={l.ok ? "ok" : "mute"}>{l.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="console-side">
        <span className="kicker">artifacts</span>
        {artifacts.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--mono)" }}>
            aún sin outputs
          </div>
        )}
        {artifacts.slice(-10).map((a, i) => (
          <div className="artifact-pill" key={i}>
            <span className={`dot ${a.code}`} />
            <span className="ref">{a.ref}</span>
            <span className="when">{a.when}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
