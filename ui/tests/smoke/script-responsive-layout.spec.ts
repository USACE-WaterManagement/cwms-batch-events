import { expect, test, type Locator } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const script = {
  id: "script-metadata", name: "Build Water Supply Metadata", slug: "build-water-supply-metadata",
  description: "Build water supply metadata for the district.", office: "SWT",
  executionType: "script", runtime: "java",
  repoPath: "java-artifacts/BuildWSMetadataViaCDA/BuildWaterSupplyMetadataWithDistrictConfiguration.jar",
  commandArgs: ["--configuration=" + "district_configuration_".repeat(8)], roles: [], active: true,
  jobRunners: ["runner-1"], createdTime: "2026-09-14T14:00:00Z", updatedTime: "2026-09-14T14:00:00Z",
};
const scripts = [script, { ...script, id: "python", name: "HourlyCorpsHydropowerData2XML.py", runtime: "python", repoPath: "python/HourlyCorpsHydropowerData2XML.py" },
  { ...script, id: "shell", name: "hourly.sh", runtime: "shell", repoPath: "bin/hourly.sh" },
  { ...script, id: "failed", name: "StoreTurbineChangesFromXMLWithDistrictConfiguration", runtime: "python", repoPath: "python/StoreTurbineChangesFromXML.py" }];

// Check the actual content boxes, including the scrollable list: document
// width alone does not catch action buttons clipped inside a narrow panel.
async function fits(locator: Locator) {
  for (const element of await locator.all()) {
    const dimensions = await element.evaluate(el => ({ tag: el.tagName, className: el.className, scroll: el.scrollWidth, client: el.clientWidth }));
    expect(dimensions.scroll, JSON.stringify(dimensions)).toBeLessThanOrEqual(dimensions.client + 1);
  }
}

for (const { width, largeText } of [
  ...[320, 390, 768, 1024, 1280, 1366, 1440, 1600, 1920].map(width => ({ width, largeText: false })),
  { width: 1280, largeText: true },
]) {
  test(`script actions and run details fit at ${width}px${largeText ? " with enlarged text" : ""}`, async ({ page }) => {
    const job = {
      id: "c0402712-808f-4465-805b-2c7057d16f63", scriptId: script.id, scriptName: script.name,
      office: "SWT", username: "EXAMPLE.CHARLES.ROBERT.1543077719", jobStatus: "Running",
      createdTime: new Date().toISOString(), runTime: new Date().toISOString(), endTime: null,
    };
    await page.route("**/api/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
      if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner-1", slug: "batch" } });
      if (path.endsWith("/scripts")) return route.fulfill({ json: scripts });
      if (path.endsWith("/jobs")) return route.fulfill({ json: [job, { ...job, id: "failure", scriptId: "failed", jobStatus: "Failed", endTime: new Date().toISOString() }] });
      if (path.endsWith(`/jobs/${job.id}`)) return route.fulfill({ json: job });
      return route.fulfill({ json: [] });
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/events/scripts-manager");
    if (largeText) await page.addStyleTag({ content: "html { font-size: 200%; }" });
    await page.getByRole("button", { name: "Login", exact: true }).first().click();
    await page.getByRole("combobox").selectOption("SWT");
    const list = page.getByRole("region", { name: "SWT scripts list" });
    await expect(list.locator("tbody tr")).toHaveCount(scripts.length);
    await fits(list.locator(".scripts-list-scroll, table, tbody, tbody tr, td"));
    for (const row of await list.locator("tbody tr").all()) {
      for (const action of await row.getByRole("button", { name: /^(Run script|Runs)$/ }).all()) {
        await action.scrollIntoViewIfNeeded();
        const box = (await action.boundingBox())!;
        const container = (await list.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(container.x);
        expect(box.x + box.width).toBeLessThanOrEqual(container.x + container.width);
      }
    }
    const row = list.locator("tr").filter({ hasText: script.name });
    await row.getByRole("button", { name: "Run script", exact: true }).click();
    await expect(page.getByRole("button", { name: "Submit job", exact: true })).toBeVisible();
    await fits(page.locator(".script-workspace-panel, .script-workspace-panel pre"));
    await page.getByRole("tab", { name: "Details", exact: true }).click();
    await fits(page.locator(".script-view-field, .script-view-field > div"));
    await row.getByRole("button", { name: `View active run for ${script.name}` }).click();
    await expect(page.getByRole("region", { name: "Selected job run" })).toContainText(job.username);
    await fits(page.locator(".script-workspace-panel, .job-detail-fields, .job-detail-fields > span"));
    // The global header has separate responsive tests. At enlarged root text
    // size, check this workspace's bounds independently of the header.
    const workspaceBox = (await page.locator(".scripts-workspace").boundingBox())!;
    expect(workspaceBox.x + workspaceBox.width).toBeLessThanOrEqual(width);
    if (!largeText) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const tabs = await page.getByRole("tab").all();
    for (let index = 1; index < tabs.length; index++) {
      const previous = (await tabs[index - 1].boundingBox())!;
      const current = (await tabs[index].boundingBox())!;
      expect(current.x >= previous.x + previous.width - 1 || current.y >= previous.y + previous.height - 1).toBe(true);
    }
    if (process.env.PR_SCREENSHOT_DIR) {
      await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
      await list.locator(".scripts-list-scroll").evaluate(el => { el.scrollTop = 0; });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.move(0, 0);
      await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, `scripts-${width}${largeText ? "-large-text" : ""}.png`), fullPage: true });
    }
  });
}
