import { commandPreview } from "./commandArguments";
import type { ScriptFormData } from "./types";

export function ArgumentValues({ args }: { args: string[] }) {
  return <ol className="flex flex-wrap gap-2" aria-label="Parsed arguments">
    {args.map((argument, index) => <li key={index} className="flex min-w-0 max-w-full items-stretch overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <span className="flex items-center border-r border-slate-200 bg-slate-100 px-2 text-xs font-semibold text-slate-500">{index + 1}: </span>
      <code className="whitespace-pre-wrap break-all px-3 py-2 text-sm text-slate-800">{JSON.stringify(argument)}</code>
    </li>)}
  </ol>;
}

export function CommandSummary({ value }: { value: ScriptFormData }) {
  const shell = value.commandMode === "shell";
  return <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded-full bg-slate-200 px-2.5 py-1 font-semibold text-slate-700">{shell ? "Bash command" : `${value.commandArgs?.length ?? 0} arguments`}</span>
      <span className="text-slate-500">{shell ? "Shell operators enabled" : "Values passed directly to the executable"}</span>
    </div>
    {!shell && <ArgumentValues args={value.commandArgs ?? []} />}
    <div className="rounded-lg bg-slate-900 p-4 text-slate-100">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Command preview</p>
      <pre className="whitespace-pre-wrap break-all font-mono text-sm">{shell ? value.shellCommand : commandPreview(value)}</pre>
    </div>
  </div>;
}
