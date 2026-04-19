interface StubPageProps {
  title: string;
  subtitle: string;
}

export function StubPage({ title, subtitle }: StubPageProps) {
  return (
    <div className="flex h-full items-center justify-center text-center px-10">
      <div>
        <div className="label-muted mb-3">{subtitle}</div>
        <div className="label text-[var(--color-cream)] mb-3">{title}</div>
        <div className="label-muted">Coming in a later cut</div>
      </div>
    </div>
  );
}
