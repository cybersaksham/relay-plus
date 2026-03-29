"use client";

import Link from "next/link";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { MultiSelect } from "./ui/multi-select";
import { Panel } from "./ui/panel";
import { Table } from "./ui/table";
import { Tabs } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

export function DesignSystemShowcase() {
  return (
    <main className="rp-page">
      <div className="rp-shell">
        <section className="rp-hero">
          <div className="rp-hero-kicker">Design system</div>
          <h1 className="rp-hero-title">
            A single visual language for every Relay Plus screen.
          </h1>
          <p className="rp-hero-copy">
            Tokens, surfaces, badges, tables, panels, and workspace-centric
            interaction patterns all land here before they reach the app
            surface.
          </p>
          <div style={{ height: "18px" }} />
          <Link className="rp-link" href="/">
            Back to dashboard
          </Link>
        </section>

        <div className="rp-grid-two">
          <Card
            title="Buttons and status"
            subtitle="Core calls to action and lifecycle signals."
          >
            <div className="rp-stack">
              <div className="rp-chip-row">
                <Button>Primary</Button>
                <Button tone="secondary">Secondary</Button>
                <Button tone="ghost">Ghost</Button>
                <Button tone="danger">Danger</Button>
              </div>
              <div className="rp-chip-row">
                <Badge status="ready">ready</Badge>
                <Badge status="pending">pending</Badge>
                <Badge status="running">running</Badge>
                <Badge status="failed">failed</Badge>
              </div>
            </div>
          </Card>

          <Card
            title="Inputs"
            subtitle="Forms stay on system by sharing the same field affordances."
          >
            <div className="rp-stack">
              <Input placeholder="Environment name" />
              <Textarea defaultValue="npm install && cargo fetch" />
            </div>
          </Card>
        </div>

        <div className="rp-grid-two">
          <Panel
            title="Selection patterns"
            subtitle="Multi-repo thread creation depends on clear selection UI."
          >
            <div className="rp-stack">
              <Tabs
                value="environments"
                onChange={() => {}}
                items={[
                  { value: "environments", label: "Environments" },
                  { value: "threads", label: "Threads" },
                ]}
              />
              <MultiSelect
                values={["one"]}
                onToggle={() => {}}
                options={[
                  {
                    value: "one",
                    label: "frontend",
                    meta: "git@github.com:acme/frontend.git",
                    status: "ready",
                  },
                  {
                    value: "two",
                    label: "backend",
                    meta: "git@github.com:acme/backend.git",
                    status: "pending",
                  },
                ]}
              />
            </div>
          </Panel>

          <Panel
            title="Data presentation"
            subtitle="Tables and cards are used for repo inventories and thread lists."
          >
            <Table headers={["Name", "Status", "Path"]}>
              <tr>
                <td>platform-core</td>
                <td>
                  <Badge status="ready">ready</Badge>
                </td>
                <td className="rp-mono">~/.relay-plus/sources/123/repo</td>
              </tr>
              <tr>
                <td>ops-console</td>
                <td>
                  <Badge status="running">running</Badge>
                </td>
                <td className="rp-mono">
                  ~/.relay-plus/workspaces/abc/ops-console
                </td>
              </tr>
            </Table>
          </Panel>
        </div>
      </div>
    </main>
  );
}
