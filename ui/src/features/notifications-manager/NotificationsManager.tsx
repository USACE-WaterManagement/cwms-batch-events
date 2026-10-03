import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Description,
  Field,
  Fieldset,
  H2,
  H3,
  Input,
  Label,
  Skeleton,
  Text,
} from "@usace/groundwork";
import { useAuth } from "@usace-watermanagement/groundwork-water";
import { useNavigate, useSearch } from "@tanstack/react-router";
import toast from "react-hot-toast";
import { FaEnvelope, FaPlus } from "react-icons/fa6";
import { HelpTip } from "../../shared/components/HelpTip";
import { OfficeSelector } from "../../shared/components/OfficeSelector";
import { useRememberedOffice } from "../../shared/hooks/useRememberedOffice";
import useAdminOffices from "../scripts-manager/useAdminOffices";
import {
  useCreateNotificationTemplate,
  useDeleteNotificationTemplate,
  useNotificationTemplates,
  usePreviewNotificationTemplate,
  useUpdateNotificationTemplate,
} from "./api";
import { JinjaTemplateField } from "./JinjaTemplateField";
import { TemplateVariablesHelp } from "./TemplateVariablesHelp";
import type { NotificationTemplate } from "./types";

const NEW_TEMPLATE_ROUTE_VALUE = "new";

const emptyTemplate = (office: string) => ({
  id: "",
  office,
  slug: "",
  subjectTemplate: "Batch job {{ scriptName }} failed",
  bodyTemplate:
    "Job {{ jobId }} failed for {{ office }}.\nError: {{ errorMessage }}\n\nReview the job and logs in Batch Events.",
});

const formFromTemplate = (template: NotificationTemplate) => ({
  id: template.id,
  office: template.office ?? "",
  slug: template.slug,
  subjectTemplate: template.subjectTemplate,
  bodyTemplate: template.bodyTemplate,
});

export const NotificationsManager = () => {
  const auth = useAuth();
  const search = useSearch({ from: "/setup" });
  const navigate = useNavigate({ from: "/setup" });
  const adminOffices = useAdminOffices();
  const [office, setOffice] = useRememberedOffice(adminOffices.data ?? []);
  const selectedOffice = office ?? "";
  const templates = useNotificationTemplates(selectedOffice);
  const createTemplate = useCreateNotificationTemplate(selectedOffice);
  const updateTemplate = useUpdateNotificationTemplate(selectedOffice);
  const deleteTemplate = useDeleteNotificationTemplate(selectedOffice);
  const preview = usePreviewNotificationTemplate();
  const resetPreview = preview.reset;
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateForm, setTemplateForm] = useState(() => emptyTemplate(""));
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const sortedTemplates = useMemo(
    () =>
      [...(templates.data ?? [])].sort((a, b) => a.slug.localeCompare(b.slug)),
    [templates.data],
  );
  const selectedTemplate = sortedTemplates.find(
    (template) => template.id === selectedTemplateId,
  );
  const isCreating = !templateForm.id;
  const initialForm = selectedTemplate
    ? formFromTemplate(selectedTemplate)
    : emptyTemplate(selectedOffice);
  const dirty = JSON.stringify(templateForm) !== JSON.stringify(initialForm);
  const pending =
    createTemplate.isPending ||
    updateTemplate.isPending ||
    deleteTemplate.isPending ||
    preview.isPending;
  const error =
    adminOffices.error ||
    templates.error ||
    createTemplate.error ||
    updateTemplate.error ||
    deleteTemplate.error ||
    preview.error;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset the draft when its office changes.
    setSelectedTemplateId("");
    setTemplateForm(emptyTemplate(selectedOffice));
    setDeleteConfirm(false);
    resetPreview();
  }, [selectedOffice, resetPreview]);

  useEffect(() => {
    if (
      search.office &&
      adminOffices.data?.includes(search.office) &&
      selectedOffice !== search.office
    ) {
      setOffice(search.office);
    }
  }, [adminOffices.data, search.office, selectedOffice, setOffice]);

  useEffect(() => {
    if (!search.template || search.template === NEW_TEMPLATE_ROUTE_VALUE) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the editable draft with template navigation.
      setSelectedTemplateId("");
      setTemplateForm(emptyTemplate(selectedOffice));
      setDeleteConfirm(false);
      resetPreview();
      return;
    }
    if (!templates.data) return;
    const routedTemplate = templates.data.find(
      (template) => template.id === search.template,
    );
    if (!routedTemplate || routedTemplate.id === selectedTemplateId) return;

    setSelectedTemplateId(routedTemplate.id);
    setTemplateForm(formFromTemplate(routedTemplate));
    setDeleteConfirm(false);
    resetPreview();
  }, [
    resetPreview,
    search.template,
    selectedOffice,
    selectedTemplateId,
    templates.data,
  ]);

  if (!auth.isAuth) {
    return (
      <Card className="mx-auto max-w-xl p-8 text-center">
        <H2>Email templates</H2>
        <Text className="mt-2">Log in to manage notification templates.</Text>
        <Button className="mt-5" type="button" onClick={auth.login}>
          Log in
        </Button>
      </Card>
    );
  }
  if (adminOffices.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }
  if (!adminOffices.data?.length) {
    return (
      <Card className="p-6">
        <H2>Email templates</H2>
        <Text className="mt-2">
          You do not have script administrator access for any offices.
        </Text>
      </Card>
    );
  }

  const selectTemplate = (template: NotificationTemplate) => {
    void navigate({
      replace: true,
      search: {
        office: template.office ?? selectedOffice,
        template: template.id,
      },
    });
  };

  const startNew = () => {
    if (dirty && !window.confirm("Discard unsaved template changes?")) return;
    void navigate({
      replace: true,
      search: {
        office: selectedOffice,
        template: NEW_TEMPLATE_ROUTE_VALUE,
      },
    });
  };

  const changeOffice = (nextOffice: string) => {
    setOffice(nextOffice);
    void navigate({
      replace: true,
      search: { office: nextOffice, template: NEW_TEMPLATE_ROUTE_VALUE },
    });
  };

  const saveTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      office: selectedOffice,
      slug: templateForm.slug.trim(),
      subjectTemplate: templateForm.subjectTemplate,
      bodyTemplate: templateForm.bodyTemplate,
    };
    try {
      const saved = templateForm.id
        ? await updateTemplate.mutateAsync({
            templateId: templateForm.id,
            payload,
          })
        : await createTemplate.mutateAsync(payload);
      selectTemplate(saved);
      toast.success(templateForm.id ? "Template updated" : "Template created");
    } catch {
      // The shared request helper displays the API error.
    }
  };

  const renderPreview = async () => {
    if (!templateForm.id) return;
    try {
      await preview.mutateAsync({
        templateId: templateForm.id,
        data: {
          jobId: "preview-job-id",
          scriptId: "preview-script-id",
          scriptName: "Hourly data load",
          scriptSlug: "hourly-data-load",
          repoPath: "bin/hourly.sh",
          executionType: "shell",
          username: "preview.user",
          office: selectedOffice,
          externalJobId: "preview-external-id",
          errorMessage: "Example failure message",
          logs: "Open Batch Events to review the job log.",
          status: "Failed",
        },
        subjectTemplate: templateForm.subjectTemplate,
        bodyTemplate: templateForm.bodyTemplate,
      });
    } catch {
      // The shared request helper displays the API error.
    }
  };

  return (
    <section className="flex min-w-0 flex-col gap-6 pb-10">
      <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge color="blue">Setup</Badge>
          <H2 className="mt-2">Email templates</H2>
          <Text className="mt-2 max-w-3xl">
            Create reusable, office-scoped email content. Templates never send
            email by themselves; enable failure email and choose a template on
            each script in Scripts Manager.
          </Text>
        </div>
        <Button
          type="button"
          disabled={isCreating || pending}
          onClick={startNew}
        >
          <FaPlus aria-hidden="true" />
          {isCreating ? "Creating new template" : "New template"}
        </Button>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {error.message}
        </div>
      )}

      <Card className="p-5">
        <Field className="max-w-sm">
          <div className="flex items-center gap-1">
            <Label>Office</Label>
            <HelpTip title="Office-scoped templates">
              A template is available only to scripts owned by this office. The
              same template ID may be used independently by another office.
            </HelpTip>
          </div>
          <Description>
            Templates can only be used by scripts in this office.
          </Description>
          <OfficeSelector
            offices={adminOffices.data}
            value={selectedOffice}
            onChange={changeOffice}
          />
        </Field>
      </Card>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.5fr)]">
        <Card className="min-w-0 p-0">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
            <H3>Templates</H3>
            <Badge color="blue">{sortedTemplates.length}</Badge>
          </div>
          <div className="space-y-2 p-3">
            {isCreating && (
              <div
                aria-current="true"
                className="rounded-lg border-2 border-blue-600 bg-blue-50 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <strong>New template</strong>
                  <Badge color="blue">Not saved</Badge>
                </div>
                <Text className="mt-1">
                  Complete the form to add a separate template.
                </Text>
              </div>
            )}
            {templates.isLoading ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </>
            ) : sortedTemplates.length ? (
              sortedTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  aria-current={
                    template.id === selectedTemplateId ? "true" : undefined
                  }
                  className={`w-full rounded-lg border p-4 text-left ${
                    template.id === selectedTemplateId
                      ? "border-blue-600 bg-blue-50"
                      : "border-zinc-200 hover:border-blue-300"
                  }`}
                  onClick={() => selectTemplate(template)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong>{template.slug}</strong>
                    <Badge color={template.usageCount ? "blue" : "zinc"}>
                      Used by {template.usageCount}{" "}
                      {template.usageCount === 1 ? "script" : "scripts"}
                    </Badge>
                  </div>
                  <Text className="mt-1 line-clamp-2">
                    {template.subjectTemplate}
                  </Text>
                </button>
              ))
            ) : (
              <div className="p-5 text-center">
                <FaEnvelope className="mx-auto mb-3 text-2xl text-zinc-500" />
                <Text>No email templates exist for {selectedOffice}.</Text>
              </div>
            )}
          </div>
        </Card>

        <Card
          className={`min-w-0 p-5 ${
            isCreating ? "border-blue-300 ring-2 ring-blue-100" : ""
          }`}
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              {isCreating && <Badge color="blue">New, not saved</Badge>}
              <H3>{templateForm.id ? "Edit template" : "New template"}</H3>
              <Text>
                {isCreating
                  ? `A separate template for ${selectedOffice}`
                  : dirty
                    ? "Unsaved changes"
                    : `Office: ${selectedOffice}`}
              </Text>
            </div>
            {templateForm.id &&
              selectedTemplate?.usageCount === 0 &&
              (deleteConfirm ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Text>Delete this template?</Text>
                  <Button
                    type="button"
                    color="danger"
                    disabled={pending}
                    onClick={async () => {
                      await deleteTemplate.mutateAsync(templateForm.id);
                      void navigate({
                        replace: true,
                        search: {
                          office: selectedOffice,
                          template: NEW_TEMPLATE_ROUTE_VALUE,
                        },
                      });
                      toast.success("Template deleted");
                    }}
                  >
                    Confirm delete
                  </Button>
                  <Button
                    type="button"
                    color="light"
                    onClick={() => setDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  color="danger"
                  style="outline"
                  onClick={() => setDeleteConfirm(true)}
                >
                  Delete template
                </Button>
              ))}
            {templateForm.id && (selectedTemplate?.usageCount ?? 0) > 0 && (
              <Text className="max-w-xs text-right">
                Used by {selectedTemplate?.usageCount}{" "}
                {selectedTemplate?.usageCount === 1 ? "script" : "scripts"}.
                Reassign those scripts before deleting this template.
              </Text>
            )}
          </div>

          {isCreating && (
            <div
              role="status"
              className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-950"
            >
              <strong>Creating a new template</strong>
              <Text className="mt-1">
                Saving this form creates a new record. It will not update an
                existing template.
              </Text>
            </div>
          )}

          <form onSubmit={saveTemplate}>
            <Fieldset className="flex flex-col gap-5">
              <Field>
                <div className="flex items-center gap-1">
                  <Label htmlFor="template-slug">Template ID</Label>
                  <HelpTip title="Template ID">
                    This stable, office-scoped name identifies the template in
                    notification rules. Use lowercase letters, numbers, hyphens,
                    or underscores.
                  </HelpTip>
                </div>
                <Description>
                  A stable identifier such as job_failure_v1.
                </Description>
                <Input
                  required
                  id="template-slug"
                  maxLength={128}
                  placeholder="job_failure_v2"
                  value={templateForm.slug}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                    setTemplateForm((current) => ({
                      ...current,
                      slug: event.target.value.toLowerCase(),
                    }))
                  }
                />
              </Field>
              <Field>
                <div className="flex items-center gap-1">
                  <Label htmlFor="template-subject">Subject</Label>
                  <TemplateVariablesHelp />
                </div>
                <JinjaTemplateField
                  id="template-subject"
                  value={templateForm.subjectTemplate}
                  className="h-20"
                  onChange={(subjectTemplate) =>
                    setTemplateForm((current) => ({
                      ...current,
                      subjectTemplate,
                    }))
                  }
                />
              </Field>
              <Field>
                <div className="flex items-center gap-1">
                  <Label htmlFor="template-body">Body</Label>
                  <TemplateVariablesHelp />
                </div>
                <JinjaTemplateField
                  id="template-body"
                  value={templateForm.bodyTemplate}
                  onChange={(bodyTemplate) =>
                    setTemplateForm((current) => ({
                      ...current,
                      bodyTemplate,
                    }))
                  }
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={
                    pending ||
                    !dirty ||
                    !templateForm.slug.trim() ||
                    !templateForm.subjectTemplate.trim() ||
                    !templateForm.bodyTemplate.trim()
                  }
                >
                  {templateForm.id ? "Save changes" : "Create template"}
                </Button>
                <Button
                  type="button"
                  color="light"
                  disabled={!templateForm.id || pending}
                  onClick={renderPreview}
                >
                  Preview email
                </Button>
              </div>
            </Fieldset>
          </form>

          {preview.data && (
            <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
              <Badge color="blue">Preview</Badge>
              <H3 className="mt-3 text-lg">{preview.data.subject}</H3>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 font-sans text-sm">
                {preview.data.body}
              </pre>
            </section>
          )}
        </Card>
      </div>
    </section>
  );
};
