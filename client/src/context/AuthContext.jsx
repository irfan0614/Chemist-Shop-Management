import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('chemist_user');
    return saved ? JSON.parse(saved) : {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Master Admin (Owner)',
      email: 'admin@chemist.com',
      role: 'ADMIN',
      phone: '+91 9876543210',
    };
  });
  const [token, setToken] = useState(() => localStorage.getItem('chemist_auth_token'));
  const [loading, setLoading] = useState(false);

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
  };

  const hasRole = useCallback((allowedRoles = []) => {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;
    if (allowedRoles.length === 0) return true;
    return allowedRoles.includes(user.role);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
