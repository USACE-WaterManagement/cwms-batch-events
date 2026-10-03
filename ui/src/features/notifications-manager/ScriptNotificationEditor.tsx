import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dropdown,
  Field,
  Fieldset,
  H3,
  Label,
  Text,
} from "@usace/groundwork";
import toast from "react-hot-toast";
import { FaPen } from "react-icons/fa6";
import { HelpTip } from "../../shared/components/HelpTip";
import type { Script } from "../scripts-manager/types";
import useAdminOffices from "../scripts-manager/useAdminOffices";
import { RecipientEditor } from "./RecipientEditor";
import {
  useCreateScriptNotificationRule,
  useDeleteScriptNotificationRule,
  useNotificationTemplates,
  usePreviewNotificationTemplate,
  useScriptNotificationRules,
  useUpdateScriptNotificationRule,
} from "./api";

interface ScriptNotificationEditorProps {
  script: Script;
}

const jobFailureData = (script: Script) => ({
  jobId: "preview-job-id",
  scriptId: script.id,
  scriptName: script.name,
  scriptSlug: script.slug,
  repoPath: script.repoPath,
  executionType: script.executionType,
  username: "preview.user",
  office: script.office,
  externalJobId: "preview-external-id",
  errorMessage: "Example failure message",
  logs: "Example job log output",
  status: "Failed",
});

export const ScriptNotificationEditor = ({
  script,
}: ScriptNotificationEditorProps) => {
  const templates = useNotificationTemplates(script.office);
  const adminOffices = useAdminOffices();
  const rules = useScriptNotificationRules(script.id);
  const createRule = useCreateScriptNotificationRule(script.id);
  const updateRule = useUpdateScriptNotificationRule(script.id);
  const deleteRule = useDeleteScriptNotificationRule(script.id);
  const preview = usePreviewNotificationTemplate();
  const resetPreview = preview.reset;

  const rule = useMemo(
    () => rules.data?.find((item) => item.eventType === "job_failed"),
    [rules.data],
  );
  const availableTemplates = templates.data ?? [];
  const defaultTemplateId =
    availableTemplates.find((template) => template.id === rule?.templateId)
      ?.id ??
    availableTemplates[0]?.id ??
    "";

  const [enabled, setEnabled] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [cdaUserListId, setCdaUserListId] = useState("");
  const [cdaUserListOffice, setCdaUserListOffice] = useState("");
  const [manualRecipients, setManualRecipients] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate the editable draft after rule queries or script changes.
    setEnabled(rule?.active ?? false);
    setTemplateId(rule?.templateId ?? defaultTemplateId);
    setCdaUserListId(rule?.cdaUserListId ?? "");
    setCdaUserListOffice(rule?.cdaUserListOffice ?? "");
    setManualRecipients(rule?.manualRecipients ?? []);
    resetPreview();
  }, [defaultTemplateId, resetPreview, rule, script.id]);

  const selectedTemplate = availableTemplates.find(
    (template) => template.id === templateId,
  );
  const recipientEmails = manualRecipients;
  const initialValues = {
    enabled: rule?.active ?? false,
    templateId: rule?.templateId ?? defaultTemplateId,
    cdaUserListId: rule?.cdaUserListId ?? "",
    cdaUserListOffice: rule?.cdaUserListOffice ?? "",
    manualRecipients: rule?.manualRecipients ?? [],
  };
  const currentValues = {
    enabled,
    templateId,
    cdaUserListId,
    cdaUserListOffice,
    manualRecipients,
  };
  const dirty = JSON.stringify(currentValues) !== JSON.stringify(initialValues);
  const recipientsMissing = !cdaUserListId && recipientEmails.length === 0;
  const enabledConfigurationInvalid =
    enabled && (!selectedTemplate || recipientsMissing);
  const pending =
    createRule.isPending || updateRule.isPending || deleteRule.isPending;

  const payload = {
    scriptId: script.id,
    eventType: "job_failed" as const,
    templateId,
    cdaUserListId: cdaUserListId || null,
    cdaUserListOffice: cdaUserListOffice || null,
    manualRecipients: recipientEmails,
    active: enabled,
  };

  const save = async () => {
    if ((!rule && !enabled) || enabledConfigurationInvalid) return;
    if (rule) {
      await updateRule.mutateAsync({ ruleId: rule.id, payload });
    } else {
      await createRule.mutateAsync(payload);
    }
    toast.success(enabled ? "Failure email saved" : "Failure email disabled");
  };

  const renderPreview = async () => {
    if (!templateId) return;
    await preview.mutateAsync({
      templateId,
      data: jobFailureData(script),
    });
  };

  const error =
    templates.error ||
    adminOffices.error ||
    rules.error ||
    createRule.error ||
    updateRule.error ||
    deleteRule.error ||
    preview.error;

  return (
    <Card className="flex min-w-0 flex-col gap-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <H3>Email alerts</H3>
          <Text>{script.name}</Text>
        </div>
        <Badge color={rule?.active ? "green" : "zinc"}>
          {rule?.active ? "Failure email enabled" : "Failure email off"}
        </Badge>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800"
        >
          {error.message}
        </div>
      )}

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
        <label
          htmlFor="email-on-failure"
          className="flex cursor-pointer items-center justify-between gap-4"
        >
          <span>
            <span className="block font-semibold text-zinc-950">
              Email when this script fails
            </span>
            <span className="mt-1 block text-sm text-zinc-600">
              This script-level setting is the only control that triggers
              failure email.
            </span>
          </span>
          <span className="flex items-center gap-2">
            <HelpTip title="Failure email">
              Templates are reusable content only. Turning this setting on tells
              Batch Events to use the selected template and recipients when this
              script fails.
            </HelpTip>
            <input
              id="email-on-failure"
              type="checkbox"
              role="switch"
              className="h-5 w-5 accent-blue-700"
              checked={enabled}
              disabled={!rule && availableTemplates.length === 0}
              onChange={(event) => setEnabled(event.target.checked)}
            />
          </span>
        </label>
      </div>

      {enabled && (
        <Fieldset className="flex flex-col gap-4">
          {availableTemplates.length > 0 ? (
            <Field>
              <div className="flex items-center gap-1">
                <Label>Email template</Label>
                <HelpTip title="Email template">
                  Choose the canonical email content for this script. Edit its
                  subject and body from Setup → Email templates.
                </HelpTip>
              </div>
              <Dropdown
                label="Email template"
                labelClassName="sr-only"
                value={templateId}
                onChange={(event: React.ChangeEvent<HTMLSelectElement>) => {
                  setTemplateId(event.target.value);
                  resetPreview();
                }}
                options={availableTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.slug}
                  </option>
                ))}
              />
            </Field>
          ) : (
            <Text role="alert">
              Create an email template in Setup before enabling failure email.
            </Text>
          )}

          <RecipientEditor
            office={script.office}
            availableOffices={adminOffices.data ?? [script.office]}
            cdaUserListId={cdaUserListId}
            cdaUserListOffice={cdaUserListOffice}
            manualRecipients={manualRecipients}
            onCdaUserListChange={(office, userListId) => {
              setCdaUserListOffice(office);
              setCdaUserListId(userListId);
            }}
            onManualRecipientsChange={setManualRecipients}
          />

          {recipientsMissing && (
            <Text className="text-red-700" role="alert">
              Choose a CDA user list or enter at least one manual recipient.
            </Text>
          )}

          {selectedTemplate && (
            <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Badge color="blue">Selected template</Badge>
                  <Text className="mt-2 font-medium">
                    {selectedTemplate.subjectTemplate}
                  </Text>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    href="/setup"
                    search={{
                      office: script.office,
                      template: selectedTemplate.id,
                    }}
                    color="light"
                    aria-label={`Edit template ${selectedTemplate.slug}`}
                  >
                    <FaPen aria-hidden="true" />
                    Edit template
                  </Button>
                  <Button
                    type="button"
                    color="light"
                    disabled={preview.isPending}
                    onClick={renderPreview}
                  >
                    Preview email
                  </Button>
                </div>
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 font-sans text-sm">
                {selectedTemplate.bodyTemplate}
              </pre>
            </section>
          )}
        </Fieldset>
      )}

      {!enabled && rule && (
        <Text>
          The template and recipients are retained. Save this change to stop
          failure email; turn it back on later to reuse the configuration.
        </Text>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={!dirty || enabledConfigurationInvalid || pending}
          onClick={save}
        >
          Save email alert
        </Button>
        {rule && (
          <Button
            type="button"
            disabled={pending}
            color="danger"
            style="outline"
            onClick={async () => {
              if (!window.confirm("Remove this email alert configuration?"))
                return;
              await deleteRule.mutateAsync(rule.id);
              toast.success("Email alert configuration removed");
            }}
          >
            Remove alert configuration
          </Button>
        )}
      </div>

      {preview.data && (
        <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4">
          <Badge color="blue">Rendered preview</Badge>
          <H3 className="text-lg">{preview.data.subject}</H3>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 font-sans text-sm">
            {preview.data.body}
          </pre>
        </section>
      )}

      {dirty && (
        <Text role="status">You have unsaved email alert changes.</Text>
      )}
    </Card>
  );
};
