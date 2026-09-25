import { test, expect } from "@playwright/test";

const script = { id: "script-report", office: "SWT", name: "Reservoir report", slug: "reservoir-report", active: true,
  configVersion: 4, runtime: "python", executionType: "github_file", repoPath: "python/report.py",
  description: "Daily reservoir levels", roles: [], commandArgs: [], jobRunners: ["runner"],
  createdTime: "2026-01-01T00:00:00Z", updatedTime: "2026-01-01T00:00:00Z" };
const runs = ["latest", "older"].map((id, index) => ({ id, office: "SWT", scriptId: script.id, scriptName: script.name,
  jobStatus: "Completed", createdTime: `2026-09-${24-index}T12:00:00Z`, repoPath: script.repoPath }));

test("script search debounces, handles empty results, and retains selection", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-24T12:00:00Z") });
  let scriptReads = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner" } });
    if (path.endsWith("/scripts")) { scriptReads++; return route.fulfill({ json: [script, { ...script, id: "java", name: "Forecast", slug: "forecast", description: "Weather", runtime: "java", repoPath: "forecast.jar" }] }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").first().selectOption("SWT");
  await page.getByText(script.name, { exact: true }).click();
  await page.clock.pauseAt(new Date("2026-09-24T12:01:00Z"));
  const rows = page.getByRole("table", { name: "Jobs", exact: true }).locator("tbody tr");
  const search = page.getByRole("searchbox", { name: "Search jobs" });
  await search.fill("FORECAST java");
  await page.clock.runFor(299);
  await expect(rows).toHaveCount(2);
  await page.clock.runFor(1);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Forecast");
  await expect(page.locator(".script-workspace-panel").getByRole("heading", { name: script.name, exact: true })).toBeVisible();
  await search.fill("does not exist");
  await page.clock.runFor(300);
  await expect(page.getByText("No jobs match your search. Try a name, command, path, or runtime.")).toBeVisible();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.clock.runFor(300);
  await expect(rows).toHaveCount(2);
  expect(scriptReads).toBe(1);
});

test("run selection is routed, share copies a canonical link, and back restores the exact run", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (value: string) => { document.documentElement.dataset.copiedLink = value; } } });
  });
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner" } });
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script] });
    if (path.endsWith("/jobs")) return route.fulfill({ json: runs, headers: { "X-Total-Count": "2" } });
    if (path.endsWith("/logs/page")) return route.fulfill({ json: { logs: path.includes("older") ? "Older output" : "Latest output", hasMore: false } });
    if (path.endsWith("/jobs/older")) return route.fulfill({ json: runs[1] });
    if (path.endsWith("/jobs/latest")) return route.fulfill({ json: runs[0] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").first().selectOption("SWT");
  await page.getByRole("button", { name: "Runs", exact: true }).click();
  await page.getByRole("list", { name: "Script run history" }).getByRole("button").nth(1).click();
  await expect(page).toHaveURL(/jobId=older/);
  await expect(page.getByLabel("Job output")).toHaveValue("Older output");
  await page.getByRole("button", { name: "Share job log", exact: true }).click();
  const shared = await page.evaluate(() => document.documentElement.dataset.copiedLink);
  expect(shared).toBe("http://127.0.0.1:4173/events/jobs/older");
  await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible();
  await page.getByRole("link", { name: "Open job page", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/older$/);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error("Clipboard unavailable"); }; });
  await page.getByRole("button", { name: "Share job log", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Job log link", exact: true })).toHaveValue(shared!);
  await page.getByRole("link", { name: "Back to script view", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Run history", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Job output")).toHaveValue("Older output");
  await expect(page.getByRole("list", { name: "Script run history" }).getByRole("button").nth(1)).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await expect(page.getByLabel("Job output")).toHaveValue("Older output");
  await page.getByRole("list", { name: "Script run history" }).getByRole("button").first().click();
  await expect(page).toHaveURL(/jobId=latest/);
  await page.goBack();
  await expect(page.getByLabel("Job output")).toHaveValue("Older output");
  await page.goto(shared!);
  await expect(page.getByRole("heading", { name: "Sign in to view this job" })).toBeVisible();
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await expect(page.getByLabel("Job output")).toHaveValue("Older output");
});
