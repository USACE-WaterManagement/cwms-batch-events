import dayjs from "dayjs";
import { ViewField } from "./ViewField";
import {
  Button,
  Checkboxes,
  DeleteConfirm,
  Field,
  Fieldset,
  Input,
  Label,
  Text,
} from "@usace/groundwork";
import type { Script, ScriptFormData } from "../scripts-manager/types";
import { MdErrorOutline } from "react-icons/md";
import { useState } from "react";
import { RoleMultiSelect } from "./RoleMultiSelect";
import { allRoles } from "./utils";

const slugify = (str: string) => {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const DRAFT_STORAGE_PREFIX = "cwms-batch-events:script-form-draft";

function draftStorageKey(office: string, script?: Script): string {
  return `${DRAFT_STORAGE_PREFIX}:${encodeURIComponent(office)}:${encodeURIComponent(script?.id ?? "new")}`;
}

function initialForm(script?: Script): ScriptFormData {
  return {
    name: script?.name ?? "",
    description: script?.description ?? "",
    active: script?.active ?? true,
    repoPath: script?.repoPath ?? "",
    roles: script?.roles ?? ["CWMS Users"],
  };
}

function readDraft(key: string, fallback: ScriptFormData): ScriptFormData {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return fallback;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    return { ...fallback, ...parsed } as ScriptFormData;
  } catch {
    return fallback;
  }
}

function writeDraft(key: string, value: ScriptFormData): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser storage may be unavailable or full. The form remains usable.
  }
}

function removeDraft(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable browser storage when clearing the form.
  }
}

const FormRow = ({ children }: React.PropsWithChildren) => {
  return <Field className="grid grid-cols-[120px_1fr] gap-6">{children}</Field>;
};

const InputLabel = ({
  htmlFor,
  children,
}: React.PropsWithChildren<{ htmlFor: string }>) => {
  return (
    <Label className="mt-4" htmlFor={htmlFor}>
      {children}
    </Label>
  );
};

interface ScriptFormProps {
  office: string;
  script?: Script;
  isPending: boolean;
  mutationError: Error | null;
  onDelete: (scriptId: string) => void;
  onSave: (data: ScriptFormData) => void;
  onCancelEdit: () => void;
}

export const ScriptForm = ({
  office,
  script,
  isPending,
  mutationError,
  onDelete,
  onSave,
  onCancelEdit,
}: ScriptFormProps) => {
  const storageKey = draftStorageKey(office, script);
  const [form, setForm] = useState<ScriptFormData>(() => readDraft(storageKey, initialForm(script)));
  const [draftRestored, setDraftRestored] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(storageKey) !== null;
    } catch {
      return false;
    }
  });

  const handleSubmit = async () => {
    await onSave(form);
    removeDraft(storageKey);
    setDraftRestored(false);
  };

  const update = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      writeDraft(storageKey, next);
      setDraftRestored(true);
      return next;
    });
  };

  const clearForm = () => {
    if (!window.confirm("Clear this form and discard the saved draft?")) return;
    setForm(initialForm(script));
    removeDraft(storageKey);
    setDraftRestored(false);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void handleSubmit();
      }}
    >
      <div className="flex flex-col gap-y-6">
        <Fieldset disabled={isPending} className="flex flex-col gap-2">
          <ViewField label="Id">{script?.id ?? "<unassigned>"}</ViewField>
          <FormRow>
            <InputLabel htmlFor="name">Name</InputLabel>
            <Input
              id="name"
              name="name"
              value={form.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                update("name", e.target.value);
              }}
              required
            />
          </FormRow>
          <ViewField label="Slug">
            {script?.slug ?? slugify(form.name)}
          </ViewField>
          <FormRow>
            <InputLabel htmlFor="description">Description</InputLabel>
            <Input
              id="description"
              name="description"
              value={form.description}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                update("description", e.target.value)
              }
            />
          </FormRow>
          <FormRow>
            <InputLabel htmlFor="repoPath">GitHub Repo Path</InputLabel>
            <Input
              id="repoPath"
              name="repoPath"
              value={form.repoPath}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                update("repoPath", e.target.value)
              }
              required
            />
          </FormRow>
          <ViewField label="Execution Type">
            {script?.executionType ?? "python"}
          </ViewField>
          <FormRow>
            <Label htmlFor="roles">Roles</Label>
            <RoleMultiSelect
              allRoles={allRoles}
              initialSelectedRoles={form.roles}
              onChange={(selectedRoles) => update("roles", selectedRoles)}
            />
          </FormRow>
          <FormRow>
            <Label htmlFor="active">Active</Label>
            <Checkboxes
              content={[
                {
                  id: "active",
                  defaultChecked: script?.active ?? true,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    update("active", e.target.checked),
                },
              ]}
            />
          </FormRow>
          {script && (
            <>
              <ViewField label="Created At">
                {dayjs(script?.createdTime).toString()}
              </ViewField>
              <ViewField label="Last Update">
                {dayjs(script?.updatedTime).toString()}
              </ViewField>
            </>
          )}
        </Fieldset>
        <div className="w-full flex justify-between">
          {script && <DeleteConfirm onDelete={() => onDelete(script?.id)} />}
          <div className="flex justify-between gap-6 ml-auto">
            {draftRestored && <span className="self-center text-sm text-gray-600">Draft restored from this browser</span>}
            <Button type="button" disabled={isPending} onClick={clearForm}>
              Clear form
            </Button>
            <Button type="submit" disabled={isPending}>
              Save
            </Button>
            <Button type="button" disabled={isPending} onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
        {mutationError && (
          <div className="flex gap-2">
            <MdErrorOutline className="text-red-500 flex-none size-6" />
            <Text className="text-red-500">{mutationError.message}</Text>
          </div>
        )}
      </div>
    </form>
  );
};
