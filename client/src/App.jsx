import React, { useState, useEffect } from 'react';
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

function MainLayout() {
  const { user, isSuperAdmin } = useAuth();
  const { settings, lastPrintedInvoice, printFormat } = useShop();
  const [currentView, setView] = useState(() => (isSuperAdmin ? 'platform' : 'dashboard'));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  useEffect(() => {
    if (isSuperAdmin && currentView === 'dashboard') {
      setView('platform');
    }
  }, [isSuperAdmin]);

  if (!user) {
    return <LoginPage />;
  }

  return (
    <>
      {/* Interactive App Shell (Hidden when printing) */}
      <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800 print:hidden">
        {/* Collapsible Sidebar */}
        <Sidebar
          currentView={currentView}
          setView={setView}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Topbar Header */}
          <Header
            setView={setView}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
          />

          {/* Scrollable View Container */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            {currentView === 'platform' && <PlatformAdminPage />}
            {currentView === 'dashboard' && <DashboardPage setView={setView} />}
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

