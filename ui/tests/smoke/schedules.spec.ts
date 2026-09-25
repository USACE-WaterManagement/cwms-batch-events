import { configSection } from "../configSection";
import { expect, test } from "@playwright/test";

test("saves timezone schedules and disables scheduling when switched to manual", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let saved: Record<string, unknown> | undefined;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/admin-offices"))
      return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/scheduler/status")) return route.fulfill({ json: {
      enabled: true, tasks: [{ name: "schedules", healthy: true, lastSuccess: "2026-09-24T12:00:00Z" }, { name: "queue_delivery", healthy: true, lastSuccess: "2026-09-24T12:00:00Z" }],
      pendingDelivery: 0, needsAttention: 0, invalidSchedules: 0,
    } });
    if (path.endsWith("/job-runners/default"))
      return route.fulfill({ json: { id: "runner-1", slug: "batch" } });
    if (["POST", "PUT"].includes(request.method())) {
      saved = {
        ...saved,
        ...request.postDataJSON(),
        id: "script-1",
        slug: "synthetic-schedule",
        createdTime: "2026-01-01T00:00:00Z",
        updatedTime: "2026-01-01T00:00:00Z",
      };
      return route.fulfill({ json: saved });
    }
    return route.fulfill({ json: saved ? [saved] : [] });
  });
  await page.goto("/events/scripts-manager");
  await page
    .getByRole("button", { name: "Login", exact: true })
    .first()
    .click();
  await page.getByRole("combobox").selectOption("SWT");
  await expect(page.getByText("Scheduler is running", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Create first job", exact: true }).click();
  await configSection(page, "General");
  await page.getByLabel("Name", { exact: true }).fill("Synthetic Schedule");
  await configSection(page, "Command");
  await page
    .getByLabel("GitHub Repo Path", { exact: true })
    .fill("python/report.py");
  await configSection(page, "Schedule");
  await page.getByLabel("Schedule", { exact: true }).selectOption("hourly");
  await configSection(page, "Schedule");
  await page.getByLabel("Minute", { exact: true }).fill("25");
  await configSection(page, "Schedule");
  await page.getByLabel("Timezone", { exact: true }).fill("America/Chicago");
  await configSection(page, "Schedule");
  await page.getByRole("radio", { name: "Automatic", exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(saved?.scheduleMinute).toBe(25);
  expect(saved?.scheduleTimezone).toBe("America/Chicago");
  for (const preset of ["daily", "monthly"]) {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await configSection(page, "Schedule");
    await page.getByLabel("Schedule", { exact: true }).selectOption(preset);
    await page.getByLabel("Run at", { exact: true }).fill("09:35");
    if (preset === "monthly") {
      await page.getByLabel("Day of month", { exact: true }).selectOption("31");
      await expect(page.getByText("In shorter months, runs on the last day of the month.")).toBeVisible();
    }
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    expect(saved?.scheduleType).toBe(preset === "monthly" ? "monthly" : "cron");
    expect(saved?.scheduleCron).toBe(preset === "daily" ? "35 9 * * *" : "35 9 31 * *");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await configSection(page, "Schedule");
    await expect(page.getByLabel("Schedule", { exact: true })).toHaveValue(preset);
    await expect(page.getByLabel("Run at", { exact: true })).toHaveValue("09:35");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await configSection(page, "Schedule");
  await page.getByLabel("Schedule", { exact: true }).selectOption("cron");
  await expect(page.getByRole("link", { name: "Open cron calculator (new tab)" })).toHaveAttribute("href", "https://crontab.guru/");
  await configSection(page, "Schedule");
  await page.getByLabel("Cron expression", { exact: true }).fill("0,1 * * * *");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("The minimum schedule interval is 5 minutes. Space all selected run times at least 5 minutes apart.")).toBeVisible();
  expect(saved?.scheduleCron).toBe("35 9 31 * *");
  await page.getByLabel("Cron expression", { exact: true }).fill("0 8 * * 1-5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(saved?.scheduleCron).toBe("0 8 * * 1-5");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await configSection(page, "Schedule");
  await page.getByLabel("Schedule", { exact: true }).selectOption("manual");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(saved?.scheduleEnabled).toBe(false);
  expect(errors).toEqual([]);
});
