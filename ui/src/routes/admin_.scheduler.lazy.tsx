import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminLoading, AdminPage } from "../features/admin/AdminPage";

export const Route = createLazyFileRoute("/admin_/scheduler")({
  component: () => <AdminPage tab="scheduler" />,
  pendingComponent: AdminLoading,
});
