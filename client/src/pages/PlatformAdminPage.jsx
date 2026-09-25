import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  ShieldCheck,
  KeyRound,
  Edit3,
  TrendingUp,
  Store,
  Users,
  CreditCard,
  FileBadge,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  RefreshCw,
  Clock,
  Sparkles,
  Award,
} from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/common/Button';

export function PlatformAdminPage({ onSwitchShop }) {
  const { showSuccess, showError } = useToast();
  const [stats, setStats] = useState(null);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [updatingShop, setUpdatingShop] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);
  const [togglingShopId, setTogglingShopId] = useState(null);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedShop, setSelectedShop] = useState(null);

  // New Shop Form State
  const [newShopForm, setNewShopForm] = useState({
    name: '',
    tagline: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    state_code: '',
    pincode: '',
    gstin: '',
    dl_number_20b: '',
    dl_number_21b: '',
    fssai_no: '',
    drug_license_expiry: '',
    plan: 'PRO',
    subscription_expiry: '',
    // Owner details
    owner_name: '',
    owner_email: '',
    owner_phone: '',
    owner_password: '',
  });

  // Edit Shop Form State
  const [editForm, setEditForm] = useState({
    name: '',
    tagline: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    gstin: '',
    dl_number_20b: '',
    dl_number_21b: '',
    drug_license_expiry: '',
    plan: 'PRO',
    subscription_expiry: '',
  });

  // Reset Password State
  const [newPassword, setNewPassword] = useState('');

  const loadPlatformData = async () => {
    setLoading(true);
    try {
      const [statsRes, shopsRes] = await Promise.all([
        api.get('/platform/stats'),
        api.get('/platform/shops'),
      ]);
      setStats(statsRes);
      setShops(shopsRes);
    } catch (err) {
      showError(err.message || 'Failed to load platform data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlatformData();
  }, []);

  const handleRegisterShop = async (e) => {
    e.preventDefault();
    setRegistering(true);
    try {
      const res = await api.post('/platform/shops', newShopForm);
      const savedName = res?.shop?.name || res?.shop_name || res?.name || newShopForm.name;
      showSuccess(`Medical Store "${savedName}" successfully registered! Owner account created.`);
      setIsRegisterOpen(false);
      setNewShopForm({
        name: '',
        tagline: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        state: '',
        state_code: '',
        pincode: '',
        gstin: '',
        dl_number_20b: '',
        dl_number_21b: '',
        fssai_no: '',
        drug_license_expiry: '',
        plan: 'PRO',
        subscription_expiry: '',
        owner_name: '',
        owner_email: '',
        owner_phone: '',
        owner_password: '',
      });
      loadPlatformData();
    } catch (err) {
      showError(err.message || 'Failed to register shop');
    } finally {
      setRegistering(false);
    }
  };

  const handleOpenEdit = (shop) => {
    setSelectedShop(shop);
    setEditForm({
      name: shop.name || '',
      tagline: shop.tagline || '',
      phone: shop.phone || '',
      email: shop.email || '',
      address: shop.address || '',
      city: shop.city || '',
      state: shop.state || '',
      pincode: shop.pincode || '',
      gstin: shop.gstin || '',
      dl_number_20b: shop.dl_number_20b || '',
      dl_number_21b: shop.dl_number_21b || '',
      drug_license_expiry: shop.drug_license_expiry || '',
      plan: shop.plan || 'PRO',
      subscription_expiry: shop.subscription_expiry || '',
    });
    setIsEditOpen(true);
  };

  const handleUpdateShop = async (e) => {
    e.preventDefault();
    if (!selectedShop) return;
    setUpdatingShop(true);
    try {
      await api.put(`/platform/shops/${selectedShop.id}`, editForm);
      showSuccess(`Updated medical shop settings for ${editForm.name}`);
      setIsEditOpen(false);
      loadPlatformData();
    } catch (err) {
      showError(err.message || 'Failed to update shop');
    } finally {
      setUpdatingShop(false);
    }
  };

  const handleToggleStatus = async (shop) => {
    const action = shop.status === 'ACTIVE' ? 'deactivate / suspend' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} "${shop.name}"?`)) return;
    setTogglingShopId(shop.id);
    try {
      const res = await api.post(`/platform/shops/${shop.id}/toggle-status`, {});
      showSuccess(`Shop "${shop.name}" is now ${res.status}`);
      loadPlatformData();
    } catch (err) {
      showError(err.message || 'Failed to change shop status');
    } finally {
      setTogglingShopId(null);
    }
  };

  const handleOpenPasswordReset = (shop) => {
    setSelectedShop(shop);
    setNewPassword('chem' + Math.floor(100000 + Math.random() * 900000));
    setIsPasswordModalOpen(true);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!selectedShop || !newPassword) return;
    setResettingPw(true);
    try {
      const res = await api.post(`/platform/shops/${selectedShop.id}/reset-owner-password`, {
        new_password: newPassword,
      });
      showSuccess(`Password reset successfully for ${res.owner_email}`);
      setIsPasswordModalOpen(false);
      loadPlatformData();
    } catch (err) {
      showError(err.message || 'Failed to reset password');
    } finally {
      setResettingPw(false);
    }
  };

  // Filtered list
  const filteredShops = Array.isArray(shops)
    ? shops.filter((s) => {
        const nameStr = s.name || s.shop_name || '';
        const matchesSearch =
          nameStr.toLowerCase().includes(search.toLowerCase()) ||
          (s.owner_name || '').toLowerCase().includes(search.toLowerCase()) ||
          (s.owner_email || s.ownerEmail || '').toLowerCase().includes(search.toLowerCase()) ||
          (s.gstin || '').toLowerCase().includes(search.toLowerCase()) ||
          (s.city || '').toLowerCase().includes(search.toLowerCase());

        const shopPlan = s.plan || s.subscription_plan || 'PRO';
        const matchesPlan = planFilter === 'ALL' || shopPlan === planFilter;
        const matchesStatus = statusFilter === 'ALL' || (s.status || 'ACTIVE') === statusFilter;

        return matchesSearch && matchesPlan && matchesStatus;
      })
    : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner & Title */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 sm:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="absolute -right-10 -bottom-10 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-bold uppercase tracking-wider border border-indigo-500/30">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span>Platform Super Admin Portal</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
            Medical Shop & Pharmacy Management
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Manage all registered medical stores, pharmacies, drug licenses, subscription plans, and shop owner credentials.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-3">
          <Button
            variant="dark"
            onClick={loadPlatformData}
            icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
            className="border border-slate-700/80"
          >
            Refresh
          </Button>
          <Button
            variant="gradient"
            onClick={() => setIsRegisterOpen(true)}
            icon={Plus}
          >
            Register Medical Shop
          </Button>
        </div>
      </div>

      {/* Global Metric Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Registered Shops</div>
              <div className="text-2xl font-black text-slate-800">{stats.totalShops || 0}</div>
              <div className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{stats.activeShops || 0} Active Stores</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Platform Gross Sales</div>
              <div className="text-2xl font-black text-slate-800">
                ₹{Number(stats.totalPlatformSales || stats.totalSalesVolume || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">
                {stats.totalBills || 0} Total Invoices
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Shop Owners</div>
              <div className="text-2xl font-black text-slate-800">{stats.totalUsers || 0}</div>
              <div className="text-[11px] font-semibold text-slate-500">Registered Shop Accounts</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <FileBadge className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Compliance & Licenses</div>
              <div className="text-2xl font-black text-slate-800">{stats.licenseExpiringSoon || 0}</div>
              <div className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Licenses Expiring &lt; 90d</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by shop name, owner, city, GSTIN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Plan Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold text-slate-600">
            {['ALL', 'TRIAL', 'BASIC', 'PRO', 'ENTERPRISE'].map((plan) => (
              <button
                key={plan}
                onClick={() => setPlanFilter(plan)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  planFilter === plan
                    ? 'bg-white text-indigo-600 shadow-sm font-bold'
                    : 'hover:text-slate-900'
                }`}
              >
                {plan}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="SUSPENDED">Suspended Only</option>
          </select>
        </div>
      </div>

      {/* Shops Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[750px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3.5 px-4">Medical Shop Details</th>
                <th className="py-3.5 px-4">Owner & Contact</th>
                <th className="py-3.5 px-4">Drug Licenses (20B/21B)</th>
                <th className="py-3.5 px-4">Subscription Plan</th>
                <th className="py-3.5 px-4">Sales & Invoices</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredShops.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">
                    <Store className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    No registered medical stores match the criteria.
                  </td>
                </tr>
              ) : (
                filteredShops.map((shop) => {
                  const isExpiring = shop.daysUntilLicenseExpiry !== null && shop.daysUntilLicenseExpiry <= 90;
                  const isExpired = shop.daysUntilLicenseExpiry !== null && shop.daysUntilLicenseExpiry < 0;

                  return (
                    <tr key={shop.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-md shadow-indigo-900/20">
                            {(shop.name || shop.shop_name || 'M').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 text-xs truncate max-w-[200px]">
                              {shop.name || shop.shop_name || 'Medical Store'}
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              <span>{shop.city}, {shop.state}</span>
                            </div>
                            {shop.gstin && (
                              <div className="text-[10px] font-mono text-slate-400 font-semibold">
                                GST: {shop.gstin}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800">{shop.owner_name}</div>
                          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span>{shop.owner_email}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{shop.phone}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <div className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block">
                            {shop.dl_number_20b || 'DL-20B-XXXXX'}
                          </div>
                          <div>
                            {isExpired ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                                <XCircle className="w-3 h-3" /> License Expired!
                              </span>
                            ) : isExpiring ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                                <AlertTriangle className="w-3 h-3" /> Expires in {shop.daysUntilLicenseExpiry}d
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500">
                                Valid until {shop.drug_license_expiry || '2028-12-31'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              shop.plan === 'ENTERPRISE'
                                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                : shop.plan === 'PRO'
                                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                : shop.plan === 'BASIC'
                                ? 'bg-teal-100 text-teal-700 border border-teal-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            <Sparkles className="w-3 h-3" /> {shop.plan} PLAN
                          </span>
                          <div className="text-[10px] text-slate-400">
                            Renew: {shop.subscription_expiry || '2027-12-31'}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800">
                            ₹{(shop.totalSales || 0).toLocaleString('en-IN')}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {shop.totalInvoices || 0} bills • Owner Managed
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                            shop.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {shop.status === 'ACTIVE' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>{shop.status}</span>
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(shop)}
                            className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                            title="Edit Medical Store"
                            icon={Edit3}
                          />
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => handleOpenPasswordReset(shop)}
                            className="text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                            title="Reset Owner Password"
                            icon={KeyRound}
                          />
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => handleToggleStatus(shop)}
                            loading={togglingShopId === shop.id}
                            className={
                              shop.status === 'ACTIVE'
                                ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50'
                            }
                            title={shop.status === 'ACTIVE' ? 'Suspend Store' : 'Activate Store'}
                            icon={shop.status === 'ACTIVE' ? XCircle : CheckCircle2}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Register New Medical Shop */}
      {isRegisterOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full my-auto max-h-[92vh] sm:max-h-[88vh] overflow-y-auto p-4 sm:p-6 md:p-8 shadow-2xl border border-slate-100 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900">Register New Medical Shop</h2>
                  <p className="text-xs text-slate-500">Create medical outlet profile and establish owner credentials</p>
                </div>
              </div>
              <button
                onClick={() => setIsRegisterOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center shrink-0"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegisterShop} className="space-y-6 text-xs">
              {/* Shop Details */}
              <div className="space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" /> 1. Medical Store Details
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Medical Shop Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MedLife Chemist & Wellness"
                      value={newShopForm.name}
                      onChange={(e) => setNewShopForm({ ...newShopForm, name: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Shop Phone / Mobile *</label>
                    <input
                      type="text"
                      required
                      placeholder="+91 98765 00000"
                      value={newShopForm.phone}
                      onChange={(e) => setNewShopForm({ ...newShopForm, phone: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Shop Contact Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="info@medlife.com"
                      value={newShopForm.email}
                      onChange={(e) => setNewShopForm({ ...newShopForm, email: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Street Address</label>
                    <input
                      type="text"
                      placeholder="Shop 5, Ground Floor, Sector 14"
                      value={newShopForm.address}
                      onChange={(e) => setNewShopForm({ ...newShopForm, address: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">City</label>
                    <input
                      type="text"
                      value={newShopForm.city}
                      onChange={(e) => setNewShopForm({ ...newShopForm, city: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">State</label>
                    <input
                      type="text"
                      value={newShopForm.state}
                      onChange={(e) => setNewShopForm({ ...newShopForm, state: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">GSTIN</label>
                    <input
                      type="text"
                      placeholder="07AAAAA0000A1Z5"
                      value={newShopForm.gstin}
                      onChange={(e) => setNewShopForm({ ...newShopForm, gstin: e.target.value.toUpperCase() })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Subscription Plan</label>
                    <select
                      value={newShopForm.plan}
                      onChange={(e) => setNewShopForm({ ...newShopForm, plan: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20"
                    >
                      <option value="TRIAL">TRIAL (14 Days)</option>
                      <option value="BASIC">BASIC (Single Counter)</option>
                      <option value="PRO">PRO (Multi-Counter & Khata)</option>
                      <option value="ENTERPRISE">ENTERPRISE (Multi-Chain)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Drug Licenses */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                  <FileBadge className="w-4 h-4" /> 2. Drug License Compliance (India)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Form 20B Number</label>
                    <input
                      type="text"
                      placeholder="DL-20B-12345"
                      value={newShopForm.dl_number_20b}
                      onChange={(e) => setNewShopForm({ ...newShopForm, dl_number_20b: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Form 21B Number</label>
                    <input
                      type="text"
                      placeholder="DL-21B-12345"
                      value={newShopForm.dl_number_21b}
                      onChange={(e) => setNewShopForm({ ...newShopForm, dl_number_21b: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">License Expiry Date</label>
                    <input
                      type="date"
                      value={newShopForm.drug_license_expiry}
                      onChange={(e) => setNewShopForm({ ...newShopForm, drug_license_expiry: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Shop Owner Credentials */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> 3. Shop Owner Account & Login Credentials
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Owner Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Rajesh Sharma"
                      value={newShopForm.owner_name}
                      onChange={(e) => setNewShopForm({ ...newShopForm, owner_name: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Owner Mobile Phone</label>
                    <input
                      type="text"
                      placeholder="+91 98765 43210"
                      value={newShopForm.owner_phone}
                      onChange={(e) => setNewShopForm({ ...newShopForm, owner_phone: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Owner Login Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="owner@medlife.com"
                      value={newShopForm.owner_email}
                      onChange={(e) => setNewShopForm({ ...newShopForm, owner_email: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Initial Login Password *</label>
                    <input
                      type="password"
                      required
                      placeholder="Min 6 characters"
                      value={newShopForm.owner_password}
                      onChange={(e) => setNewShopForm({ ...newShopForm, owner_password: e.target.value })}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  variant="secondary"
                  onClick={() => setIsRegisterOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="gradient"
                  loading={registering}
                  loadingText="Registering Medical Shop..."
                >
                  Confirm & Register Medical Shop
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Medical Store */}
      {isEditOpen && selectedShop && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-xl w-full my-auto max-h-[92vh] sm:max-h-[88vh] overflow-y-auto p-4 sm:p-6 md:p-8 shadow-2xl border border-slate-100 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 truncate max-w-[200px] sm:max-w-[350px]">
                    Edit {selectedShop.name}
                  </h2>
                  <p className="text-xs text-slate-500">Update medical store profile and subscription settings</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center shrink-0"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateShop} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Shop Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={editForm.gstin}
                    onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Subscription Plan</label>
                  <select
                    value={editForm.plan}
                    onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  >
                    <option value="TRIAL">TRIAL</option>
                    <option value="BASIC">BASIC</option>
                    <option value="PRO">PRO</option>
                    <option value="ENTERPRISE">ENTERPRISE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Drug License Expiry</label>
                  <input
                    type="date"
                    value={editForm.drug_license_expiry}
                    onChange={(e) => setEditForm({ ...editForm, drug_license_expiry: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Subscription Expiry</label>
                  <input
                    type="date"
                    value={editForm.subscription_expiry}
                    onChange={(e) => setEditForm({ ...editForm, subscription_expiry: e.target.value })}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  variant="secondary"
                  onClick={() => setIsEditOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="indigo"
                  loading={updatingShop}
                  loadingText="Saving Changes..."
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Owner Password */}
      {isPasswordModalOpen && selectedShop && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full my-auto max-h-[92vh] sm:max-h-[88vh] overflow-y-auto p-4 sm:p-6 md:p-8 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-black text-slate-900">Reset Owner Password</h2>
                  <p className="text-xs text-slate-500 truncate max-w-[220px]">
                    {selectedShop.name} ({selectedShop.owner_email})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPasswordModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center shrink-0"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1.5">New Password</label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Share this new password securely with the medical store owner.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <Button
                  variant="secondary"
                  onClick={() => setIsPasswordModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="warning"
                  loading={resettingPw}
                  loadingText="Resetting Password..."
                >
                  Reset Password
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
