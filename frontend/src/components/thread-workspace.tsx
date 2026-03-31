"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useRef,
} from "react";

import { api } from "@/lib/api";
import type { Message, RelayEvent, ThreadDetail } from "@/lib/types";
import { findString, formatDate } from "@/lib/utils";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function ThreadWorkspace({ threadId }: { threadId: string }) {
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Stream state
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const [streamingAssistant, setStreamingAssistant] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingAssistant]);

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
    if (!detail?.activeJob) return;

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
    if (!draft.trim()) return;

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
    return new Map(
      detail?.threadEnvironments.map((item) => [item.environmentId, item]) ?? []
    );
  }, [detail]);

  return (
    <div className="rp-chat-layout">
      <header className="rp-chat-header">
        <div className="rp-chat-header-title">
          <h2>{detail?.thread.title ?? "Loading workspace…"}</h2>
          <div className="rp-chip-row">
            <Badge status={detail?.thread.status ?? "pending"}>
              {detail?.thread.status ?? "pending"}
            </Badge>
            {detail?.thread.codexSessionId ? (
              <span className="rp-chip rp-mono">
                {detail.thread.codexSessionId.slice(0, 8)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="rp-chat-header-actions">
           <Button tone="ghost" onClick={() => setShowDetails(!showDetails)}>
             {showDetails ? "Hide environments" : "Show environments"}
           </Button>
        </div>
      </header>

      {showDetails && (
         <div className="rp-chat-details-panel">
            <div className="rp-stack-sm" style={{ padding: "16px", background: "var(--surface-panel)", borderBottom: "1px solid var(--border-soft)", fontSize: "0.9em" }}>
               <h4>Workspace Roots & Environments</h4>
               <p className="rp-mono" style={{ color: "var(--text-secondary)" }}>Root: {detail?.thread.workspaceRoot || "Awaiting"}</p>
               <div className="rp-chip-row">
                 {detail?.environments.map((environment) => {
                   const workspace = workspaceMap.get(environment.id);
                   return (
                     <span key={environment.id} className="rp-chip">
                       {environment.name} • {workspace?.materializationStatus ?? environment.status}
                     </span>
                   );
                 })}
               </div>
            </div>
         </div>
      )}

      {error ? (
        <div className="rp-chat-error">
          {error}
        </div>
      ) : null}

      <div className="rp-chat-scroll-area">
        <div className="rp-chat-messages">
          {messages.length === 0 && !streamingAssistant ? (
            <div className="rp-chat-empty">
               <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-secondary)", marginBottom: "16px" }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
               <h3>Get started with {detail?.thread.title}</h3>
               <p>Send a prompt to orchestrate changes across the selected environments.</p>
            </div>
          ) : null}

          {messages.map((message) => (
             <div key={message.id} className={`rp-chat-message-row ${message.role}`}>
               <div className="rp-chat-message-bubble">
                  {message.role === "assistant" && <div className="rp-message-role">Relay Plus</div>}
                  <div className="rp-message-content">{message.content}</div>
               </div>
             </div>
          ))}

          {streamingAssistant ? (
             <div className="rp-chat-message-row assistant">
               <div className="rp-chat-message-bubble streaming">
                  <div className="rp-message-role">Relay Plus (streaming)</div>
                  <div className="rp-message-content">{streamingAssistant}</div>
               </div>
             </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="rp-chat-composer-area">
        <form className="rp-chat-composer-form" onSubmit={handleSendMessage}>
          <textarea
             className="rp-chat-input"
             value={draft}
             onChange={(event) => setDraft(event.target.value)}
             placeholder="Message Relay Plus..."
             onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                   e.preventDefault();
                   if (!sending && detail?.thread.status === "ready") {
                      e.currentTarget.form?.requestSubmit();
                   }
                }
             }}
          />
          <div className="rp-chat-composer-actions">
            <span className="rp-note" style={{ fontSize: "0.8em" }}>
              Press Enter to send. Shift+Enter for newline.
            </span>
            <Button
              type="submit"
              disabled={sending || detail?.thread.status !== "ready"}
            >
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
