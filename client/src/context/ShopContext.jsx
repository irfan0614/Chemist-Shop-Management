import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [settings, setSettings] = useState({
    shop_name: 'Apollo Health Chemist & Druggist',
    tagline: 'Your Trusted Pharmacy & Healthcare Partner',
    owner_name: 'Dr. Rajesh Sharma',
    dl_number_20b: 'DL-20B-129482',
    dl_number_21b: 'DL-21B-129483',
    drug_license_expiry: '2028-12-31',
    subscription_expiry: '2028-12-31',
    plan: 'PRO',
    gstin: '07AAAAA0000A1Z5',
    fssai_no: '10019011000123',
    phone: '+91 98765 43210',
    address: 'Shop No. 12, Ground Floor, Central Market',
    city: 'New Delhi',
    state: 'Delhi',
    state_code: '07',
    pincode: '110001',
    bill_prefix: 'INV',
    thermal_printer_size: '80mm',
    default_low_stock_threshold: 15,
    enable_fefo: true,
  });
  const [lastPrintedInvoice, setLastPrintedInvoice] = useState(null);
  const [printFormat, setPrintFormat] = useState('80mm'); // '80mm' | '58mm' | 'A4'
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const data = await api.get('/settings');
      setSettings(data);
      if (data.thermal_printer_size) {
        setPrintFormat(data.thermal_printer_size);
      }
    } catch (err) {
      console.warn('Could not load shop settings:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('chemist_auth_token');
    if (token) {
      fetchSettings();
    } else {
      setLoading(false);
    }
  }, [fetchSettings]);

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

