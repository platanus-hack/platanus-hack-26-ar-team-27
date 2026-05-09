import { DashboardShell } from "@/components/dashboard/dashboard-shell";

type DashboardPageProps = {
  params: {
    projectId: string;
  };
};

export default function DashboardPage({ params }: DashboardPageProps) {
  return <DashboardShell projectId={params.projectId} />;
}
