import { Redirect } from "wouter";
import type { ComponentType } from "react";
import { useEinlagerungAccess } from "./lib";

export function EinlagerungRoute({ component: Component, anyOf }: { component: ComponentType; anyOf?: string[] }) {
  const { isLoading, user, has, any } = useEinlagerungAccess();
  if (isLoading) return <div className="w-full min-h-[40vh] flex items-center justify-center text-sm text-slate-500">Laden...</div>;
  if (!user) return <Redirect to="/login" />;
  const ok = anyOf ? anyOf.some(has) : any;
  if (!ok) return <Redirect to="/dashboard" />;
  return <Component />;
}
