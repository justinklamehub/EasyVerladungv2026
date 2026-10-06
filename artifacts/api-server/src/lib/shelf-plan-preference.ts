import { z } from "zod";

export const SHELF_PLAN_PREFERENCE_KEY = "einlagerung_shelf_plan";
export const shelfPlanPreferenceSchema = z.object({
  contentMode: z.enum(["planned", "orders", "returns", "reservations"]),
  view: z.enum(["matrix", "tiles"]),
}).strict();

export const DEFAULT_SHELF_PLAN_PREFERENCE = { contentMode: "planned", view: "matrix" } as const;
