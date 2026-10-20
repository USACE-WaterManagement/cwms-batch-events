import fetchWithAuth from "../../utils/fetchWithAuth";
import { notifyError } from "../../utils/errorNotifications";
import { notifySuccess } from "../../utils/actionNotifications";
import { currentEnvironmentLabel } from "../../utils/environment";

interface SaveFileHandle {
  name: string;
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}

type SaveFilePicker = (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<SaveFileHandle>;

const saveFilePicker = (globalThis as typeof globalThis & { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;

export type TransferPackage = {
  schemaVersion: 1;
  configurationKey: string;
  sourceOffice: string;
  environment?: string;
  configuration: Record<string, unknown>;
};

export const exportConfiguration = async (scriptId: string, token?: string) => {
  try {
    const response = await fetchWithAuth(`/api/scripts/${scriptId}/configuration-export`, {}, token);
    const exportedPackage = await response.json() as TransferPackage;
    const packageData: TransferPackage = { ...exportedPackage, environment: currentEnvironmentLabel() };
    const fileName = `${String(packageData.configuration.name ?? "script")}-configuration.json`;
    const blob = new Blob([JSON.stringify(packageData, null, 2)], { type: "application/json" });
    if (saveFilePicker) {
      const handle = await saveFilePicker({
        suggestedName: fileName,
        types: [{ description: "JSON configuration", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      notifySuccess(`Configuration saved as ${handle.name}`);
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    notifySuccess(`Configuration download started: ${fileName}`);
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") return;
    notifyError({ id: "configuration-export", message: caught instanceof Error ? caught.message : "The configuration could not be exported." });
  }
};
