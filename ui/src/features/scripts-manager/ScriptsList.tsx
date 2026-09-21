import { FaCircleCheck, FaCircleXmark, FaPlay, FaClockRotateLeft } from "react-icons/fa6";
import type { Script } from "../scripts-manager/types";
import type { JobDetails } from "../jobs-list/useJobDetails";
import { ScriptRunIndicators } from "./ScriptRunIndicators";
import { LatestScriptRun } from "./LatestScriptRun";

interface ActiveIconProps {
  isActive: boolean;
}

const ActiveIcon = ({ isActive }: ActiveIconProps) => {
  if (isActive) {
    return <FaCircleCheck className="text-green-500" />;
  } else {
    return <FaCircleXmark className="text-red-500" />;
  }
};

interface ScriptsListProps {
  scripts: Script[];
  selectScript: (scriptId: string, tab?: number, jobId?: string) => void;
  jobs: JobDetails[];
  jobsUpdatedAt: number;
  selectedScriptId?: string;
  runHistoryState: "loading" | "unavailable" | "ready";
}

export const ScriptsList = ({
  scripts,
  selectScript,
  selectedScriptId,
  jobs,
  jobsUpdatedAt,
  runHistoryState,
}: ScriptsListProps) => {
  return (
    <div className="scripts-list-scroll @container/scripts max-h-[65vh] overflow-y-auto overscroll-contain">
    <table className="block w-full" aria-label="Scripts">
      <thead className="sr-only"><tr><th scope="col">Script</th><th scope="col">Actions</th></tr></thead>
      <tbody className="block w-full">
        {[...scripts]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((script) => (
            <tr
              key={script.id}
              tabIndex={0}
              aria-selected={script.id === selectedScriptId}
              onClick={() => selectScript(script.id)}
              onKeyDown={(event: React.KeyboardEvent<HTMLTableRowElement>) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectScript(script.id);
                }
              }}
              className={`grid cursor-pointer grid-cols-1 gap-4 border-b border-l-4 border-gray-200 p-4 last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 @min-[34rem]/scripts:grid-cols-[minmax(0,1fr)_auto] ${
                script.id === selectedScriptId
                  ? "border-l-blue-600 bg-blue-50"
                  : "border-l-transparent hover:bg-gray-50"
              }`}
            >
              <td className="block min-w-0 [overflow-wrap:anywhere]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">{script.name}</span>
                  <ScriptRunIndicators
                    jobs={jobs.filter(job => job.scriptId === script.id && job.office === script.office)}
                    scriptName={script.name}
                    onSelectRun={jobId => selectScript(script.id, 2, jobId)} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                  <span>{script.runtime}</span>
                  <span className="inline-flex items-center gap-1"><ActiveIcon isActive={script.active} />{script.active ? "Active" : "Inactive"}</span>
                </div>
                <span className="mt-1 block text-sm text-gray-600">{script.repoPath}</span>
                <LatestScriptRun
                  jobs={jobs.filter(job => job.scriptId === script.id && job.office === script.office)}
                  now={jobsUpdatedAt} scriptName={script.name} state={runHistoryState}
                  onSelectRun={jobId => selectScript(script.id, 2, jobId)} />
              </td>
              <td className="block self-center">
                <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                  <button type="button" disabled={!script.active} onClick={() => selectScript(script.id, 1)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none">
                    <FaPlay aria-hidden="true" className="text-xs" /> Run script
                  </button>
                  <button type="button" onClick={() => selectScript(script.id, 2)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
                    <FaClockRotateLeft aria-hidden="true" /> Runs
                  </button>
                </div>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
    </div>
  );
};
