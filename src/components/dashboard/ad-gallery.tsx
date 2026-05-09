"use client";

import { useMemo, useState } from "react";

type AdItem = {
  id: string;
  heroSku: string;
  variant_label: string;
  asset_url: string | null;
  copy_text: string | null;
};

type AdGalleryProps = {
  loading: boolean;
  ads: AdItem[];
};

function parseVariant(label: string): { style: string; framework: string } {
  const parts = label.split("·").map((s) => s.trim());
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return { style: parts[0], framework: parts[1] };
  }
  return { style: label, framework: "—" };
}

export function AdGallery({ loading, ads }: AdGalleryProps) {
  const skus = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    ads.forEach((ad) => {
      if (!seen.has(ad.heroSku)) {
        seen.add(ad.heroSku);
        out.push(ad.heroSku);
      }
    });
    return out;
  }, [ads]);

  const [activeSku, setActiveSku] = useState<string | null>(null);

  const visible = useMemo(() => {
    const focus = activeSku ?? skus[0] ?? null;
    if (focus === null) return ads;
    return ads.filter((ad) => ad.heroSku === focus);
  }, [ads, activeSku, skus]);

  if (ads.length === 0 && !loading) {
    return null;
  }

  return (
    <section>
      <div className="section-head">
        <h2>
          <span style={{ color: "var(--creative)" }}>●</span>
          Ad Gallery
          <span style={{ color: "var(--fg-2)", fontWeight: 400 }}>· 9 variantes por SKU</span>
        </h2>
        <span className="meta">
          {loading ? "generando…" : `${ads.length} creativos · 3 styles × 3 frameworks`}
        </span>
      </div>

      {skus.length > 0 ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {skus.map((sku) => {
            const isActive = (activeSku ?? skus[0]) === sku;
            const count = ads.filter((ad) => ad.heroSku === sku).length;
            return (
              <button
                key={sku}
                type="button"
                onClick={() => setActiveSku(sku)}
                className="btn"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  padding: "6px 12px",
                  background: isActive ? "var(--strategy-soft)" : "var(--bg-2)",
                  color: isActive ? "var(--strategy)" : "var(--fg-1)",
                  borderColor: isActive ? "var(--strategy-line)" : "var(--line)",
                }}
              >
                {sku} · {count}
              </button>
            );
          })}
        </div>
      ) : null}

      {loading && ads.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, fontSize: 13, color: "var(--fg-2)" }}>
            Generando creativos…
          </p>
        </div>
      ) : (
        <div className="ad-grid">
          {visible.map((ad, i) => {
            const { style, framework } = parseVariant(ad.variant_label);
            return (
              <article className="ad" key={ad.id}>
                <div className="ad-img">
                  {ad.asset_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ad.asset_url} alt={ad.variant_label} loading="lazy" />
                  ) : (
                    <div className="placeholder">
                      {style}
                      <small>product shot · {framework}</small>
                    </div>
                  )}
                  <div className="ad-tags">
                    <span className="ad-tag">{style}</span>
                    <span className="ad-tag framework">{framework}</span>
                  </div>
                </div>
                <div className="ad-body">
                  <div className="cap">
                    {ad.heroSku} · variant {i + 1} / {visible.length}
                  </div>
                  <div className="copy">{ad.copy_text ?? "Copy pendiente"}</div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
