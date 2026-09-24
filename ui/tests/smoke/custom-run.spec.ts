import { expect, test } from "@playwright/test";
import { configSection } from "../configSection";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test("custom arguments apply once, cancel restores defaults, and role help explains access", async ({ page }) => {
  const script = {
    id: "report-script", configVersion: 3, name: "Daily reservoir report", slug: "daily-reservoir-report",
    description: "Build a report for the selected date range.", office: "SWT",
    executionType: "github_file", runtime: "python", repoPath: "python/daily_report.py",
    commandArgs: ["--start-date", "today", "--end-date", "today"], roles: [], active: true,
    createdTime: "2026-09-23T12:00:00Z", updatedTime: "2026-09-23T12:00:00Z", jobRunners: [],
  };
  const submissions: unknown[] = [];
  const scriptWrites: string[] = [];
  let reject = true;
  const job = { id: "custom-job", scriptId: script.id, scriptName: script.name, office: "SWT",
    username: "dev-user", repoPath: script.repoPath, jobStatus: "Completed", createdTime: script.createdTime };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/scripts") && route.request().method() !== "GET") scriptWrites.push(path);
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/repository-files")) return route.fulfill({ json: { repository: "USACE-WaterManagement/swt-wm-cwbi-jobs", ref: "cwbi-dev", paths: [script.repoPath] } });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script, { ...script, id: "legacy", name: "Legacy report", configVersion: 1 }] });
    if (path.endsWith("/scripts/catalog")) return route.fulfill({ json: [script] });
    if (path.endsWith("/jobs") && route.request().method() === "POST") {
      submissions.push(route.request().postDataJSON());
      return route.fulfill(reject ? { status: 403, json: { detail: "Not authorized" } } : { json: job });
    }
    if (path.endsWith("/jobs/custom-job")) return route.fulfill({ json: job });
    if (path.endsWith("/logs/page")) return route.fulfill({ json: { logs: "Report complete.", available: true } });
    return route.fulfill({ json: [] });
  });
  const capture = async (name: string) => {
    if (!process.env.PR_SCREENSHOT_DIR) return;
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  };
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  const row = page.locator("tr").filter({ hasText: script.name });
  await row.getByRole("button", { name: `Edit ${script.name}`, exact: true }).click();
  await configSection(page, "Access");
  await expect(page.getByText(/Adding a role restricts who can run this script/)).toBeVisible();
  await page.getByRole("combobox", { name: "Role to add" }).selectOption({ label: "CWMS Users" });
  await page.getByRole("button", { name: "Add role", exact: true }).click();
  await capture("execution-role-help");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await row.getByRole("button", { name: "Run script", exact: true }).click();
  await page.getByRole("button", { name: "Custom run", exact: true }).click();
  await expect(page.getByLabel("Arguments for this run")).toHaveValue(script.commandArgs.join(" "));
  await page.getByLabel("Arguments for this run").fill("--start-date 2026-09-01 --end-date 2026-09-07   ");
  await capture("custom-run");
  await page.getByRole("button", { name: "Submit custom run", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Job could not" })).toBeVisible();
  await expect(page.getByLabel("Arguments for this run")).toHaveValue(/2026-09-01/);
  expect(submissions[0]).toEqual({ runTrigger: "manual", scriptId: script.id, commandArgs: ["--start-date", "2026-09-01", "--end-date", "2026-09-07"] });
  await page.getByRole("button", { name: "Cancel custom run" }).click();
  await page.getByRole("button", { name: "Custom run", exact: true }).click();
  await expect(page.getByLabel("Arguments for this run")).toHaveValue(script.commandArgs.join(" "));
  await page.getByLabel("Arguments for this run").fill("");
  reject = false;
  await page.getByRole("button", { name: "Submit custom run", exact: true }).click();
  await expect(page.getByLabel("Job output")).toHaveValue("Report complete.");
  expect(submissions[1]).toEqual({ runTrigger: "manual", scriptId: script.id, commandArgs: [] });
  await row.getByRole("button", { name: "Run script", exact: true }).click();
  await page.getByRole("button", { name: "Submit job", exact: true }).click();
  await expect.poll(() => submissions.length).toBe(3);
  expect(submissions[2]).toEqual({ runTrigger: "manual", scriptId: script.id });
  expect(scriptWrites).toEqual([]);
  await page.locator("tr").filter({ hasText: "Legacy report" }).getByRole("button", { name: "Run script", exact: true }).click();
  await expect(page.getByRole("button", { name: "Custom run", exact: true })).toBeDisabled();
  await expect(page.getByText(/must use Upgrade configuration in Details first/)).toBeVisible();
  await page.getByRole("link", { name: "Submit Job", exact: true }).click();
  await page.getByRole("combobox").last().selectOption(script.id);
  await page.getByRole("button", { name: "Custom run", exact: true }).click();
  await page.getByLabel("Arguments for this run").fill('"two words" \'\' --literal');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Submit custom run", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/custom-job$/);
  expect(submissions[3]).toEqual({ runTrigger: "manual", scriptId: script.id, commandArgs: ["two words", "", "--literal"] });
  expect(scriptWrites).toEqual([]);
});
