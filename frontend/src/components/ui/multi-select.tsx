import { Badge } from "./badge";

export interface MultiSelectOption {
  value: string;
  label: string;
  meta?: string;
  status?: string;
}

export function MultiSelect({
  options,
  values,
  onToggle,
}: {
  options: MultiSelectOption[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="rp-multiselect">
      {options.map((option) => {
        const checked = values.includes(option.value);
        return (
          <label key={option.value} className="rp-multiselect-option">
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(option.value)}
            />
            <div className="rp-stack-sm">
              <div className="rp-toolbar">
                <strong>{option.label}</strong>
                {option.status ? (
                  <Badge status={option.status}>{option.status}</Badge>
                ) : null}
              </div>
              {option.meta ? (
                <span className="rp-note">{option.meta}</span>
              ) : null}
            </div>
          </label>
        );
      })}
    </div>
  );
}
