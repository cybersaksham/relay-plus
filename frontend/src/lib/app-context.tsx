"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "./api";
import type { Environment, Organization, Thread } from "./types";

interface AppContextValue {
  organizations: Organization[];
  selectedOrganizationId: string | null;
  setSelectedOrganizationId: (id: string | null) => void;
  environments: Environment[];
  threads: Thread[];
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  loadOrganizations: () => Promise<void>;
  loadOrganizationResources: (orgId: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizations = useCallback(async () => {
    try {
      const data = await api.organizations.list();
      setOrganizations(data);
      if (!selectedOrganizationId && data.length > 0) {
        setSelectedOrganizationId(data[0].id);
      } else if (
        selectedOrganizationId &&
        !data.some((item) => item.id === selectedOrganizationId)
      ) {
        setSelectedOrganizationId(data[0]?.id ?? null);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Failed to load organizations");
    }
  }, [selectedOrganizationId]);

  const loadOrganizationResources = useCallback(
    async (organizationId: string) => {
      try {
        const [nextEnvironments, nextThreads] = await Promise.all([
          api.environments.list(organizationId),
          api.threads.list(organizationId),
        ]);
        setEnvironments(nextEnvironments);
        setThreads(nextThreads);
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : "Failed to load resources");
      }
    },
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    loadOrganizations().finally(() => setLoading(false));
  }, [loadOrganizations]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnvironments([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThreads([]);
      return;
    }
    loadOrganizationResources(selectedOrganizationId);
  }, [loadOrganizationResources, selectedOrganizationId]);

  useEffect(() => {
    // Polling for active jobs
    const hasActiveJobs = [...environments, ...threads].some((item) => item.activeJobId);
    if (!hasActiveJobs || !selectedOrganizationId) {
      return;
    }

    const interval = window.setInterval(() => {
      loadOrganizationResources(selectedOrganizationId);
    }, 4000);

    return () => window.clearInterval(interval);
  }, [environments, threads, loadOrganizationResources, selectedOrganizationId]);

  const value = useMemo(
    () => ({
      organizations,
      selectedOrganizationId,
      setSelectedOrganizationId,
      environments,
      threads,
      loading,
      error,
      setError,
      loadOrganizations,
      loadOrganizationResources,
    }),
    [
      organizations,
      selectedOrganizationId,
      environments,
      threads,
      loading,
      error,
      loadOrganizations,
      loadOrganizationResources,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within an AppContextProvider");
  }
  return context;
}
