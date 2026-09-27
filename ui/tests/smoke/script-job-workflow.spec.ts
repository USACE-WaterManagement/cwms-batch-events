import { configSection } from "../configSection";
import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { formatArguments } from "../../src/features/scripts-manager/commandArguments";

test("run from a script row, inspect its runs, and switch Groundwork tabs", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const script = {
    id: "script-env", configVersion: 3, name: "Inspect runner time zone", slug: "inspect-runner-time-zone",
    description: "Print the runner time zone with Bash. No CDA request is made.",
    office: "SWT", executionType: "command", runtime: "shell", repoPath: "bash",
    commandArgs: ["-lc", "printf 'TZ=%s\\n' \"$TZ\""], roles: [], active: true,
    jobRunners: ["runner-1"], createdTime: "2026-09-14T14:00:00Z", updatedTime: "2026-09-14T14:00:00Z",
  };
  const second = { ...script, id: "script-other", name: "Daily report", roles: ["CWMS Users"] };
  const inactive = { ...script, id: "script-inactive", name: "Paused diagnostics", active: false };
  const job = {
    id: "job-env", scriptId: script.id, scriptName: script.name, scriptSlug: script.slug,
    office: "SWT", username: "dev-user", repoPath: "bash", executionType: "command",
    runtime: "shell", commandArgs: script.commandArgs, jobStatus: "Completed",
    createdTime: "2026-09-14T15:00:00Z", runTime: "2026-09-14T15:00:01Z",
    endTime: "2026-09-14T15:00:03Z", jobRunnerId: "runner-1", externalJobId: "batch-example",
  };
  let posts = 0;
  let failSubmission = false;
  let failHistory = false;
  let finishSubmission!: () => void;
  const submissionReady = new Promise<void>(resolve => { finishSubmission = resolve; });
  const capture = async (name: string) => {
    if (!process.env.PR_SCREENSHOT_DIR) return;
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  };
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner-1", slug: "batch" } });
    if (path.endsWith("/repository-files")) return route.fulfill({ json: {repository:"USACE-WaterManagement/swt-wm-cwbi-jobs",ref:"cwbi-dev",paths:["bin/report.sh"]} });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script, second, inactive] });
    if (path.endsWith("/jobs") && route.request().method() === "POST") {
      posts++;
      expect(route.request().postDataJSON()).toEqual({ scriptId: script.id, runTrigger: "manual" });
      if (failSubmission) return route.fulfill({ status: 403, json: { detail: "Not authorized to run requested script" } });
      await submissionReady;
      return route.fulfill({ json: job });
    }
    if (path.endsWith("/jobs")) {
      if (failHistory) return route.fulfill({ status: 500, json: { detail: "Unavailable" } });
      return route.fulfill({ json: posts ? [job, { ...job, id: "job-other", scriptId: second.id, scriptName: second.name }] : [] });
    }
    if (path.endsWith("/jobs/job-env")) return route.fulfill({ json: job });
    if (path.endsWith("/jobs/job-other")) return route.fulfill({ json: { ...job, id: "job-other", scriptId: second.id, scriptName: second.name } });
    if (path.endsWith("/jobs/job-other/logs/page")) return route.fulfill({ json: { logs: "Daily report output", reset: true } });
    if (path.endsWith("/jobs/job-env/logs/page")) return route.fulfill({ json: { logs: "TZ=America/Chicago\n", reset: true } });
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  const row = page.locator("tr").filter({ hasText: script.name });
  await row.click();
  await expect(page.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await row.getByRole("button", { name: `Edit ${script.name}`, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(script.name);
  expect(posts).toBe(0);
  await row.getByText(script.name, { exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await capture("onboarding-scripts-manager");
  await row.getByRole("button", { name: "Runs", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Run history", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("No runs yet. Open Run job to submit this script.")).toBeVisible();
  await row.getByRole("button", { name: "Run job", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "Run job", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(posts).toBe(0);
  await expect(page.getByText("CWMS Users satisfies this job's execution role requirements.")).toBeVisible();
  await capture("onboarding-submit-job");
  await page.getByRole("button", { name: "Submit job", exact: true }).click();
  await expect(page.getByRole("button", { name: "Submitting...", exact: true })).toBeDisabled();
  await page.locator("tr").filter({ hasText: second.name }).click();
  finishSubmission();
  await expect(page.getByRole("tab", { name: "Run history", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: `Back to office runs for ${script.name}` })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Job output" })).toHaveValue("TZ=America/Chicago\n");
  await expect(page).toHaveURL(/\/events\/scripts-manager$/);
  expect(posts).toBe(1);
  await page.getByRole("button", { name: `Back to office runs for ${script.name}` }).click();
  await expect(page.getByRole("list").filter({ has: page.getByRole("button", { name: /Completed/ }) }).getByRole("button")).toHaveCount(1);
  await page.getByRole("tabpanel").getByRole("button", { name: /Completed/ }).click();
  await expect(page.getByRole("region", { name: "Selected job run" })).toContainText(job.id);
  await capture("onboarding-job-runs");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Run history", exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture("mobile-job-workspace");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("button", { name: `Back to office runs for ${script.name}` }).click();
  await page.getByRole("link", { name: "Open Job History", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Job History", exact: true })).toBeVisible();
  await capture("job-history");
  await page.getByRole("link", { name: "Job Manager", exact: true }).click();
  await page.locator("tr").filter({ hasText: second.name }).getByRole("button", { name: "Runs" }).click();
  await expect(page.getByRole("heading", { name: `Office runs for ${second.name}` })).toBeVisible();
  await page.getByRole("list", { name: "Script run history" }).getByRole("button").click();
  await expect(page.getByRole("region", { name: "Selected job run" })).toContainText("job-other");
  await expect(page.locator("tr").filter({ hasText: inactive.name }).getByRole("button", { name: "Run job", exact: true })).toBeDisabled();
  await row.getByRole("button", { name: "Run job", exact: true }).click();
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(script.name);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "New +", exact: true }).click();
  await configSection(page, "General");
  await page.getByLabel("Name", { exact: true }).fill(script.name);
  await configSection(page, "General");
  await page.getByLabel("Description", { exact: true }).fill(script.description);
  await configSection(page, "Command");
  await page.getByLabel("Source", { exact: true }).selectOption("command");
  await configSection(page, "Command");
  await page.getByLabel("Executable", { exact: true }).fill("bash");
  await configSection(page, "Command");
  await page.getByRole("button", { name: "Add arguments", exact: true }).click();
  await page.getByLabel("Arguments", { exact: true }).fill(formatArguments(script.commandArgs));
  await page.getByRole("button", { name: "Apply arguments", exact: true }).click();
  await configSection(page, "Access");
  await expect(page.getByRole("dialog").getByText("CWMS Users satisfies this job's execution role requirements.")).toBeVisible();
  await capture("onboarding-script-form");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  failSubmission = true;
  await row.getByRole("button", { name: "Run job", exact: true }).click();
  await page.getByRole("button", { name: "Submit job", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText("You do not have permission to perform this action.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit job", exact: true })).toBeEnabled();
  expect(posts).toBe(2);
  failHistory = true;
  await row.getByRole("button", { name: "Runs", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("heading", { name: "We couldn't load this page" })).toBeVisible();
  failHistory = false;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("button", { name: /Completed/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("tab", { name: "Run history", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("link", { name: "Open Job History", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Job History", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
