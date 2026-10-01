import { expect, test } from "@playwright/test";
import { dismissError, dismissToast, getNotifications, notifyError, reportWarnings } from "../../src/utils/errorNotifications";

test.beforeEach(() => getNotifications().forEach(item => dismissError(item.id)));

test("duplicates share one message until every failed read recovers", async () => {
  let retries = 0;
  notifyError({ id: "jobs", message: " Server unavailable ", retry: () => { retries++; } });
  notifyError({ id: "scripts", message: "Server   unavailable", retry: () => { retries++; } });
  expect(getNotifications()).toHaveLength(1);
  await getNotifications()[0].retry?.();
  expect(retries).toBe(2);
  reportWarnings("jobs", [], undefined);
  expect(getNotifications()).toHaveLength(1);
  reportWarnings("scripts", [], undefined);
  expect(getNotifications()).toHaveLength(0);
});

test("all unique errors persist and hiding a toast preserves the header entry", () => {
  for (let i = 0; i < 8; i++) notifyError({ id: `request-${i}`, message: `Error ${i}` });
  expect(getNotifications()).toHaveLength(8);
  dismissToast("Error 0");
  expect(getNotifications()[0].toastDismissed).toBe(true);
  expect(getNotifications()).toHaveLength(8);
  dismissError("Error 0");
  expect(getNotifications()).toHaveLength(7);
});

test("warnings from any backend response and repeated writes are deduplicated", () => {
  reportWarnings("status", { warnings: [{ message: "Partial results" }, { message: "Partial results" }] }, undefined);
  reportWarnings("catalog", { warnings: [{ message: "Partial results" }] }, undefined);
  notifyError({ id: "save-1", message: "Save failed" });
  notifyError({ id: "save-2", message: "Save failed" });
  expect(getNotifications().map(item => item.message)).toEqual(["Partial results", "Save failed"]);
  expect(getNotifications()[0].kind).toBe("warning");
  expect(getNotifications()[1].retry).toBeUndefined();
  reportWarnings("status", {}, undefined);
  expect(getNotifications()).toHaveLength(2);
  dismissError("Partial results");
  expect(getNotifications().map(item => item.message)).toEqual(["Save failed"]);
});
