"use client";

type HeroSku = {
  sku: string;
  reason: string;
  priority_score: number;
};

type HeroSkusSectionProps = {
  loading: boolean;
  skus: HeroSku[];
};

export function HeroSkusSection({ loading, skus }: HeroSkusSectionProps) {
  if (skus.length === 0 && !loading) {
    return null;
  }

  return (
    <section>
      <div className="section-head">
        <h2>
          <span style={{ color: "var(--strategy)" }}>●</span>
          Hero SKUs
          <span style={{ color: "var(--fg-2)", fontWeight: 400 }}>· del Strategy Agent</span>
        </h2>
        <span className="meta">
          {loading ? "analizando…" : `${skus.length} priorizados`}
        </span>
      </div>

      {loading && skus.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, fontSize: 13, color: "var(--fg-2)" }}>
            Analizando catálogo y brief…
          </p>
        </div>
      ) : (
        <div className="heros">
          {skus.map((h) => (
            <div className="hero-sku" key={h.sku}>
              <div className="row1">
                <span className="sku">{h.sku}</span>
                <span className="pill">{Math.round(h.priority_score * 100)}% priority</span>
              </div>
              <div className="name">{h.sku}</div>
              <div className="reason">{h.reason}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
