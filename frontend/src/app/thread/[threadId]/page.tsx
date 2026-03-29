import { ThreadWorkspace } from "@/components/thread-workspace";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  return <ThreadWorkspace threadId={threadId} />;
}
