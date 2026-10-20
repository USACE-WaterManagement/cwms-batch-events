import { createFileRoute } from "@tanstack/react-router";
import { ScriptsManager } from "../features/scripts-manager/ScriptsManager";

export const Route = createFileRoute("/scripts-manager")({
  validateSearch: (search: Record<string, unknown>): { office?: string; scriptId?: string; jobId?: string; edit?: boolean } => ({
    office: typeof search.office === "string" ? search.office : undefined,
    scriptId: typeof search.scriptId === "string" ? search.scriptId : undefined,
    jobId: typeof search.jobId === "string" ? search.jobId : undefined,
    edit: search.edit === true ? true : undefined,
  }),
  component: ScriptsManager,
});
