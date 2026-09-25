import React, { useState, useEffect, useCallback } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ShopProvider, useShop } from './context/ShopContext';
import { ToastProvider } from './context/ToastContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { KeyboardShortcutsModal } from './components/layout/KeyboardShortcutsModal';
import { ThermalReceipt } from './components/pos/ThermalReceipt';
import { A4TaxInvoice } from './components/pos/A4TaxInvoice';

import { LoginPage } from './pages/LoginPage';
import { PlatformAdminPage } from './pages/PlatformAdminPage';
import { DashboardPage } from './pages/DashboardPage';
import { POSBillingPage } from './pages/POSBillingPage';
import { MedicinesPage } from './pages/MedicinesPage';
import { BatchesPage } from './pages/BatchesPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { CustomersPage } from './pages/CustomersPage';
import { PrescriptionsPage } from './pages/PrescriptionsPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { SalesHistoryPage } from './pages/SalesHistoryPage';

// Route alias mapping for clean URLs
const ROUTES_MAP = {
  '': 'dashboard',
  'dashboard': 'dashboard',
  'platform': 'platform',
  'admin': 'platform',
  'pos': 'pos',
  'pos-billing': 'pos',
  'billing': 'pos',
  'medicines': 'medicines',
  'medicine-catalog': 'medicines',
  'batches': 'batches',
  'inventory': 'batches',
  'purchases': 'purchases',
  'inward-purchases': 'purchases',
  'suppliers': 'suppliers',
  'customers': 'customers',
  'khata': 'customers',
  'prescriptions': 'prescriptions',
  'schedule-h1': 'prescriptions',
  'returns': 'returns',
  'refunds': 'returns',
  'expenses': 'expenses',
  'cash-drawer': 'expenses',
  'reports': 'reports',
  'gst': 'reports',
  'settings': 'settings',
  'profile': 'settings',
  'users': 'users',
  'security': 'users',
  'history': 'history',
  'sales-history': 'history',
};

const PAGE_TITLES = {
  dashboard: 'Dashboard | MedCloud Pharmacy',
  platform: 'Platform Admin Suite | MedCloud Platform',
  pos: 'POS Billing Terminal | MedCloud Pharmacy',
  medicines: 'Medicine Catalog | MedCloud Pharmacy',
  batches: 'Batch Inventory & FEFO | MedCloud Pharmacy',
  purchases: 'Purchase Inward | MedCloud Pharmacy',
  suppliers: 'Suppliers & Ledger | MedCloud Pharmacy',
  customers: 'Customers & Khata | MedCloud Pharmacy',
  prescriptions: 'Prescriptions & Schedule H1 | MedCloud Pharmacy',
  returns: 'Returns & Refunds | MedCloud Pharmacy',
  expenses: 'Expenses & Cash Drawer | MedCloud Pharmacy',
  reports: 'Reports & GST | MedCloud Pharmacy',
  settings: 'Shop Profile & Drug License | MedCloud Pharmacy',
  users: 'User Management & Security | MedCloud Pharmacy',
  history: 'Sales Invoicing History | MedCloud Pharmacy',
};

function getViewFromUrl(isSuperAdmin) {
  // Check pathname first (e.g. /prescriptions or /pos)
  let rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();

  // If path is empty, root, or index.html, check hash fallback (#/prescriptions)
  if (!rawPath || rawPath === 'index.html') {
    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    if (hash) rawPath = hash;
  }

  const matchedView = ROUTES_MAP[rawPath];
  if (matchedView) {
    if (matchedView === 'platform' && !isSuperAdmin) {
      return 'dashboard';
    }
    return matchedView;
  }

  return isSuperAdmin ? 'platform' : 'dashboard';
}

function MainLayout() {
  const { user, isSuperAdmin } = useAuth();
  const { settings, lastPrintedInvoice, printFormat } = useShop();
  const [currentView, setView] = useState(() => getViewFromUrl(isSuperAdmin));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Sync route on mount and browser back/forward buttons
  useEffect(() => {
    const initialView = getViewFromUrl(isSuperAdmin);
    setView(initialView);

    const targetPath = '/' + (initialView === 'dashboard' ? 'dashboard' : initialView);
    const currentPath = window.location.pathname;

    // Set page title
    if (PAGE_TITLES[initialView]) {
      document.title = PAGE_TITLES[initialView];
    }

    // If on root or unnormalized path, sync URL cleanly
    if (currentPath === '/' || currentPath === '' || currentPath === '/index.html') {
      window.history.replaceState({ view: initialView }, '', targetPath);
    }

    // Listen for browser Back/Forward (popstate)
    const handlePopState = () => {
      const poppedView = getViewFromUrl(isSuperAdmin);
      setView(poppedView);
      if (PAGE_TITLES[poppedView]) {
        document.title = PAGE_TITLES[poppedView];
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isSuperAdmin, user?.id]);

  // Handle route change with URL sync, history push, and auto-closing mobile drawer
  const handleSetView = useCallback((view) => {
    const targetView = (view === 'platform' && !isSuperAdmin) ? 'dashboard' : view;
    setView(targetView);
    setMobileDrawerOpen(false);

    const targetPath = '/' + (targetView === 'dashboard' ? 'dashboard' : targetView);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ view: targetView }, '', targetPath);
    }

    if (PAGE_TITLES[targetView]) {
      document.title = PAGE_TITLES[targetView];
    }
  }, [isSuperAdmin]);

  if (!user) {
    return <LoginPage />;
  }

  return (
    <>
      {/* Interactive App Shell (Hidden when printing) */}
      <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800 print:hidden relative">
        {/* Mobile Backdrop Overlay */}
        {mobileDrawerOpen && (
          <div
            onClick={() => setMobileDrawerOpen(false)}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-40 md:hidden transition-opacity"
            aria-hidden="true"
          />
        )}

        {/* Sidebar (Desktop Persistent / Mobile Drawer) */}
        <Sidebar
          currentView={currentView}
          setView={handleSetView}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          mobileOpen={mobileDrawerOpen}
          onCloseMobile={() => setMobileDrawerOpen(false)}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar Header */}
          <Header
            setView={handleSetView}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
            onToggleMobileMenu={() => setMobileDrawerOpen((prev) => !prev)}
            mobileDrawerOpen={mobileDrawerOpen}
          />

          {/* Scrollable View Container */}
          <main className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-6">
            {currentView === 'platform' && isSuperAdmin && <PlatformAdminPage />}
            {(currentView === 'dashboard' || (currentView === 'platform' && !isSuperAdmin)) && (
              <DashboardPage setView={handleSetView} />
            )}
            {currentView === 'pos' && <POSBillingPage />}
            {currentView === 'medicines' && <MedicinesPage />}
            {currentView === 'batches' && <BatchesPage />}
            {currentView === 'purchases' && <PurchasesPage />}
            {currentView === 'suppliers' && <SuppliersPage />}
            {currentView === 'customers' && <CustomersPage />}
            {currentView === 'prescriptions' && <PrescriptionsPage />}
            {currentView === 'returns' && <ReturnsPage />}
            {currentView === 'expenses' && <ExpensesPage />}
            {currentView === 'reports' && <ReportsPage />}
            {currentView === 'settings' && <SettingsPage />}
            {currentView === 'users' && <UsersPage />}
            {currentView === 'history' && <SalesHistoryPage />}
          </main>
        </div>

        {/* Keyboard Shortcuts Modal */}
        <KeyboardShortcutsModal
          isOpen={isShortcutsOpen}
          onClose={() => setIsShortcutsOpen(false)}
        />
      </div>

      {/* Print Templates (Rendered only on window.print()) */}
      {printFormat === 'A4' ? (
        <A4TaxInvoice
          invoice={lastPrintedInvoice}
          settings={{ ...settings, thermal_printer_size: printFormat }}
        />
      ) : (
        <ThermalReceipt
          invoice={lastPrintedInvoice}
          settings={{ ...settings, thermal_printer_size: printFormat }}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <ShopProvider>
          <MainLayout />
        </ShopProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
