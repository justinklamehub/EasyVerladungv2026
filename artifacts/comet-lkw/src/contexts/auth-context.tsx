import React, { createContext, useContext, ReactNode, useEffect } from "react";
import { AuthUser, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  refetch: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading, refetch, isError } = useGetMe({
    query: {
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });

  useEffect(() => {
    const isPublicRoute = location === "/login" || location === "/forgot-password" || location.startsWith("/reset-password") || location.startsWith("/scanner") || location === "/impressum" || location === "/datenschutz";
    if (!isLoading && (isError || !user) && !isPublicRoute) {
      setLocation("/login");
      return;
    }
    if (!isLoading && user && (user as any).passwordChangeRequired && location !== "/passwort-aendern") {
      setLocation("/passwort-aendern");
    }
  }, [isLoading, isError, user, location, setLocation]);

  useEffect(() => {
    const socket = getSocket();
    const handleForceLogout = () => {
      queryClient.setQueryData(getGetMeQueryKey(), null);
      queryClient.clear();
      setLocation("/login?reason=admin");
    };
    socket.on("force-logout", handleForceLogout);

    const handlePasswordChanged = () => {
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      refetch();
    };
    socket.on("password-changed", handlePasswordChanged);

    return () => {
      socket.off("force-logout", handleForceLogout);
      socket.off("password-changed", handlePasswordChanged);
    };
  }, [queryClient, setLocation, refetch]);

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
