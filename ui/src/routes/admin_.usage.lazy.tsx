import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminLoading, AdminPage } from "../features/admin/AdminPage";

export const Route = createLazyFileRoute("/admin_/usage")({
  component: () => <AdminPage tab="usage" />,
  pendingComponent: AdminLoading,
});
