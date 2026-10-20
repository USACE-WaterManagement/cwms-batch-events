import { test, expect } from "@playwright/test";
import { configSection } from "../configSection";

test("select a release JAR and preserve the pin in the saved configuration", async ({ page }) => {
  const pin = { repository: "USACE-WaterManagement/swt-wm-cwbi-jobs", releaseId: 1, assetId: 2, tag: "v1.2", name: "report.jar", sha256: "a".repeat(64), size: 500 };
  let script = { id: "java-report", office: "SWT", name: "Java report", slug: "java-report", active: true, configVersion: 4,
    runtime: "java", executionType: "github_file", repoPath: "report.jar", description: "Office report", commandMode: "arguments", roles: [], commandArgs: ["--help"], jobRunners: ["runner"],
    createdTime: "2026-01-01T00:00:00Z", updatedTime: "2026-01-01T00:00:00Z" };
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner" } });
    if (path.endsWith("/scripts/java-report") && route.request().method() === "PUT") {
      saved = route.request().postDataJSON();
      script = { ...script, ...saved };
      return route.fulfill({ json: script });
    }
    if (path.endsWith("/scripts")) return route.fulfill({ json: [script] });
    if (path.endsWith("/repository-releases")) return route.fulfill({ json: { repository: pin.repository, ref: "cwbi-test", releases: [{ id: 1, tag: pin.tag, name: "Report", prerelease: false }], hasMore: false } });
    if (path.endsWith("/jars")) return route.fulfill({ json: { assets: [{ name: pin.name, selection: pin }, { name: "old.jar", selection: null }], hasMore: false } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/scripts-manager?office=SWT&scriptId=java-report&edit=true");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await expect(page.getByRole("navigation", { name: "Configuration sections" })).toBeVisible();
  await configSection(page, "Command");
  await page.getByRole("button", { name: "Browse release JARs" }).click();
  await page.getByRole("combobox", { name: "Release", exact: true }).selectOption("1");
  await expect(page.getByText("Unavailable for selection.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Select report.jar" }).click();
  await expect(page.getByText("Pinned asset #2 · SHA-256 verified")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saved?.releaseJar).toEqual(pin);
  await expect.poll(() => saved?.commandArgs).toEqual(["--help"]);
  await expect(page.getByText("GitHub Release v1.2", { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
