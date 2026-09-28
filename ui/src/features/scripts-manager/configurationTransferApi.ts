import fetchWithAuth from "../../utils/fetchWithAuth";

export type TransferPackage = {
  schemaVersion: 1;
  configurationKey: string;
  sourceOffice: string;
  configuration: Record<string, unknown>;
};

export const exportConfiguration = async (scriptId: string, token?: string) => {
  const response = await fetchWithAuth(`/api/scripts/${scriptId}/configuration-export`, {}, token);
  const packageData = await response.json() as TransferPackage;
  const blob = new Blob([JSON.stringify(packageData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${String(packageData.configuration.name ?? "script")}-configuration.json`;
  link.click();
  URL.revokeObjectURL(url);
};
