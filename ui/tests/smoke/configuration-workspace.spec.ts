import { test, expect, type Page } from "@playwright/test";
import { configSection } from "../configSection";

const original = {
  id: "versioned-report", name: "District report", slug: "district-report", office: "SWT",
  description: "A daily report", configVersion: 3, repoPath: "python/report.py",
  executionType: "github_file", runtime: "python", commandMode: "arguments", commandArgs: ["two words", ""],
  roles: [], active: true, jobRunners: ["runner-1"], scheduleType: "manual", scheduleEnabled: false,
  scheduleTimezone: "UTC", createdTime: "2026-01-01T00:00:00Z", updatedTime: "2026-01-01T00:00:00Z",
};
async function open(page: Page) {
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  await page.getByText(original.name, { exact: true }).click();
}

test("explicit upgrade shows progress, recoverable failure, success, and stays upgraded", async ({ page }) => {
  let script = { ...original };
  let attempts = 0;
  let jobs = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner-1" } });
    if (path.endsWith("/upgrade")) {
      attempts++;
      if (attempts === 1) { await gate; return route.fulfill({ status: 503, json: { detail: "unavailable" } }); }
      script = { ...script, configVersion: 4 };
      return route.fulfill({ json: script });
    }
    if (path.endsWith("/jobs") && route.request().method() === "POST") jobs++;
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script] });
    return route.fulfill({ json: [] });
  });
  await open(page);
  await configSection(page, "Upgrade");
  await page.getByRole("button", { name: "Upgrade configuration", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saving configuration version 4" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upgrading configuration…", exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("The server could not complete the request");
  expect(attempts).toBe(1);
  await page.getByRole("button", { name: "Upgrade configuration", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuration upgraded successfully" })).toBeVisible();
  await configSection(page, "Upgrade");
  await expect(page.getByRole("note")).toContainText("version 4");
  expect(jobs).toBe(0);
  expect(script.commandArgs).toEqual(original.commandArgs);
  await page.getByRole("tab", { name: "Run job", exact: true }).click();
  await page.getByRole("tab", { name: "Details", exact: true }).click();
  await expect(page.getByRole("button", { name: "Upgrade configuration", exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  await page.getByText(original.name, { exact: true }).click();
  await configSection(page, "Upgrade");
  await expect(page.getByRole("note")).toContainText("version 4");
  await expect(page.getByRole("button", { name: "Upgrade configuration", exact: true })).toHaveCount(0);
});

test("save marks missing fields and sections, keeps drafts, and preserves an old version", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  let script = { ...original };
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner-1" } });
    if (route.request().method() === "PUT") {
      writes.push(route.request().postDataJSON());
      script = { ...script, ...route.request().postDataJSON() };
      return route.fulfill({ json: script });
    }
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script] });
    return route.fulfill({ json: [] });
  });
  await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await configSection(page, "Name");
  await page.getByLabel("Name", { exact: true }).fill("");
  await configSection(page, "Command");
  await page.getByLabel("GitHub Repo Path", { exact: true }).fill("");
  await configSection(page, "Schedule");
  await expect(page.getByLabel("Schedule", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("[data-invalid-details=true]")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  const nav = page.getByRole("navigation", { name: "Configuration sections" });
  await expect(nav.getByRole("button", { name: /Name/ }).getByLabel("Needs attention")).toBeVisible();
  await expect(nav.getByRole("button", { name: /Command/ }).getByLabel("Needs attention")).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByLabel("Name", { exact: true }).fill("Corrected report");
  await nav.getByRole("button", { name: /Command/ }).click();
  await expect(page.getByLabel("GitHub Repo Path", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("GitHub Repo Path", { exact: true }).fill("python/report.py");
  await configSection(page, "Name");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Corrected report");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  expect(writes[0].configVersion).toBe(3);
  expect(writes[0].commandArgs).toEqual(original.commandArgs);
});

test("invalid cron and timezone highlight Schedule and recover without losing values", async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner-1" } });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [{ ...original, configVersion: 4 }] });
    return route.fulfill({ json: [] });
  });
  await open(page);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await configSection(page, "Schedule");
  await page.getByLabel("Schedule", { exact: true }).selectOption("cron");
  await page.getByLabel("Cron expression", { exact: true }).fill("99 8 * * *");
  await page.getByLabel("Timezone", { exact: true }).fill("Not/AZone");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Cron expression", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Cron expression", { exact: true }).fill("0 8 * * 1-5");
  await page.getByLabel("Timezone", { exact: true }).fill("America/Chicago");
  await expect(page.getByRole("tab", { name: "Details", exact: true })).toBeVisible();
  await expect(page.locator("[data-invalid-details=false]")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const sectionPicker = page.getByRole("combobox", { name: "Configuration section" });
  await expect(sectionPicker).toHaveValue("schedule");
  await expect(page.getByRole("navigation", { name: "Configuration sections" }).getByRole("button")).toHaveCount(0);
  await sectionPicker.selectOption("general");
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await sectionPicker.selectOption("schedule");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel("Cron expression", { exact: true })).toHaveValue("0 8 * * 1-5");
});
