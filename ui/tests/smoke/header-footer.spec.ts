import { expect, test } from "@playwright/test";

test("Dev links follow a non-admin user's district and footer links keep the app base path", async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/repository-status")) return route.fulfill({ json: {
      warnings: [], mock: false, repositories: { SWT: "example/custom-jobs", SWL: "USACE-WaterManagement/swl-wm-cwbi-jobs" },
    } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/about");
  const header = page.getByRole("banner").first();
  await header.getByRole("link", { name: /^Dev/ }).hover();
  await expect(header.getByRole("menuitem", { name: "Swagger UI", exact: true })).toHaveAttribute("href", "http://127.0.0.1:4173/api/docs");
  await expect(header.getByRole("menuitem", { name: "CWMS Batch Events", exact: true })).toHaveAttribute("href", "https://github.com/USACE-WaterManagement/cwms-batch-events");
  await expect(header.getByRole("menuitem", { name: "CWBI WM images", exact: true })).toHaveAttribute("href", "https://github.com/USACE/cwbi-wm-images");
  await expect(header.getByRole("menuitem", { name: /CWBI jobs/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  for (const [office, repository] of [["SWT", "example/custom-jobs"], ["SWL", "USACE-WaterManagement/swl-wm-cwbi-jobs"]]) {
    await page.evaluate(office => {
      localStorage.setItem("cwms-batch-events:selected-office", office);
      window.dispatchEvent(new Event("batch-events-office-changed"));
    }, office);
    await header.getByRole("link", { name: /^Dev/ }).hover();
    const link = header.getByRole("menuitem", { name: `${office} CWBI jobs`, exact: true });
    await expect(link).toHaveAttribute("href", `https://github.com/${repository}`);
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("For access or job support, contact your district Batch Events administrator.");
  await expect(footer.getByRole("link", { name: "Version and environment" })).toHaveAttribute("href", "/events/about/version");
  await page.getByRole("button", { name: "Logout", exact: true }).first().click();
  await header.getByRole("link", { name: /^Dev/ }).hover();
  await expect(header.getByRole("menuitem", { name: /CWBI jobs/ })).toHaveCount(0);
  await expect(footer.getByRole("link", { name: "Version and environment" })).toHaveCount(0);
  await footer.getByRole("link", { name: "Script setup", exact: true }).click();
  await expect(page).toHaveURL(/\/events\/help\/script-files$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
