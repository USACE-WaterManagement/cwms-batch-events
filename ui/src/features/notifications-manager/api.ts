import { useAuth } from "@usace-watermanagement/groundwork-water";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import fetchWithAuth from "../../utils/fetchWithAuth";
import type {
  NotificationTemplate,
  NotificationTemplateCreate,
  NotificationTemplateUpdate,
  RenderedNotification,
  ScriptNotificationRule,
  ScriptNotificationRuleCreate,
  ScriptNotificationRuleUpdate,
} from "./types";

const jsonHeaders = { "Content-Type": "application/json" };

const requestJson = async <T>(
  input: RequestInfo | URL,
  options: RequestInit,
  token?: string,
): Promise<T> => {
  const response = await fetchWithAuth(input, options, token);
  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    const message = data?.detail ?? `Request failed with ${response.status}`;
    toast.error(message);
    throw new Error(message);
  }
  return response.json();
};

const requestNoContent = async (
  input: RequestInfo | URL,
  options: RequestInit,
  token?: string,
) => {
  const response = await fetchWithAuth(input, options, token);
  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    const message = data?.detail ?? `Request failed with ${response.status}`;
    toast.error(message);
    throw new Error(message);
  }
};

export interface CdaUserList {
  "office-id": string;
  "user-list-id": string;
  description?: string | null;
}

export const useCdaUserLists = (office?: string) => {
  const auth = useAuth();
  return useQuery({
    queryKey: ["cda-user-lists", office],
    enabled: !!office && auth.isAuth,
    retry: false,
    queryFn: () =>
      requestJson<CdaUserList[]>(
        `/api/notifications/cda-user-lists?office=${encodeURIComponent(office!)}`,
        { cache: "no-store" },
        auth.token,
      ),
  });
};

export const useNotificationTemplates = (office?: string) => {
  const auth = useAuth();
  return useQuery({
    queryKey: ["notification-templates", office],
    enabled: !!office && auth.isAuth,
    queryFn: () =>
      requestJson<NotificationTemplate[]>(
        `/api/notifications/templates?office=${encodeURIComponent(office!)}`,
        { cache: "no-store" },
        auth.token,
      ),
  });
};

export const useCreateNotificationTemplate = (office?: string) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: NotificationTemplateCreate) =>
      requestJson<NotificationTemplate>(
        `/api/notifications/templates`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(payload),
        },
        auth.token,
      ),
    onSuccess: (template) => {
      queryClient.setQueryData<NotificationTemplate[]>(
        ["notification-templates", office],
        (old) => (old ? [...old, template] : [template]),
      );
    },
  });
};

export const useUpdateNotificationTemplate = (office?: string) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      templateId: string;
      payload: NotificationTemplateUpdate;
    }) =>
      requestJson<NotificationTemplate>(
        `/api/notifications/templates/${args.templateId}`,
        {
          method: "PUT",
          headers: jsonHeaders,
          body: JSON.stringify(args.payload),
        },
        auth.token,
      ),
    onSuccess: (template) => {
      queryClient.setQueryData<NotificationTemplate[]>(
        ["notification-templates", office],
        (old) =>
          old?.map((item) => (item.id === template.id ? template : item)),
      );
    },
  });
};

export const useDeleteNotificationTemplate = (office?: string) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      requestNoContent(
        `/api/notifications/templates/${templateId}`,
        { method: "DELETE" },
        auth.token,
      ),
    onSuccess: (_data, templateId) => {
      queryClient.setQueryData<NotificationTemplate[]>(
        ["notification-templates", office],
        (old) => old?.filter((template) => template.id !== templateId),
      );
    },
  });
};

export const useScriptNotificationRules = (scriptId?: string) => {
  const auth = useAuth();
  return useQuery({
    queryKey: ["script-notification-rules", scriptId],
    enabled: !!scriptId,
    queryFn: () =>
      requestJson<ScriptNotificationRule[]>(
        `/api/notifications/rules?script_id=${scriptId}`,
        { cache: "no-store" },
        auth.token,
      ),
  });
};

export const useCreateScriptNotificationRule = (scriptId?: string) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ScriptNotificationRuleCreate) =>
      requestJson<ScriptNotificationRule>(
        `/api/notifications/rules`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify(payload),
        },
        auth.token,
      ),
    onSuccess: (rule) => {
      queryClient.setQueryData<ScriptNotificationRule[]>(
        ["script-notification-rules", scriptId],
        (old) => (old ? [...old, rule] : [rule]),
      );
    },
  });
};

export const useUpdateScriptNotificationRule = (scriptId?: string) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      ruleId: string;
      payload: ScriptNotificationRuleUpdate;
    }) =>
      requestJson<ScriptNotificationRule>(
        `/api/notifications/rules/${args.ruleId}`,
        {
          method: "PUT",
          headers: jsonHeaders,
          body: JSON.stringify(args.payload),
        },
        auth.token,
      ),
    onSuccess: (rule) => {
      queryClient.setQueryData<ScriptNotificationRule[]>(
        ["script-notification-rules", scriptId],
        (old) => old?.map((item) => (item.id === rule.id ? rule : item)),
      );
    },
  });
};

export const useDeleteScriptNotificationRule = (scriptId?: string) => {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) =>
      requestNoContent(
        `/api/notifications/rules/${ruleId}`,
        { method: "DELETE" },
        auth.token,
      ),
    onSuccess: (_data, ruleId) => {
      queryClient.setQueryData<ScriptNotificationRule[]>(
        ["script-notification-rules", scriptId],
        (old) => old?.filter((rule) => rule.id !== ruleId),
      );
    },
  });
};

export const usePreviewNotificationTemplate = () => {
  const auth = useAuth();
  return useMutation({
    mutationFn: (args: {
      templateId: string;
      jobId?: string;
      data: Record<string, string | null>;
      subjectTemplate?: string;
      bodyTemplate?: string;
    }) =>
      requestJson<RenderedNotification>(
        `/api/notifications/templates/${args.templateId}/preview`,
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            jobId: args.jobId,
            data: args.data,
            subjectTemplate: args.subjectTemplate,
            bodyTemplate: args.bodyTemplate,
          }),
        },
        auth.token,
      ),
  });
};
