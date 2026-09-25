import { createFileRoute, Link } from "@tanstack/react-router";
import { H1, H2 } from "@usace/groundwork";

export const Route = createFileRoute("/help_/script-versions")({ component: ScriptVersions });

function ScriptVersions() {
  return <article className="mx-auto w-full min-w-0 max-w-3xl space-y-5 leading-relaxed [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_pre]:rounded [&_pre]:bg-gray-100 [&_pre]:p-4">
    <H1>Script versions and commands</H1>
    <p>A script version describes how Batch Events runs a saved registration. It is separate from the application version and the version of your Python file or Java program.</p>
    <H2>Version 4: district schedules and timezones</H2>
    <p>Version 4 keeps version 3 command behavior and adds API-owned scheduling. Choose an hourly minute or five-field cron expression and an IANA timezone in Details → Schedule. Schedules start disabled. Save and enable only after removing any equivalent external trigger.</p>
    <H2>Version 3: arguments or a Bash command</H2>
    <p><strong>Executable with arguments</strong> passes each argument directly to one program. Enter arguments on one line, with quotes around values containing spaces. Trailing spaces outside quotes are ignored. The numbered preview shows exactly what each argument contains.</p>
    <pre><code>{'--start-date 2026-09-01 --name "Daily report"'}</code></pre>
    <p>Use <code>''</code> for an empty argument. Quote intentional leading or trailing spaces. Variables and shell operators are not evaluated in this mode.</p>
    <p><strong>Bash command</strong> runs the complete command through <code>bash -c</code>. Include the executable or script invocation. Use <code>&amp;&amp;</code> to continue after success, <code>||</code> to run a fallback after failure, and pipes or redirection as needed.</p>
    <pre><code>{'python /jobs/python/report.py --date 2026-09-01 && echo "Report complete" || echo "Report failed"'}</code></pre>
    <p>Bash mode replaces the executable and argument fields. The selected source still controls setup: District GitHub repository checks out the repository and downloads enabled artifacts; Installed command skips that setup. The exit status of the complete Bash command determines job success. A successful fallback can therefore make the job successful.</p>
    <H2>Upgrading existing jobs</H2>
    <p>Open Details in <Link to="/scripts-manager" className="text-blue-700 underline">Job Manager</Link> and choose <strong>Upgrade configuration</strong>. A progress indicator shows the request, followed by a success or error box. Upgrading saves version 4 without submitting a job or enabling a schedule. Ordinary runs and edits keep their saved version and do not prompt for upgrades.</p>
    <p>Versions 2 and 3 retain their exact argument arrays or Bash command. Version 1 keeps its effective Python command and clears fields historical execution ignored. Ambiguous legacy paths require administrator review and are not changed automatically. Previously submitted jobs and queued messages retain their original version.</p>
    <p>Details is divided into General, Source &amp; path, Arguments &amp; command, Access, and Schedule. Save highlights sections and fields needing correction. Apply arguments changes the form; Save persists it. Custom-run overrides are never saved to the script.</p>
    <H2>Why did &amp;&amp; produce an argument error?</H2>
    <p>In argument mode, operators passed as arguments are received by the first program. They do not start another command. Select Bash command when you want a command chain. Do not add quotes around the entire command unless your shell syntax requires them.</p>
  </article>;
}
