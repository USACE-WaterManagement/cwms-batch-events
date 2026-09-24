import { useState } from "react";
import { formatArguments, parseArguments } from "./commandArguments";
import { ArgumentValues } from "./CommandSummary";

function ArgumentsPreview({ id, error, args }: { id: string; error: string; args: string[] }) {
  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!args.length) return <div id={`${id}-preview`}><span className="text-sm text-gray-500">No arguments</span></div>;
  return <div id={`${id}-preview`}><ArgumentValues args={args} /></div>;
}

export function ArgumentsEditor({ id, label = "Arguments", initialArgs, disabled, onChange, onValidityChange }: {
  id: string; label?: string; initialArgs: string[]; disabled?: boolean;
  onChange: (args: string[]) => void; onValidityChange: (valid: boolean) => void;
}) {
  const [text, setText] = useState(() => formatArguments(initialArgs));
  let args: string[] = [];
  let error = "";
  try { args = parseArguments(text); } catch (failure) { error = (failure as Error).message; }
  return <div className="min-w-0 space-y-2">
    <textarea rows={2} id={id} aria-label={label} aria-describedby={`${id}-help ${id}-preview`} aria-invalid={!!error}
      value={text} disabled={disabled} className="block w-full rounded border border-gray-400 bg-white p-2 font-mono text-sm"
      placeholder={'--start-date 2026-09-01 --name "Daily report"'}
      onChange={event => {
        setText(event.target.value);
        try { onChange(parseArguments(event.target.value)); onValidityChange(true); }
        catch { onValidityChange(false); }
      }} />
    <p id={`${id}-help`} className="text-sm text-gray-600">Separate arguments with spaces. Quote a value containing spaces. Trailing spaces are ignored; use <code>''</code> for an empty argument.</p>
    <ArgumentsPreview id={id} error={error} args={args} />
  </div>;
}
