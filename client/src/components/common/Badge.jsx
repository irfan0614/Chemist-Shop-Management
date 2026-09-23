import React from 'react';

export function Badge({ tone = 'neutral', children, className = '' }) {
  const tones = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    warn: 'bg-amber-50 text-amber-700 border-amber-200/60',
    alert: 'bg-rose-50 text-rose-700 border-rose-200/60',
    purple: 'bg-purple-50 text-purple-700 border-purple-200/60',
    blue: 'bg-sky-50 text-sky-700 border-sky-200/60',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${tones[tone] || tones.neutral} ${className}`}
    >
      {children}
    </span>
  );
}

export function DrugScheduleBadge({ scheduleType }) {
  if (!scheduleType || scheduleType === 'NONE') return null;

  const config = {
    H1: { label: 'Schedule H1 (Warning)', tone: 'alert' },
    H: { label: 'Schedule H (Rx)', tone: 'warn' },
    X: { label: 'Schedule X (Strict)', tone: 'purple' },
    NARCOTIC: { label: 'Narcotic / NDPS', tone: 'purple' },
    G: { label: 'Schedule G', tone: 'blue' },
  };

  const item = config[scheduleType] || { label: `Sched ${scheduleType}`, tone: 'neutral' };

  return <Badge tone={item.tone}>{item.label}</Badge>;
}
