"use client";
import type { TargetCompanyOut } from "@/lib/types";

interface ResearchVisProps {
  companies: TargetCompanyOut[];
  doneCount: number;
  busyIdx: number;
}

export default function ResearchVis({ companies, doneCount, busyIdx }: ResearchVisProps) {
  const visible = companies.slice(0, 6);

  return (
    <div className="res-vis">
      <div className="res-grid">
        {visible.map((c, i) => {
          const isDone = i < doneCount;
          const isBusy = i === busyIdx && !isDone;
          const initials = c.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
          return (
            <div key={c.name} className={`res-card ${isDone ? "is-done" : ""} ${isBusy ? "is-busy" : ""}`}>
              <div className="res-card-head">
                <div className="company-mark">{initials}</div>
                <div className="company-info">
                  <div className="cn">{c.name}</div>
                  <div className="cm">{c.industry ?? "—"} · {c.size_range ?? "—"} · {c.location ?? "—"}</div>
                </div>
                <div className="score-pill">
                  {isDone ? <><b>{Math.round((c.score ?? 0) * 100)}</b><span>fit</span></> :
                    isBusy ? <span className="dots">···</span> :
                    <span className="dots">—</span>}
                </div>
              </div>
              <div className="rationale">
                {isDone ? c.score_rationale ?? "" : isBusy ? "leyendo LinkedIn, GitHub, posts recientes…" : ""}
              </div>
            </div>
          );
        })}
      </div>
      <div className="res-summary">
        <span><b>{doneCount}</b>/{visible.length} empresas investigadas</span>
        <span className="dot-sep">·</span>
        <span>{busyIdx >= 0 && busyIdx < visible.length ? `redactando draft · #${busyIdx + 1}` : "—"}</span>
      </div>
    </div>
  );
}
