import { createFileRoute } from "@tanstack/react-router";
import { AdminPage } from "./admin";

export const Route = createFileRoute("/admin_/rate-limits")({
  component: () => <AdminPage tab="rate-limits" />,
});
