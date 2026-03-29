export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface Environment {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  gitSshUrl: string;
  setupScript: string;
  workspaceScript: string;
  sourcePath: string;
  status: string;
  lastSyncedCommit: string | null;
  lastSyncAt: string | null;
  activeJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  organizationId: string;
  title: string;
  workspaceRoot: string;
  status: string;
  codexSessionId: string | null;
  activeJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadEnvironment {
  threadId: string;
  environmentId: string;
  workspacePath: string;
  materializationStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  threadId: string;
  role: string;
  content: string;
  rawEventRef: string | null;
  createdAt: string;
}

export interface Job {
  id: string;
  kind: string;
  targetType: string;
  targetId: string;
  status: string;
  logPath: string;
  errorJson: { message?: string } | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface MutationResponse<T> {
  data: T;
  job: Job | null;
}

export interface ThreadDetail {
  thread: Thread;
  environments: Environment[];
  threadEnvironments: ThreadEnvironment[];
  activeJob: Job | null;
}

export interface ThreadMessageMutationResponse {
  userMessage: Message;
  job: Job;
}

export interface RelayEvent {
  eventType: string;
  threadId?: string;
  jobId?: string;
  emittedAt?: string;
  data: Record<string, unknown>;
}
