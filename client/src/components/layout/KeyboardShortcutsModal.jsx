import React from 'react';
import { Modal } from '../common/Modal';

export function KeyboardShortcutsModal({ isOpen, onClose }) {
  const shortcuts = [
    { key: 'F2', label: 'Start New POS Bill', desc: 'Jump immediately to POS billing screen' },
    { key: 'F4', label: 'Focus Medicine Search', desc: 'Place cursor into POS search input' },
    { key: 'F8', label: 'Hold Current Bill', desc: 'Park the active cart to attend next patient' },
    { key: 'F9', label: 'Customer / Doctor Lookup', desc: 'Select regular customer or prescription info' },
    { key: 'F10', label: 'Complete Checkout', desc: 'Open Payment & Thermal Print modal' },
    { key: 'Alt + S', label: 'Save / Update Record', desc: 'Quick save in any modal form' },
    { key: 'Esc', label: 'Close Dialog / Clear', desc: 'Dismiss active modal or clear selection' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="POS & Keyboard Shortcuts" subtitle="Speed up counter sales without touching the mouse" maxWidth="max-w-lg">
      <div className="space-y-3">
        {shortcuts.map((s, idx) => (
          <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-colors">
            <div>
              <div className="text-xs font-bold text-slate-800">{s.label}</div>
              <div className="text-[11px] text-slate-400">{s.desc}</div>
            </div>
            <kbd className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-emerald-700 shadow-sm">
              {s.key}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
