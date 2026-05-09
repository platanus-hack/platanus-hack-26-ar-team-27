"use client";

import { motion } from "framer-motion";

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

export function AdGallery({ loading, ads }: AdGalleryProps) {
  const grouped = ads.reduce<Record<string, AdItem[]>>((acc, ad) => {
    const bucket = acc[ad.heroSku] ?? [];
    bucket.push(ad);
    acc[ad.heroSku] = bucket;
    return acc;
  }, {});

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
      <h2 className="text-base font-semibold text-slate-100">Ad Gallery</h2>
      {loading ? <p className="mt-2 text-sm text-slate-400">Generando creativos...</p> : null}
      {!loading && ads.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">Aun no hay anuncios listos. Van a aparecer en vivo a medida que se generen.</p>
      ) : null}

      <div className="mt-4 space-y-5">
        {Object.entries(grouped).map(([heroSku, items]) => (
          <div key={heroSku}>
            <p className="mb-2 text-sm text-fuchsia-200">{heroSku}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((ad) => (
                <motion.article
                  key={ad.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
                >
                  <div className="aspect-[4/5] overflow-hidden rounded-md bg-slate-800">
                    {ad.asset_url ? (
                      <img
                        src={ad.asset_url}
                        alt={ad.variant_label}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-xs text-slate-500">Sin imagen</div>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{ad.variant_label}</p>
                  <p className="mt-1 line-clamp-3 text-sm text-slate-200">{ad.copy_text ?? "Copy pendiente"}</p>
                </motion.article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
