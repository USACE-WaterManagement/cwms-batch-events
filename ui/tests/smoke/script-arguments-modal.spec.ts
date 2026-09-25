import { configSection } from "../configSection";
import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test("Scripts Manager argument modal applies drafts, cancels edits, without upgrading on ordinary edits", async ({ page }) => {
  const script = { id: "daily-report", name: "Daily reservoir report", slug: "daily-reservoir-report", configVersion: 2,
    description: "Build the daily reservoir report for the selected date and office.", office: "SWT", active: true, roles: [],
    repoPath: "python/daily_report.py", executionType: "github_file", runtime: "python", commandArgs: [],
    createdTime: "2026-09-23T12:00:00Z", updatedTime: "2026-09-23T12:00:00Z" };
  let writes = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") writes++;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script, { ...script, id: "weekly", name: "Weekly summary", configVersion: 3 }] });
    if (path.endsWith("/repository-files")) return route.fulfill({ json: { repository: "USACE-WaterManagement/swt-wm-cwbi-jobs", ref: "cwbi-dev", paths: [script.repoPath] } });
    return route.fulfill({ json: [] });
  });
  const capture = async (name: string) => {
    if (!process.env.PR_SCREENSHOT_DIR) return;
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, `${name}.png`), fullPage: name === "scripts-manager-rendered-arguments" });
  };
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  const row = page.locator("tr").filter({ hasText: script.name });
  await row.getByRole("button", { name: `Edit ${script.name}`, exact: true }).click();
  await configSection(page, "Command");
  await page.getByRole("button", { name: "Add arguments", exact: true }).click();
  await page.getByLabel("Arguments", { exact: true }).fill('--date 2026-09-23 --office SWT --name "Daily reservoir report"   ');
  await expect(page.getByRole("dialog", { name: "Edit arguments and command" }).getByLabel("Parsed arguments")).toContainText('6: "Daily reservoir report"');
  await capture("scripts-manager-arguments-modal");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Apply arguments", exact: true }).click();
  await page.setViewportSize({ width: 1600, height: 1100 });
  await expect(page.getByRole("region", { name: "Script arguments" })).toContainText("6 arguments");
  await capture("scripts-manager-rendered-arguments");
  await configSection(page, "Command");
  await page.getByRole("button", { name: "Edit arguments", exact: true }).click();
  await page.getByLabel("Arguments", { exact: true }).fill('"unfinished');
  await expect(page.getByRole("button", { name: "Apply arguments", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.getByRole("region", { name: "Script arguments" })).toContainText("6 arguments");
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await configSection(page, "Upgrade config");
  await expect(page.getByRole("button", { name: "Upgrade configuration", exact: true })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("configuration version 2");
  expect(writes).toBe(0);
});
