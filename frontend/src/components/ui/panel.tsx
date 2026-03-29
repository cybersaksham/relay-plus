import { cn } from "@/lib/utils";

export function Panel({
  title,
  subtitle,
  className,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  className?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rp-panel", className)}>
      {(title || subtitle || actions) && (
        <>
          <div className="rp-toolbar">
            <div>
              {title ? <h2 className="rp-panel-title">{title}</h2> : null}
              {subtitle ? (
                <p className="rp-panel-subtitle">{subtitle}</p>
              ) : null}
            </div>
            {actions}
          </div>
          <div style={{ height: "18px" }} />
        </>
      )}
      {children}
    </section>
  );
}
