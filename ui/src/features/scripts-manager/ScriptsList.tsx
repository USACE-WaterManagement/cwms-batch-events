import {
  Table,
  TableBody,
  TableRow,
  TableHead,
  TableHeader,
  TableCell,
} from "@usace/groundwork";
import { FaCircleCheck, FaCircleXmark } from "react-icons/fa6";
import type { Script } from "../scripts-manager/types";

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
  selectScript: (scriptId: string) => void;
  selectedScriptId?: string;
}

export const ScriptsList = ({
  scripts,
  selectScript,
  selectedScriptId,
}: ScriptsListProps) => {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Name</TableHeader>
          <TableHeader>Type</TableHeader>
          <TableHeader>Path</TableHeader>
          <TableHeader>Active</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {scripts
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((script) => (
            <TableRow
              key={script.id}
              tabIndex={0}
              aria-selected={script.id === selectedScriptId}
              onClick={() => selectScript(script.id)}
              onKeyDown={(event: React.KeyboardEvent<HTMLTableRowElement>) => {
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
              </TableCell>
              <TableCell>{script.executionType}</TableCell>
              <TableCell>{script.repoPath}</TableCell>
              <TableCell>
                <ActiveIcon isActive={script.active} />
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
};
