import { expect, test } from "@playwright/test";

test("loads the production UI without browser runtime errors", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const response = await page.goto("/");
  await page.waitForTimeout(250);

  expect(response?.ok()).toBe(true);
  expect(pageErrors, `Uncaught browser errors:\n${pageErrors.join("\n")}`).toEqual([]);
  const initialResources = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((entry) => entry.name),
  );
  expect(initialResources.some((url) => /AdminPage-|OperationsDashboard-/.test(url))).toBe(false);
  await expect(
    page.getByRole("heading", { level: 1, name: "Welcome to CWMS Batch Events" }),
  ).toBeVisible();
});
