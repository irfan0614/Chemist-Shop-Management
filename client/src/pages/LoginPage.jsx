import React, { useState } from 'react';
import { Plus, Shield, Lock, Mail, ArrowRight, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function LoginPage() {
  const [email, setEmail] = useState('admin@chemist.com');
  const [password, setPassword] = useState('admin123');
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
      <div className="absolute w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl -top-20 -left-20 pointer-events-none" />
      <div className="absolute w-96 h-96 bg-teal-600/10 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900 border border-slate-800/80 rounded-3xl p-8 shadow-2xl relative z-10 space-y-6">
        {/* Brand Icon & Heading */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 mx-auto flex items-center justify-center shadow-lg shadow-emerald-950/50">
            <Plus className="w-8 h-8 text-white" strokeWidth={3} />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">Apollo Chemist ERP</h1>
          <p className="text-xs text-slate-400">Medical Store Management & Compliance System</p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Staff Email Address
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
              Secure Password
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
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/40 disabled:opacity-50 transition-all flex items-center justify-center gap-2 mt-2"
          >
            <span>{loading ? 'Authenticating…' : 'Access Pharmacy POS'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Demo Roles Quick Pick */}
        <div className="pt-4 border-t border-slate-800/80 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 text-center">
            Instant Demo Account Switcher
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickFill('admin@chemist.com', 'admin123')}
              className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-800 transition-colors"
            >
              Admin (Owner)
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('pharmacist@chemist.com', 'pharmacist123')}
              className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-800 transition-colors"
            >
              Pharmacist
            </button>
            <button
              type="button"
              onClick={() => handleQuickFill('cashier@chemist.com', 'cashier123')}
              className="px-2 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg text-[11px] font-semibold border border-slate-800 transition-colors"
            >
              Cashier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
