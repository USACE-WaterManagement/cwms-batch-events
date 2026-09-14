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

test("script indicators open the exact active or recent failed run", async ({ page }) => {
  await page.clock.install({ time: now });
  const runs = [
    job,
    { ...job, id: "older-failure", jobStatus: "Failed", endTime: "2026-09-14T17:40:00Z" },
    { ...job, id: "latest-failure", jobStatus: "Failed", createdTime: "2026-09-12T00:00:00Z", endTime: "2026-09-14T17:55:00Z" },
    { ...job, id: "queued", scriptId: "queued-script", jobStatus: "Pending" },
    { ...job, id: "expired-failure", scriptId: "old-script", jobStatus: "Failed", endTime: "2026-09-13T17:59:00Z" },
    { ...job, id: "wrong-office", scriptId: "old-script", office: "LRH", jobStatus: "Failed", endTime: "2026-09-14T17:59:00Z" },
    { ...job, id: "wrong-script", scriptId: "other-id", scriptName: script.name, jobStatus: "Failed", endTime: "2026-09-14T17:59:00Z" },
  ];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner", slug: "batch" } });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script, { ...script, id: "queued-script", name: "Queued report" }, { ...script, id: "old-script", name: "Old report" }] });
    if (path.endsWith("/jobs")) return route.fulfill({ json: runs });
    if (path.endsWith("/logs")) return route.fulfill({ json: { logs: "Example failed run output" } });
    const requested = runs.find(run => path.endsWith(`/jobs/${run.id}`));
    if (requested) return route.fulfill({ json: requested });
    return route.fulfill({ json: [] });
  });
  await openManager(page);
  const active = page.getByRole("button", { name: `View active run for ${script.name}`, exact: true });
  const warning = page.getByRole("button", { name: `View recent failed run for ${script.name}`, exact: true });
  await expect(active).toContainText("Running");
  await expect(active.locator(".animate-spin")).toHaveCount(1);
  await expect(warning).toBeVisible();
  await expect(page.getByRole("button", { name: "View active run for Queued report", exact: true })).toContainText("Queued");
  await expect(page.getByRole("button", { name: "View recent failed run for Old report", exact: true })).toHaveCount(0);
  await active.click();
  await expect(page.getByRole("tab", { name: "Job runs", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Selected job run" })).toContainText("running");
  await expect(page.getByRole("tabpanel").getByRole("button", { name: /Running/ }).locator(".animate-spin")).toHaveCount(1);
  await warning.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Selected job run" })).toContainText("latest-failure");
  await expect(page.getByRole("textbox", { name: "Job output" })).toHaveValue("Example failed run output");
  await expect(page.getByRole("tab", { name: "Job runs", exact: true })).toHaveAttribute("aria-selected", "true");
  if (process.env.PR_SCREENSHOT_DIR) {
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, "script-run-indicators.png"), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(active).toBeVisible();
  await expect(warning).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("indicators refresh, expire after 24 hours, and stop polling on read failure", async ({ page }) => {
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
        { ...job, id: "expiring-failure", jobStatus: "Failed", endTime: "2026-09-13T18:00:05Z" },
      ] });
    }
    return route.fulfill({ json: [] });
  });
  await openManager(page);
  const active = page.getByRole("button", { name: `View active run for ${script.name}`, exact: true });
  const warning = page.getByRole("button", { name: `View recent failed run for ${script.name}`, exact: true });
  await expect(active).toContainText("Queued");
  await expect(warning).toBeVisible();
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
