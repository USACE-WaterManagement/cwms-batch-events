import { test, expect } from "@playwright/test";
import { formatArguments, parseArguments } from "../../src/features/scripts-manager/commandArguments";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test("argument parsing preserves quoted values and ignores unquoted trailing whitespace", () => {
  const args = ["two words", "", "space ", " leading", "$HOME", "&&", "a'b", 'a"b', "a\\b", "*", "line\nbreak"];
  expect(parseArguments(formatArguments(args))).toEqual(args);
  expect(parseArguments('--date 2026-09-01 "two words"   ')).toEqual(["--date", "2026-09-01", "two words"]);
  for (const text of ['"unfinished', "trailing\\", "--date today && echo done", "--date today || echo failed", "$HOME", "*.txt"]) {
    expect(() => parseArguments(text)).toThrow();
  }
});

test("v2 run offers an upgrade; shell chains use a v3 snapshot without saving the script", async ({ page }) => {
  const script = { id: "v2-report", configVersion: 2, name: "Daily report", office: "SWT", active: true,
    roles: [], executionType: "github_file", runtime: "python", repoPath: "python/report.py",
    commandArgs: ["--date", "today"], description: "Generate and upload a reservoir report.",
    createdTime: "2026-09-23T12:00:00Z", updatedTime: "2026-09-23T12:00:00Z" };
  const posts: Record<string, unknown>[] = [];
  const scriptWrites: string[] = [];
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.includes("/scripts") && method !== "GET") scriptWrites.push(path);
    if (path.endsWith("/scripts/catalog")) return route.fulfill({ json: [script] });
    if (path.endsWith("/jobs") && method === "POST") {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ json: { id: "v3-job", scriptId: script.id, scriptName: script.name, office: "SWT", jobStatus: "Completed" } });
    }
    if (path.endsWith("/jobs/v3-job")) return route.fulfill({ json: { id: "v3-job", scriptName: script.name, office: "SWT", jobStatus: "Completed" } });
    if (path.endsWith("/logs/page")) return route.fulfill({ json: { logs: "Report complete", available: true } });
    return route.fulfill({ json: [] });
  });
  const capture = async (name: string) => {
    if (!process.env.PR_SCREENSHOT_DIR) return;
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  };
  await page.setViewportSize({ width: 1360, height: 1050 });
  await page.goto("/events/submit");
  await page.getByRole("button", { name: "Login", exact: true }).first().click();
  await page.getByRole("combobox").first().selectOption("SWT");
  await page.getByRole("combobox").last().selectOption(script.id);
  await page.getByRole("button", { name: "Submit job", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Upgrade this run to version 3?" })).toBeVisible();
  expect(posts).toEqual([]);
  await capture("version-upgrade-prompt");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Custom run", exact: true }).click();
  await page.getByLabel("Arguments for this run").fill('--date 2026-09-01 --name "Daily reservoir report"   ');
  await expect(page.getByLabel("Parsed arguments")).toContainText('4: "Daily reservoir report"');
  await capture("quoted-arguments");
  await page.getByLabel("Arguments for this run").fill('--date today && echo done');
  await expect(page.getByRole("button", { name: "Submit custom run", exact: true })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Use Bash command mode");
  await page.getByLabel("Command mode", { exact: true }).selectOption("shell");
  const command = 'python /jobs/python/report.py --date 2026-09-01 && echo "Report complete" || echo "Report failed"   ';
  await page.getByLabel("Bash command", { exact: true }).fill(command);
  await capture("bash-command-chain");
  await page.getByRole("button", { name: "Submit custom run", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run version 2", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Upgrade this run", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/v3-job$/);
  expect(posts).toEqual([{ scriptId: script.id, upgradeToVersion: 3, commandMode: "shell", shellCommand: command }]);
  expect(scriptWrites).toEqual([]);
  expect(script.configVersion).toBe(2);
  await page.getByRole("link", { name: "Submit Job", exact: true }).click();
  await page.getByRole("combobox").first().selectOption("SWT");
  await page.getByRole("combobox").last().selectOption(script.id);
  await page.getByRole("button", { name: "Submit job", exact: true }).click();
  await page.getByRole("button", { name: "Run version 2", exact: true }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1]).toEqual({ scriptId: script.id });
  await page.goto("/events/help/script-versions");
  await expect(page.getByRole("heading", { name: "Script versions and commands" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
