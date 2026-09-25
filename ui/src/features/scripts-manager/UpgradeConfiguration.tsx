import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { Button } from "@usace/groundwork";
import fetchWithAuth from "../../utils/fetchWithAuth";
import LoadingSpinner from "../../shared/components/LoadingSpinner";
import { CURRENT_SCRIPT_VERSION, supportsScriptVersion } from "./commandArguments";
import type { Script } from "./types";
import { ScriptVersionHelp } from "./CommandModal";
import { ScriptVersionNotice } from "./ScriptVersionNotice";

export function UpgradeConfiguration({ script }: { script: Script }) {
  const auth = useAuth();
  const cache = useQueryClient();
  const upgrade = useMutation({
    meta: { inlineError: true },
    mutationFn: async (): Promise<Script> => {
      const response = await fetchWithAuth(`/api/scripts/${script.id}/upgrade`, { method: "POST" }, auth.token);
      return response.json();
    },
    onSuccess: updated => {
      cache.setQueryData<Script[]>(["scripts", script.office], old => old?.map(item => item.id === updated.id ? updated : item));
      void cache.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
  const version = script.configVersion ?? 1;
  return <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
    <ScriptVersionNotice version={version} />
    {version === CURRENT_SCRIPT_VERSION && <p>This configuration is up to date.</p>}
    {supportsScriptVersion(version) && version < CURRENT_SCRIPT_VERSION && <>
      <p className="font-semibold">Upgrade configuration to version {CURRENT_SCRIPT_VERSION}</p>
      <p className="text-sm">Add scheduling and timezone settings. This keeps the effective saved command and leaves scheduling disabled. Existing jobs keep their original settings.</p>
      {version === 1 && <p className="text-sm">Historical scripts keep Python execution. Previously ignored runtime and argument fields will be cleared. Paths that cannot be safely converted require review.</p>}
      <Button type="button" disabled={upgrade.isPending} onClick={() => upgrade.mutate()}>
        {upgrade.isPending ? "Upgrading configuration…" : "Upgrade configuration"}
      </Button>
    </>}
    {upgrade.isPending && <div role="status" className="flex items-center gap-2"><LoadingSpinner />Saving configuration version {CURRENT_SCRIPT_VERSION}…</div>}
    {upgrade.isSuccess && <div role="status" className="rounded border border-green-600 bg-green-50 p-3 text-green-900">Configuration upgraded successfully to version {CURRENT_SCRIPT_VERSION}. Scheduling is disabled until you configure and enable it.</div>}
    {upgrade.isError && <div role="alert" className="rounded border border-red-500 bg-red-50 p-3 text-red-800">Upgrade failed: {upgrade.error.message} You can retry with Upgrade configuration.</div>}
    <ScriptVersionHelp />
  </div>;
}
