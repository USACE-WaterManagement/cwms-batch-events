import {
  Table,
  TableBody,
  TableRow,
  TableHead,
  TableHeader,
  TableCell,
  Button,
} from "@usace/groundwork";
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
    <Table
      overflow
      stickyHeader
      overflowHeight="min-h-48 max-h-72 overscroll-contain xl:max-h-[65vh]"
    >
      <TableHead>
        <TableRow>
          <TableHeader>Name</TableHeader>
          <TableHeader>Type</TableHeader>
          <TableHeader>Path</TableHeader>
          <TableHeader>Active</TableHeader>
          <TableHeader>Actions</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {[...scripts]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((script) => (
            <TableRow
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
              <TableCell>
                <span className="font-bold">{script.name}</span>
                <ScriptRunIndicators
                  jobs={jobs.filter(job => job.scriptId === script.id && job.office === script.office)}
                  now={jobsUpdatedAt} scriptName={script.name}
                  onSelectRun={jobId => selectScript(script.id, 2, jobId)} />
              </TableCell>
              <TableCell>
                {script.executionType === "command"
                  ? script.repoPath
                  : script.runtime}
              </TableCell>
              <TableCell><span className="block max-w-32 truncate sm:max-w-64" title={script.repoPath}>{script.repoPath}</span></TableCell>
              <TableCell>
                <ActiveIcon isActive={script.active} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                  <Button size="sm" disabled={!script.active} onClick={() => selectScript(script.id, 1)}>Run job</Button>
                  <Button size="sm" onClick={() => selectScript(script.id, 2)}>View job runs</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
};
