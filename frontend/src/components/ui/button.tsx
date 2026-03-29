import { cn } from "@/lib/utils";

export function Button({
  className,
  tone = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      className={cn(
        "rp-button",
        tone === "primary" && "rp-button-primary",
        tone === "secondary" && "rp-button-secondary",
        tone === "ghost" && "rp-button-ghost",
        tone === "danger" && "rp-button-danger",
        className,
      )}
      {...props}
    />
  );
}
