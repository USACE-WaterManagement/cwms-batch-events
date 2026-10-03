import { createFileRoute } from "@tanstack/react-router";
import { NotificationsManager } from "../features/notifications-manager/NotificationsManager";

export const Route = createFileRoute("/setup")({
  validateSearch: (search: Record<string, unknown>) => ({
    office: typeof search.office === "string" ? search.office : undefined,
    template: typeof search.template === "string" ? search.template : undefined,
  }),
  component: NotificationsManager,
});
