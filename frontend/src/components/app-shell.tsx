"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { api } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Modal } from "./ui/modal";
import { MultiSelect } from "./ui/multi-select";

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    organizations,
    selectedOrganizationId,
    setSelectedOrganizationId,
    environments,
    threads,
    loading,
    error,
    setError,
    loadOrganizationResources,
  } = useAppContext();

  const router = useRouter();
  const pathname = usePathname();

  const [createWorkspaceModalOpen, setCreateWorkspaceModalOpen] = useState(false);
  const [threadTitle, setThreadTitle] = useState("System design spike");
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] = useState<string[]>([]);
  const [creatingThread, setCreatingThread] = useState(false);

  const selectedEnvironmentOptions = environments.map((env) => ({
    value: env.id,
    label: env.name,
    status: env.status,
    meta: env.gitSshUrl,
  }));

  async function handleCreateThread(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganizationId || selectedEnvironmentIds.length === 0) {
      return;
    }

    try {
      setCreatingThread(true);
      const response = await api.threads.create({
        organizationId: selectedOrganizationId,
        title: threadTitle,
        environmentIds: selectedEnvironmentIds,
      });
      await loadOrganizationResources(selectedOrganizationId);
      setCreateWorkspaceModalOpen(false);
      
      startTransition(() => {
        router.push(`/thread/${response.data.id}`);
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create thread");
    } finally {
      setCreatingThread(false);
    }
  }

  const selectedOrganization = organizations.find((o) => o.id === selectedOrganizationId);

  return (
    <div className="rp-app-layout">
      <nav className="rp-navbar">
        <div className="rp-navbar-brand">
          <strong>Relay Plus</strong>
        </div>
        <div className="rp-navbar-center">
          <select
            className="rp-select rp-org-select"
            value={selectedOrganizationId ?? ""}
            onChange={(e) => setSelectedOrganizationId(e.target.value)}
            disabled={loading || organizations.length === 0}
          >
            {organizations.length === 0 && <option value="" disabled>No organizations</option>}
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>
        <div className="rp-navbar-actions">
          {error && <div className="rp-error-toast">{error}</div>}
        </div>
      </nav>

      <div className="rp-app-content">
        <aside className="rp-sidebar-nav">
          <div className="rp-sidebar-section">
            <Link
              href="/"
              className={`rp-sidebar-item ${pathname === "/" ? "active" : ""}`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
              Organizations
            </Link>
          </div>

          <div className="rp-sidebar-section">
            <div className="rp-sidebar-header">
              <span>Workspaces</span>
              <button 
                className="rp-sidebar-add" 
                onClick={() => setCreateWorkspaceModalOpen(true)}
                disabled={!selectedOrganizationId || environments.length === 0}
                title={environments.length === 0 ? "Add an environment to create a workspace" : "New workspace"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              </button>
            </div>
            <div className="rp-sidebar-list">
              {threads.length === 0 ? (
                <div className="rp-sidebar-empty">No workspaces yet</div>
              ) : (
                threads.map((thread) => {
                  const isActive = pathname === `/thread/${thread.id}`;
                  return (
                    <Link
                      key={thread.id}
                      href={`/thread/${thread.id}`}
                      className={`rp-sidebar-item ${isActive ? "active" : ""}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span className="rp-truncate">{thread.title}</span>
                      {thread.status !== "ready" && (
                        <div className={`rp-dot ${thread.status}`} />
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        <main className="rp-main-view">{children}</main>
      </div>

      <Modal
        open={createWorkspaceModalOpen}
        onClose={() => setCreateWorkspaceModalOpen(false)}
        title="Create workspace thread"
        description="Pick one or more environments. Relay Plus will materialize a fresh workspace before the first prompt."
      >
        <form className="rp-stack" onSubmit={handleCreateThread}>
          <div className="rp-field">
            <label className="rp-field-label" htmlFor="threadTitle">
              Thread title
            </label>
            <Input
              id="threadTitle"
              value={threadTitle}
              onChange={(event) => setThreadTitle(event.target.value)}
              placeholder="Cross-repo refactor"
            />
          </div>
          <div className="rp-field">
            <span className="rp-field-label">Attach environments</span>
            <MultiSelect
              options={selectedEnvironmentOptions}
              values={selectedEnvironmentIds}
              onToggle={(value) =>
                setSelectedEnvironmentIds((current) =>
                  current.includes(value)
                    ? current.filter((item) => item !== value)
                    : [...current, value],
                )
              }
            />
            {environments.length === 0 && (
              <p className="rp-note" style={{ color: "var(--color-crimson-600)" }}>
                You must create an environment first in the Organizations view before creating a workspace.
              </p>
            )}
          </div>
          <Button
            type="submit"
            disabled={!selectedOrganizationId || creatingThread || environments.length === 0 || selectedEnvironmentIds.length === 0}
          >
            {creatingThread ? "Preparing…" : "Create thread"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
