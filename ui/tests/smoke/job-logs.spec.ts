import { expect, test, type Page } from "@playwright/test";

async function viewer(page: Page, initialStatus = "Running") {
  const state = {
    status: initialStatus, requests: [] as (string | null)[], failure: 0,
    live: true, available: true, more: false, reset: false,
  };
  await page.clock.install();
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/logs/page")) {
      state.requests.push(url.searchParams.get("cursor"));
      if (state.failure) return route.fulfill({ status: state.failure, json: { detail: "Invalid log cursor. Refresh the logs." } });
      return route.fulfill({ json: {
        logs: state.available ? `line ${state.requests.length}` : "",
        nextCursor: `cursor-${state.requests.length}`, hasMore: state.more,
        reset: state.reset, available: state.available, supportsLive: state.live,
      } });
    }
    if (url.pathname.endsWith("/jobs/log-job")) return route.fulfill({ json: {
      id: "log-job", scriptName: "Log polling test", username: "dev-user", office: "SWT",
      jobStatus: state.status, createdTime: "2026-09-14T12:00:00Z", repoPath: "run.py",
    } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/jobs/log-job");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await expect(page.getByLabel("Job output")).toBeVisible();
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
  await page.clock.runFor(30000);
  expect(state.requests).toHaveLength(4);
  await page.getByRole("button", { name: "Refresh logs" }).click();
  await expect.poll(() => state.requests.length).toBe(5);
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
