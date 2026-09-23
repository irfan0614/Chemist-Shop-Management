import React from 'react';

export function StatCard({ label, value, icon: Icon, tone = 'neutral', subtext, onClick }) {
  const tones = {
    ok: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    warn: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    alert: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    blue: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
    purple: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  const textTone = {
    ok: 'text-emerald-700',
    warn: 'text-amber-700',
    alert: 'text-rose-700',
    blue: 'text-sky-700',
    purple: 'text-purple-700',
    neutral: 'text-slate-900',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all ${onClick ? 'cursor-pointer hover:border-emerald-500/50' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
        {Icon && (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center border ${tones[tone] || tones.neutral}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className={`text-2xl font-bold font-mono tracking-tight mt-1.5 ${textTone[tone] || 'text-slate-900'}`}>
        {value}
      </div>
      {subtext && <div className="text-[11px] text-slate-400 font-medium mt-1">{subtext}</div>}
    </div>
  );
}
