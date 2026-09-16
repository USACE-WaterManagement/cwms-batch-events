import { useState } from "react";
import useScriptsCatalog from "./useScriptCatalog";
import { Dropdown } from "@usace/groundwork";
import ScriptExecutor from "./ScriptExecutor";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { OfficeSelector } from "../../shared/components/OfficeSelector";
import { useRememberedOffice } from "../../shared/hooks/useRememberedOffice";
import LoginPrompt from "../auth/LoginPrompt";

const ScriptPicker = () => {
  const [scriptId, setScriptId] = useState<string | undefined>();

  const auth = useAuth();
  const { data, isLoading, isError } = useScriptsCatalog();
  const offices = Array.from(new Set(data?.map((script) => script.office) ?? []));
  const [office, setOffice] = useRememberedOffice(offices);

  if (!auth.isAuth) {
    return (
      <LoginPrompt
        title="Sign in to submit a job"
        description="Choose an approved office script and provide the inputs it needs to run."
      />
    );
  }
  if (isLoading) return <span>Loading...</span>;
  if (isError || !data) return <span>Error occurred!</span>;

  const scriptsForOffice = data.filter((script) => script.office === office);

  const officeChange = (office: string) => {
    setOffice(office);
    setScriptId(undefined);
  };

  return (
    <div className="flex flex-col">
      <OfficeSelector
        offices={offices}
        value={office}
        onChange={officeChange}
      />
      <div className="mt-4">
        <Dropdown
          className="w-96"
          label="Script"
          value={scriptId}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            setScriptId(e.target.value);
          }}
          options={[
            <option key="" value="">
              Script...
            </option>,
            ...scriptsForOffice
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((script) => (
                <option key={script.id} value={script.id}>
                  {script.name}
                </option>
              )),
          ]}
        />
      </div>
      {scriptId && (
        <div className="mt-8">
          <ScriptExecutor scriptId={scriptId} />
        </div>
      )}
    </div>
  );
};

export default ScriptPicker;
