import { configSection } from "../configSection";
import { expect, test } from "@playwright/test";

for (const warning of [
  { code: "github_app_not_configured", message: "The GitHub App token is not set. Enter the path manually." },
  { code: "github_app_secret_unavailable", message: "The GitHub App secret could not be read. Enter the path manually." },
]) test(`${warning.code}: warn signed-in users without blocking manual registration`, async ({ page }) => {
  let saved: Record<string, unknown> | undefined;
  let catalogRequests = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/scheduler/status")) return route.fulfill({ json: { enabled: false, tasks: [], pendingDelivery: 0, needsAttention: 0, invalidSchedules: 0 } });
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/repository-status")) return route.fulfill({ json: { warnings: [warning], mock: false } });
    if (path.endsWith("/repository-files")) {
      catalogRequests++;
      return route.fulfill({ json: { repository: "USACE-WaterManagement/swt-wm-cwbi-jobs", ref: "cwbi-dev", paths: [], warnings: [warning] } });
    }
    if (path.endsWith("/scripts") && route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { ...saved, id: "test-script" }, status: 201 });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/scripts-manager");
  await expect(page.getByRole("button", { name: /View warnings and errors/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  await page.getByRole("button", { name: /View warnings and errors/ }).click();
  await expect(page.getByText(warning.message, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "SWT GitHub", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "SWT GitHub", exact: true }).click();
  await expect(page.getByText("https://github.com/USACE-WaterManagement/swt-wm-cwbi-jobs", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Create first script" }).click();
  await configSection(page, "General");
  await page.getByLabel("Name", { exact: true }).fill("Manual SWT report");
  await configSection(page, "Command");
  await page.getByLabel("GitHub Repo Path", { exact: true }).fill("python/report.py");
  await expect(page.getByRole("button", { name: "Browse", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saved?.repoPath).toBe("python/report.py");
  expect(catalogRequests).toBe(1);
});
