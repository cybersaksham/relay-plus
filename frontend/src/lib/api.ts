import type {
  Environment,
  Job,
  Message,
  MutationResponse,
  Organization,
  Thread,
  ThreadDetail,
  ThreadMessageMutationResponse,
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
  "http://127.0.0.1:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  organizations: {
    list: () => request<Organization[]>("/organizations"),
    create: (payload: { name: string }) =>
      request<Organization>("/organizations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    update: (id: string, payload: { name?: string; archived?: boolean }) =>
      request<Organization>(`/organizations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
  },
  environments: {
    list: (organizationId: string) =>
      request<Environment[]>(`/organizations/${organizationId}/environments`),
    create: (
      organizationId: string,
      payload: {
        name: string;
        gitSshUrl: string;
        setupScript: string;
        workspaceScript: string;
      },
    ) =>
      request<MutationResponse<Environment>>(
        `/organizations/${organizationId}/environments`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      ),
    refresh: (environmentId: string) =>
      request<MutationResponse<Environment>>(
        `/environments/${environmentId}/refresh`,
        {
          method: "POST",
        },
      ),
  },
  threads: {
    list: (organizationId: string) =>
      request<Thread[]>(`/organizations/${organizationId}/threads`),
    create: (payload: {
      organizationId: string;
      title: string;
      environmentIds: string[];
    }) =>
      request<MutationResponse<Thread>>("/threads", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    get: (threadId: string) => request<ThreadDetail>(`/threads/${threadId}`),
    listMessages: (threadId: string) =>
      request<Message[]>(`/threads/${threadId}/messages`),
    sendMessage: (threadId: string, payload: { content: string }) =>
      request<ThreadMessageMutationResponse>(`/threads/${threadId}/messages`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    streamUrl: (threadId: string) =>
      `${API_BASE_URL}/threads/${threadId}/stream`,
  },
  jobs: {
    get: (jobId: string) => request<Job>(`/jobs/${jobId}`),
  },
};
