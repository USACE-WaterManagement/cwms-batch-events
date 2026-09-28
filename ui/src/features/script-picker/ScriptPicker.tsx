import { useState } from "react";
import useScriptsCatalog from "./useScriptCatalog";
import { Dropdown, Text } from "@usace/groundwork";
import { Link } from "@tanstack/react-router";
import ScriptExecutor from "./ScriptExecutor";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { OfficeSelector } from "../../shared/components/OfficeSelector";
import LoginPrompt from "../auth/LoginPrompt";

const ScriptPicker = () => {
  const [office, setOffice] = useState<string | undefined>();
  const [scriptId, setScriptId] = useState<string | undefined>();

  const auth = useAuth();
  const { data, isLoading, isError } = useScriptsCatalog();

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

  const offices = Array.from(new Set(data.map((s) => s.office)));
  const scriptsForOffice = data.filter((script) => script.office === office);
  const selectedScript = data.find((script) => script.id === scriptId);

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
      {selectedScript?.executionType === "python" && (
        <Text className="mt-8 max-w-xl text-sm text-slate-600">
          Python jobs use the WM base image. See the{" "}
          <Link to="/dependencies" className="font-semibold text-blue-700 underline decoration-blue-300 underline-offset-4">
            installed Python dependencies
          </Link>{" "}
          before requesting a package for an office job.
        </Text>
      )}
    </div>
  );
};

export default ScriptPicker;
