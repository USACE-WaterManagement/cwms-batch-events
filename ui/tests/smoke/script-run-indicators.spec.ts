import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const now = new Date("2026-09-14T18:00:00Z");
const script = {
  id: "diagnostics", name: "Runner diagnostics", slug: "runner-diagnostics", office: "SWT",
  description: "Inspect the runner time zone.", repoPath: "bash", executionType: "command",
  runtime: "shell", commandArgs: ["-lc", "printf 'TZ=%s\\n' \"$TZ\""], active: true,
  roles: [], jobRunners: ["runner"], createdTime: now.toISOString(), updatedTime: now.toISOString(),
};
const job = {
  id: "running", scriptId: script.id, scriptName: script.name, scriptSlug: script.slug,
  office: "SWT", username: "dev-user", jobStatus: "Running", repoPath: "bash",
  executionType: "command", runtime: "shell", commandArgs: script.commandArgs,
  createdTime: "2026-09-14T17:30:00Z", runTime: "2026-09-14T17:31:00Z",
  endTime: null as string | null, jobRunnerId: "runner", externalJobId: null,
};

async function openManager(page: Page) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
}

test("modern script actions keep submission explicit and open the latest run", async ({ page }) => {
  await page.clock.install({ time: now });
  let submissions = 0;
  const latest = { ...job, id: "latest-completed", jobStatus: "Completed",
    createdTime: "2026-09-14T17:45:00Z", endTime: "2026-09-14T17:52:00Z" };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "POST") submissions++;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner", slug: "batch" } });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script] });
    if (path.endsWith("/jobs")) return route.fulfill({ json: [job, latest] });
    if (path.endsWith("/jobs/latest-completed")) return route.fulfill({ json: latest });
    if (path.endsWith("/logs/page")) return route.fulfill({ json: { logs: "Latest run output" } });
    return route.fulfill({ json: [] });
  });
  await openManager(page);
  const row = page.getByRole("row").filter({ hasText: script.name });
  const summary = row.getByRole("button", { name: `View latest run for ${script.name}` });
  await expect(summary).toHaveText("Latest run: Completed · 8 minutes ago");
  await row.getByRole("button", { name: "Run job", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("tab", { name: "Run job", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Submit job", exact: true })).toBeVisible();
  expect(submissions).toBe(0);
  await row.getByRole("button", { name: "Runs", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Run history", exact: true })).toHaveAttribute("aria-selected", "true");
  await summary.click();
  await expect(page.getByRole("region", { name: "Selected job run" })).toContainText("latest-completed");
  await expect(page.getByLabel("Job output")).toHaveValue("Latest run output");
  await expect(row).toHaveAttribute("aria-selected", "true");
  expect(submissions).toBe(0);
  if (process.env.PR_SCREENSHOT_DIR) {
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.getByRole("region", { name: "SWT jobs list" }).screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, "script-actions-desktop.png") });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await row.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.PR_SCREENSHOT_DIR) {
    await row.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, "script-actions-mobile.png") });
  }
});

test("selected run shares Starting and Running status with the run list without extra requests", async ({ page }) => {
  await page.clock.install({ time: now });
  const current = { ...job, jobStatus: "Pending", batchStatus: "STARTING" };
  let listRequests = 0;
  let logRequests = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner", slug: "batch" } });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script] });
    if (path.endsWith("/jobs")) {
      listRequests++;
      return route.fulfill({ json: [{ ...job, jobStatus: "Pending" }] });
    }
    if (path.endsWith("/jobs/running")) return route.fulfill({ json: current });
    if (path.endsWith("/logs/page")) {
      logRequests++;
      return route.fulfill({ json: { logs: "", available: true, supportsLive: true } });
    }
    return route.fulfill({ json: [] });
  });
  await openManager(page);
  const indicator = page.getByRole("button", { name: `View active run for ${script.name}`, exact: true });
  await indicator.click();
  const selected = page.getByRole("region", { name: "Selected job run" });
  const runButton = page.getByRole("tabpanel").getByRole("button", { name: /Starting/ });
  await expect(runButton).toBeVisible();
  await expect(indicator).toContainText("Starting");
  await expect(selected.getByText("Starting", { exact: true })).toHaveCount(2);
  await expect(selected.getByText("Pending", { exact: true })).toHaveCount(0);
  await expect(selected.getByText(/AWS Batch:/)).toHaveCount(0);
  await expect(page.getByLabel("Job output")).toHaveValue(/Container is starting/);
  // Existing manager load plus the run-list mount refresh; synchronizing
  // detail data itself must not request the list again.
  expect(listRequests).toBe(2);
  expect(logRequests).toBe(0);
  if (process.env.PR_SCREENSHOT_DIR) {
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await selected.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, "logs-starting-desktop.png") });
  }
  current.jobStatus = "Running";
  current.batchStatus = "RUNNING";
  await page.clock.runFor(5100);
  await expect(page.getByRole("tabpanel").getByRole("button", { name: /Running/ })).toBeVisible();
  await expect(page.getByLabel("Job output")).toHaveValue(/Waiting for the first log lines/);
  expect(listRequests).toBe(3);
  expect(logRequests).toBe(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Update interval").scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.PR_SCREENSHOT_DIR) {
    await page.getByRole("region", { name: "Job logs", exact: true }).screenshot({
      path: join(process.env.PR_SCREENSHOT_DIR, "logs-running-mobile.png"),
    });
  }
});


test("latest run controls the badge and default history selection", async ({ page }) => {
  await page.clock.install({ time: now });
  const oldFailure = { ...job, id: "old-failure", jobStatus: "Failed", createdTime: "2026-09-12T12:00:00Z", endTime: "2026-09-14T17:59:00Z" };
  const latest = { ...job, id: "latest", jobStatus: "Completed", endTime: "2026-09-14T17:40:00Z" };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner", slug: "batch" } });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script] });
    if (path.endsWith("/jobs")) return route.fulfill({ json: [oldFailure, latest] });
    if (path.endsWith(`/jobs/${latest.id}`)) return route.fulfill({ json: latest });
    if (path.endsWith("/jobs/old-failure")) return route.fulfill({ json: oldFailure });
    if (path.endsWith("/logs/page")) return route.fulfill({ json: { logs: "Run output" } });
    return route.fulfill({ json: [] });
  });
  await openManager(page);
  const row = page.getByRole("row").filter({ hasText: script.name });
  const warning = row.getByRole("button", { name: /View latest failed run/ });
  await expect(warning).toHaveCount(0);
  await expect(row).toContainText("Latest run: Completed");
  await row.getByRole("button", { name: "Runs", exact: true }).click();
  const selected = page.getByRole("region", { name: "Selected job run" });
  await expect(selected).toContainText("latest");
  await page.getByRole("tabpanel").getByRole("button", { name: /Failed/ }).click();
  await expect(selected).toContainText("old-failure");
  await expect(warning).toHaveCount(0);
  await row.getByRole("button", { name: "Runs", exact: true }).click();
  await expect(selected).toContainText("latest");
  // A new submission supersedes the selected run only in default latest mode.
  latest.id = "newest";
  latest.jobStatus = "Pending";
  await page.clock.runFor(5100);
  await expect(row.getByRole("button", { name: /View active run/ })).toContainText("Queued");
  await expect(selected).toContainText("newest");
});

test("latest failure remains visible beyond 24 hours", async ({ page }) => {
  await page.clock.install({ time: now });
  const latest = { ...job, id: "old-latest", jobStatus: "Failed", createdTime: "2026-09-10T12:00:00Z", endTime: "2026-09-10T13:00:00Z" };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner", slug: "batch" } });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script] });
    if (path.endsWith("/jobs")) return route.fulfill({ json: [latest] });
    if (path.endsWith("/jobs/old-latest")) return route.fulfill({ json: latest });
    if (path.endsWith("/logs/page")) return route.fulfill({ json: { logs: "Failure output" } });
    return route.fulfill({ json: [] });
  });
  await openManager(page);
  await page.getByRole("button", { name: /View latest failed run/ }).click();
  await expect(page.getByRole("region", { name: "Selected job run" })).toContainText("old-latest");
});

test("latest indicators refresh and stop polling on read failure", async ({ page }) => {
  await page.clock.install({ time: now });
  let status = "Pending";
  let failed = false;
  let requests = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner", slug: "batch" } });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script] });
    if (path.endsWith("/jobs")) {
      requests++;
      if (failed) return route.fulfill({ status: 500, json: { detail: "Unavailable" } });
      return route.fulfill({ json: [
        { ...job, jobStatus: status },
        { ...job, id: "expiring-failure", createdTime: "2026-09-12T12:00:00Z", jobStatus: "Failed", endTime: "2026-09-13T18:00:05Z" },
      ] });
    }
    return route.fulfill({ json: [] });
  });
  await openManager(page);
  const active = page.getByRole("button", { name: `View active run for ${script.name}`, exact: true });
  const warning = page.getByRole("button", { name: `View latest failed run for ${script.name}`, exact: true });
  await expect(active).toContainText("Queued");
  await expect(warning).toHaveCount(0);
  status = "Running";
  await page.clock.fastForward(6000);
  await expect(active).toContainText("Running");
  await expect(warning).toHaveCount(0);
  status = "Completed";
  await page.clock.fastForward(6000);
  await expect(active).toHaveCount(0);
  failed = true;
  await page.clock.fastForward(6000);
  await expect.poll(() => requests).toBeGreaterThanOrEqual(4);
  await page.clock.fastForward(2000);
  await expect(page.getByRole("button", { name: "Retry run status", exact: true })).toBeVisible();
  const stoppedAt = requests;
  await page.clock.fastForward(20000);
  expect(requests).toBe(stoppedAt);
  failed = false;
  status = "Running";
  await page.getByRole("button", { name: "Retry run status", exact: true }).click();
  await expect(active).toContainText("Running");
});
