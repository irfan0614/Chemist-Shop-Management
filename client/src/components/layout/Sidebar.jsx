import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  Package,
  Boxes,
  Truck,
  ShoppingBag,
  History,
  Users,
  FileText,
  RotateCcw,
  Wallet,
  BarChart3,
  Settings as SettingsIcon,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Plus,
  Cross,
  Building2,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useShop } from '../../context/ShopContext';

export function Sidebar({
  currentView,
  setView,
  collapsed,
  setCollapsed,
  mobileOpen = false,
  onCloseMobile,
}) {
  const { user, hasRole, isSuperAdmin } = useAuth();
  const { settings } = useShop();

  const menuSections = [
    ...(isSuperAdmin
      ? [
          {
            title: 'SaaS Platform',
            items: [
              {
                key: 'platform',
                label: 'Platform Control Panel',
                icon: Building2,
                roles: ['SUPER_ADMIN'],
                highlight: true,
                badge: 'SUPER',
              },
            ],
          },
        ]
      : []),
    {
      title: 'Operations',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['SHOP_OWNER'] },
        { key: 'pos', label: 'POS Billing', icon: Receipt, roles: ['SHOP_OWNER'], badge: 'F2', highlight: true },
      ],
    },
    {
      title: 'Inventory & Procurement',
      items: [
        { key: 'medicines', label: 'Medicine Catalog', icon: Package, roles: ['SHOP_OWNER'] },
        { key: 'batches', label: 'Batch Inventory', icon: Boxes, roles: ['SHOP_OWNER'] },
        { key: 'purchases', label: 'Purchase Inward', icon: ShoppingBag, roles: ['SHOP_OWNER'] },
        { key: 'suppliers', label: 'Suppliers', icon: Truck, roles: ['SHOP_OWNER'] },
      ],
    },
    {
      title: 'Patients & Compliance',
      items: [
        { key: 'history', label: 'Sales History', icon: History, roles: ['SHOP_OWNER'] },
        { key: 'customers', label: 'Customers (Khata)', icon: Users, roles: ['SHOP_OWNER'] },
        { key: 'prescriptions', label: 'Prescriptions / H1', icon: FileText, roles: ['SHOP_OWNER'] },
        { key: 'returns', label: 'Returns & Refunds', icon: RotateCcw, roles: ['SHOP_OWNER'] },
      ],
    },
    {
      title: 'Accounts & Analytics',
      items: [
        { key: 'expenses', label: 'Expenses & Cash', icon: Wallet, roles: ['SHOP_OWNER'] },
        { key: 'reports', label: 'Reports & GST', icon: BarChart3, roles: ['SHOP_OWNER'] },
      ],
    },
    {
      title: 'Administration',
      items: [
        { key: 'settings', label: 'Shop Profile & DL', icon: SettingsIcon, roles: ['SHOP_OWNER'] },
        { key: 'users', label: 'Owner & Security Logs', icon: ShieldCheck, roles: ['SHOP_OWNER'] },
      ],
    },
  ];

  const handleItemClick = (key) => {
    setView(key);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 md:static md:z-30 shrink-0 bg-slate-950 text-slate-300 flex flex-col transition-all duration-300 print:hidden shadow-2xl md:shadow-none ${
        mobileOpen
          ? 'translate-x-0 w-72 max-w-[85vw]'
          : '-translate-x-full md:translate-x-0'
      } ${collapsed ? 'md:w-20' : 'md:w-64'}`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 bg-slate-950">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-950/40">
            <Plus className="w-6 h-6 text-white" strokeWidth={3} />
          </div>
          {(!collapsed || mobileOpen) && (
            <div className="min-w-0">
              <h1 className="font-extrabold text-sm text-white truncate tracking-tight">
                {isSuperAdmin ? 'MedCloud Platform' : settings.shop_name || 'Apollo Chemist'}
              </h1>
              <div className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase truncate flex items-center gap-1">
                {isSuperAdmin ? (
                  <span>Super Admin Suite</span>
                ) : (
                  <>
                    <span className="bg-emerald-950 text-emerald-300 px-1 rounded border border-emerald-800/50">
                      {settings.plan || 'PRO'}
                    </span>
                    <span>Pharmacy v2.0</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Mobile Close Button (md:hidden) */}
        <button
          onClick={onCloseMobile}
          className="md:hidden w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Close Navigation"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Desktop Collapse Toggle (hidden md:flex) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5 custom-scrollbar">
        {menuSections.map((section, sIdx) => {
          const visibleItems = section.items.filter((item) => hasRole(item.roles));
          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx} className="space-y-1">
              {(!collapsed || mobileOpen) && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {section.title}
                </div>
              )}
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.key;
                const isPlatformItem = item.key === 'platform';

                return (
                  <button
                    key={item.key}
                    onClick={() => handleItemClick(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group relative ${
                      isActive
                        ? isPlatformItem
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/40 font-bold'
                          : 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/30 font-bold'
                        : isPlatformItem
                        ? 'bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50 border border-indigo-700/40'
                        : item.highlight
                        ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                    }`}
                    title={collapsed && !mobileOpen ? item.label : undefined}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                        isActive
                          ? 'text-white'
                          : isPlatformItem
                          ? 'text-indigo-400'
                          : item.highlight
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    />
                    {(!collapsed || mobileOpen) && <span className="truncate">{item.label}</span>}
                    {(!collapsed || mobileOpen) && item.badge && (
                      <span
                        className={`ml-auto text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : isPlatformItem
                            ? 'bg-indigo-900/80 text-indigo-200 border border-indigo-600/60'
                            : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-900 bg-slate-950 text-[11px] text-slate-300">
        {(!collapsed || mobileOpen) ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-slate-300">
              <span>GSTIN:</span>
              <span className="font-mono font-bold text-slate-200">{settings.gstin || '07AAAAA0000A1Z5'}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span>DL 20B:</span>
              <span className="font-mono font-bold text-slate-200">{settings.dl_number_20b || 'DL-20B-129482'}</span>
            </div>
          </div>
        ) : (
          <div className="text-center font-mono text-[10px] text-emerald-400 font-bold">20B/21B</div>
        )}
      </div>
    </aside>
  );
}

