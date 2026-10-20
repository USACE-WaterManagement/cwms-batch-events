import { expect, test } from "@playwright/test";

test("job history requests pages and keeps All in a scrollable results panel", async ({ page }) => {
  const jobs = Array.from({ length: 23 }, (_, index) => ({
    id: `job-${index + 1}`, scriptName: `History script ${index + 1}`,
    username: "dev-user", office: "SWT", jobStatus: "Completed",
    createdTime: "2026-09-14T15:00:00Z", repoPath: "bin/report.py",
  }));
  const requests: string[] = [];
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/jobs")) {
      requests.push(url.search);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? jobs.length);
      return route.fulfill({ json: jobs.slice(offset, offset + limit), headers: { "X-Total-Count": String(jobs.length) } });
    }
    if (url.pathname.endsWith("/jobs/job-1")) return route.fulfill({ json: jobs[0] });
    if (url.pathname.endsWith("/logs/page")) return route.fulfill({ json: { logs: "History output" } });
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/events/jobs");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  const results = page.getByRole("region", { name: "Job history results" });
  const rows = results.getByRole("link", { name: /^Open History script/ });
  await expect(rows).toHaveCount(10);
  await expect(results.getByRole("link", { name: /^Open History script/ })).toHaveCount(10);
  await expect(results.getByRole("link", { name: /^Open History script 1 run/ })).toBeVisible();
  expect(requests).toContain("?limit=10&offset=0");
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await expect(results).toHaveCSS("overflow-y", "auto");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Page 2 of 3 (23 jobs)")).toBeVisible();
  await expect(rows).toHaveCount(10);
  expect(requests).toContain("?limit=10&offset=10");
  await expect(rows.first()).toContainText("History script 11");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(rows.first()).toContainText("History script 11");
  await page.getByLabel("Jobs per page").selectOption("25");
  await expect(rows).toHaveCount(23);
  expect(requests).toContain("?limit=25&offset=0");
  await page.getByLabel("Jobs per page").selectOption("all");
  await expect(rows).toHaveCount(23);
  await expect(page.getByText("Showing all 23 jobs")).toBeVisible();
  expect(requests).toContain("");
  await expect(results).toHaveCSS("overflow-y", "auto");
  expect(await results.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await rows.last().scrollIntoViewIfNeeded();
  expect(await results.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.getByLabel("Jobs per page").selectOption("10");
  await expect(rows).toHaveCount(10);
  await expect(rows.first()).toContainText("History script 1");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await results.getByRole("link", { name: /^Open History script 1 run/ }).click();
  await expect(page).toHaveURL(/\/events\/jobs\/job-1$/);
  await expect(page.getByLabel("Job output")).toHaveValue("History output");
});
