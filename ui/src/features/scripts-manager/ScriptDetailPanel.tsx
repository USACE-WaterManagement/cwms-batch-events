import { ScriptForm } from "./ScriptForm";
import { ScriptView } from "./ScriptView";
import type { Script, ScriptFormData } from "../scripts-manager/types";
import { MdTouchApp } from "react-icons/md";

interface ScriptDetailPanelProps {
  office: string;
  mode: "view" | "edit";
  script?: Script;
  isPending: boolean;
  mutationError: Error | null;
  onDelete: (scriptId: string) => void;
  onEdit: () => void;
  onSave: (data: ScriptFormData) => void | Promise<void>;
  onValidationChange?: (invalid: boolean) => void;
  onCancelEdit: () => void;
}

export const ScriptDetailPanel = ({
  office,
  mode,
  script,
  isPending,
  mutationError,
  onDelete,
  onEdit,
  onSave,
  onCancelEdit,
  onValidationChange,
}: ScriptDetailPanelProps) => {
  if (mode === "view" && !script) {
    return <section className="flex min-h-48 min-w-0 flex-col items-center justify-center gap-3 self-start rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center">
      <MdTouchApp aria-hidden className="text-4xl text-gray-400" />
      <h3 className="text-lg font-semibold text-gray-900">Select a script</h3>
      <p className="max-w-sm text-sm text-gray-600">Choose a script to view its details, run a job, or review office runs. Use <strong>New +</strong> to create another script.</p>
    </section>;
  }
  let innerComponent;

  if (mode === "view") {
    innerComponent = <ScriptView script={script} onEdit={onEdit} />;
  } else if (mode === "edit") {
    innerComponent = (
      <ScriptForm
        key={`${office}:${script?.id ?? "new"}`}
        office={office}
        script={script}
        isPending={isPending}
        mutationError={mutationError}
        onDelete={onDelete}
        onSave={onSave}
        onCancelEdit={onCancelEdit}
        onValidationChange={onValidationChange}
      />
    );
  }

  return (
    <section className="min-w-0 pt-4">{innerComponent}</section>
  );
};
