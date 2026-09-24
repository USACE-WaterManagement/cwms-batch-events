import { configSection } from "../configSection";
import { expect, test } from "@playwright/test";

test("registers and edits an installed Java command with separate arguments", async ({
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
        slug: "synthetic-java",
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
  await page.getByRole("button", { name: "Create first script", exact: true }).click();
  await configSection(page, "General");
  await page.getByLabel("Name", { exact: true }).fill("Synthetic Java");
  await configSection(page, "Source & path");
  await page.getByLabel("Source", { exact: true }).selectOption("command");
  await configSection(page, "Source & path");
  await page.getByLabel("Executable", { exact: true }).fill("java");
  await configSection(page, "Arguments & command");
  await page.getByRole("button", { name: "Add arguments", exact: true }).click();
  await page
    .getByLabel("Arguments", { exact: true })
    .fill('-jar /opt/report.jar "two words"   ');
  await page.getByRole("button", { name: "Apply arguments", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(saved?.executionType).toBe("command");
  expect(saved?.configVersion).toBe(4);
  expect(saved?.commandArgs).toEqual(["-jar", "/opt/report.jar", "two words"]);
  expect(saved?.jobRunners).toEqual(["runner-1"]);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await configSection(page, "Arguments & command");
  await page.getByRole("button", { name: "Edit arguments", exact: true }).click();
  await expect(page.getByLabel("Arguments", { exact: true })).toHaveValue(
    "-jar /opt/report.jar 'two words'",
  );
  await page.getByRole("button", { name: "Apply arguments", exact: true }).click();
  await configSection(page, "Source & path");
  await page.getByLabel("Source", { exact: true }).selectOption("github_file");
  await configSection(page, "Source & path");
  await page.getByLabel("Runtime", { exact: true }).selectOption("java");
  await configSection(page, "Source & path");
  await page
    .getByLabel("JAR Path", { exact: true })
    .fill("java-artifacts/BuildWSmetadataViaCDA.jar");
  await configSection(page, "Arguments & command");
  await page.getByRole("button", { name: "Edit arguments", exact: true }).click();
  await page.getByLabel("Arguments", { exact: true }).fill('"two words"');
  await page.getByRole("button", { name: "Apply arguments", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(saved?.runtime).toBe("java");
  expect(saved?.repoPath).toBe("java-artifacts/BuildWSmetadataViaCDA.jar");
  expect(saved?.executionType).toBe("github_file");
  expect(errors).toEqual([]);
});

test("legacy registration upgrades only through the dedicated action", async ({ page }) => {
  let script = {
    id: "legacy-1", office: "SWT", name: "Legacy Python", slug: "legacy-python",
    description: "Historical registration", repoPath: "python/report.py",
    executionType: "python", runtime: "python", commandArgs: [], configVersion: 1,
    active: true, roles: [], jobRunners: ["runner-1"],
    createdTime: "2026-01-01T00:00:00Z", updatedTime: "2026-01-01T00:00:00Z",
  };
  let writes = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({ json: ["SWT"] });
    if (path.endsWith("/job-runners/default")) return route.fulfill({ json: { id: "runner-1", slug: "batch" } });
    if (path.endsWith("/upgrade")) {
      writes++;
      script = { ...script, configVersion: 4, executionType: "github_file" };
      return route.fulfill({ json: script });
    }
    if (route.request().method() === "PUT") {
      writes++;
      script = { ...script, ...route.request().postDataJSON() };
      return route.fulfill({ json: script });
    }
    return route.fulfill({ json: path.endsWith("/scripts") ? [script] : [] });
  });
  await page.goto("/events/scripts-manager");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  await page.getByText("Legacy Python", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeDisabled();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Upgrade configuration", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Configuration upgraded successfully" })).toBeVisible();
  expect(writes).toBe(1);
  expect(script.configVersion).toBe(4);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await configSection(page, "Source & path");
  await expect(page.getByLabel("Source", { exact: true })).toHaveValue("github_file");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  expect(writes).toBe(2);
  expect(script.configVersion).toBe(4);
  expect(script.repoPath).toBe("python/report.py");
});
