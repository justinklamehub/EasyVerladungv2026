import { z } from "zod";

export const SHELF_PLAN_PREFERENCE_KEY = "einlagerung_shelf_plan";
export const shelfPlanPreferenceSchema = z.object({
  contentMode: z.enum(["planned", "orders", "returns", "reservations"]),
  view: z.enum(["matrix", "tiles"]),
}).strict();
export type ShelfPlanPreference = z.infer<typeof shelfPlanPreferenceSchema>;
export const DEFAULT_SHELF_PLAN_PREFERENCE: ShelfPlanPreference = { contentMode: "planned", view: "matrix" };

export function parseShelfPlanPreference(value: unknown): ShelfPlanPreference {
  const parsed = shelfPlanPreferenceSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...DEFAULT_SHELF_PLAN_PREFERENCE };
}

export function shelfPlanPreferenceQueryKey(userId: number | undefined) {
  return ["user-preferences", userId, SHELF_PLAN_PREFERENCE_KEY] as const;
}
