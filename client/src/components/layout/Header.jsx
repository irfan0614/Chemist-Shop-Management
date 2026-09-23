import React, { useState, useEffect } from 'react';
import {
  Receipt,
  Keyboard,
  User,
  LogOut,
  Bell,
  Clock,
  Building2,
  Search,
  Sparkles,
  Shield,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useShop } from '../../context/ShopContext';

export function Header({ setView, onOpenShortcuts }) {
  const { user, logout } = useAuth();
  const { settings } = useShop();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between gap-4 sticky top-0 z-20 print:hidden">
      {/* Left: Shop Name & Live Clock */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200/60">
          <Building2 className="w-4 h-4 text-emerald-600" />
          <span className="font-bold">{settings.shop_name}</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 font-mono text-[11px]">{settings.city || 'New Delhi'}</span>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 font-mono">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>
            {currentTime.toLocaleDateString('en-IN', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
            , {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Right: Actions, POS Quick Button, User Info */}
      <div className="flex items-center gap-3">
        {/* Quick New Bill Button */}
        <button
          onClick={() => setView('pos')}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 transition-all transform active:scale-95"
        >
          <Receipt className="w-4 h-4" />
          <span>New Bill (F2)</span>
        </button>

        {/* Keyboard Shortcuts Trigger */}
        <button
          onClick={onOpenShortcuts}
          className="p-2 text-slate-500 hover:text-slate-900 bg-slate-100/70 hover:bg-slate-200/60 rounded-xl border border-slate-200/60 transition-colors"
          title="Keyboard Shortcuts Guide"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {/* User Role Badge & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center font-bold text-xs">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
          </div>
          <div className="hidden sm:block text-left leading-tight">
            <div className="text-xs font-bold text-slate-800 truncate max-w-[130px]">{user?.name || 'Admin'}</div>
            <div className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">{user?.role || 'PHARMACIST'}</div>
          </div>
          <button
            onClick={logout}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors ml-1"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
