import { expect, test } from "@playwright/test";
import { configSection } from "../configSection";

const initial = { id: "report", name: "Review report", office: "SWT", configVersion: 4,
  description: "Review fixture", active: true, runtime: "java", executionType: "github_file",
  repoPath: "report.jar", roles: [], commandArgs: [], commandMode: "arguments", jobRunners: ["runner"],
  scheduleType: "hourly", scheduleEnabled: false, scheduleMinute: 0, scheduleTimezone: "UTC",
  createdTime: "2026-01-01T00:00:00Z", updatedTime: "2026-01-01T00:00:00Z" };

test("review controls retain sections, update runtime and run mode, and route guide without reload", async ({ page }) => {
  let script = { ...initial };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/system-admin")) return route.fulfill({ json: false });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner" } });
    if (route.request().method() === "PUT") { script = { ...script, ...route.request().postDataJSON() }; return route.fulfill({ json: script }); }
    if (path.endsWith("/scripts") || path.endsWith("/catalog")) return route.fulfill({ json: [script] });
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").first().selectOption("SWT");
  await page.getByText(script.name, { exact: true }).click();
  await expect(page.getByRole("link", { name: "Script version guide" })).toHaveCount(0);
  await configSection(page, "Source");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Runtime", { exact: true })).toBeVisible();
  await page.getByLabel("Runtime", { exact: true }).selectOption("python");
  await page.getByLabel("GitHub Repo Path", { exact: true }).fill("report.py");
  await page.getByRole("radio", { name: "Automatic", exact: true }).check();
  await expect(page.getByLabel("Schedule", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: script.name });
  await expect(row.getByText("python", { exact: true })).toBeVisible();
  await expect(row.getByText("Automatic", { exact: true })).toBeVisible();
  await configSection(page, "Access");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Role to add" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  const role = await page.getByRole("combobox", { name: "Role to add" }).boundingBox();
  expect(role!.width).toBeGreaterThan(80);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await configSection(page, "Upgrade");
  await expect(page.getByText("This configuration is up to date.")).toBeVisible();
  await page.evaluate(() => { document.documentElement.dataset.routeMarker = "retained"; });
  await page.getByRole("link", { name: "Script version guide" }).click();
  await expect(page).toHaveURL(/\/help\/script-versions$/);
  expect(await page.evaluate(() => document.documentElement.dataset.routeMarker)).toBe("retained");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole("link", { name: "Submit Job", exact: true }).click();
  await page.getByRole("combobox").last().selectOption(script.id);
  await page.getByRole("button", { name: "Edit job", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(script.name);
});

test("script history loads ten runs then fetches the next page on scroll", async ({ page }) => {
  const offsets: number[] = [];
  const runs = Array.from({ length: 23 }, (_, index) => ({ id: `run-${index}`, scriptId: initial.id,
    office: "SWT", scriptName: initial.name, jobStatus: "Completed", createdTime: new Date(Date.UTC(2026, 8, 24, 0, 23-index)).toISOString() }));
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (url.pathname.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner" } });
    if (url.pathname.endsWith("/scripts")) return route.fulfill({ json: [initial] });
    if (url.pathname.endsWith("/jobs")) {
      if (url.searchParams.has("latestPerScript")) return route.fulfill({ json: [runs[0]] });
      expect(url.searchParams.get("scriptId")).toBe(initial.id);
      expect(url.searchParams.get("limit")).toBe("10");
      const offset = Number(url.searchParams.get("offset")); offsets.push(offset);
      return route.fulfill({ json: runs.slice(offset, offset + 10), headers: { "X-Total-Count": "23" } });
    }
    if (url.pathname.endsWith("/jobs/run-0")) return route.fulfill({ json: runs[0] });
    if (url.pathname.endsWith("/logs/page")) return route.fulfill({ json: { logs: "Fixture output", hasMore: false } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  await page.getByRole("button", { name: "Runs", exact: true }).click();
  const list = page.getByRole("list", { name: "Script run history" });
  await expect(list.getByRole("button")).toHaveCount(10);
  expect(offsets).toEqual([0]);
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(list.getByRole("button")).toHaveCount(20);
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(list.getByRole("button")).toHaveCount(23);
  expect(offsets).toEqual([0, 10, 20]);
});

for (const isAdmin of [false, true]) test(`scheduler admin visibility: HQ admin=${isAdmin}`, async ({ page }) => {
  let statusReads = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/system-admin")) return route.fulfill({ json: isAdmin });
    if (path.endsWith("/scheduler/status")) {
      statusReads++;
      return route.fulfill({ json: { enabled: true, tasks: [{ name: "schedules", healthy: true }, { name: "queue_delivery", healthy: true }], pendingDelivery: 0, needsAttention: 0, invalidSchedules: 0 } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/admin");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  if (isAdmin) {
    await expect(page.getByText("Scheduler is running", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible();
    expect(statusReads).toBe(1);
  } else {
    await expect(page.getByText("The HQ CWMS Admin role is required.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    expect(statusReads).toBe(0);
  }
});
