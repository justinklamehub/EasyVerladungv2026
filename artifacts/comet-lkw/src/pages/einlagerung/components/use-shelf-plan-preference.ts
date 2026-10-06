import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, type AuthUser } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import {
  DEFAULT_SHELF_PLAN_PREFERENCE, SHELF_PLAN_PREFERENCE_KEY, parseShelfPlanPreference,
  shelfPlanPreferenceQueryKey, shelfPlanPreferenceSchema, type ShelfPlanPreference,
} from "./shelf-plan-preference";

const url = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/user-preferences/${SHELF_PLAN_PREFERENCE_KEY}`;

export function useShelfPlanPreference() {
  const { user } = useAuth();
  const userId = user?.id;
  const client = useQueryClient();
  const queryKey = shelfPlanPreferenceQueryKey(userId);
  const saving = useIsMutating({ mutationKey: queryKey }) > 0;
  const query = useQuery({
    queryKey,
    enabled: userId != null && !saving,
    // Re-read on reopening; never use another user's data as placeholder.
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const res = await fetch(url, { credentials: "include", signal });
      if (res.status === 404) return { ...DEFAULT_SHELF_PLAN_PREFERENCE };
      if (!res.ok) throw new Error("Ansichtseinstellungen konnten nicht geladen werden.");
      const body = await res.json();
      return parseShelfPlanPreference(body.value);
    },
  });
  const mutation = useMutation({
    mutationKey: queryKey,
    scope: { id: `shelf-plan-preference-${userId}` },
    retry: false,
    mutationFn: async ({ ownerId, value }: { ownerId: number; value: ShelfPlanPreference }) => {
      // A queued write must not use the next signed-in user's session.
      if (client.getQueryData<AuthUser | null>(getGetMeQueryKey())?.id !== ownerId) {
        throw new Error("Der angemeldete Benutzer hat sich geändert.");
      }
      const res = await fetch(url, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: shelfPlanPreferenceSchema.parse(value) }),
      });
      if (!res.ok) throw new Error("Die gewählte Lageransicht konnte nicht gespeichert werden.");
    },
    onMutate: async ({ ownerId, value }) => {
      const key = shelfPlanPreferenceQueryKey(ownerId);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ShelfPlanPreference>(key);
      client.setQueryData(key, value);
      return { previous };
    },
    onError: (_error, { ownerId }, context) => {
      client.setQueryData(shelfPlanPreferenceQueryKey(ownerId), context?.previous ?? DEFAULT_SHELF_PLAN_PREFERENCE);
    },
    onSettled: (_data, _error, { ownerId }) => {
      void client.invalidateQueries({ queryKey: shelfPlanPreferenceQueryKey(ownerId) });
    },
  });
  const preference = query.data ?? DEFAULT_SHELF_PLAN_PREFERENCE;
  const disabled = userId == null || query.isPending || query.isFetching || saving || query.isError;
  const update = (patch: Partial<ShelfPlanPreference>) => {
    if (disabled || userId == null) return;
    mutation.mutate({ ownerId: userId, value: shelfPlanPreferenceSchema.parse({ ...preference, ...patch }) });
  };
  // Mutation errors belong to the owner even if auth changes without unmounting.
  const saveError = mutation.variables?.ownerId === userId ? mutation.error?.message : undefined;
  return {
    ...preference, disabled, saving, update,
    loading: query.isPending && userId != null,
    loadError: query.error?.message, saveError,
    retry: () => query.refetch(),
  };
}
