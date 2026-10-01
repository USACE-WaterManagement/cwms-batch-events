import { ScriptRunJob } from "../scripts-manager/ScriptJobs";
import type { Script } from "../scripts-manager/types";
import { useNavigate } from "@tanstack/react-router";
import useAdminOffices from "../scripts-manager/useAdminOffices";

const ScriptExecutor = ({ script }: { script: Script }) => {
  const navigate = useNavigate();
  const admins = useAdminOffices();
  const edit = () => { void navigate({ to: "/scripts-manager", search: { office: script.office, scriptId: script.id, edit: true } }); };
  return <ScriptRunJob script={script} onEdit={admins.data?.includes(script.office) ? edit : undefined} />;
};

export default ScriptExecutor;
