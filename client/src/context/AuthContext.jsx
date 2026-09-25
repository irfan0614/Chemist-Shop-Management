import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('chemist_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('chemist_auth_token'));
  const [loading, setLoading] = useState(false);

  const isSuperAdmin = Boolean(user?.role === 'SUPER_ADMIN' || user?.is_super_admin);
  const isShopOwner = Boolean(user?.role === 'ADMIN' || user?.role === 'SHOP_OWNER');

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      setUser(res.user);
      setToken(res.token);
      localStorage.setItem('chemist_auth_token', res.token);
      localStorage.setItem('chemist_user', JSON.stringify(res.user));
      return res.user;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('chemist_auth_token');
    localStorage.removeItem('chemist_user');
    window.history.pushState(null, '', '/login');
    document.title = 'Login | MedCloud Pharmacy ERP';
  };

  const hasRole = useCallback((allowedRoles = []) => {
    if (!user) return false;
    if (isSuperAdmin) return true;
    if (user.role === 'ADMIN' || user.role === 'SHOP_OWNER') return true;
    if (allowedRoles.length === 0) return true;
    return allowedRoles.includes(user.role);
  }, [user, isSuperAdmin]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        hasRole,
        isSuperAdmin,
        isShopOwner,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

