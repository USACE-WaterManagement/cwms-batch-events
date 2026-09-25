import { test, expect, type Page } from "@playwright/test";
import { configSection } from "../configSection";

const script = { id: "report", name: "Office report", office: "SWT", configVersion: 4,
  description: "", active: true, runtime: "python", executionType: "github_file",
  repoPath: "report.py", roles: [], commandArgs: [], commandMode: "arguments", shellCommand: null,
  jobRunners: ["runner"], scheduleType: "hourly", scheduleEnabled: true, scheduleMinute: 15,
  scheduleTimezone: "America/Chicago", createdTime: "2026-01-01T00:00:00Z", updatedTime: "2026-01-01T00:00:00Z" };

async function open(page: Page) {
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").first().selectOption("SWT");
  await page.getByText(script.name, { exact: true }).click();
}

test("source changes restore path drafts, preview no-argument commands, and keep the panel stable", async ({ page }) => {
  let saved = { ...script };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner" } });
    if (route.request().method() === "PUT") { saved = { ...saved, ...route.request().postDataJSON() }; return route.fulfill({ json: saved }); }
    if (path.endsWith("/scripts")) return route.fulfill({ json: [saved] });
    return route.fulfill({ json: [] });
  });
  await open(page);
  await configSection(page, "Command");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const before = await page.locator(".script-workspace-panel").boundingBox();
  await page.getByLabel("Source", { exact: true }).selectOption("command");
  await page.getByLabel("Executable", { exact: true }).fill("cwmscli");
  await expect(page.getByLabel("Script arguments").locator("pre")).toHaveText("cwmscli");
  const after = await page.locator(".script-workspace-panel").boundingBox();
  expect(after?.height).toBe(before?.height);
  await page.getByLabel("Source", { exact: true }).selectOption("github_file");
  await expect(page.getByLabel("GitHub Repo Path", { exact: true })).toHaveValue("report.py");
  await page.getByLabel("Runtime", { exact: true }).selectOption("java");
  await expect(page.getByLabel("Script arguments").locator("pre")).toHaveText("java -jar /jobs/report.py");
  await page.getByLabel("Source", { exact: true }).selectOption("command");
  await expect(page.getByLabel("Executable", { exact: true })).toHaveValue("cwmscli");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Script saved." })).toBeVisible();
  expect(saved.executionType).toBe("command");
  expect(saved.commandArgs).toEqual([]);
  expect(saved.repoPath).toBe("cwmscli");
});

test("schedule timing uses the saved timezone and edit mode labels it as saved", async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script] });
    if (path.endsWith("/schedule-status")) return route.fulfill({ json: {
      nextRunAt: "2026-09-25T13:15:00Z", lastFinishedAt: "2026-09-24T13:16:00Z", lastRunStatus: "Completed", lastRunTrigger: "scheduled",
    } });
    return route.fulfill({ json: [] });
  });
  await open(page);
  await configSection(page, "Schedule");
  await expect(page.getByText("9/25/2026, 8:15:00 AM", { exact: true })).toBeVisible();
  await expect(page.getByText("9/24/2026, 8:16:00 AM · Completed · scheduled", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByText(/Based on the saved schedule/)).toBeVisible();
});

test("office filters support multiple accessible offices and apply before pagination", async ({ page }) => {
  const requested: string[][] = [];
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/users/me/offices")) return route.fulfill({ json: ["SWT", "SWF"] });
    if (url.pathname.endsWith("/jobs")) {
      requested.push(url.searchParams.getAll("office"));
      return route.fulfill({ json: [], headers: { "X-Total-Count": "0" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/jobs");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await expect(page.getByText("Click a job to open it", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "SWT", exact: true }).check();
  await expect.poll(() => requested.at(-1)).toEqual(["SWT"]);
  await page.getByRole("checkbox", { name: "SWF", exact: true }).check();
  await expect.poll(() => requested.at(-1)).toEqual(["SWF", "SWT"]);
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  await expect(page.getByText("No jobs found for this selection.")).toBeVisible();
  await page.getByRole("button", { name: "All offices", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "SWT", exact: true })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "SWF", exact: true })).not.toBeChecked();
});
