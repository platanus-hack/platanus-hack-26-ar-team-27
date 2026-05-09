/**
 * "Tools" del Strategy Agent (D2).
 *
 * En el MVP no las exponemos como tool-calling al LLM; las invocamos antes
 * de armar el prompt y emitimos los eventos `tool.called` / `tool.result`
 * al bus para que la UI muestre el flujo real (D6, D15).
 */
import { getSql } from "@/lib/db/pg";

export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: number | null;
  cost: number | null;
  stock: number | null;
  category: string | null;
  primary_image_url: string | null;
};

export type BriefRow = {
  id: string;
  brand_name: string | null;
  tone_of_voice: string | null;
  target_description: string | null;
  values: string[] | null;
  do_not_say: string[] | null;
  raw_text: string;
};

export async function getProducts(projectId: string): Promise<ProductRow[]> {
  const sql = getSql();
  const rows = await sql<ProductRow[]>`
    select id, sku, name, description, price::float8 as price, cost::float8 as cost,
           stock, category, primary_image_url
    from products
    where project_id = ${projectId}
    order by created_at asc
  `;
  return rows as unknown as ProductRow[];
}

export async function getBrandBrief(
  projectId: string,
): Promise<BriefRow | null> {
  const sql = getSql();
  const rows = await sql<BriefRow[]>`
    select id, brand_name, tone_of_voice, target_description, values, do_not_say, raw_text
    from brand_briefs
    where project_id = ${projectId}
    order by created_at desc
    limit 1
  `;
  return (rows[0] as unknown as BriefRow) ?? null;
}
