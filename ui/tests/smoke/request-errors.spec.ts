import { configSection } from "../configSection";
import { expect, test } from "@playwright/test";

test("server errors retry once, show one toast, and recover on explicit retry", async ({ page }) => {
  let requests = 0;
  let recovered = false;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/scheduler/status")) return route.fulfill({ json: { enabled: false, tasks: [], pendingDelivery: 0, needsAttention: 0, invalidSchedules: 0 } });
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner-1", slug: "batch" } });
    if (path.endsWith("/scripts")) {
      requests++;
      return recovered ? route.fulfill({ json: [] }) : route.fulfill({ status: 500, contentType: "text/plain", body: "Internal Server Error" });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  const notifications = page.getByRole("region", { name: "Notifications" });
  await expect(notifications.getByRole("alert")).toHaveCount(1);
  await expect(notifications).toContainText("The server could not complete the request");
  expect(requests).toBe(2);
  await page.waitForTimeout(5500);
  expect(requests).toBe(2);
  recovered = true;
  await notifications.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "No scripts yet for SWT" })).toBeVisible();
  await expect(notifications.getByRole("alert")).toHaveCount(0);
  expect(requests).toBe(3);
});

test("client errors show the API detail without retrying and can be dismissed", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/scheduler/status")) return route.fulfill({ json: { enabled: false, tasks: [], pendingDelivery: 0, needsAttention: 0, invalidSchedules: 0 } });
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner-1", slug: "batch" } });
    if (path.endsWith("/repository-files")) {
      requests++;
      return route.fulfill({ status: 404, json: { detail: "No job repository configured for this office" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  const notifications = page.getByRole("region", { name: "Notifications" });
  await expect(notifications).toContainText("No job repository configured for this office");
  expect(requests).toBe(1);
  await notifications.getByRole("button", { name: "Dismiss notification" }).click();
  await expect(notifications.getByRole("alert")).toHaveCount(0);
});

test("failed saves show a toast, retain the form, and are not automatically repeated", async ({ page }) => {
  let saves = 0;
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/scheduler/status")) return route.fulfill({ json: { enabled: false, tasks: [], pendingDelivery: 0, needsAttention: 0, invalidSchedules: 0 } });
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner-1", slug: "batch" } });
    if (path.endsWith("/scripts") && route.request().method() === "POST") {
      saves++;
      return route.fulfill({ status: 500, body: "Internal Server Error" });
    }
    if (path.endsWith("/repository-files")) return route.fulfill({ json: { repository: "USACE-WaterManagement/swt-wm-cwbi-jobs", ref: "cwbi-dev", paths: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  await page.getByRole("button", { name: "Create first script" }).click();
  await configSection(page, "General");
  await page.getByLabel("Name", { exact: true }).fill("SWT report");
  await configSection(page, "Command");
  await page.getByLabel("GitHub Repo Path", { exact: true }).fill("python/report.py");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("The server could not complete the request");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("SWT report");
  await page.waitForTimeout(2500);
  expect(saves).toBe(1);
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => saves).toBe(2);
  await expect(page.getByRole("region", { name: "Notifications" }).getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "View warnings and errors (1)", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Warnings and errors" });
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Check again", exact: true })).toBeDisabled();
  expect(saves).toBe(2);
});

test("failed job polling stops after one retry", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/**", route => {
    if (new URL(route.request().url()).pathname.endsWith("/jobs/test-job")) {
      requests++;
      return route.fulfill({ status: 500, body: "Internal Server Error" });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/events/jobs/test-job");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByRole("alert")).toHaveCount(1);
  await page.waitForTimeout(5500);
  expect(requests).toBe(2);
});
