import { createFileRoute } from "@tanstack/react-router";
import ScriptPicker from "../features/script-picker/ScriptPicker";

export const Route = createFileRoute("/submit")({
  validateSearch: (search: Record<string, unknown>): { office?: string; scriptId?: string } => ({
    office: typeof search.office === "string" ? search.office : undefined,
    scriptId: typeof search.scriptId === "string" ? search.scriptId : undefined,
  }),
  component: ScriptPicker,
});
