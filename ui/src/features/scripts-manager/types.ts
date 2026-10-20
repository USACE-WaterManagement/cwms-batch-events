// features/scripts-manager/types.ts

import { components } from "../../generated/api-types";

type Schemas = components["schemas"];

export type Script = Schemas["ScriptRead"];
export type ScriptCreate = Schemas["ScriptCreate"];
export type ScriptUpdate = Schemas["ScriptUpdate"];

export type ScriptFormData = Omit<ScriptUpdate, "jobRunners">;
