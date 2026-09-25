import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Plus, UserPlus, Key, Lock, CheckCircle2, UserX } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { fmtDate } from '../utils/formatters';

export function UsersPage() {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'audit'
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const { showSuccess, showError } = useToast();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'SHOP_OWNER',
    phone: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [u, a] = await Promise.all([
        api.get('/auth/users'),
        api.get('/auth/audit-logs'),
      ]);
      setUsers(u);
      setAuditLogs(a);
    } catch (err) {
      showError('Failed to load user management records: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateUser = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      showError('Name, Email, and Password are required');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post('/auth/users', form);
      showSuccess(`Shop Owner account "${res.name}" registered successfully`);
      setIsAddUserModalOpen(false);
      setForm({ name: '', email: '', password: '', role: 'SHOP_OWNER', phone: '' });
      loadData();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleUserStatus = async (user) => {
    setTogglingId(user.id);
    try {
      const res = await api.put(`/auth/users/${user.id}/toggle-status`);
      showSuccess(`User account ${res.is_active ? 'activated' : 'deactivated'}`);
      loadData();
    } catch (err) {
      showError(err.message);
    } finally {
      setTogglingId(null);
    }
  };

  const userColumns = [
    {
      header: 'Account Name',
      key: 'name',
      render: (u) => (
        <div>
          <div className="font-bold text-slate-900">{u.name}</div>
          <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
        </div>
      ),
    },
    {
      header: 'System Role',
      key: 'role',
      render: (u) => {
        const isSuper = u.role === 'SUPER_ADMIN';
        return <Badge tone={isSuper ? 'blue' : 'purple'}>{u.role}</Badge>;
      },
    },
    {
      header: 'Contact',
      key: 'phone',
      render: (u) => <span className="font-mono text-xs text-slate-600">{u.phone || '—'}</span>,
    },
    {
      header: 'Account Status',
      key: 'is_active',
      render: (u) => (
        <Badge tone={u.is_active ? 'ok' : 'alert'}>
          {u.is_active ? 'Active' : 'Disabled'}
        </Badge>
      ),
    },
    {
      header: 'Last Login',
      key: 'last_login_at',
      render: (u) => <span className="text-xs text-slate-500 font-mono">{fmtDate(u.last_login_at)}</span>,
    },
    {
      header: 'Action',
      key: 'actions',
      align: 'center',
      sortable: false,
      exportable: false,
      render: (u) => (
        <Button
          size="xs"
          variant={u.is_active ? 'danger-outline' : 'primary'}
          onClick={() => handleToggleUserStatus(u)}
          loading={togglingId === u.id}
          className={u.is_active ? '' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}
        >
          {u.is_active ? 'Deactivate' : 'Activate'}
        </Button>
      ),
    },
  ];

  const auditColumns = [
    {
      header: 'Timestamp',
      key: 'created_at',
      render: (a) => <span className="font-mono text-[11px]">{new Date(a.created_at).toLocaleString()}</span>,
    },
    {
      header: 'User',
      key: 'user_name',
      render: (a) => <span className="font-bold text-slate-900 text-xs">{a.user_name || 'System'}</span>,
    },
    {
      header: 'Action / Event',
      key: 'action',
      render: (a) => <Badge tone="blue">{a.action}</Badge>,
    },
    {
      header: 'Entity',
      key: 'entity_type',
      render: (a) => <span className="font-mono text-xs text-slate-600">{a.entity_type}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div>
          <h1 className="text-base font-extrabold text-slate-900">Shop Owner & Security Audit</h1>
          <p className="text-xs text-slate-400">Manage medical shop owner credentials and tamper-evident audit logs</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'users' ? 'bg-white text-emerald-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Shop Owner Accounts
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'audit' ? 'bg-white text-emerald-950 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Audit Trail
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            icon={UserPlus}
            onClick={() => setIsAddUserModalOpen(true)}
          >
            Add Shop Owner
          </Button>
        </div>
      </div>

      {/* Main Table */}
      {activeTab === 'users' ? (
        <DataTable
          columns={userColumns}
          data={users}
          searchPlaceholder="Search accounts by name, email, or role…"
          searchFields={['name', 'email', 'role', 'phone']}
          exportFilename="shop_owner_directory"
        />
      ) : (
        <DataTable
          columns={auditColumns}
          data={auditLogs}
          searchPlaceholder="Search audit trails by action, user, or entity…"
          searchFields={['action', 'user_name', 'entity_type']}
          exportFilename="pharmacy_audit_logs"
        />
      )}

      {/* Add Shop Owner Modal */}
      <Modal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        title="Add Shop Owner Account"
        subtitle="Provision a medical shop owner account with full shop management access"
        maxWidth="max-w-xl"
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Owner Full Name *</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none"
              placeholder="e.g. Dr. Rajesh Sharma"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Login Email *</label>
            <input
              type="email"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none"
              placeholder="owner@chemist.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Password *</label>
            <input
              type="password"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none"
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">System Role</label>
              <input
                type="text"
                readOnly
                disabled
                className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                value="SHOP_OWNER"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Contact Mobile</label>
              <input
                type="text"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none"
                placeholder="+91 98xxxxxxxx"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setIsAddUserModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateUser}
              loading={saving}
              loadingText="Creating Account…"
            >
              Create Account
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
