import { useId, type ReactNode } from "react";
import { MdTune, MdTerminal, MdShield, MdSchedule, MdUpgrade, MdErrorOutline } from "react-icons/md";
import { FieldHelp } from "./FieldHelp";

import { scriptSections, fieldSections, type ScriptSection } from "./configurationSections";

const sectionIcons = { general: MdTune, source: MdTerminal, access: MdShield, schedule: MdSchedule, upgrade: MdUpgrade };
const descriptions = {
  general: "Name your script and describe what it does.",
  source: "Choose where the script comes from and how it runs.",
  access: "Choose who can run this script in your office.",
  schedule: "Choose when this script runs and the timezone it follows.",
  upgrade: "Review and upgrade this script's configuration version.",
};

export function ScriptSections({ active, onSelect, errors = {}, children }: {
  active: ScriptSection; onSelect: (section: ScriptSection) => void;
  errors?: Record<string, string>; children: ReactNode;
}) {
  const selectId = useId();
  const invalidSections = scriptSections.filter(section => Object.keys(errors).some(field => fieldSections[field] === section.id));
  return <div className="grid min-h-0 min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white @min-[30rem]/script-panel:grid-cols-[10rem_minmax(0,1fr)]">
    <nav aria-label="Configuration sections" className="select-none border-b border-slate-200 bg-slate-50 p-2 @min-[30rem]/script-panel:border-b-0 @min-[30rem]/script-panel:border-r @min-[30rem]/script-panel:p-0">
      <div className="@min-[30rem]/script-panel:hidden">
        <label htmlFor={selectId} className="mb-2 block text-xs font-semibold text-slate-600">Configuration section</label>
        <select id={selectId} value={active} onChange={event => onSelect(event.target.value as ScriptSection)}
          aria-describedby={invalidSections.length ? `${selectId}-errors` : undefined}
          className={`min-h-12 w-full cursor-pointer rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 ${invalidSections.length ? "border-red-500" : "border-slate-300"}`}>
          {scriptSections.map(section => <option key={section.id} value={section.id}>
            {section.label}{invalidSections.includes(section) ? " — needs attention" : ""}
          </option>)}
        </select>
        {invalidSections.length > 0 && <p id={`${selectId}-errors`} className="mt-2 text-sm text-red-800">Needs attention: {invalidSections.map(section => section.label).join(", ")}.</p>}
      </div>
      <div className="hidden @min-[30rem]/script-panel:block">
      <div className="grid grid-cols-1">
      {scriptSections.map(section => {
        const invalid = Object.keys(errors).some(field => fieldSections[field] === section.id);
        const Icon = sectionIcons[section.id];
        let style = "border-transparent text-slate-700 hover:bg-blue-50";
        if (active === section.id) style = "border-blue-700 bg-white text-blue-800";
        if (invalid) style = "border-red-500 bg-red-50 text-red-800";
        return <button key={section.id} type="button" aria-pressed={active === section.id}
          onClick={() => onSelect(section.id)} className={`flex min-h-12 cursor-pointer items-center gap-2 border-l-4 px-3 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 ${style}`}>
          <Icon aria-hidden className="size-5 shrink-0" />
          <span className="min-w-0 flex-1 [overflow-wrap:normal]">{section.label}</span>
          {invalid && <MdErrorOutline className="size-4 shrink-0" aria-label="Needs attention" />}
        </button>;
      })}
      </div>
      </div>
    </nav>
    <div className="h-[clamp(32rem,65dvh,44rem)] min-w-0 overflow-y-auto overscroll-contain bg-white p-4 [scrollbar-gutter:stable]">
      <header className="mb-5 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2"><h3 className="text-lg font-semibold text-slate-900">{scriptSections.find(section => section.id === active)?.label}</h3>
          {active === "access" && <FieldHelp label="Execution roles">Optional. Leave empty to allow users with office access to run this script. Selected roles restrict execution to users with at least one of those roles in this office.</FieldHelp>}
        </div>
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
