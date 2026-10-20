import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminLoading, AdminPage } from "../features/admin/AdminPage";

export const Route = createLazyFileRoute("/admin_/rate-limits")({
  component: () => <AdminPage tab="rate-limits" />,
  pendingComponent: AdminLoading,
});
