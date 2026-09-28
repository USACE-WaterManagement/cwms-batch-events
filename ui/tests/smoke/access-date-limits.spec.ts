import { test, expect } from "@playwright/test";
import { meetsMinimumInterval } from "../../src/features/scripts-manager/schedulePresets";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test("rendering errors use the recovery page and navigation still works", async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/jobs/broken")) return route.fulfill({ json: {
      id: "broken", office: "SWT", scriptName: { invalid: "render fixture" },
      createdTime: "2026-09-24T12:00:00Z", jobStatus: "Completed",
    } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/jobs/broken");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "We couldn't load this page" })).toBeVisible();
  await page.getByRole("navigation", { name: "Recovery options" }).getByRole("link", { name: "Access and onboarding" }).click();
  await expect(page).toHaveURL(/\/help\/onboarding$/);
  await expect(page.getByRole("heading", { name: "We couldn't load this page" })).toHaveCount(0);
});

for (const [expression, accepted] of [
  ["* * * * *", false], ["0,1 8 * * *", false], ["*/7 * * * *", false],
  ["0,59 * * * *", false], ["*/5 * * * *", true], ["59 9 * * *", true],
] as const) test(`five minute schedule policy: ${expression}`, () => {
  expect(meetsMinimumInterval(expression.split(" "))).toBe(accepted);
});

for (const status of [403, 404, 500]) test(`shared job recovery page handles ${status}`, async ({ page }) => {
  let logReads = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/logs")) logReads++;
    if (path.endsWith("/jobs/shared")) return route.fulfill({ status, json: { detail: { code: "office_access_required", office: "SPK" } } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/jobs/shared");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  let title = "We couldn't load this page";
  if (status === 403) title = "You do not have access";
  if (status === 404) title = "Job not found";
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  if (status === 403) await expect(page.getByText(/Request access from the SPK script admin/)).toBeVisible();
  if (status === 403) await expect(page.getByText("You do not have permission to perform this action.")).toHaveCount(0);
  if (status !== 403) await expect(page.getByText(/SPK script admin/)).toHaveCount(0);
  expect(logReads).toBe(0);
  if (process.env.PR_SCREENSHOT_DIR && status === 403) {
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, "office-access-required.png"), fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.dataset.routeMarker = "preserved"; });
  await page.getByRole("navigation", { name: "Recovery options" }).getByRole("link", { name: "Access and onboarding" }).click();
  await expect(page).toHaveURL(/\/help\/onboarding$/);
  expect(await page.evaluate(() => document.documentElement.dataset.routeMarker)).toBe("preserved");
});

test("job history dates filter server pages and reset the offset", async ({ page }) => {
  const queries: URLSearchParams[] = [];
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/jobs")) {
      queries.push(url.searchParams);
      return route.fulfill({ headers: { "X-Total-Count": "30" }, json: Array.from({ length: 10 }, (_, i) => ({ id: `job-${i}`, office: "SWT", scriptName: `Report ${i}`, createdTime: "2026-09-24T12:00:00Z", jobStatus: "Completed" })) });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/jobs");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect.poll(() => queries.at(-1)?.get("offset")).toBe("10");
  await page.getByLabel("From date").fill("2026-09-01");
  await page.getByLabel("Through date").fill("2026-09-02");
  const expected = await page.evaluate(() => ({ from: new Date("2026-09-01T00:00:00").toISOString(), before: new Date("2026-09-03T00:00:00").toISOString() }));
  await expect.poll(() => queries.at(-1)?.get("submittedBefore")).toBe(expected.before);
  expect(queries.at(-1)?.get("submittedFrom")).toBe(expected.from);
  expect(queries.at(-1)?.get("offset")).toBe("0");
  if (process.env.PR_SCREENSHOT_DIR) {
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, "history-date-filter.png"), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env.PR_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, "history-date-filter-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Clear dates" }).click();
  await expect.poll(() => queries.at(-1)?.has("submittedFrom")).toBe(false);
});
