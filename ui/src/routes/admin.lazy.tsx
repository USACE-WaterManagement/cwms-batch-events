import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminLoading, AdminPage } from "../features/admin/AdminPage";

export const Route = createLazyFileRoute("/admin")({
  component: () => <AdminPage tab="overview" />,
  pendingComponent: AdminLoading,
});
