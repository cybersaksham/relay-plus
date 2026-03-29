import { cn } from "@/lib/utils";

export function Card({
  title,
  subtitle,
  className,
  children,
}: {
  title?: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rp-card", className)}>
      {title ? <h2 className="rp-card-title">{title}</h2> : null}
      {subtitle ? <p className="rp-card-subtitle">{subtitle}</p> : null}
      {title || subtitle ? <div style={{ height: "16px" }} /> : null}
      {children}
    </section>
  );
}
