import { expect, test } from "@playwright/test";

test("authenticated status modal filters rich logs and continues empty pages", async ({ page }, testInfo) => {
  const requests: URL[] = [];
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/server-logs")) {
      requests.push(url);
      const cursor = url.searchParams.get("cursor");
      const entry = (id: string, level: string) => ({ eventId: id, timestamp: 1000, ingestionTime: 2000, logStreamName: "ecs/api/task", level, message: `${level} example output\nsecond line`, fields: { duration: 125 } });
      return route.fulfill({ json: { entries: cursor === "empty" ? [] : cursor === "last" ? [entry("3", "ERROR")] : [entry("1", "INFO"), entry("2", "ERROR")], nextCursor: cursor === "last" ? null : cursor === "empty" ? "last" : "empty", startTime: 0, endTime: 10000, logGroup: "ecs/cwms-batch/cwms-batch-events-api" } });
    }
    if (url.pathname.endsWith("/repository-status")) return route.fulfill({ json: { warnings: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/about");
  await expect(page.getByRole("button", { name: /View server logs/ })).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("button", { name: /View server logs/ }).click();
  const dialog = page.getByRole("dialog", { name: "Warnings and errors" });
  await expect(dialog.getByText("2 shown of 2 loaded entries.", { exact: false })).toBeVisible();
  await dialog.getByLabel("Log level", { exact: true }).selectOption("ERROR");
  await expect(dialog.getByRole("row")).toHaveCount(2);
  await dialog.getByText("CloudWatch details", { exact: true }).click();
  await expect(dialog.getByText("ecs/api/task", { exact: true })).toBeVisible();
  await expect(dialog.getByText('"duration": 125', { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Load more server logs" }).click();
  await expect(dialog.getByRole("button", { name: "Load more server logs" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Load more server logs" }).click();
  await expect(dialog.getByText("2 shown of 3 loaded entries.", { exact: false })).toBeVisible();
  expect(requests[1].searchParams.get("start_time")).toBe("0");
  expect(requests[1].searchParams.get("end_time")).toBe("10000");
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeVisible();
    for (const control of [dialog.getByRole("button", { name: "Close", exact: true }), dialog.getByLabel("Log level", { exact: true }), dialog.getByRole("button", { name: "Refresh server logs" })]) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const region = dialog.getByRole("region", { name: "Server log entries" });
    await region.focus();
    await expect(region).toBeFocused();
    await region.evaluate(element => { element.scrollLeft = 0; });
    await page.screenshot({ path: testInfo.outputPath(`server-logs-${width}.png`) });
  }
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(requests).toHaveLength(3);
  await page.getByRole("button", { name: /View server logs/ }).click();
  await expect(page.getByRole("dialog").getByText("2 shown of 2 loaded entries.", { exact: false })).toBeVisible();
  expect(requests).toHaveLength(4);
});

test("server log failure is recoverable and empty state is accurate", async ({ page }) => {
  let fail = true;
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/server-logs")) return fail
      ? route.fulfill({ status: 503, json: { detail: "Server logs are currently unavailable." } })
      : route.fulfill({ json: { entries: [], nextCursor: null, startTime: 0, endTime: 1000, logGroup: "server" } });
    if (url.pathname.endsWith("/repository-status")) return route.fulfill({ json: { warnings: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/about");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("button", { name: /View server logs/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Server logs unavailable" })).toBeVisible();
  await expect(page.getByText("No matching entries in the loaded time range.")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Refresh server logs" }).click();
  await expect(page.getByText("No matching entries in the loaded time range.")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Server logs unavailable" })).toHaveCount(0);
});
