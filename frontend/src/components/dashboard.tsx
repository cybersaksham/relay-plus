"use client";

import { useState, useMemo } from "react";
import { type Environment } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAppContext } from "@/lib/app-context";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { CommandBar } from "./ui/command-bar";
import { Input } from "./ui/input";
import { Modal } from "./ui/modal";
import { Panel } from "./ui/panel";
import { Table } from "./ui/table";
import { Textarea } from "./ui/textarea";

export function Dashboard() {
  const {
    organizations,
    selectedOrganizationId,
    setSelectedOrganizationId,
    environments,
    error: contextError,
    loadOrganizations,
    loadOrganizationResources,
  } = useAppContext();

  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Environment State
  const [filter, setFilter] = useState("");
  const [environmentModalOpen, setEnvironmentModalOpen] = useState(false);
  const [creatingEnvironment, setCreatingEnvironment] = useState(false);
  const [environmentForm, setEnvironmentForm] = useState({
    name: "",
    gitSshUrl: "",
    setupScript: "npm install",
    workspaceScript: "git status",
  });

  const selectedOrganization = useMemo(
    () => organizations.find((o) => o.id === selectedOrganizationId) ?? null,
    [organizations, selectedOrganizationId],
  );

  const filteredEnvironments = useMemo(() => {
    const normalized = filter.trim().toLowerCase();
    if (!normalized) {
      return environments;
    }
    return environments.filter((env: Environment) =>
      [env.name, env.gitSshUrl, env.status].join(" ").toLowerCase().includes(normalized),
    );
  }, [environments, filter]);

  async function handleCreateOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organizationName.trim()) {
      return;
    }
    try {
      setCreatingOrganization(true);
      setLocalError(null);
      const organization = await api.organizations.create({
        name: organizationName.trim(),
      });
      setOrganizationName("");
      await loadOrganizations();
      setSelectedOrganizationId(organization.id);
    } catch (caughtError) {
      setLocalError(caughtError instanceof Error ? caughtError.message : "Unable to create organization");
    } finally {
      setCreatingOrganization(false);
    }
  }

  async function handleCreateEnvironment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedOrganizationId) {
      return;
    }
    try {
      setCreatingEnvironment(true);
      setLocalError(null);
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
      setLocalError(caughtError instanceof Error ? caughtError.message : "Unable to create environment");
    } finally {
      setCreatingEnvironment(false);
    }
  }

  async function handleRefreshEnvironment(environmentId: string) {
    try {
      setLocalError(null);
      await api.environments.refresh(environmentId);
      if (selectedOrganizationId) {
        await loadOrganizationResources(selectedOrganizationId);
      }
    } catch (caughtError) {
      setLocalError(caughtError instanceof Error ? caughtError.message : "Unable to refresh environment");
    }
  }

  const displayError = localError || contextError;

  return (
    <div className="rp-page-content">
      <div className="rp-stack" style={{ maxWidth: "1000px" }}>
        <h1 className="rp-page-title">Organizations & Environments</h1>
        <p className="rp-note" style={{ maxWidth: "600px", marginBottom: "1rem" }}>
          Manage your organizations and their derived Git environments here. Once an environment is set up, you can create workspaces for it from the sidebar.
        </p>

        {displayError && (
          <Panel title="Problem" subtitle="The UI is surfacing an error.">
            <div className="rp-empty" style={{ borderColor: "rgba(170, 67, 67, 0.4)", color: "var(--color-crimson-600)" }}>
              {displayError}
            </div>
          </Panel>
        )}

        <div className="rp-grid-two">
          <Card title="Create Organization" subtitle="Local partition for systems and tools.">
            <form className="rp-stack-sm" onSubmit={handleCreateOrganization}>
              <div className="rp-field">
                <Input
                  id="organizationName"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="Platform Systems"
                />
              </div>
              <div>
                <Button type="submit" disabled={creatingOrganization || !organizationName.trim()}>
                  {creatingOrganization ? "Creating..." : "Create organization"}
                </Button>
              </div>
            </form>
          </Card>
          
          <Card title="Your Organizations" subtitle="Currently available partitioned workspaces.">
            <div className="rp-stack-sm">
                {organizations.map((org) => (
                  <div key={org.id} className="rp-list-button" data-active={org.id === selectedOrganizationId} onClick={() => setSelectedOrganizationId(org.id)} style={{ padding: "10px 14px" }}>
                    <strong>{org.name}</strong>
                    <div className="rp-meta">
                      <span>{formatDate(org.createdAt)}</span>
                      {org.archivedAt && <Badge status="failed">Archived</Badge>}
                    </div>
                  </div>
                ))}
                {organizations.length === 0 && (
                   <div className="rp-note">No organizations found.</div>
                )}
            </div>
          </Card>
        </div>

        <Panel
          title={selectedOrganization ? `${selectedOrganization.name} environments` : "Environment inventory"}
          subtitle="Each environment is a source clone plus setup and workspace recipes."
          actions={
            <div className="rp-toolbar">
              <CommandBar
                value={filter}
                onChange={setFilter}
                placeholder="Filter repos..."
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
          <Table headers={["Environment", "Source", "Status", "Last sync", "Actions"]}>
            {filteredEnvironments.map((environment) => (
              <tr key={environment.id}>
                <td>
                  <div className="rp-stack-sm">
                    <strong>{environment.name}</strong>
                    <span className="rp-note rp-mono">{environment.sourcePath}</span>
                  </div>
                </td>
                <td className="rp-mono" style={{ fontSize: "0.85em" }}>{environment.gitSshUrl}</td>
                <td>
                  <Badge status={environment.status}>{environment.status}</Badge>
                </td>
                <td>
                  <div className="rp-stack-sm">
                    <span style={{ fontSize: "0.9em" }}>{formatDate(environment.lastSyncAt)}</span>
                    {environment.lastSyncedCommit && (
                      <span className="rp-note rp-mono">{environment.lastSyncedCommit.slice(0, 10)}</span>
                    )}
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
            <div className="rp-empty" style={{ borderTop: "none", borderRadius: "0 0 8px 8px" }}>
              {selectedOrganization
                ? "No environments found. Add one to get started."
                : "Select an organization to inspect its environments."}
            </div>
          )}
        </Panel>
      </div>

      <Modal
        open={environmentModalOpen}
        onClose={() => setEnvironmentModalOpen(false)}
        title="Create environment"
        description="Environment setup happens against the cached source clone."
      >
        <form className="rp-stack" onSubmit={handleCreateEnvironment}>
          <div className="rp-grid-two">
            <div className="rp-field">
              <label className="rp-field-label" htmlFor="environmentName">Name</label>
              <Input
                id="environmentName"
                value={environmentForm.name}
                onChange={(e) => setEnvironmentForm((curr) => ({ ...curr, name: e.target.value }))}
                placeholder="web-frontend"
              />
            </div>
            <div className="rp-field">
              <label className="rp-field-label" htmlFor="gitSshUrl">Git SSH URL</label>
              <Input
                id="gitSshUrl"
                value={environmentForm.gitSshUrl}
                onChange={(e) => setEnvironmentForm((curr) => ({ ...curr, gitSshUrl: e.target.value }))}
                placeholder="git@github.com:acme/app.git"
              />
            </div>
          </div>
          <div className="rp-field">
            <label className="rp-field-label" htmlFor="setupScript">Setup script</label>
            <Textarea
              id="setupScript"
              value={environmentForm.setupScript}
              onChange={(e) => setEnvironmentForm((curr) => ({ ...curr, setupScript: e.target.value }))}
            />
          </div>
          <div className="rp-field">
            <label className="rp-field-label" htmlFor="workspaceScript">Workspace script</label>
            <Textarea
              id="workspaceScript"
              value={environmentForm.workspaceScript}
              onChange={(e) => setEnvironmentForm((curr) => ({ ...curr, workspaceScript: e.target.value }))}
            />
          </div>
          <Button type="submit" disabled={creatingEnvironment || !selectedOrganizationId}>
            {creatingEnvironment ? "Queueing setup…" : "Create environment"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
