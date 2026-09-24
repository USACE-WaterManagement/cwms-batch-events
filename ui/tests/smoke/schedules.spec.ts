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
  await page.getByRole("button", { name: "New +", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Synthetic Schedule");
  await page
    .getByLabel("GitHub Repo Path", { exact: true })
    .fill("python/report.py");
  await page.getByLabel("Schedule", { exact: true }).selectOption("hourly");
  await page.getByLabel("Minute", { exact: true }).fill("25");
  await page.getByLabel("Timezone", { exact: true }).fill("America/Chicago");
  await page.getByLabel("Enable schedule", { exact: true }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(saved?.scheduleMinute).toBe(25);
  expect(saved?.scheduleTimezone).toBe("America/Chicago");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Schedule", { exact: true }).selectOption("cron");
  await page.getByLabel("Cron expression", { exact: true }).fill("0 8 * * 1-5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(saved?.scheduleCron).toBe("0 8 * * 1-5");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Schedule", { exact: true }).selectOption("manual");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(saved?.scheduleEnabled).toBe(false);
  expect(errors).toEqual([]);
});
