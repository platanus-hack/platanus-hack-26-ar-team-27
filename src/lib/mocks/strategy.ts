/**
 * Mock canned del Strategy Agent — usado cuando MOCK_STRATEGY=true.
 * Track 2 reemplaza con la implementación real.
 */

import type { StrategyOutput } from "@/lib/db/schema";

export const MOCK_STRATEGY_OUTPUT: StrategyOutput = {
  hero_skus: [
    {
      sku: "LUNA-009",
      reason: "Slip dress en satén con margen alto y stock limitado — urgente moverlo",
      priority_score: 0.92,
    },
    {
      sku: "LUNA-001",
      reason: "Vestido midi de lino se alinea con tono slow fashion mediterráneo del brief",
      priority_score: 0.88,
    },
    {
      sku: "LUNA-007",
      reason: "Mom jeans vintage, alto ticket y demanda evergreen en 25-35",
      priority_score: 0.81,
    },
  ],
  icp: {
    age_range: "25-35",
    gender: "female",
    interests: ["slow fashion", "minimalismo", "diseño consciente", "viajes"],
    behaviors: [
      "compra ropa premium pero ocasional",
      "busca calidad sobre cantidad",
      "sigue creadoras de lifestyle",
    ],
    pain_points: [
      "fast fashion los aburre",
      "buscan piezas atemporales",
    ],
    confidence: "medium",
  },
  detected_categories: ["fashion"],
  reasoning:
    "Catálogo claramente femenino con énfasis en lino, satén y siluetas fluidas. Brief refuerza tono mediterráneo. Hero SKUs priorizados por mix de margen, stock y fit con voz.",
};
