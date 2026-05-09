"use client";
import type { DomainPurchaseResult } from "@/lib/types";

interface DomainCandidate {
  domain: string;
  price: number;
  status: string;
  chosen: boolean;
  reason?: string;
}

interface DomainVisProps {
  candidates: DomainCandidate[];
  evaluatedCount: number;
}

export default function DomainVis({ candidates, evaluatedCount }: DomainVisProps) {
  const visible = candidates.slice(0, 5);
  const chosenSoFar = visible.slice(0, evaluatedCount).filter((c) => c.chosen).length;
  const totalCost = visible.slice(0, evaluatedCount).filter((c) => c.chosen).reduce((s, c) => s + c.price, 0);

  return (
    <div className="dom-vis">
      <div className="dom-cap-banner">
        <span className="kicker">budget cap</span>
        <span className="cap-meta">≤ <b>$4</b> / dominio · <b>2</b> dominios · evaluando {evaluatedCount}/{visible.length}</span>
      </div>
      <div className="dom-list">
        {visible.map((d, i) => {
          const evaluated = i < evaluatedCount;
          const ok = evaluated && d.chosen;
          const rejected = evaluated && !d.chosen;
          const overCap = d.price > 4 && d.status !== "premium";
          return (
            <div key={d.domain} className={`dom-row ${ok ? "is-ok" : ""} ${rejected ? "is-rejected" : ""} ${d.status === "premium" ? "is-premium" : ""}`}>
              <span className="status-ico">
                {!evaluated ? <span className="pending">···</span> :
                  ok ? <span className="ok">✓</span> :
                    <span className="x">✕</span>}
              </span>
              <span className="dom-name">{d.domain}</span>
              <div className="dom-meta">
                {d.status === "premium" ? (
                  <span className="tag-premium">premium · ${d.price.toLocaleString("en-US")}</span>
                ) : (
                  <>
                    <span className={`price ${overCap ? "over" : ""}`}>${d.price.toFixed(2)}</span>
                    <span className="dot-sep">·</span>
                    <span className="avail">disponible</span>
                  </>
                )}
              </div>
              <span className="dom-reason">{evaluated ? (ok ? "comprado" : d.reason ?? "") : ""}</span>
            </div>
          );
        })}
      </div>
      <div className="dom-summary">
        <span><b>{chosenSoFar}</b>/2 dominios comprados</span>
        <span className="dot-sep">·</span>
        <span>total <b>${totalCost.toFixed(2)}</b></span>
      </div>
    </div>
  );
}
