import { useState } from "react";
import { Button } from "@usace/groundwork";
import { CommandEditor } from "./CommandEditor";
import { CommandModal } from "./CommandModal";
import { CommandSummary } from "./CommandSummary";
import type { ScriptFormData } from "./types";

function editButtonLabel(value: ScriptFormData): string {
  if (value.commandMode === "shell") return "Edit command";
  if (value.commandArgs?.length) return "Edit arguments";
  return "Add arguments";
}

export function CommandSettings({ value, onChange, disabled }: {
  value: ScriptFormData; onChange: (value: ScriptFormData) => void; disabled?: boolean;
}) {
  const [draft, setDraft] = useState<ScriptFormData | null>(null);
  const [valid, setValid] = useState(true);
  return <section className="space-y-4" aria-label="Script arguments">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold text-slate-900">Arguments</h3><p className="text-sm text-slate-500">Arguments are optional. This is the complete command that will run.</p></div>
      <Button type="button" disabled={disabled} onClick={() => { setDraft({ ...value }); setValid(true); }}>
        {editButtonLabel(value)}
      </Button>
    </div>
    <CommandSummary value={value} />
    <CommandModal opened={draft !== null} onClose={() => setDraft(null)} title="Edit arguments and command" footer={<>
      <button type="button" className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-200" onClick={() => setDraft(null)}>Cancel</button>
      <Button type="button" disabled={!valid} onClick={() => { if (draft && valid) { onChange(draft); setDraft(null); } }}>Apply arguments</Button>
    </>}>
      <p className="text-sm text-slate-600">Changes are applied to this form. Save the script when you are ready.</p>
      {draft && <CommandEditor value={draft} onChange={setDraft} onValidityChange={setValid} />}
    </CommandModal>
  </section>;
}
