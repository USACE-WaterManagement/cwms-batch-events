import type { ReactNode } from "react";

import { scriptSections, fieldSections, type ScriptSection } from "./configurationSections";

export function ScriptSections({ active, onSelect, errors = {}, children }: {
  active: ScriptSection; onSelect: (section: ScriptSection) => void;
  errors?: Record<string, string>; children: ReactNode;
}) {
  return <div className="grid min-h-0 min-w-0 gap-4 @min-[28rem]/script-panel:grid-cols-[8rem_minmax(0,1fr)]">
    <nav aria-label="Configuration sections" className="flex flex-wrap content-start gap-1 @min-[28rem]/script-panel:flex-col">
      {scriptSections.map(section => {
        const invalid = Object.keys(errors).some(field => fieldSections[field] === section.id);
        let style = "border-transparent text-slate-600 hover:bg-slate-100";
        if (active === section.id) style = "border-blue-600 bg-blue-50 text-blue-900";
        if (invalid) style = "border-red-500 bg-red-50 text-red-800";
        return <button key={section.id} type="button" aria-pressed={active === section.id}
          onClick={() => onSelect(section.id)} className={`rounded-lg border px-3 py-2 text-left text-sm font-medium ${style}`}>
          {section.label}{invalid && <span className="ml-2" aria-label="Needs attention">!</span>}
        </button>;
      })}
    </nav>
    <div className="min-w-0">{children}</div>
  </div>;
}

export function ConfigSection({ id, active, children }: {
  id: ScriptSection; active: ScriptSection; children: ReactNode;
}) {
  return <section hidden={active !== id} aria-label={`${scriptSections.find(section => section.id === id)?.label} settings`}
    className="space-y-4">{children}</section>;
}
