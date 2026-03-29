import { summarizeStatus } from "@/lib/utils";

export function Badge({
  status,
  children,
}: {
  status: string;
  children?: React.ReactNode;
}) {
  const tone = summarizeStatus(status);
  return (
    <span className={`rp-badge rp-badge-${tone}`}>{children ?? status}</span>
  );
}
