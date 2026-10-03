import { components } from "../../generated/api-types";

type Schemas = components["schemas"];

export type NotificationTemplate = Schemas["NotificationTemplateRead"];
export type NotificationTemplateCreate = Schemas["NotificationTemplateCreate"];
export type NotificationTemplateUpdate = Schemas["NotificationTemplateUpdate"];
export type ScriptNotificationRule = Schemas["ScriptNotificationRuleRead"];
export type ScriptNotificationRuleCreate =
  Schemas["ScriptNotificationRuleCreate"];
export type ScriptNotificationRuleUpdate =
  Schemas["ScriptNotificationRuleUpdate"];
export type RenderedNotification = Schemas["RenderedNotification"];
