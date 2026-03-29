"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "@/lib/api";
import type { Environment, Organization, Thread } from "@/lib/types";
import { formatDate } from "@/lib/utils";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { CommandBar } from "./ui/command-bar";
import { Input } from "./ui/input";
import { Modal } from "./ui/modal";
import { MultiSelect } from "./ui/multi-select";
import { Panel } from "./ui/panel";
import { Table } from "./ui/table";
import { Textarea } from "./ui/textarea";

export function Dashboard() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<
    string | null
  >(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [creatingEnvironment, setCreatingEnvironment] = useState(false);
  const [creatingThread, setCreatingThread] = useState(false);
  const [environmentModalOpen, setEnvironmentModalOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [threadTitle, setThreadTitle] = useState("System design spike");
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] = useState<
    string[]
  >([]);
  const [environmentForm, setEnvironmentForm] = useState({
    name: "",
    gitSshUrl: "",
    setupScript: "npm install",
    workspaceScript: "git status",
  });

  const loadOrganizations = useCallback(async () => {
    const data = await api.organizations.list();
    setOrganizations(data);
    if (!selectedOrganizationId && data.length > 0) {
      setSelectedOrganizationId(data[0].id);
    }
    if (
      selectedOrganizationId &&
      !data.some((item) => item.id === selectedOrganizationId)
    ) {
      setSelectedOrganizationId(data[0]?.id ?? null);
    }
  }, [selectedOrganizationId]);

  const loadOrganizationResources = useCallback(
    async (organizationId: string) => {
      const [nextEnvironments, nextThreads] = await Promise.all([
        api.environments.list(organizationId),
        api.threads.list(organizationId),
      ]);
      setEnvironments(nextEnvironments);
      setThreads(nextThreads);
    },
    [],
  );

  useEffect(() => {
    setLoading(true);
    loadOrganizations()
      .catch((caughtError: Error) => setError(caughtError.message))
      .finally(() => setLoading(false));
  }, [loadOrganizations]);

  useEffect(() => {
    if (!selectedOrganizationId) {
      setEnvironments([]);
      setThreads([]);
      return;
    }

    loadOrganizationResources(selectedOrganizationId).catch(
      (caughtError: Error) => setError(caughtError.message),
    );
  }, [loadOrganizationResources, selectedOrganizationId]);

  useEffect(() => {
    const hasActiveJobs = [...environments, ...threads].some(
      (item) => item.activeJobId,
    );
    if (!hasActiveJobs || !selectedOrganizationId) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadOrganizationResources(selectedOrganizationId).catch(
        (caughtError: Error) => setError(caughtError.message),
      );
    }, 4000);

    return () => window.clearInterval(interval);
  }, [
    environments,
    loadOrganizationResources,
    selectedOrganizationId,
    threads,
  ]);

  const selectedOrganization = useMemo(
    () =>
      organizations.find(
        (organization) => organization.id === selectedOrganizationId,
      ) ?? null,
    [organizations, selectedOrganizationId],
  );

  const filteredEnvironments = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    if (!normalized) {
      return environments;
    }

    return environments.filter((environment) =>
      [environment.name, environment.gitSshUrl, environment.status]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [environments, filter]);

  const selectedEnvironmentOptions = environments.map((environment) => ({
    value: environment.id,
    label: environment.name,
    status: environment.status,
    meta: environment.gitSshUrl,
  }));

  async function handleCreateOrganization(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!organizationName.trim()) {
      return;
    }

    try {
      setCreatingOrganization(true);
      const organization = await api.organizations.create({
        name: organizationName.trim(),
      });
      setOrganizationName("");
      await loadOrganizations();
      setSelectedOrganizationId(organization.id);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create organization",
      );
    } finally {
      setCreatingOrganization(false);
    }
  }

  async function handleCreateEnvironment(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!selectedOrganizationId) {
      return;
    }

    try {
      setCreatingEnvironment(true);
      await api.environments.create(selectedOrganizationId, environmentForm);
      setEnvironmentModalOpen(false);
      setEnvironmentForm({
        name: "",
        gitSshUrl: "",
        setupScript: "npm install",
        workspaceScript: "git status",
      });
      await loadOrganizationResources(selectedOrganizationId);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create environment",
      );
    } finally {
      setCreatingEnvironment(false);
    }
  }

  async function handleRefreshEnvironment(environmentId: string) {
    try {
      await api.environments.refresh(environmentId);
      if (selectedOrganizationId) {
        await loadOrganizationResources(selectedOrganizationId);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to refresh environment",
      );
    }
  }

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
      startTransition(() => {
        router.push(`/thread/${response.data.id}`);
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to create thread",
      );
    } finally {
      setCreatingThread(false);
    }
  }

  return (
    <main className="rp-page">
      <div className="rp-shell">
        <section className="rp-hero">
          <div className="rp-hero-kicker">Relay Plus v1</div>
          <h1 className="rp-hero-title">
            Orchestrate multi-repo AI workspaces without leaving your machine.
          </h1>
          <p className="rp-hero-copy">
            Model organizations, derive environments from Git repos, materialize
            isolated workspaces, and keep Codex sessions alive across follow-up
            prompts. All filesystem state lives under{" "}
            <span className="rp-mono">PROJECT_BASE_DATA_DIRECTORY</span>.
          </p>
        </section>

        <div className="rp-app-grid">
          <aside className="rp-sidebar">
            <Card
              title="Organizations"
              subtitle="Local partitions for your systems, experiments, and teams."
            >
              <form className="rp-stack-sm" onSubmit={handleCreateOrganization}>
                <div className="rp-field">
                  <label className="rp-field-label" htmlFor="organizationName">
                    New organization
                  </label>
                  <Input
                    id="organizationName"
                    value={organizationName}
                    onChange={(event) =>
                      setOrganizationName(event.target.value)
                    }
                    placeholder="Platform Systems"
                  />
                </div>
                <Button type="submit" disabled={creatingOrganization}>
                  {creatingOrganization ? "Creating..." : "Create organization"}
                </Button>
              </form>
              <div style={{ height: "20px" }} />
              <div className="rp-list">
                {organizations.map((organization) => (
                  <button
                    key={organization.id}
                    className="rp-list-button"
                    data-active={organization.id === selectedOrganizationId}
                    onClick={() => setSelectedOrganizationId(organization.id)}
                    type="button"
                  >
                    <strong>{organization.name}</strong>
                    <div className="rp-meta">
                      <span>Created {formatDate(organization.createdAt)}</span>
                      {organization.archivedAt ? (
                        <Badge status="failed">Archived</Badge>
                      ) : null}
                    </div>
                  </button>
                ))}
                {loading && (
                  <div className="rp-empty">Loading organizations…</div>
                )}
                {!loading && organizations.length === 0 && (
                  <div className="rp-empty">
                    Create your first organization to start tracking
                    environments.
                  </div>
                )}
              </div>
            </Card>

            <Card
              title="Interface"
              subtitle="Reference the component language while you build screens."
            >
              <div className="rp-stack-sm">
                <Link className="rp-link" href="/design-system">
                  Open design system gallery
                </Link>
                <p className="rp-note">
                  Keep the UI aligned to shared tokens, surfaces, and
                  interaction patterns instead of page-local styling.
                </p>
              </div>
            </Card>
          </aside>

          <section className="rp-main">
            <Panel
              title={
                selectedOrganization
                  ? `${selectedOrganization.name} environments`
                  : "Environment inventory"
              }
              subtitle="Each environment is a source clone plus setup and workspace recipes."
              actions={
                <div className="rp-toolbar">
                  <CommandBar
                    value={filter}
                    onChange={setFilter}
                    placeholder="Filter repos, URLs, statuses"
                  />
                  <Button
                    tone="secondary"
                    onClick={() => setEnvironmentModalOpen(true)}
                    disabled={!selectedOrganizationId}
                  >
                    Add environment
                  </Button>
                </div>
              }
            >
              <Table
                headers={[
                  "Environment",
                  "Source",
                  "Status",
                  "Last sync",
                  "Actions",
                ]}
              >
                {filteredEnvironments.map((environment) => (
                  <tr key={environment.id}>
                    <td>
                      <div className="rp-stack-sm">
                        <strong>{environment.name}</strong>
                        <span className="rp-note rp-mono">
                          {environment.sourcePath}
                        </span>
                      </div>
                    </td>
                    <td className="rp-mono">{environment.gitSshUrl}</td>
                    <td>
                      <Badge status={environment.status}>
                        {environment.status}
                      </Badge>
                    </td>
                    <td>
                      <div className="rp-stack-sm">
                        <span>{formatDate(environment.lastSyncAt)}</span>
                        {environment.lastSyncedCommit ? (
                          <span className="rp-note rp-mono">
                            {environment.lastSyncedCommit.slice(0, 10)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <Button
                        tone="ghost"
                        onClick={() => handleRefreshEnvironment(environment.id)}
                        disabled={Boolean(environment.activeJobId)}
                      >
                        {environment.activeJobId ? "Running…" : "Refresh"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
              {filteredEnvironments.length === 0 && (
                <div className="rp-empty">
                  {selectedOrganization
                    ? "No environments match this filter yet."
                    : "Select an organization to inspect its environments."}
                </div>
              )}
            </Panel>

            <div className="rp-grid-two">
              <Panel
                title="Create workspace thread"
                subtitle="Pick one or more environments. Relay Plus will materialize a fresh workspace before the first prompt."
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
                  </div>
                  <Button
                    type="submit"
                    disabled={!selectedOrganizationId || creatingThread}
                  >
                    {creatingThread ? "Preparing…" : "Create thread"}
                  </Button>
                </form>
              </Panel>

              <Panel
                title="Recent threads"
                subtitle="Track materialization status, jump back into a Codex-backed workspace, and continue the same session."
              >
                <div className="rp-list">
                  {threads.map((thread) => (
                    <Link
                      key={thread.id}
                      href={`/thread/${thread.id}`}
                      className="rp-list-button"
                    >
                      <strong>{thread.title}</strong>
                      <div className="rp-meta">
                        <Badge status={thread.status}>{thread.status}</Badge>
                        <span>{formatDate(thread.updatedAt)}</span>
                        {thread.codexSessionId ? (
                          <span className="rp-mono">
                            {thread.codexSessionId.slice(0, 8)}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                  {threads.length === 0 && (
                    <div className="rp-empty">
                      No threads yet. Materialize a workspace to start a
                      session.
                    </div>
                  )}
                </div>
              </Panel>
            </div>

            {error ? (
              <Panel
                title="Problem"
                subtitle="The UI is surfacing the most recent backend error."
              >
                <div className="rp-empty">{error}</div>
              </Panel>
            ) : null}
          </section>
        </div>
      </div>

      <Modal
        open={environmentModalOpen}
        onClose={() => setEnvironmentModalOpen(false)}
        title="Create environment"
        description="Environment setup happens against the cached source clone. Workspace setup runs later in each thread copy."
      >
        <form className="rp-stack" onSubmit={handleCreateEnvironment}>
          <div className="rp-grid-two">
            <div className="rp-field">
              <label className="rp-field-label" htmlFor="environmentName">
                Environment name
              </label>
              <Input
                id="environmentName"
                value={environmentForm.name}
                onChange={(event) =>
                  setEnvironmentForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="web-frontend"
              />
            </div>
            <div className="rp-field">
              <label className="rp-field-label" htmlFor="gitSshUrl">
                Git SSH URL
              </label>
              <Input
                id="gitSshUrl"
                value={environmentForm.gitSshUrl}
                onChange={(event) =>
                  setEnvironmentForm((current) => ({
                    ...current,
                    gitSshUrl: event.target.value,
                  }))
                }
                placeholder="git@github.com:acme/app.git"
              />
            </div>
          </div>
          <div className="rp-field">
            <label className="rp-field-label" htmlFor="setupScript">
              Setup script
            </label>
            <Textarea
              id="setupScript"
              value={environmentForm.setupScript}
              onChange={(event) =>
                setEnvironmentForm((current) => ({
                  ...current,
                  setupScript: event.target.value,
                }))
              }
            />
          </div>
          <div className="rp-field">
            <label className="rp-field-label" htmlFor="workspaceScript">
              Workspace script
            </label>
            <Textarea
              id="workspaceScript"
              value={environmentForm.workspaceScript}
              onChange={(event) =>
                setEnvironmentForm((current) => ({
                  ...current,
                  workspaceScript: event.target.value,
                }))
              }
            />
          </div>
          <Button
            type="submit"
            disabled={creatingEnvironment || !selectedOrganizationId}
          >
            {creatingEnvironment ? "Queueing setup…" : "Create environment"}
          </Button>
        </form>
      </Modal>
    </main>
  );
}
