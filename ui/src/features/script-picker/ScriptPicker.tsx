import { useState } from "react";
import useScriptsCatalog from "./useScriptCatalog";
import { Dropdown } from "@usace/groundwork";
import ScriptExecutor from "./ScriptExecutor";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { OfficeSelector } from "../../shared/components/OfficeSelector";
import { useRememberedOffice } from "../../shared/hooks/useRememberedOffice";
import LoginPrompt from "../auth/LoginPrompt";
import { useSearch } from "@tanstack/react-router";

const ScriptPicker = () => {
  const search = useSearch({ from: "/submit" });
  const [scriptId, setScriptId] = useState<string | undefined>(search.scriptId);

  const auth = useAuth();
  const { data, isLoading, isError } = useScriptsCatalog();
  const offices = Array.from(new Set(data?.map((script) => script.office) ?? []));
  const [rememberedOffice, setOffice] = useRememberedOffice(offices);
  const [changedOffice, setChangedOffice] = useState<string>();
  const office = changedOffice ?? (offices.includes(search.office ?? "") ? search.office : rememberedOffice);

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
  const selectedScript = scriptsForOffice.find(script => script.id === scriptId);

  const officeChange = (office: string) => {
    setChangedOffice(office);
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
          className="w-full max-w-96"
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
      {selectedScript && (
        <div className="mt-8">
          <ScriptExecutor key={selectedScript.id} script={selectedScript} />
        </div>
      )}
    </div>
  );
};

export default ScriptPicker;
