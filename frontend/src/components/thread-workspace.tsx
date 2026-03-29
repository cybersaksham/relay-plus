"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";

import { api } from "@/lib/api";
import type { Message, RelayEvent, ThreadDetail } from "@/lib/types";
import { findString, formatDate } from "@/lib/utils";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Panel } from "./ui/panel";
import { Tabs } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

export function ThreadWorkspace({ threadId }: { threadId: string }) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [streamTab, setStreamTab] = useState("chat");
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const [streamingAssistant, setStreamingAssistant] = useState("");

  const loadThread = useCallback(async () => {
    const [thread, threadMessages] = await Promise.all([
      api.threads.get(threadId),
      api.threads.listMessages(threadId),
    ]);
    setDetail(thread);
    setMessages(threadMessages);
  }, [threadId]);

  useEffect(() => {
    loadThread().catch((caughtError: Error) => setError(caughtError.message));
  }, [loadThread]);

  useEffect(() => {
    if (!detail?.activeJob) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadThread().catch((caughtError: Error) =>
        setError(caughtError.message),
      );
    }, 3500);

    return () => window.clearInterval(interval);
  }, [detail?.activeJob, loadThread]);

  const pushLogLine = useCallback((line: string) => {
    setStreamLog((current) => [...current.slice(-59), line]);
  }, []);

  const handleRelayEvent = useEffectEvent((payload: RelayEvent) => {
    const data = payload.data ?? {};
    pushLogLine(`${payload.eventType} · ${new Date().toLocaleTimeString()}`);

    const assistantDelta =
      (data.assistantDelta as string | undefined) ??
      findString(data.raw, ["delta", "text"]);
    if (assistantDelta && payload.eventType.includes("delta")) {
      setStreamingAssistant((current) => current + assistantDelta);
    }

    if (payload.eventType === "assistant.message.created") {
      setStreamingAssistant("");
      void loadThread().catch((caughtError: Error) =>
        setError(caughtError.message),
      );
    }

    if (
      payload.eventType === "thread.prepare.succeeded" ||
      payload.eventType === "thread.run.succeeded" ||
      payload.eventType === "thread.prepare.failed" ||
      payload.eventType === "thread.run.failed"
    ) {
      void loadThread().catch((caughtError: Error) =>
        setError(caughtError.message),
      );
    }
  });

  useEffect(() => {
    const eventSource = new EventSource(api.threads.streamUrl(threadId));
    const onEvent = (event: MessageEvent<string>) => {
      try {
        handleRelayEvent(JSON.parse(event.data) as RelayEvent);
      } catch {
        pushLogLine("stream.parse_error");
      }
    };

    eventSource.addEventListener("relay-event", onEvent as EventListener);
    eventSource.onerror = () => pushLogLine("stream.connection_warning");

    return () => {
      eventSource.removeEventListener("relay-event", onEvent as EventListener);
      eventSource.close();
    };
  }, [threadId, pushLogLine]);

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) {
      return;
    }

    try {
      setSending(true);
      const submittedDraft = draft.trim();
      setDraft("");
      setMessages((current) => [
        ...current,
        {
          id: `local-${Date.now()}`,
          threadId,
          role: "user",
          content: submittedDraft,
          rawEventRef: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      pushLogLine("thread.run.queued");
      await api.threads.sendMessage(threadId, { content: submittedDraft });
      await loadThread();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to send message",
      );
    } finally {
      setSending(false);
    }
  }

  const workspaceMap = useMemo(() => {
    const map = new Map(
      detail?.threadEnvironments.map((item) => [item.environmentId, item]) ??
        [],
    );
    return map;
  }, [detail]);

  return (
    <main className="rp-page">
      <div className="rp-shell">
        <section className="rp-hero">
          <div className="rp-hero-kicker">Thread workspace</div>
          <h1 className="rp-hero-title">
            {detail?.thread.title ?? "Loading thread…"}
          </h1>
          <p className="rp-hero-copy">
            Send follow-up prompts into the same Codex session and keep the
            entire multi-repo workspace scoped to one writable sandbox root.
          </p>
          <div style={{ height: "18px" }} />
          <div className="rp-toolbar">
            <div className="rp-chip-row">
              <Badge status={detail?.thread.status ?? "pending"}>
                {detail?.thread.status ?? "pending"}
              </Badge>
              {detail?.thread.codexSessionId ? (
                <span className="rp-chip rp-mono">
                  {detail.thread.codexSessionId}
                </span>
              ) : (
                <span className="rp-chip">No Codex session yet</span>
              )}
            </div>
            <Link href="/" className="rp-link">
              Back to dashboard
            </Link>
          </div>
        </section>

        <div className="rp-grid-two">
          <Panel
            title="Workspace"
            subtitle={
              detail
                ? `Root: ${detail.thread.workspaceRoot}`
                : "Hydrating workspace details"
            }
          >
            <div className="rp-chip-row">
              {detail?.environments.map((environment) => {
                const workspace = workspaceMap.get(environment.id);
                return (
                  <span key={environment.id} className="rp-chip">
                    {environment.name}
                    <Badge
                      status={
                        workspace?.materializationStatus ?? environment.status
                      }
                    >
                      {workspace?.materializationStatus ?? environment.status}
                    </Badge>
                  </span>
                );
              })}
            </div>
            <div style={{ height: "18px" }} />
            <div className="rp-stack-sm">
              {detail?.threadEnvironments.map((item) => (
                <div
                  key={item.environmentId}
                  className="rp-list-button"
                  data-active="false"
                >
                  <strong className="rp-mono">
                    {item.workspacePath || "Awaiting materialization"}
                  </strong>
                  <div className="rp-meta">
                    <span>{item.materializationStatus}</span>
                    <span>{formatDate(item.updatedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Stream"
            subtitle="Live session events, workspace prep milestones, and assistant deltas."
          >
            <div className="rp-stack">
              <Tabs
                value={streamTab}
                onChange={setStreamTab}
                items={[
                  { value: "chat", label: "Chat" },
                  { value: "log", label: "Event log" },
                ]}
              />
              {streamTab === "chat" ? (
                <div className="rp-chat">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className="rp-message"
                      data-role={message.role}
                    >
                      <div className="rp-message-role">{message.role}</div>
                      <div className="rp-message-content">
                        {message.content}
                      </div>
                    </article>
                  ))}
                  {streamingAssistant ? (
                    <article className="rp-message" data-role="assistant">
                      <div className="rp-message-role">
                        assistant (streaming)
                      </div>
                      <div className="rp-message-content">
                        {streamingAssistant}
                      </div>
                    </article>
                  ) : null}
                  {messages.length === 0 && !streamingAssistant ? (
                    <div className="rp-empty">
                      No messages yet. Once the workspace is ready, send your
                      first prompt.
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rp-log">
                  {streamLog.length > 0
                    ? streamLog.join("\n")
                    : "Waiting for stream events…"}
                </div>
              )}
            </div>
          </Panel>
        </div>

        <Panel
          title="Composer"
          subtitle="Messages execute inside the thread workspace root."
        >
          <form className="rp-stack" onSubmit={handleSendMessage}>
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask Codex to coordinate changes across the selected repositories."
            />
            <div className="rp-toolbar">
              <span className="rp-note">
                Network stays enabled. Writes are limited to the workspace
                materialized for this thread.
              </span>
              <Button
                type="submit"
                disabled={sending || detail?.thread.status !== "ready"}
              >
                {sending ? "Dispatching…" : "Send prompt"}
              </Button>
            </div>
          </form>
        </Panel>

        {error ? (
          <Panel
            title="Problem"
            subtitle="The latest API or stream error is shown here."
          >
            <div className="rp-empty">{error}</div>
          </Panel>
        ) : null}
      </div>
    </main>
  );
}
