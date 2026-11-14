import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Check,
  FileText,
  Loader2,
  Plus,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AppUser, BookingItem, ServiceCategory } from '../types';
import { apiFetch } from '../lib/api';

interface AdminOverview {
  metrics: {
    totalCustomers: number;
    totalProviders: number;
    pendingVerifications: number;
    totalBookings: number;
    completedBookings: number;
    cancelledBookings: number;
    openDisputes: number;
    totalMarketplaceRevenueKsh: number;
    totalPlatformCommissionKsh: number;
    totalProviderEarningsKsh: number;
  };
  customers: AppUser[];
  providers: Array<{
    id: number;
    userId: number;
    fullName: string;
    email: string;
    phone: string;
    businessName: string;
    serviceLocations: string;
    verificationStatus: string;
    idNumber: string;
    verificationNotes: string;
    accountStatus: string;
    idDocumentUrl: string | null;
    completedJobs: number;
    averageRating: number;
  }>;
  categories: ServiceCategory[];
  bookings: BookingItem[];
  payments: Array<{
    id: number;
    bookingCode: string;
    customerName: string;
    method: string;
    status: string;
    amountKsh: number;
    gatewayReference: string;
    mpesaPhone: string;
    mpesaReceiptNumber: string;
    notes: string;
  }>;
  payouts: Array<{
    id: number;
    bookingCode: string;
    businessName: string;
    grossAmountKsh: number;
    commissionKsh: number;
    netEarningsKsh: number;
    payoutStatus: string;
  }>;
  categoryReport: Array<{
    categoryName: string;
    bookings: number;
    revenueKsh: number;
    commissionKsh: number;
  }>;
}

interface Props {
  onCategoriesChanged: () => void;
}

export const AdminDashboard: React.FC<Props> = ({ onCategoriesChanged }) => {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    'verifications' | 'users' | 'bookings' | 'categories' | 'payments' | 'reports'
  >('verifications');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // New Category state
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Preview ID document modal
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);

  const loadOverview = async () => {
    try {
      const res = await apiFetch<AdminOverview>('/api/admin/overview');
      setData(res);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin overview');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const handleVerifyProvider = async (
    providerId: number,
    verificationStatus: 'approved' | 'rejected'
  ) => {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/admin/providers/${providerId}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({
          verificationStatus,
          verificationNotes:
            verificationStatus === 'approved'
              ? 'Documents verified by Administrator.'
              : 'Identification details require resubmission.',
        }),
      });
      setNotice(`Provider ${verificationStatus}.`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update verification');
    }
  };

  const handleToggleUserStatus = async (userId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice(`Account status updated to ${nextStatus}.`);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user status');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name: catName, description: catDesc, iconKey: 'wrench' }),
      });
      setCatName('');
      setCatDesc('');
      setNotice('New service category added.');
      onCategoriesChanged();
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    }
  };

  const handleToggleCategory = async (id: number, current: boolean) => {
    try {
      await apiFetch(`/api/admin/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !current }),
      });
      onCategoriesChanged();
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category');
    }
  };

  const handleResolveDispute = async (bookingId: number) => {
    try {
      await apiFetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          disputeStatus: 'resolved',
          disputeNotes: 'Mediated and resolved by Administrator.',
        }),
      });
      setNotice('Dispute marked as resolved.');
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    }
  };

  const handleSettlePayout = async (payoutId: number) => {
    try {
      await apiFetch(`/api/admin/payouts/${payoutId}/settle`, { method: 'PATCH' });
      setNotice('Provider payout marked settled.');
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to settle payout');
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{error || 'Administrator access denied.'}</span>
        </div>
      </div>
    );
  }

  const m = data.metrics;
  const maxCategoryRevenue = Math.max(
    1,
    ...data.categoryReport.map((r) => r.revenueKsh)
  );

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-teal-700">Protected Administrator Console</p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-navy-900">
            JAMII CONNECT Marketplace Operations
          </h1>
        </div>
        <button
          type="button"
          onClick={loadOverview}
          className="px-4 py-2 text-xs font-semibold text-navy-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer self-start"
        >
          Refresh Metrics
        </button>
      </div>

      {/* 8-Metric Executive KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 border border-slate-200 rounded-xl bg-white divide-y md:divide-x divide-slate-200">
        <div className="p-4">
          <p className="text-xs text-slate-500">Registered Customers</p>
          <p className="font-mono text-xl font-bold text-navy-900 mt-1 tabular-nums">
            {m.totalCustomers}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">Service Providers (Pending)</p>
          <p className="font-mono text-xl font-bold text-navy-900 mt-1 tabular-nums">
            {m.totalProviders}{' '}
            <span className="text-xs font-normal text-amber-700">
              ({m.pendingVerifications} pending)
            </span>
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">Bookings (Done / Cancelled)</p>
          <p className="font-mono text-xl font-bold text-navy-900 mt-1 tabular-nums">
            {m.totalBookings}{' '}
            <span className="text-xs font-normal text-slate-500">
              ({m.completedBookings} / {m.cancelledBookings})
            </span>
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">Open Disputes</p>
          <p className="font-mono text-xl font-bold text-rose-700 mt-1 tabular-nums">
            {m.openDisputes}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">Marketplace Revenue</p>
          <p className="font-mono text-xl font-bold text-navy-900 mt-1 tabular-nums">
            KSh {m.totalMarketplaceRevenueKsh.toLocaleString('en-KE')}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">Platform Commission (15%)</p>
          <p className="font-mono text-xl font-bold text-teal-700 mt-1 tabular-nums">
            KSh {m.totalPlatformCommissionKsh.toLocaleString('en-KE')}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">Provider Earnings (85%)</p>
          <p className="font-mono text-xl font-bold text-navy-900 mt-1 tabular-nums">
            KSh {m.totalProviderEarningsKsh.toLocaleString('en-KE')}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">Active Categories</p>
          <p className="font-mono text-xl font-bold text-navy-900 mt-1 tabular-nums">
            {data.categories.filter((c) => c.isActive).length}
          </p>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl overflow-x-auto">
        {(
          [
            { id: 'verifications', label: 'Provider Verifications' },
            { id: 'users', label: 'Customer & User Control' },
            { id: 'bookings', label: 'Bookings & Disputes' },
            { id: 'categories', label: 'Service Categories' },
            { id: 'payments', label: 'Payments & Payouts' },
            { id: 'reports', label: 'Reports & Analytics' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 cursor-pointer ${
              tab === t.id
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-slate-600 hover:text-navy-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900">
          {notice}
        </div>
      )}

      {tab === 'verifications' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Business &amp; Lead Pro</th>
                  <th className="px-4 py-3 font-semibold">Locations</th>
                  <th className="px-4 py-3 font-semibold">ID Number / Doc</th>
                  <th className="px-4 py-3 font-semibold">Verification</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.providers.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-bold text-navy-900">{p.businessName}</p>
                      <p className="text-slate-600">
                        {p.fullName} · {p.phone}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs">{p.serviceLocations}</td>
                    <td className="px-4 py-3 font-mono">
                      <span>{p.idNumber || 'N/A'}</span>
                      {p.idDocumentUrl && (
                        <button
                          type="button"
                          onClick={() => setDocPreviewUrl(p.idDocumentUrl)}
                          className="ml-2 text-teal-700 hover:underline font-sans inline-flex items-center gap-1 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          View Doc
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize font-semibold">
                      <span
                        className={
                          p.verificationStatus === 'approved'
                            ? 'text-teal-700'
                            : p.verificationStatus === 'rejected'
                            ? 'text-rose-700'
                            : 'text-amber-700'
                        }
                      >
                        {p.verificationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                      {p.verificationStatus !== 'approved' && (
                        <button
                          type="button"
                          onClick={() => handleVerifyProvider(p.id, 'approved')}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3 h-3" />
                          Approve
                        </button>
                      )}
                      {p.verificationStatus !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => handleVerifyProvider(p.id, 'rejected')}
                          className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                          Reject
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggleUserStatus(p.userId, p.accountStatus)}
                        className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                      >
                        {p.accountStatus === 'active' ? 'Suspend' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Customer Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Account Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-navy-900">{c.fullName}</td>
                    <td className="px-4 py-3 text-slate-600">{c.email}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{c.phone || '—'}</td>
                    <td className="px-4 py-3 capitalize font-semibold">
                      <span
                        className={
                          c.status === 'active' ? 'text-teal-700' : 'text-rose-700'
                        }
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleToggleUserStatus(c.id, c.status)}
                        className="px-3 py-1 text-xs font-semibold text-navy-900 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer"
                      >
                        {c.status === 'active' ? 'Suspend Account' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'bookings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Service &amp; Category</th>
                  <th className="px-4 py-3 font-semibold">Customer / Provider</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Total (KSh)</th>
                  <th className="px-4 py-3 font-semibold text-right">Dispute</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold text-navy-900">
                      {b.bookingCode}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy-900">{b.serviceTitle}</p>
                      <p className="text-slate-500">{b.categoryName}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {b.customerName} → {b.providerBusinessName}
                    </td>
                    <td className="px-4 py-3 font-semibold text-teal-700">{b.status}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {b.totalAmountKsh.toLocaleString('en-KE')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {b.disputeStatus === 'open' ? (
                        <button
                          type="button"
                          onClick={() => handleResolveDispute(b.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md cursor-pointer"
                        >
                          Resolve Dispute
                        </button>
                      ) : (
                        <span className="text-slate-500 capitalize">{b.disputeStatus}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {data.categories.map((c) => (
              <div key={c.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-navy-900">{c.name}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{c.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleCategory(c.id, c.isActive)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                    c.isActive
                      ? 'bg-teal-50 text-teal-800 border border-teal-200'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {c.isActive ? 'Active' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddCategory}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <h3 className="font-display text-base font-bold text-navy-900 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-teal-600" />
              <span>Add Service Category</span>
            </h3>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">
                Category Name
              </label>
              <input
                type="text"
                required
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Solar & Backup Power"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                placeholder="Scope of residential work..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg cursor-pointer"
            >
              Create Category
            </button>
          </form>
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 font-display text-sm font-bold text-navy-900">
              Customer Payment Intents &amp; Gateway Records
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Ref</th>
                    <th className="px-4 py-3 font-semibold">Booking</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Method</th>
                    <th className="px-4 py-3 font-semibold text-right">Amount (KSh)</th>
                    <th className="px-4 py-3 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-3 font-mono font-semibold text-navy-900">
                        {p.gatewayReference}
                      </td>
                      <td className="px-4 py-3 font-mono">{p.bookingCode}</td>
                      <td className="px-4 py-3">{p.customerName}</td>
                      <td className="px-4 py-3">
                        {p.method === 'mpesa_stk'
                          ? `M-Pesa (${p.mpesaPhone || 'STK'})`
                          : 'Card'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {p.amountKsh.toLocaleString('en-KE')}
                      </td>
                      <td className="px-4 py-3 text-right capitalize font-semibold text-teal-700">
                        {p.status.replace('_', ' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 font-display text-sm font-bold text-navy-900">
              Provider Earnings &amp; Payout Settlement (85% Share)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Booking</th>
                    <th className="px-4 py-3 font-semibold">Provider</th>
                    <th className="px-4 py-3 font-semibold text-right">Gross (KSh)</th>
                    <th className="px-4 py-3 font-semibold text-right">15% Commission</th>
                    <th className="px-4 py-3 font-semibold text-right">85% Payout</th>
                    <th className="px-4 py-3 font-semibold text-right">Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {data.payouts.map((po) => (
                    <tr key={po.id}>
                      <td className="px-4 py-3 font-semibold text-navy-900">{po.bookingCode}</td>
                      <td className="px-4 py-3 font-sans">{po.businessName}</td>
                      <td className="px-4 py-3 text-right">
                        {po.grossAmountKsh.toLocaleString('en-KE')}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {po.commissionKsh.toLocaleString('en-KE')}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-teal-700">
                        {po.netEarningsKsh.toLocaleString('en-KE')}
                      </td>
                      <td className="px-4 py-3 text-right font-sans">
                        {po.payoutStatus === 'pending' ? (
                          <button
                            type="button"
                            onClick={() => handleSettlePayout(po.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-md cursor-pointer"
                          >
                            Settle Payout
                          </button>
                        ) : (
                          <span className="text-teal-700 font-semibold">Settled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h3 className="font-display text-base font-bold text-navy-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-teal-600" />
            <span>Category Revenue &amp; Commission Report</span>
          </h3>
          <div className="space-y-4">
            {data.categoryReport.map((row) => {
              const pct = Math.max(4, Math.round((row.revenueKsh / maxCategoryRevenue) * 100));
              return (
                <div key={row.categoryName} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-navy-900">
                      {row.categoryName}{' '}
                      <span className="font-mono font-normal text-slate-500">
                        ({row.bookings} bookings)
                      </span>
                    </span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      Gross KSh {row.revenueKsh.toLocaleString('en-KE')} · Commission KSh{' '}
                      {row.commissionKsh.toLocaleString('en-KE')}
                    </span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-600 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ID Document Modal Preview (Protected Admin Inspection) */}
      {docPreviewUrl && (
        <div className="fixed inset-0 z-50 bg-navy-950/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-navy-900">
                Verification Document Inspection
              </h3>
              <button
                type="button"
                onClick={() => setDocPreviewUrl(null)}
                className="p-1.5 text-slate-500 hover:text-navy-900 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 max-h-[70vh] flex items-center justify-center">
              <img
                src={docPreviewUrl}
                alt="Submitted verification ID document"
                referrerPolicy="no-referrer"
                className="max-h-[68vh] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
