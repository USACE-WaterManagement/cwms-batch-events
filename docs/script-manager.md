# Run jobs in Scripts Manager

1. Sign in, open **Scripts Manager**, and select your office.
2. Select a script row to open **Details**. Use **Edit** to change and save its settings.
3. Select **Run job** at the end of the row to open that script's **Run job** tab.
4. Review the saved file or executable and arguments, then select **Submit job** once.
5. The new run opens in **Job runs**. Its status updates until it finishes, then output loads.
6. Use **View job runs** on a row to return to that script's runs. Select a run to inspect it;
   **Refresh** reloads the list. **Job History** shows shared runs across scripts in your offices.

The Groundwork tabs keep details, submission, and run output in the selected script's workspace.
Each row groups the script name, runtime, active state, and full path. Actions appear beside
that information when space permits and below it on smaller screens. The selected script
appears beside the list on wide screens and below it on narrower screens. Long paths and
run details wrap so the action buttons remain reachable without horizontal scrolling.

<details>
<summary>Wide-screen and phone layouts</summary>

On a wide screen, the script list and selected run share the workspace:

![Scripts Manager at 1366 pixels with long names and paths](../ui/public/about/scripts-manager-desktop.png)

On a phone, scroll the script list to choose a script, then scroll down to its tabs:

<img src="../ui/public/about/scripts-manager-mobile.png" alt="Scripts Manager at 390 pixels with stacked actions and run details" width="390" />

</details>

Script rows show a spinner for queued or running office jobs and a warning for the most recent
failure within the past 24 hours. Click either indicator to open that exact run in **Job runs**.
Running jobs also show spinners in the run list. The manager refreshes run status every five
seconds while visible, including when a different tab is selected. A read failure stops polling;
**Retry run status** resumes it. The indicators remain scoped to jobs in the selected office.

![Running and queued spinners alongside a clickable recent-failure warning](../ui/public/about/script-run-indicators.png)

Both history views share runs within the user's CWMS offices and show the submitter's readable
name. Manual and Scheduled badges identify recorded triggers; historical or unmarked runs
show Unknown. See [run attribution](job-logs.md#shared-run-attribution) for scheduler setup.
Existing `/events/jobs`
and `/events/jobs/{jobId}` links continue to work. **Submit Job** remains available for users
who can run scripts but do not have script administration access.

## Optional execution roles

New registrations start with no execution roles selected. An empty `roles` array means
no additional CDA execution role is required: the user's authenticated CDA profile must
still include the script's office. If roles are selected, at least one must match in that
office. Existing nonempty role lists keep their restrictions. Inactive scripts cannot run.
Catalog listing and job submission use the same checks, including direct API submissions.

This also makes existing registrations with empty role lists runnable by users with office
access. Script administration still requires Data Acquisition Mgr or Data Exchange Mgr.
Execution roles control who may submit a job; they do not give the running process CDA credentials.
Jobs that call CDA still need appropriate credentials in their execution environment.

## Bash without a CDA call

Register an **Installed command**, executable `bash`, with no roles selected. To inspect
the runner's time zone, enter these two arguments on separate lines:

```text
-lc
printf 'TZ=%s\n' "$TZ"
```

Save, choose **Run job**, and select **Submit job**. Read the output under **Job runs**.
The command uses the existing runner environment and does not make a CDA request.

## Screenshots

The in-app onboarding guide uses the maintained screenshots in `ui/public/about/`.
Capture updates with `PR_SCREENSHOT_DIR` set while running
`ui/tests/smoke/script-job-workflow.spec.ts`. Its API fixtures contain synthetic script
definitions and output; these images demonstrate the UI, not an AWS execution.
Keep PR-only screenshots outside the repository and copy only the intended documentation
images into `ui/public/about/`.

`ui/tests/smoke/script-responsive-layout.spec.ts` checks long names, paths, arguments,
and usernames at nine widths from 320 to 1920 pixels, plus 200% text size. It checks
the list and individual content boxes for overflow, verifies action-button bounds,
and exercises all three tabs. Set `PR_SCREENSHOT_DIR` to capture each layout.
