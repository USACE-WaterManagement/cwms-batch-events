import { test, expect } from "@playwright/test";

test("queue admin view shows office pressure and cancellation confirmation", async ({ page }) => {
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/users/me/system-admin")) return route.fulfill({ json: true });
    if (url.pathname.endsWith("/admin/queues")) return route.fulfill({ json: {
      asOf: "2026-09-30T12:00:00Z", queueAvailable: true,
      approximateMessagesAvailable: 4, approximateMessagesInFlight: 2,
      offices: [{ office: "SWT", queued: 1, running: 1, cancelling: 0, dispatchUnknown: 0,
        submissionsLastMinute: 8, submissionLimitPerMinute: 10, oldestQueuedAt: "2026-09-30T11:59:00Z",
        jobs: [{ id: "job-1", office: "SWT", scriptName: "Forecast", username: "operator", jobStatus: "Running", createdTime: "2026-09-30T11:55:00Z" }] }],
    } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/admin/queues");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
  await expect(page.getByText("8 / 10")).toBeVisible();
  await page.getByRole("button", { name: "Cancel run", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cancel this job run" })).toBeVisible();
  await expect(page.getByText(/A running job will receive a stop request/)).toBeVisible();
});
