import { Button } from "@usace/groundwork";
import { FaCircleCheck, FaCircleXmark } from "react-icons/fa6";
import type { Script } from "../scripts-manager/types";
import type { JobDetails } from "../jobs-list/useJobDetails";
import { ScriptRunIndicators } from "./ScriptRunIndicators";

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
}

export const ScriptsList = ({
  scripts,
  selectScript,
  selectedScriptId,
  jobs,
  jobsUpdatedAt,
}: ScriptsListProps) => {
  return (
    <div className="scripts-list-scroll">
    <table className="scripts-list" aria-label="Scripts">
      <thead className="sr-only"><tr><th scope="col">Script</th><th scope="col">Actions</th></tr></thead>
      <tbody>
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
              className={
                script.id === selectedScriptId
                  ? "cursor-pointer bg-blue-100"
                  : "cursor-pointer hover:bg-gray-100"
              }
            >
              <td className="min-w-0 [overflow-wrap:anywhere]">
                <span className="font-bold">{script.name}</span>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                  <span>{script.runtime}</span>
                  <span className="inline-flex items-center gap-1"><ActiveIcon isActive={script.active} />{script.active ? "Active" : "Inactive"}</span>
                </div>
                <span className="mt-1 block text-sm text-gray-600">{script.repoPath}</span>
                <ScriptRunIndicators
                  jobs={jobs.filter(job => job.scriptId === script.id && job.office === script.office)}
                  now={jobsUpdatedAt} scriptName={script.name}
                  onSelectRun={jobId => selectScript(script.id, 2, jobId)} />
              </td>
              <td className="script-row-actions">
                <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                  <Button size="sm" disabled={!script.active} onClick={() => selectScript(script.id, 1)}>Run job</Button>
                  <Button size="sm" onClick={() => selectScript(script.id, 2)}>View job runs</Button>
                </div>
              </td>
            </tr>
          ))}
      </tbody>
    </table>
    </div>
  );
};
