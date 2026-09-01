export function Panel({
  title,
  hint,
  children,
}: {
  title?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-border-c rounded-xl p-5 mb-5 shadow-sm">
      {title && (
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="font-display font-semibold text-base text-ink">
            {title}
          </h2>
          {hint && <span className="text-xs text-ink-faint">{hint}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = "flat",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down" | "flat";
}) {
  const toneClass =
    tone === "up" ? "text-good" : tone === "down" ? "text-critical" : "text-ink-faint";
  return (
    <div className="bg-surface border border-border-c rounded-xl p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint mb-2">
        {label}
      </div>
      <div className="font-display text-2xl font-semibold text-ink tabular">
        {value}
      </div>
      {sub && <div className={`text-xs mt-1.5 ${toneClass}`}>{sub}</div>}
    </div>
  );
}

const chipTones: Record<string, string> = {
  good: "bg-good-bg text-good",
  warn: "bg-warn-bg text-warn",
  critical: "bg-critical-bg text-critical",
  neutral: "bg-surface-2 text-ink-soft",
};

export function Chip({
  tone,
  children,
}: {
  tone: "good" | "warn" | "critical" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${chipTones[tone]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function PageHeader({
  kicker,
  title,
  action,
}: {
  kicker?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
      <div>
        {kicker && (
          <div className="text-xs text-ink-faint mb-1">{kicker}</div>
        )}
        <h1 className="font-display font-semibold text-2xl text-ink">
          {title}
        </h1>
      </div>
      {action}
    </div>
  );
}
