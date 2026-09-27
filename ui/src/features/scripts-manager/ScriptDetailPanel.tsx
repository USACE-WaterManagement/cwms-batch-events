import { ScriptForm } from "./ScriptForm";
import { ScriptView } from "./ScriptView";
import type { Script, ScriptFormData } from "../scripts-manager/types";

interface ScriptDetailPanelProps {
  office: string;
  mode: "view" | "edit";
  script?: Script;
  isPending: boolean;
  mutationError: Error | null;
  onDelete: (scriptId: string) => void;
  onEdit: () => void;
  onSave: (data: ScriptFormData) => void;
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
}: ScriptDetailPanelProps) => {
  let innerComponent;

  if (mode === "view") {
    innerComponent = <ScriptView script={script} onEdit={onEdit} />;
  } else if (mode === "edit") {
    innerComponent = (
      <ScriptForm
        office={office}
        key={script?.id ?? "new"}
        script={script}
        isPending={isPending}
        mutationError={mutationError}
        onDelete={onDelete}
        onSave={onSave}
        onCancelEdit={onCancelEdit}
      />
    );
  }

  return (
    <section className="p-4 rounded-xl bg-gray-200">{innerComponent}</section>
  );
};
