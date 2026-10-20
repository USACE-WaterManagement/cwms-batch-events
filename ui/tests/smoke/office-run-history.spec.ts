import { expect, test } from "@playwright/test";

test("office history shows colleagues, safe names, and manual/scheduled badges", async ({ page }, testInfo) => {
  const base = { office: "SWT", jobStatus: "Completed", repoPath: "report.py", createdTime: "2026-09-15T12:00:00Z" };
  const jobs = [
    { ...base, id: "manual", scriptName: "Reservoir report", username: "1234567890@mil", displayName: "Jane Doe", runTrigger: "manual" },
    { ...base, id: "scheduled", scriptName: "Hourly update", username: "office-scheduler", displayName: "Office scheduler", runTrigger: "scheduled" },
    { ...base, id: "legacy", scriptName: "Historical report", username: "DOE.JANE.1234567890" },
  ];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/jobs")) return route.fulfill({ json: jobs, headers: { "X-Total-Count": "3" } });
    if (path.endsWith("/logs/page")) return route.fulfill({ json: { logs: "Shared office output", reset: true } });
    if (path.endsWith("/jobs/manual")) return route.fulfill({ json: jobs[0] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/jobs");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  const results = page.getByRole("region", { name: "Job history results" });
  await expect(results.getByRole("link", { name: /Reservoir report/ }).getByText("Manual", { exact: true })).toBeVisible();
  await expect(results.getByRole("link", { name: /Hourly update/ }).getByText("Scheduled", { exact: true })).toBeVisible();
  await expect(results.getByRole("link", { name: /Historical report/ }).getByText("Unknown", { exact: true })).toBeVisible();
  await expect(results.getByText("SWT · Jane Doe")).toBeVisible();
  await expect(results.getByText("SWT · Name unavailable")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("1234567890");
  await page.screenshot({ path: testInfo.outputPath("office-history-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await results.getByRole("link", { name: /Reservoir report/ }).click();
  await expect(page.locator(".job-detail-fields").first()).toContainText("Jane Doe");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("office-history-mobile.png"), fullPage: true });
  await expect(page.getByRole("textbox", { name: "Job output" })).toHaveValue("Shared office output");
  await expect(page.locator("body")).not.toContainText("1234567890");
});
