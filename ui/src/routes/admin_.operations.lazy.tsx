import { createLazyFileRoute } from "@tanstack/react-router";
import { AdminLoading, AdminPage } from "../features/admin/AdminPage";

export const Route = createLazyFileRoute("/admin_/operations")({
  component: () => <AdminPage tab="operations" />,
  pendingComponent: AdminLoading,
});
