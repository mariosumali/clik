interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SegmentProps<T extends string> {
  value: T;
  onChange: (next: T) => void;
  options: SegmentOption<T>[];
  className?: string;
}

export function Segment<T extends string>({ value, onChange, options, className }: SegmentProps<T>) {
  return (
    <div className={`segment ${className ?? ''}`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={opt.disabled}
          data-active={value === opt.value}
          onClick={() => !opt.disabled && onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
