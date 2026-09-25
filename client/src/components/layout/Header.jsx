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
  ShieldCheck,
  AlertTriangle,
  FileBadge,
  Menu,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useShop } from '../../context/ShopContext';

export function Header({ setView, onOpenShortcuts, onToggleMobileMenu, mobileDrawerOpen }) {
  const { user, logout, isSuperAdmin } = useAuth();
  const { settings } = useShop();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getDaysUntil = (dateStr) => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T00:00:00');
    return Math.round((d - today) / (1000 * 60 * 60 * 24));
  };

  const dlDays = getDaysUntil(settings.drug_license_expiry);
  const isLicenseExpiring = dlDays !== null && dlDays <= 90;

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-3 sm:px-5 md:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-20 print:hidden">
      {/* Left: Mobile Menu Trigger + Shop Name / Platform Badge */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Hamburger Trigger for Mobile/Tablet */}
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0"
          title="Toggle Navigation Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {isSuperAdmin ? (
          <button
            onClick={() => setView('platform')}
            className="flex items-center gap-1.5 sm:gap-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 sm:px-3 py-1.5 rounded-xl border border-indigo-200 transition-colors shrink-0"
          >
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="hidden xs:inline">Platform Admin</span>
            <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.2 rounded font-mono">GLOBAL</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold text-slate-700 bg-slate-100/80 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200/60 min-w-0">
            <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-bold truncate max-w-[110px] sm:max-w-[180px] md:max-w-[220px]">
              {settings?.shop_name || user?.shop?.name || 'Pharmacy'}
            </span>
            {(settings?.city || user?.shop?.city) && (
              <>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <span className="text-slate-500 font-mono text-[11px] hidden sm:inline truncate max-w-[90px]">
                  {settings?.city || user?.shop?.city}
                </span>
              </>
            )}
          </div>
        )}

        {/* Drug License Expiry Warning Badge */}
        {!isSuperAdmin && isLicenseExpiring && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200 animate-pulse shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>DL Expiry: {dlDays < 0 ? 'Expired' : `${dlDays}d left`}</span>
          </div>
        )}

        {/* Live Clock on Desktop */}
        <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-500 font-mono shrink-0">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>
            {currentTime.toLocaleDateString('en-IN', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
            })}
            , {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>

      {/* Right: Actions, POS Quick Button, User Info */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Quick New Bill Button */}
        <button
          onClick={() => setView('pos')}
          className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-700/20 transition-all transform active:scale-95 shrink-0"
        >
          <Receipt className="w-4 h-4 shrink-0" />
          <span className="hidden xs:inline">New Bill</span>
          <span className="hidden sm:inline font-mono text-[10px] bg-white/20 px-1 rounded">F2</span>
        </button>

        {/* Keyboard Shortcuts Trigger (Hidden on Mobile) */}
        <button
          onClick={onOpenShortcuts}
          className="hidden md:flex p-2 text-slate-500 hover:text-slate-900 bg-slate-100/70 hover:bg-slate-200/60 rounded-xl border border-slate-200/60 transition-colors"
          title="Keyboard Shortcuts Guide"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {/* User Role Badge & Logout */}
        <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-slate-200">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
              isSuperAdmin
                ? 'bg-indigo-900 text-indigo-300'
                : 'bg-slate-900 text-emerald-400'
            }`}
          >
            {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
          </div>
          <div className="hidden md:block text-left leading-tight">
            <div className="text-xs font-bold text-slate-800 truncate max-w-[110px]">{user?.name || 'Admin'}</div>
            <div
              className={`text-[10px] font-semibold uppercase tracking-wide ${
                isSuperAdmin ? 'text-indigo-600 font-black' : 'text-emerald-600'
              }`}
            >
              {user?.role || (isSuperAdmin ? 'SUPER_ADMIN' : 'SHOP_OWNER')}
            </div>
          </div>
          <button
            onClick={logout}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

