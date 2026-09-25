import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const summary = {
  asOf: "2026-09-25T00:00:00Z", since: "2026-09-18T00:00:00Z", offices: ["SWT", "SWF", "SAC"],
  usage: [
    { office: "SWT", runs: 120, completed: 114, failed: 4, users: 8, runtimeMinutes: 900, missingDuration: 1 },
    { office: "SWF", runs: 80, completed: 75, failed: 5, users: 5, runtimeMinutes: 600, missingDuration: 0 },
    { office: "SAC", runs: 40, completed: 40, failed: 0, users: 3, runtimeMinutes: 300, missingDuration: 0 },
  ],
  topJobs: [{ office: "SWT", scriptId: "report", name: "Daily reservoir report", runs: 30, completed: 29, failed: 1, users: 4, runtimeMinutes: 600, missingDuration: 0 }],
  daily: [{ day: "2026-09-23", runs: 120, failed: 4 }, { day: "2026-09-24", runs: 120, failed: 5 }],
  queued: 2, running: 3, registered: 20, automatic: 12, attentionTotal: 2,
  attention: [{ id: "queued-job", office: "SWT", name: "Queued forecast", status: "Pending", ageMinutes: 85, batchCheckedAt: null },
    { id: "long-job", office: "SWF", name: "Long report", status: "Running", ageMinutes: 180, batchCheckedAt: "2026-09-24T20:00:00Z" }],
  failures: [{ id: "failed-job", office: "SWT", name: "Failed forecast", status: "Failed", ageMinutes: 90, reason: "Process exited with code 1", batchCheckedAt: null }],
};

test("HQ dashboard reports usage, queue issues, failures and clearly labeled cost scenarios", async ({ page }) => {
  const queries: URLSearchParams[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/system-admin")) return route.fulfill({ json: true });
    if (url.pathname.endsWith("/admin/operations")) { queries.push(url.searchParams); return route.fulfill({ json: summary }); }
    if (url.pathname.endsWith("/scheduler/status")) return route.fulfill({ json: { enabled: true, tasks: [{ name: "schedules", healthy: true }, { name: "queue_delivery", healthy: true }], pendingDelivery: 0, needsAttention: 0, invalidSchedules: 0 } });
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/events/admin");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await expect(page.getByText("1,800", { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("SWT");
  if (process.env.PR_SCREENSHOT_DIR) {
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, "admin-overview-fixture.png"), fullPage: true });
  }
  await page.getByRole("button", { name: "Operations", exact: true }).click();
  await expect(page.getByText("Queued forecast", { exact: true })).toBeVisible();
  await expect(page.getByText("Process exited with code 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open job", exact: true }).first()).toHaveAttribute("href", "/events/jobs/queued-job");
  await page.getByLabel("Queue age", { exact: true }).selectOption("30");
  await expect.poll(() => queries.at(-1)?.get("queueMinutes")).toBe("30");
  await page.getByRole("button", { name: "Usage", exact: true }).click();
  await page.getByRole("button", { name: "Cost", exact: true }).click();
  await page.getByLabel("Planning rate (USD per job runtime hour)").fill("2");
  await expect(page.getByText("Scenario estimate: $60.00", { exact: true })).toBeVisible();
  await expect(page.getByText(/This is not an AWS bill/)).toBeVisible();
  await page.getByRole("button", { name: "Jobs", exact: true }).click();
  await expect(page.getByRole("table")).toContainText("Daily reservoir report");
  await page.getByLabel("Office", { exact: true }).selectOption("SWF");
  await expect.poll(() => queries.at(-1)?.get("office")).toBe("SWF");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.PR_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, "admin-mobile-fixture.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("pagination reserves row space while new history is loading", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/jobs")) {
      const offset = Number(url.searchParams.get("offset"));
      if (offset) await gate;
      return route.fulfill({ json: Array.from({ length: 10 }, (_, index) => ({ id: `job-${index + offset}`, scriptName: `Job ${index + offset}`, office: "SWT", jobStatus: "Completed", createdTime: "2026-09-24T12:00:00Z" })), headers: { "X-Total-Count": "20" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/jobs");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  const results = page.getByRole("region", { name: "Job history results" });
  await expect(results.getByRole("link")).toHaveCount(10);
  const before = await results.boundingBox();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("status", { name: "Loading job history", exact: true })).toBeVisible();
  await expect(page.getByText("Page 2 of 2 (20 jobs)", { exact: true })).toBeVisible();
  expect((await results.boundingBox())?.height).toBe(before?.height);
  release();
  await expect(results.getByRole("link").first()).toContainText("Job 10");
  expect((await results.boundingBox())?.height).toBe(before?.height);
});
