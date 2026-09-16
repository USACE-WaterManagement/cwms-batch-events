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
  await page.getByLabel("Name", { exact: true }).fill("Synthetic Java");
  await page.getByLabel("Source", { exact: true }).selectOption("command");
  await page.getByLabel("Executable", { exact: true }).fill("java");
  await page
    .getByLabel("Arguments", { exact: true })
    .fill("-jar\n/opt/report.jar\ntwo words");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(saved?.executionType).toBe("command");
  expect(saved?.commandArgs).toEqual(["-jar", "/opt/report.jar", "two words"]);
  expect(saved?.jobRunners).toEqual(["runner-1"]);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Arguments", { exact: true })).toHaveValue(
    "-jar\n/opt/report.jar\ntwo words",
  );
  await page.getByLabel("Source", { exact: true }).selectOption("github_file");
  await page.getByLabel("Runtime", { exact: true }).selectOption("java");
  await page
    .getByLabel("JAR Path", { exact: true })
    .fill("java-artifacts/BuildWSmetadataViaCDA.jar");
  await page.getByLabel("Arguments", { exact: true }).fill("two words");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(saved?.runtime).toBe("java");
  expect(saved?.repoPath).toBe("java-artifacts/BuildWSmetadataViaCDA.jar");
  expect(saved?.executionType).toBe("github_file");
  expect(errors).toEqual([]);
});
