import { cn } from "@/lib/utils";

export function Tabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="rp-tabs" role="tablist" aria-label="Tabs">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          data-active={value === item.value}
          className={cn("rp-tab")}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
