/**
 * GET /api/init — bootstrap del proyecto.
 *
 * `cookies().set()` no puede llamarse desde un Server Component (Next.js 14
 * lo prohíbe). Por eso el root page redirige acá: este Route Handler crea el
 * proyecto si no existe, setea la cookie y redirige al dashboard.
 */
import { redirect } from "next/navigation";
import { getOrCreateProjectId } from "@/lib/project";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projectId = await getOrCreateProjectId();
  redirect(`/dashboard/${projectId}`);
}
