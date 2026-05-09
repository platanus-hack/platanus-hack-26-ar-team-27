import { redirect } from "next/navigation";
import { getOrCreateProjectId } from "@/lib/project";

export default async function Home() {
  const projectId = await getOrCreateProjectId();
  redirect(`/dashboard/${projectId}`);
}
