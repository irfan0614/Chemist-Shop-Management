import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const { user, token } = useAuth();
  const [settings, setSettings] = useState(() => user?.shop || {});
  const [lastPrintedInvoice, setLastPrintedInvoice] = useState(null);
  const [printFormat, setPrintFormat] = useState('80mm'); // '80mm' | '58mm' | 'A4'
  const [loading, setLoading] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!token) {
      setSettings({});
      return;
    }
    setLoading(true);
    try {
      const data = await api.get('/settings');
      if (data && data.id) {
        setSettings(data);
        if (data.thermal_printer_size) {
          setPrintFormat(data.thermal_printer_size);
        }
      }
    } catch (err) {
      // If user has a shop attached to profile, use that
      if (user?.shop) {
        setSettings(user.shop);
      }
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    if (user?.shop) {
      setSettings((prev) => ({ ...prev, ...user.shop }));
    }
    if (token) {
      fetchSettings();
    } else {
      setSettings({});
    }
  }, [user, token, fetchSettings]);

  const updateSettings = async (payload) => {
    const updated = await api.put('/settings', payload);
    setSettings(updated);
    return updated;
  };

  const triggerPrint = (invoice, format = null) => {
    setLastPrintedInvoice(invoice);
    if (format) setPrintFormat(format);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <ShopContext.Provider
      value={{
        settings,
        setSettings,
        updateSettings,
        fetchSettings,
        loading,
        lastPrintedInvoice,
        setLastPrintedInvoice,
        printFormat,
        setPrintFormat,
        triggerPrint,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error('useShop must be used within a ShopProvider');
  return ctx;
}

