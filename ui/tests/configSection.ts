import type { Page } from "@playwright/test";
export async function configSection(page: Page, label: string) {
  const nav = page.getByRole("navigation", { name: "Configuration sections" });
  if (await nav.isVisible()) await nav.getByRole("button", { name: label, exact: true }).click();
}
