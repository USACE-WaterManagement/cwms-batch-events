import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function viewer(page: Page, initialStatus = "Running", available = true, live = true, endTime?: string) {
  const state = {
    status: initialStatus, requests: [] as (string | null)[], failure: 0,
    live, available, more: false, reset: false,
    message: null as string | null,
    output: undefined as string | undefined,
  };
  await page.clock.install();
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/logs/page")) {
      state.requests.push(url.searchParams.get("cursor"));
      if (state.failure) return route.fulfill({ status: state.failure, json: { detail: "Invalid log cursor. Refresh the logs." } });
      return route.fulfill({ json: {
        logs: state.available ? state.output ?? `line ${state.requests.length}` : "",
        nextCursor: `cursor-${state.requests.length}`, hasMore: state.more,
        reset: state.reset, available: state.available, supportsLive: state.live,
        message: state.message,
      } });
    }
    if (url.pathname.endsWith("/jobs/log-job")) return route.fulfill({ json: {
      id: "log-job", scriptName: "Log polling test", username: "dev-user", office: "SWT",
      jobStatus: state.status, createdTime: "2026-09-14T12:00:00Z", repoPath: "run.py", endTime,
    } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/jobs/log-job");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await expect(page.getByLabel("Job output")).toBeVisible();
  await expect(page.getByLabel("Update interval")).toHaveValue("5000");
  if (initialStatus === "Running") await page.getByLabel("Update interval").selectOption("2000");
  return state;
}

test("polls incrementally at the selected interval, pauses, and stops on completion", async ({ page }) => {
  const state = await viewer(page);
  await expect(page.getByLabel("Job output")).toHaveValue("line 1");
  await page.clock.runFor(1900);
  expect(state.requests).toEqual([null]);
  await page.clock.runFor(200);
  await expect(page.getByLabel("Job output")).toHaveValue("line 1\nline 2");
  expect(state.requests).toEqual([null, "cursor-1"]);
  await page.getByLabel("Update interval").selectOption("5000");
  await page.clock.runFor(4900);
  expect(state.requests).toHaveLength(2);
  await page.clock.runFor(200);
  await expect.poll(() => state.requests.length).toBe(3);
  await page.getByLabel("Update interval").selectOption("0");
  await page.clock.runFor(15000);
  expect(state.requests).toHaveLength(3);
  state.status = "Completed";
  await page.clock.runFor(5100);
  await expect(page.getByLabel("Job output")).toHaveValue("line 1\nline 2\nline 3\nline 4");
  expect(state.requests[3]).toBe("cursor-3");
  await expect(page.getByLabel("Update interval")).toBeDisabled();
  for (let count = 5; count <= 10; count++) {
    await page.clock.runFor(5100);
    await expect(page.getByLabel("Job output")).toHaveValue(Array.from({ length: count }, (_, i) => `line ${i + 1}`).join("\n"));
  }
  expect(state.requests).toHaveLength(10);
  await expect(page.getByLabel("Job output")).toHaveValue(Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n"));
  await page.clock.runFor(60000);
  expect(state.requests).toHaveLength(10);
  await page.getByRole("button", { name: "Refresh logs" }).click();
  await expect.poll(() => state.requests.length).toBe(11);
});

test("completed and failed jobs load once; pagination requires explicit action", async ({ page }) => {
  const state = await viewer(page, "Failed");
  await expect(page.getByLabel("Job output")).toHaveValue("line 1");
  await page.clock.runFor(30000);
  expect(state.requests).toHaveLength(1);
  state.more = true;
  await page.getByRole("button", { name: "Refresh logs" }).click();
  await expect(page.getByRole("button", { name: "Load more" })).toBeVisible();
  await page.clock.runFor(30000);
  expect(state.requests).toHaveLength(2);
  state.more = false;
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByLabel("Job output")).toHaveValue("line 1\nline 2\nline 3");
});

test("pending and completion-only jobs do not repeatedly request logs", async ({ page }) => {
  const state = await viewer(page, "Pending");
  await page.clock.runFor(10000);
  expect(state.requests).toHaveLength(0);
  state.status = "Running";
  state.live = false;
  state.available = false;
  await page.clock.runFor(5100);
  await expect(page.getByText("Logs are available after this job finishes.")).toBeVisible();
  await page.clock.runFor(15000);
  expect(state.requests).toHaveLength(1);
  state.status = "Completed";
  state.available = true;
  state.reset = true;
  await page.clock.runFor(5100);
  await expect(page.getByLabel("Job output")).toHaveValue("line 2");
  await page.clock.runFor(10000);
  expect(state.requests).toHaveLength(2);
});

test("hidden tabs and closed viewers stop polling", async ({ page }) => {
  const state = await viewer(page);
  await expect(page.getByLabel("Job output")).toHaveValue("line 1");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(15000);
  expect(state.requests).toHaveLength(1);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(2100);
  await expect.poll(() => state.requests.length).toBe(2);
  await page.getByRole("link", { name: "Scripts Manager", exact: true }).click();
  await expect(page.getByLabel("Job output")).toHaveCount(0);
  const closedCount = state.requests.length;
  await page.clock.runFor(10000);
  expect(state.requests).toHaveLength(closedCount);
});

test("log errors retain output, retry once at most, and stop polling", async ({ page }) => {
  const state = await viewer(page);
  await expect(page.getByLabel("Job output")).toHaveValue("line 1");
  state.failure = 500;
  await page.clock.runFor(2100);
  await page.clock.runFor(1100);
  await expect(page.getByText("Automatic updates stopped after an error.")).toBeVisible();
  expect(state.requests).toHaveLength(3);
  await expect(page.getByLabel("Job output")).toHaveValue("line 1");
  await page.clock.runFor(15000);
  expect(state.requests).toHaveLength(3);
  state.failure = 0;
  await page.getByRole("button", { name: "Refresh logs" }).click();
  await expect(page.getByLabel("Job output")).toHaveValue("line 4");
  expect(state.requests[3]).toBeNull();
  state.failure = 400;
  await page.clock.runFor(2100);
  await expect(page.getByText("Automatic updates stopped after an error.")).toBeVisible();
  await page.clock.runFor(10000);
  expect(state.requests).toHaveLength(5);
});

test("new attempts replace old output and controls fit a narrow viewport", async ({ page }) => {
  const state = await viewer(page);
  await expect(page.getByLabel("Job output")).toHaveValue("line 1");
  state.reset = true;
  await page.clock.runFor(2100);
  await expect(page.getByLabel("Job output")).toHaveValue("line 2");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("pending jobs allow manual diagnostics without starting log polling", async ({ page }) => {
  const state = await viewer(page, "Pending");
  state.available = false;
  state.message = "AWS Batch: RUNNABLE. Waiting for capacity";
  await page.getByRole("button", { name: "Refresh logs" }).click();
  await expect(page.getByLabel("Job output")).toHaveValue(state.message);
  await page.clock.runFor(60000);
  expect(state.requests).toHaveLength(1);
});

test("completion catch-up stops after an error", async ({ page }) => {
  const state = await viewer(page);
  await expect(page.getByLabel("Job output")).toHaveValue("line 1");
  await page.getByLabel("Update interval").selectOption("0");
  state.status = "Completed";
  await page.clock.runFor(5100);
  await expect.poll(() => state.requests.length).toBe(2);
  state.failure = 500;
  await page.clock.runFor(6100);
  await expect(page.getByText("Automatic updates stopped after an error.")).toBeVisible();
  const stopped = state.requests.length;
  await page.clock.runFor(60000);
  expect(state.requests).toHaveLength(stopped);
});

for (const live of [true, false]) {
  test(`newly opened terminal job catches delayed output (live=${live})`, async ({ page }) => {
    const state = await viewer(page, "Completed", false, live);
    await expect.poll(() => state.requests.length).toBe(1);
    await expect(page.getByText("Checking for final output...")).toBeVisible();
    for (let count = 2; count <= 5; count++) {
      await page.clock.runFor(5100);
      await expect.poll(() => state.requests.length).toBe(count);
      await expect(page.getByRole("button", { name: "Refresh logs" })).toBeEnabled();
    }
    expect(state.requests).toHaveLength(5);
    state.available = true;
    state.reset = !live;
    await page.clock.runFor(5100);
    await expect(page.getByLabel("Job output")).toHaveValue("line 6");
    if (live) {
      await page.clock.runFor(5100);
      await expect(page.getByLabel("Job output")).toHaveValue("line 6\nline 7");
    }
    await page.clock.runFor(60000);
    expect(state.requests).toHaveLength(live ? 7 : 6);
    await expect(page.getByText("Automatic updates stopped.")).toBeVisible();
  });
}

test("missing final logs stop retrying after a bounded catch-up", async ({ page }) => {
  const state = await viewer(page, "Failed", false);
  await expect.poll(() => state.requests.length).toBe(1);
  await page.clock.runFor(90000);
  expect(state.requests).toHaveLength(7);
  await expect(page.getByText("Automatic updates stopped.")).toBeVisible();
});

test("resizing output grows its panel and keeps the last line and padding reachable", async ({ page }) => {
  const state = await viewer(page, "Completed");
  state.output = Array.from({ length: 80 }, (_, i) => `Processing report record ${i + 1} of 80`).join("\n") + "\nReport complete. All 80 records processed.";
  state.reset = true;
  await page.getByRole("button", { name: "Refresh logs" }).click();
  await expect(page.getByLabel("Job output")).toHaveValue(state.output);
  await page.setViewportSize({ width: 1360, height: 1100 });
  const output = page.getByLabel("Job output");
  const panel = page.getByRole("region", { name: "Job logs", exact: true });
  const before = await panel.boundingBox();
  await output.scrollIntoViewIfNeeded();
  const box = (await output.boundingBox())!;
  await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 4, box.y + box.height + 180, { steps: 12 });
  await page.mouse.up();
  const after = (await panel.boundingBox())!;
  const resized = (await output.boundingBox())!;
  expect(after.height).toBeGreaterThan(before!.height + 100);
  expect(after.y + after.height).toBeGreaterThan(resized.y + resized.height + 12);
  await output.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await output.evaluate(el => el.scrollHeight > el.clientHeight && Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 2)).toBe(true);
  if (process.env.PR_SCREENSHOT_DIR) {
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, "resized-job-output.png"), fullPage: true });
  }
});

test("recently completed jobs catch up even when their first page has partial output", async ({ page }) => {
  const state = await viewer(page, "Completed", true, true, new Date().toISOString());
  await expect(page.getByLabel("Job output")).toHaveValue("line 1");
  await expect(page.getByText("Checking for final output...")).toBeVisible();
  await page.clock.runFor(5100);
  await expect(page.getByLabel("Job output")).toHaveValue("line 1\nline 2");
  expect(state.requests).toEqual([null, "cursor-1"]);
});
