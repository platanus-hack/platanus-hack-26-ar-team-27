import { redirect } from "next/navigation";
import { readProjectIdFromCookie } from "@/lib/project";

export const dynamic = "force-dynamic";

export default function Home() {
  const projectId = readProjectIdFromCookie();
  if (projectId) {
    redirect(`/dashboard/${projectId}`);
  }
  redirect("/api/init");
}
