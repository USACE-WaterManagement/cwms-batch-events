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
    <label className="block space-y-1 text-sm font-semibold" htmlFor="command-placeholder">
      Custom run hint
      <input id="command-placeholder" value={value.commandPlaceholder ?? ""} onChange={event => onChange({ ...value, commandPlaceholder: event.target.value || null })}
        placeholder='--start-date 2026-09-01 --name "Daily report"' className="mt-1 block w-full rounded border border-gray-400 p-2 font-normal" />
      <span className="block font-normal text-gray-600">Shown as guidance when someone enters arguments for one run. It does not change saved arguments.</span>
    </label>
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
