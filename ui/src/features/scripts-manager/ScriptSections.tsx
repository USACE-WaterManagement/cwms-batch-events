import type { ReactNode } from "react";
import { MdTune, MdFolderOpen, MdTerminal, MdShield, MdSchedule, MdChevronRight, MdErrorOutline } from "react-icons/md";

import { scriptSections, fieldSections, type ScriptSection } from "./configurationSections";

const sectionIcons = { general: MdTune, source: MdFolderOpen, arguments: MdTerminal, access: MdShield, schedule: MdSchedule };
const descriptions = {
  general: "Name your script and describe what it does.",
  source: "Choose where the script comes from and how it runs.",
  arguments: "Review the command and the values passed to your script.",
  access: "Choose who can run this script in your office.",
  schedule: "Choose when this script runs and the timezone it follows.",
};

export function ScriptSections({ active, onSelect, errors = {}, children }: {
  active: ScriptSection; onSelect: (section: ScriptSection) => void;
  errors?: Record<string, string>; children: ReactNode;
}) {
  return <div className="grid min-h-0 min-w-0 items-start gap-4 @min-[30rem]/script-panel:grid-cols-[10rem_minmax(0,1fr)]">
    <nav aria-label="Configuration sections" className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
      <p className="px-2 pb-3 pt-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">Configuration</p>
      <div className="grid grid-cols-2 gap-2 @min-[30rem]/script-panel:grid-cols-1">
      {scriptSections.map(section => {
        const invalid = Object.keys(errors).some(field => fieldSections[field] === section.id);
        const Icon = sectionIcons[section.id];
        let style = "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-blue-300 hover:bg-blue-50";
        if (active === section.id) style = "border-blue-700 bg-blue-700 text-white shadow-sm hover:bg-blue-800";
        if (invalid) style = "border-red-500 bg-red-50 text-red-800";
        return <button key={section.id} type="button" aria-pressed={active === section.id}
          onClick={() => onSelect(section.id)} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${style}`}>
          <Icon aria-hidden className="size-5 shrink-0" />
          <span className="min-w-0 flex-1">{section.label}</span>
          {invalid && <MdErrorOutline className="size-4 shrink-0" aria-label="Needs attention" />}
          {!invalid && active === section.id && <MdChevronRight aria-hidden className="size-4 shrink-0" />}
        </button>;
      })}
      </div>
    </nav>
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-5 border-b border-slate-100 pb-4">
        <h3 className="text-lg font-semibold text-slate-900">{scriptSections.find(section => section.id === active)?.label}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{descriptions[active]}</p>
      </header>
      {children}
    </div>
  </div>;
}

export function ConfigSection({ id, active, children }: {
  id: ScriptSection; active: ScriptSection; children: ReactNode;
}) {
  return <section hidden={active !== id} aria-label={`${scriptSections.find(section => section.id === id)?.label} settings`}
    className="space-y-4">{children}</section>;
}
