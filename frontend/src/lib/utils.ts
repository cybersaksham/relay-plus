export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function summarizeStatus(status: string) {
  switch (status) {
    case "ready":
    case "succeeded":
      return "ready";
    case "running":
    case "syncing":
      return "running";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

export function findString(value: unknown, keys: string[]): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys);
      if (found) {
        return found;
      }
    }
  }

  if (value && typeof value === "object") {
    const map = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = map[key];
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
    for (const candidate of Object.values(map)) {
      const found = findString(candidate, keys);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}
