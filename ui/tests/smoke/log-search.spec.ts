import { test, expect } from "@playwright/test";

test("search scans subsequent pages and opens the matching run", async ({ page }) => {
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/offices")) return route.fulfill({ json: ["SWT"] });
    if (url.pathname.endsWith("/job-log-search")) {
      expect(url.searchParams.get("q")).toBe("failed");
      if (!url.searchParams.has("cursor")) return route.fulfill({ json: { results: [], scannedJobs: 3, unavailableJobs: 1, nextCursor: "next" } });
      return route.fulfill({ json: { results: [{ jobId: "run-1", name: "Office report", office: "SWT", createdTime: "2026-09-24T12:00:00Z", snippets: ["Report failed to load"] }], scannedJobs: 1, unavailableJobs: 0, nextCursor: null } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/log-search");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("searchbox", { name: "Search text" }).fill("failed");
  await page.getByRole("button", { name: "Search logs", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "More output" })).toContainText("1 logs unavailable");
  await page.getByRole("button", { name: "Continue search" }).click();
  await expect(page.getByText("Report failed to load")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Search complete" })).toContainText("4 runs searched");
  await expect(page.getByRole("link", { name: "Office report · SWT" })).toHaveAttribute("href", "/events/jobs/run-1");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
