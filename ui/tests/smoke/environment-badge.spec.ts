import { expect, test } from "@playwright/test";

test("environment selector stays visible in the title strip before login", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ json: [] }));
  await page.goto("/events/about");
  const header = page.getByRole("banner").first();
  const selector = header.getByLabel("Batch Events environment", { exact: true });
  await expect(selector.locator("option")).toHaveText(["Unknown", "Dev", "Test", "Production"]);
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(selector).toBeVisible();
    const title = header.getByText("CWMS Batch Events", { exact: true });
    await expect(title).toBeVisible();
    const bounds = await selector.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (process.env.BADGE_SCREENSHOT_DIR) {
      await header.screenshot({ path: `${process.env.BADGE_SCREENSHOT_DIR}/header-${width}.png` });
    }
  }
});
