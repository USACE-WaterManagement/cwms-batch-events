import { HelpTip } from "../../shared/components/HelpTip";

const fields = [
  ["errorMessage", "Failure message reported for the job."],
  ["executionType", "Script runtime, such as python or shell."],
  ["externalJobId", "ID assigned by the external job runner."],
  ["jobId", "Batch Events job ID."],
  ["logs", "Available job log output."],
  ["office", "CWMS office that owns the script."],
  ["repoPath", "Script path inside its repository."],
  ["scriptId", "Script registry ID."],
  ["scriptName", "Human-readable script name."],
  ["scriptSlug", "Stable script identifier."],
  ["status", "Current job status."],
  ["username", "User who submitted the job."],
] as const;

export const TemplateVariablesHelp = () => (
  <HelpTip title="Available template tags">
    <p>
      Insert a case-sensitive field with double braces. Unsupported fields and
      filters are rejected when the template is saved.
    </p>
    <p className="mt-2 rounded bg-zinc-100 px-2 py-1 font-mono text-xs text-zinc-950">
      {"{{ scriptName }} failed in {{ office }}"}
    </p>
    <dl className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">
      {fields.map(([field, description]) => (
        <div key={field}>
          <dt className="font-mono text-xs font-semibold text-blue-800">
            {`{{ ${field} }}`}
          </dt>
          <dd>{description}</dd>
        </div>
      ))}
    </dl>
    <p className="mt-3">
      Allowed filters:{" "}
      <code className="text-xs">
        default, e, escape, lower, replace, title, trim, upper
      </code>
      .
    </p>
    <p className="mt-2 font-mono text-xs text-zinc-950">
      {"{{ status | upper }}"}
    </p>
  </HelpTip>
);
