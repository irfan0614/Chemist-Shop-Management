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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useShop } from '../../context/ShopContext';

export function Sidebar({ currentView, setView, collapsed, setCollapsed }) {
  const { user, hasRole } = useAuth();
  const { settings } = useShop();

  const menuSections = [
    {
      title: 'Operations',
      items: [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: [] },
        { key: 'pos', label: 'POS Billing', icon: Receipt, roles: [], badge: 'F2', highlight: true },
      ],
    },
    {
      title: 'Inventory & Procurement',
      items: [
        { key: 'medicines', label: 'Medicine Catalog', icon: Package, roles: [] },
        { key: 'batches', label: 'Batch Inventory', icon: Boxes, roles: [] },
        { key: 'purchases', label: 'Purchase Inward', icon: ShoppingBag, roles: ['ADMIN', 'PHARMACIST', 'INVENTORY_MGR'] },
        { key: 'suppliers', label: 'Suppliers', icon: Truck, roles: ['ADMIN', 'INVENTORY_MGR', 'ACCOUNTANT'] },
      ],
    },
    {
      title: 'Patients & Compliance',
      items: [
        { key: 'history', label: 'Sales History', icon: History, roles: [] },
        { key: 'customers', label: 'Customers (Khata)', icon: Users, roles: [] },
        { key: 'prescriptions', label: 'Prescriptions / H1', icon: FileText, roles: [] },
        { key: 'returns', label: 'Returns & Refunds', icon: RotateCcw, roles: [] },
      ],
    },
    {
      title: 'Accounts & Analytics',
      items: [
        { key: 'expenses', label: 'Expenses & Cash', icon: Wallet, roles: ['ADMIN', 'ACCOUNTANT', 'CASHIER'] },
        { key: 'reports', label: 'Reports & GST', icon: BarChart3, roles: ['ADMIN', 'ACCOUNTANT'] },
      ],
    },
    {
      title: 'Administration',
      items: [
        { key: 'settings', label: 'Shop Profile & DL', icon: SettingsIcon, roles: ['ADMIN'] },
        { key: 'users', label: 'Staff & Audit Logs', icon: ShieldCheck, roles: ['ADMIN'] },
      ],
    },
  ];

  return (
    <aside
      className={`shrink-0 bg-slate-950 text-slate-300 flex flex-col transition-all duration-300 z-30 print:hidden ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800/80 bg-slate-950">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-950/40">
            <Plus className="w-6 h-6 text-white" strokeWidth={3} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="font-extrabold text-sm text-white truncate tracking-tight">
                {settings.shop_name || 'Apollo Chemist'}
              </h1>
              <div className="text-[10px] text-emerald-400 font-semibold tracking-wider uppercase truncate">
                Pharmacy ERP v2.0
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
        {menuSections.map((section, sIdx) => {
          const visibleItems = section.items.filter((item) => hasRole(item.roles));
          if (visibleItems.length === 0) return null;

          return (
            <div key={sIdx} className="space-y-1">
              {!collapsed && (
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-300">
                  {section.title}
                </div>
              )}
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === item.key;

                return (
                  <button
                    key={item.key}
                    onClick={() => setView(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group relative ${
                      isActive
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/30'
                        : item.highlight
                        ? 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30'
                        : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                    }`}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                        isActive ? 'text-white' : item.highlight ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span
                        className={`ml-auto text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                          isActive
                            ? 'bg-emerald-700 text-emerald-100'
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
        {!collapsed ? (
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
