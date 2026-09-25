import { useAuth } from "@usace-watermanagement/groundwork-water";
import useAdminOffices from "./useAdminOffices";
import { OfficeSelector } from "../../shared/components/OfficeSelector";
import { ScriptsWorkspace } from "./ScriptsWorkspace";
import { useRememberedOffice } from "../../shared/hooks/useRememberedOffice";
import LoginPrompt from "../auth/LoginPrompt";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";

export const ScriptsManager = () => {
  const auth = useAuth();
  const { data, isLoading, isError } = useAdminOffices();

  const [office, setOffice] = useRememberedOffice(data ?? []);
  const search = useSearch({ from: "/scripts-manager" });
  const navigate = useNavigate();
  const [scriptSearch, setScriptSearch] = useState("");
  const searchTerm = useDebouncedValue(scriptSearch);
  const selectedOffice = search.office && data?.includes(search.office) ? search.office : office;

  if (!auth.isAuth) {
    return (
      <LoginPrompt
        title="Sign in to manage jobs"
        description="Office administrators can define and maintain jobs for their offices."
      />
    );
  }

  if (isLoading) return <span>Admin office list is loading...</span>;
  if (isError) return <span>Error fetching admin office list for user</span>;
  if (!data || data.length < 1)
    return <span>You do not have job administrator rights for any offices.</span>;

  return (
    <>
      {selectedOffice && <ScriptsWorkspace key={selectedOffice} office={selectedOffice} initialScriptId={search.scriptId} initialJobId={search.jobId} initialEdit={search.edit}
        officeSelector={<label className="flex items-center gap-2 text-sm font-medium text-slate-600">Office<select aria-label="Office" value={selectedOffice} className="min-h-10 rounded-md border border-slate-300 bg-white py-2 pl-3 pr-9 text-slate-900" onChange={event => { setOffice(event.target.value); void navigate({ to: "/scripts-manager", search: {}, replace: true }); }}>{[...data].sort().map(code => <option key={code} value={code}>{code}</option>)}</select></label>}
        search={scriptSearch} onSearch={setScriptSearch} searchTerm={searchTerm} />}
      {!selectedOffice && <OfficeSelector offices={data} value={selectedOffice} onChange={setOffice} />}
    </>
  );
};
