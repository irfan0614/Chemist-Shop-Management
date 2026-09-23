import React, { useState } from 'react';
import { Plus, Shield, Lock, Mail, ArrowRight, Building2, Store, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function LoginPage() {
  const [email, setEmail] = useState('superadmin@platform.com');
  const [password, setPassword] = useState('superadmin123');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { showError, showSuccess } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      showError('Please enter both email and password');
      return;
    }

    setLoading(true);
    try {
      const user = await login(email, password);
      showSuccess(`Welcome back, ${user.name}!`);
    } catch (err) {
      showError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-emerald-500 selection:text-white relative overflow-hidden">
      {/* Background Decorative Glow */}
      <div className="absolute w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl -top-20 -left-20 pointer-events-none" />
      <div className="absolute w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none" />

      <div className="w-full max-w-lg bg-slate-900 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
        {/* Brand Icon & Heading */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-teal-500 to-emerald-500 mx-auto flex items-center justify-center shadow-lg shadow-indigo-950/50">
            <Plus className="w-8 h-8 text-white" strokeWidth={3} />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">MedCloud Pharmacy ERP</h1>
          <p className="text-xs text-slate-400">Medical Store Management & Compliance Platform</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Account Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                placeholder="staff@chemist.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 via-teal-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-indigo-950/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-2"
          >
            <span>{loading ? 'Authenticating…' : 'Secure Login'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Demo Roles Quick Pick */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Instant Role & Shop Switcher</span>
          </div>

          {/* 1. SUPER_ADMIN */}
          <div>
            <button
              type="button"
              onClick={() => handleQuickFill('superadmin@platform.com', 'superadmin123')}
              className="w-full px-3.5 py-2.5 bg-indigo-950/80 hover:bg-indigo-900/80 text-indigo-200 rounded-xl text-xs font-bold border border-indigo-700/60 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <div className="text-xs font-bold text-white">SUPER_ADMIN</div>
                  <div className="text-[10px] text-indigo-300">Manages all registered medical shops</div>
                </div>
              </div>
              <span className="text-[10px] bg-indigo-800/80 px-2 py-0.5 rounded text-indigo-200 font-mono font-bold">ALL SHOPS</span>
            </button>
          </div>

          {/* 2. SHOP_OWNER - Shop 1: Apollo Chemist (Delhi) */}
          <div>
            <button
              type="button"
              onClick={() => handleQuickFill('admin@chemist.com', 'admin123')}
              className="w-full px-3.5 py-2.5 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-200 rounded-xl text-xs font-bold border border-emerald-800/50 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <Store className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <div className="text-xs font-bold text-white">SHOP_OWNER · Apollo Health Chemist</div>
                  <div className="text-[10px] text-emerald-300">Manages Delhi shop (Inventory, Billing, GST)</div>
                </div>
              </div>
              <span className="text-[10px] bg-emerald-900/80 px-2 py-0.5 rounded text-emerald-300 font-mono font-bold">SHOP 1</span>
            </button>
          </div>

          {/* 3. SHOP_OWNER - Shop 2: CarePlus Pharmacy (Mumbai) */}
          <div>
            <button
              type="button"
              onClick={() => handleQuickFill('owner@careplus.com', 'owner123')}
              className="w-full px-3.5 py-2.5 bg-teal-950/60 hover:bg-teal-900/60 text-teal-200 rounded-xl text-xs font-bold border border-teal-800/50 transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-2.5">
                <Store className="w-4 h-4 text-teal-400 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <div className="text-xs font-bold text-white">SHOP_OWNER · CarePlus Pharmacy</div>
                  <div className="text-[10px] text-teal-300">Manages Mumbai shop (Inventory, Billing, GST)</div>
                </div>
              </div>
              <span className="text-[10px] bg-teal-900/80 px-2 py-0.5 rounded text-teal-300 font-mono font-bold">SHOP 2</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

