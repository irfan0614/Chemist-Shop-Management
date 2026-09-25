import React, { useState } from 'react';
import { Plus, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/common/Button';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

          <Button
            type="submit"
            loading={loading}
            loadingText="Authenticating…"
            className="w-full py-3 bg-gradient-to-r from-indigo-600 via-teal-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-indigo-950/40 mt-2"
          >
            Secure Login
          </Button>
        </form>

        {/* Demo Credentials Box */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Platform Demo Access
            </span>
            <button
              type="button"
              onClick={() => {
                setEmail('superadmin@platform.com');
                setPassword('superadmin123');
              }}
              className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer transition-colors"
            >
              Auto Fill
            </button>
          </div>

          <div className="space-y-1.5 font-mono text-[11px] text-slate-300 bg-slate-900/90 rounded-xl p-2.5 border border-slate-800/60">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Email:</span>
              <span className="text-emerald-300 font-bold select-all">superadmin@platform.com</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Password:</span>
              <span className="text-indigo-300 font-bold select-all">superadmin123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

