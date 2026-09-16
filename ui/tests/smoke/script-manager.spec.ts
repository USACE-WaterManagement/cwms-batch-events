import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

test("browse files, field help, responsive footer, and help navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const capture = async (name: string) => {
    if (!process.env.PR_SCREENSHOT_DIR) return;
    await mkdir(process.env.PR_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.PR_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
  };
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/admin-offices")) return route.fulfill({json:["SWT", "CERL"]});
    if (path.endsWith("/repository-files")) return route.fulfill({json:{
      repository:"USACE-WaterManagement/swt-wm-cwbi-jobs", ref:"cwbi-dev",
      paths:["python/reports/daily_report.py", "python/reports/config.json", "bin/daily.sh", "lib/report.jar"],
    }});
    if (path.endsWith("/job-runners/default")) return route.fulfill({json:{id:"runner-1",slug:"batch"}});
    return route.fulfill({json:[]});
  });
  await page.setViewportSize({width:1280,height:900});
  await page.goto("/events/scripts-manager");
  await page.getByRole("button",{name:"Login",exact:true}).first().click();
  await page.getByRole("combobox").selectOption("SWT");
  await expect(page.getByRole("heading",{name:"No scripts yet for SWT"})).toBeVisible();
  await capture("empty-office");
  await page.getByRole("button",{name:"Create first script"}).click();
  await page.getByLabel("Name",{exact:true}).fill("Daily report");
  await page.getByLabel("GitHub Repo Path",{exact:true}).fill("python/");
  await page.getByRole("option",{name:"reports/",exact:true}).click();
  await expect(page.getByLabel("GitHub Repo Path",{exact:true})).toHaveValue("python/reports/");
  await page.getByRole("button",{name:"Browse",exact:true}).click();
  await expect(page.getByRole("button",{name:"Select file config.json"})).toHaveCount(0);
  await capture("file-browser");
  await page.getByRole("combobox").filter({visible:true}).last().selectOption("all");
  await expect(page.getByRole("button",{name:"Select file config.json"})).toBeVisible();
  await page.getByRole("button",{name:"Select file daily_report.py"}).click();
  await page.getByRole("button",{name:"Use selected file"}).click();
  await expect(page.getByLabel("GitHub Repo Path",{exact:true})).toHaveValue("python/reports/daily_report.py");
  await capture("python-registration");
  await page.getByLabel("Runtime",{exact:true}).selectOption("java");
  await page.getByLabel("Name",{exact:true}).fill("Build water supply metadata");
  await page.getByLabel("JAR Path",{exact:true}).fill("java-artifacts/BuildWSmetadataViaCDA.jar");
  await page.getByLabel("Name",{exact:true}).click();
  await expect(page.getByText(/Browse lists GitHub files only/)).toBeVisible();
  await capture("java-registration");
  await page.getByLabel("Runtime",{exact:true}).selectOption("shell");
  await page.getByLabel("GitHub Repo Path",{exact:true}).fill("bin/daily.sh");
  await capture("bash-registration");
  await page.getByLabel("Source",{exact:true}).selectOption("command");
  await page.getByLabel("Name",{exact:true}).fill("Upload job status");
  await page.getByLabel("Executable",{exact:true}).fill("bash");
  await page.getByLabel("Arguments",{exact:true}).fill("-lc\nprintf 'Job completed\\n' > /tmp/job-status.txt && cwms-cli blob upload --input-file /tmp/job-status.txt --blob-id JOB-STATUS --media-type text/plain --office SWT");
  await capture("installed-command");
  await page.getByRole("button",{name:"Help with Arguments",exact:true}).click();
  await expect(page.getByRole("region",{name:"Arguments help"})).toBeVisible();
  await capture("field-help");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("region",{name:"Arguments help"})).toBeHidden();
  await page.getByLabel("Role to add").selectOption("RDL Reviewer");
  await page.getByRole("button",{name:"Add role",exact:true}).click();
  await page.setViewportSize({width:390,height:700});
  await page.getByLabel("Active",{exact:true}).uncheck();
  await expect(page.getByRole("button",{name:"Save",exact:true})).toBeInViewport();
  const bounds = await page.evaluate(() => ({
    fields: document.querySelector(".script-form-fields")!.getBoundingClientRect().bottom,
    footer: document.querySelector(".script-form-actions")!.getBoundingClientRect().top,
  }));
  expect(bounds.fields).toBeLessThan(bounds.footer);
  await capture("mobile-registration");
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole("button",{name:"SWT GitHub",exact:true}).click();
  await expect(page.getByText("https://github.com/USACE-WaterManagement/swt-wm-cwbi-jobs",{exact:true})).toBeVisible();
  await capture("district-repository");
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await page.goto("/events/about/script-files");
  await expect(page).toHaveURL(/\/help\/script-files$/);
  await expect(page.getByRole("heading",{name:"Adding script files"})).toBeVisible();
  await capture("script-setup-guide");
  expect(errors).toEqual([]);
});
