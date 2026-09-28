import fetchWithAuth from "../../utils/fetchWithAuth";
import { notifyError } from "../../utils/errorNotifications";
import { notifySuccess } from "../../utils/actionNotifications";

export type TransferPackage = {
  schemaVersion: 1;
  configurationKey: string;
  sourceOffice: string;
  configuration: Record<string, unknown>;
};

export const exportConfiguration = async (scriptId: string, token?: string) => {
  try {
    const response = await fetchWithAuth(`/api/scripts/${scriptId}/configuration-export`, {}, token);
    const packageData = await response.json() as TransferPackage;
    const fileName = `${String(packageData.configuration.name ?? "script")}-configuration.json`;
    const savedPath = `Downloads\\${fileName}`;
    const blob = new Blob([JSON.stringify(packageData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    notifySuccess(`Configuration exported to ${savedPath}`, {
      label: "Copy path",
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(savedPath);
          notifySuccess("Export path copied to the clipboard");
        } catch {
          notifyError({ id: "configuration-export-copy", message: "The export path could not be copied to the clipboard." });
        }
      },
    });
  } catch (caught) {
    notifyError({ id: "configuration-export", message: caught instanceof Error ? caught.message : "The configuration could not be exported." });
  }
};
