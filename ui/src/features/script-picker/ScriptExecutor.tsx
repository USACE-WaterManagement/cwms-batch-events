import { ScriptRunJob } from "../scripts-manager/ScriptJobs";
import type { Script } from "../scripts-manager/types";

const ScriptExecutor = ({ script }: { script: Script }) => <ScriptRunJob script={script} />;

export default ScriptExecutor;
