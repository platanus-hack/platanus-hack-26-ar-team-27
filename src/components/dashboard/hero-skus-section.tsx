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
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 className="text-base font-semibold text-slate-100">Hero SKUs</h2>
      {loading ? <p className="mt-2 text-sm text-slate-400">Analizando catalogo...</p> : null}
      {!loading && skus.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">Aun no priorizamos SKUs. En cuanto termine Strategy los vas a ver aca.</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {skus.map((item) => (
          <span
            key={item.sku}
            className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs text-violet-200"
            title={item.reason}
          >
            {`${item.sku} · ${Math.round(item.priority_score * 100)}%`}
          </span>
        ))}
      </div>
    </section>
  );
}
