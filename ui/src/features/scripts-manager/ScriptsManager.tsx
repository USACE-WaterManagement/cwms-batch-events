import { useAuth } from "@usace-watermanagement/groundwork-water";
import useAdminOffices from "./useAdminOffices";
import { OfficeSelector } from "../../shared/components/OfficeSelector";
import { ScriptsWorkspace } from "./ScriptsWorkspace";
import { useRememberedOffice } from "../../shared/hooks/useRememberedOffice";
import LoginPrompt from "../auth/LoginPrompt";

export const ScriptsManager = () => {
  const auth = useAuth();
  const { data, isLoading, isError } = useAdminOffices();

  const [office, setOffice] = useRememberedOffice(data ?? []);

  if (!auth.isAuth) {
    return (
      <LoginPrompt
        title="Sign in to manage scripts"
        description="Script administrators can define and maintain jobs for their offices."
      />
    );
  }

  if (isLoading) return <span>Admin office list is loading...</span>;
  if (isError) return <span>Error fetching admin office list for user</span>;
  if (!data || data.length < 1)
    return <span>You do not have script admin rights for any offices.</span>;

  return (
    <>
      <OfficeSelector offices={data} value={office} onChange={setOffice} />
      {office && <ScriptsWorkspace key={office} office={office} />}
    </>
  );
};
