import { createFileRoute } from "@tanstack/react-router";
import DependenciesPage from "../features/dependencies/DependenciesPage";

export const Route = createFileRoute("/dependencies")({
  validateSearch: (search: Record<string, unknown>) => ({
    office: typeof search.office === "string" ? search.office.toUpperCase() : undefined,
  }),
  component: DependenciesPage,
});
