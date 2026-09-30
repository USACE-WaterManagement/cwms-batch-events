import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test("grouped Help navigation works with keyboard, touch, and client-side routing", async ({ page }, testInfo) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/system-admin")) return route.fulfill({ json: true });
    if (path.endsWith("/repository-status")) return route.fulfill({ json: { repositories: { SWT: "example/district-jobs" }, warnings: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/about");
  const header = page.getByRole("banner").first();
  const about = header.getByRole("button", { name: "Help", exact: true });
  const menu = page.getByRole("navigation", { name: "Help and resources" });
  await about.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Version and environment" })).toHaveCount(0);
  await expect(header.getByRole("link", { name: /^(Help|Dev)/ })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "API rate limits", exact: true })).toHaveAttribute("href", "/events/about/rate-limits");
  for (const name of [
    "Dispatch outcomes", "District repository browsing", "Job cancellation", "Job logs",
    "Office history rollout", "Registered commands", "Registered schedules", "Scripts Manager", "Server logs",
  ]) await expect(menu.getByRole("link", { name, exact: true })).toHaveAttribute("href", /\/blob\/cwbi-dev\/docs\/[^/]+\.md$/);
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("link", { name: "About Batch Events", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(about).toBeFocused();
  await header.getByRole("button", { name: "Login", exact: true }).click();
  await expect(header.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await about.click();
    await expect(menu.getByRole("link", { name: "Version and environment" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "SWT CWBI jobs" })).toHaveAttribute("href", "https://github.com/example/district-jobs");
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    for (const link of await menu.getByRole("link").all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if ([1440, 390].includes(width)) {
      const directory = process.env.PR_SCREENSHOT_DIR ?? testInfo.outputPath("screenshots");
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: join(directory, `header-${width}.png`) });
    }
    await page.keyboard.press("Escape");
  }
  await about.click();
  await menu.getByRole("link", { name: "Getting started" }).click();
  await expect(page).toHaveURL(/\/help\/onboarding$/);
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Python", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Bash", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Java", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Bash without repo dependencies", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Bash without repo dependencies", exact: true }).click();
  await expect(page.getByText("no district checkout or Python dependency install", { exact: false })).toBeVisible();
  // Mock authentication lives in memory and would be lost after a full reload.
  await expect(header.getByRole("button", { name: "Logout", exact: true })).toBeVisible();
  await about.click();
  await header.getByRole("button", { name: "Logout", exact: true }).click();
  await expect(menu).toHaveCount(0);
});
