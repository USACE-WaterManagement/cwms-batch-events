import { expect, test } from "@playwright/test";

const warning = { code: "example", message: "Repository browsing is unavailable. Enter the path manually." };

test("header controls and links fit desktop, tablet and phone widths", async ({ page }) => {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/repository-status")) return route.fulfill({ json: { warnings: [warning] } });
    if (path.endsWith("/repository-files")) return route.fulfill({ json: { repository: "USACE-WaterManagement/swt-wm-cwbi-jobs", ref: "cwbi-dev", paths: [], warnings: [warning] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  await expect(page.getByRole("button", { name: "View warnings and errors (1)", exact: true })).toBeVisible();
  // Leave room for the different font metrics on Windows and Linux runners.
  const layouts = ["normal", "0.25px"].flatMap(letterSpacing =>
    [1440, 1280, 1100, 1024, 768, 390, 320].map(width => ({ width, letterSpacing })));
  for (const { width, letterSpacing } of layouts) {
    await page.getByRole("banner").first().evaluate((header, spacing) => { header.style.letterSpacing = spacing; }, letterSpacing);
    await page.setViewportSize({ width, height: 900 });
    const boxes = await page.locator(".batch-header-actions > button").evaluateAll(buttons => buttons.map(button => {
      const r = button.getBoundingClientRect();
      return { x: r.x, right: r.right, centerY: r.y + r.height / 2 };
    }));
    expect(boxes).toHaveLength(3);
    expect(Math.max(...boxes.map(b => b.centerY)) - Math.min(...boxes.map(b => b.centerY))).toBeLessThan(2);
    expect(boxes[0].x).toBeGreaterThan(60);
    expect(boxes[2].right).toBeLessThan(width);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].right);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (width >= 768) {
      const first = await page.getByRole("link", { name: "Job History", exact: true }).first().boundingBox();
      const last = await page.getByRole("link", { name: /^Help/ }).first().boundingBox();
      expect(Math.abs(first!.y - last!.y), `Navigation at ${width}px with ${letterSpacing} letter spacing`).toBeLessThan(5);
    }
  }
});

for (const failure of ["server", "network", "client", "invalid-json"] as const) {
  test(`${failure} errors appear once in the header and Check again recovers failed reads`, async ({ page }) => {
    let recovered = false;
    let requests = 0;
    await page.route("**/api/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
      if (path.endsWith("/repository-status")) return route.fulfill({ json: { warnings: [] } });
      if (path.endsWith("/repository-files")) return route.fulfill({ json: { repository: "USACE-WaterManagement/swt-wm-cwbi-jobs", ref: "cwbi-dev", paths: [] } });
      if (path.endsWith("/scripts")) {
        requests++;
        if (recovered) return route.fulfill({ json: [] });
        if (failure === "network") return route.abort("connectionrefused");
        if (failure === "client") return route.fulfill({ status: 403, json: { detail: "Forbidden" } });
        if (failure === "invalid-json") return route.fulfill({ contentType: "application/json", body: "invalid" });
        return route.fulfill({ status: 500, body: "Internal Server Error" });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto("/events/scripts-manager");
    await page.getByRole("button", { name: "Login", exact: true }).first().click();
    await page.getByRole("combobox").selectOption("SWT");
    await page.getByRole("button", { name: "View warnings and errors (1)", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Warnings and errors" });
    await expect(dialog.getByRole("listitem")).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Notifications" })).toBeHidden();
    expect(requests).toBe(failure === "client" ? 1 : 2);
    recovered = true;
    await dialog.getByRole("button", { name: "Check again", exact: true }).click();
    await expect(dialog.getByText("No current warnings or errors.")).toBeVisible();
    await expect(page.getByRole("button", { name: /View warnings and errors/ })).toHaveCount(0);
  });
}
