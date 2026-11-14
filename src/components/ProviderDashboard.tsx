import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {
  AuthStateResponse,
  BookingItem,
  ChatMessage,
  ProviderServiceItem,
  ServiceCategory,
} from '../types';
import { apiFetch } from '../lib/api';
import { BookingChatPanel } from './BookingChatPanel';

interface ProviderDashboardPayload {
  registered: boolean;
  profile: AuthStateResponse['providerProfile'] & {
    profilePhotoUrl: string | null;
    idDocumentUrl: string | null;
  };
  services: ProviderServiceItem[];
  bookings: BookingItem[];
  earningsSummary: {
    grossKsh: number;
    commissionKsh: number;
    netEarningsKsh: number;
    completedCount: number;
    pendingRequests: number;
  };
  transactions: Array<{
    id: number;
    bookingCode: string;
    scheduledDate: string;
    grossAmountKsh: number;
    commissionKsh: number;
    netEarningsKsh: number;
    payoutStatus: string;
  }>;
}

interface Props {
  authState: AuthStateResponse;
  categories: ServiceCategory[];
  onGoToOnboarding: () => void;
  latestBookingEvent: BookingItem | null;
  incomingMessage: ChatMessage | null;
}

export const ProviderDashboard: React.FC<Props> = ({
  authState,
  categories,
  onGoToOnboarding,
  latestBookingEvent,
  incomingMessage,
}) => {
  const [data, setData] = useState<ProviderDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'bookings' | 'services' | 'earnings'>('bookings');
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Add new service state
  const [newCategoryId, setNewCategoryId] = useState<number>(categories[0]?.id ?? 1);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriceKsh, setNewPriceKsh] = useState('2000');
  const [newUnitLabel, setNewUnitLabel] = useState('per visit');

  const loadDashboard = async () => {
    try {
      const payload = await apiFetch<ProviderDashboardPayload>('/api/provider/dashboard');
      setData(payload);
      if (payload.bookings?.length && !selectedBookingId) {
        setSelectedBookingId(payload.bookings[0].id);
      }
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load provider dashboard');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (latestBookingEvent) {
      loadDashboard();
    }
  }, [latestBookingEvent]);

  const handleStatusUpdate = async (bookingId: number, status: string) => {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/provider/bookings/${bookingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setNotice(`Booking status updated to "${status}".`);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/provider/services', {
        method: 'POST',
        body: JSON.stringify({
          categoryId: newCategoryId,
          title: newTitle,
          description: newDescription,
          priceKsh: Number(newPriceKsh),
          unitLabel: newUnitLabel,
        }),
      });
      setNewTitle('');
      setNewDescription('');
      setNotice('New service offering added.');
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add service');
    }
  };

  const handleToggleService = async (serviceId: number, currentActive: boolean) => {
    try {
      await apiFetch(`/api/provider/services/${serviceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !currentActive }),
      });
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update service');
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-16 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
      </div>
    );
  }

  if (!data?.registered || !data.profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-navy-900">
            Complete Your Service Provider Profile
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            Submit your business details, service prices, profile photo, and national ID to start receiving bookings on JAMII CONNECT.
          </p>
          <button
            type="button"
            onClick={onGoToOnboarding}
            className="mt-6 px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
          >
            Start Provider Registration
          </button>
        </div>
      </div>
    );
  }

  const selectedBooking =
    data.bookings.find((b) => b.id === selectedBookingId) || null;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Provider Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {data.profile.profilePhotoUrl ? (
            <img
              src={data.profile.profilePhotoUrl}
              alt={data.profile.businessName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-lg object-cover border border-slate-200"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-navy-900 text-white font-display font-bold text-lg flex items-center justify-center">
              {data.profile.businessName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-slate-500">
              Service Provider Hub ·{' '}
              <span
                className={
                  data.profile.verificationStatus === 'approved'
                    ? 'text-teal-700 font-semibold'
                    : data.profile.verificationStatus === 'rejected'
                    ? 'text-rose-700 font-semibold'
                    : 'text-amber-700 font-semibold'
                }
              >
                Verification: {data.profile.verificationStatus}
              </span>
            </p>
            <h1 className="font-display text-2xl font-bold text-navy-900">
              {data.profile.businessName}
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Service Areas: {data.profile.serviceLocations}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onGoToOnboarding}
          className="px-4 py-2 text-xs font-semibold text-navy-900 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
        >
          Update Profile &amp; Docs
        </button>
      </div>

      {/* Verification Status Notice */}
      {data.profile.verificationStatus !== 'approved' && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            {data.profile.verificationStatus === 'pending'
              ? 'Your identification documents are under administrator review. Once approved, customers can discover and book your services.'
              : `Verification update required: ${data.profile.verificationNotes}`}
          </span>
        </div>
      )}

      {/* 4-Column Earnings & Commission Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-xl bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs text-slate-500">Gross Completed Volume</p>
          <p className="font-mono text-2xl font-bold text-navy-900 mt-1 tabular-nums">
            KSh {data.earningsSummary.grossKsh.toLocaleString('en-KE')}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500">15% Platform Commission</p>
          <p className="font-mono text-2xl font-bold text-slate-700 mt-1 tabular-nums">
            KSh {data.earningsSummary.commissionKsh.toLocaleString('en-KE')}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500">Your 85% Net Earnings</p>
          <p className="font-mono text-2xl font-bold text-teal-700 mt-1 tabular-nums">
            KSh {data.earningsSummary.netEarningsKsh.toLocaleString('en-KE')}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-slate-500">Completed Jobs · Pending</p>
          <p className="font-mono text-2xl font-bold text-navy-900 mt-1 tabular-nums">
            {data.earningsSummary.completedCount} · {data.earningsSummary.pendingRequests} new
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-full sm:w-fit">
        {(
          [
            { id: 'bookings', label: 'Booking Requests & Jobs' },
            { id: 'services', label: 'Services & Pricing' },
            { id: 'earnings', label: 'Earnings & Ledger' },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-xs font-semibold rounded-lg whitespace-nowrap cursor-pointer ${
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
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900">
          {notice}
        </div>
      )}

      {tab === 'bookings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-navy-900">Assigned Bookings</span>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {data.bookings.length} total
              </span>
            </div>

            {data.bookings.length === 0 ? (
              <p className="p-8 text-xs text-slate-500 text-center">
                No booking requests received yet.
              </p>
            ) : (
              data.bookings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBookingId(b.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    selectedBookingId === b.id ? 'bg-slate-50' : 'hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-navy-900">
                      {b.bookingCode}
                    </span>
                    <span className="font-semibold text-teal-700">{b.status}</span>
                  </div>
                  <p className="text-sm font-bold text-navy-900 mt-1">{b.serviceTitle}</p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Customer: {b.customerName} · {b.customerAddress}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-xs font-mono text-slate-500 tabular-nums">
                    <span>
                      {b.scheduledDate} · {b.scheduledTime}
                    </span>
                    <span className="font-semibold text-navy-900">
                      Net: KSh {b.providerEarningsKsh.toLocaleString('en-KE')}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="lg:col-span-7">
            {selectedBooking ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <p className="text-xs font-mono text-slate-500">
                      {selectedBooking.bookingCode} · {selectedBooking.distanceKm} km away
                    </p>
                    <h2 className="font-display text-xl font-bold text-navy-900 mt-0.5">
                      {selectedBooking.serviceTitle}
                    </h2>
                    <p className="text-xs text-slate-600 mt-1">
                      Customer: {selectedBooking.customerName} ·{' '}
                      {selectedBooking.customerPhone || 'No phone'}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Address: {selectedBooking.customerAddress}
                    </p>
                  </div>

                  <div className="sm:text-right">
                    <p className="text-xs text-slate-500">Your 85% Payout</p>
                    <p className="font-mono text-lg font-bold text-teal-700 tabular-nums">
                      KSh {selectedBooking.providerEarningsKsh.toLocaleString('en-KE')}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                      Gross KSh {selectedBooking.totalAmountKsh.toLocaleString('en-KE')} − 15% (KSh{' '}
                      {selectedBooking.commissionKsh.toLocaleString('en-KE')})
                    </p>
                  </div>
                </div>

                {selectedBooking.notes && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                    <span className="font-semibold text-navy-900">Customer Note: </span>
                    {selectedBooking.notes}
                  </div>
                )}

                {/* Workflow Action Controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {selectedBooking.status === 'Pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStatusUpdate(selectedBooking.id, 'Accepted')}
                        className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
                      >
                        Accept Booking
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusUpdate(selectedBooking.id, 'Rejected')}
                        className="px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg cursor-pointer"
                      >
                        Reject Request
                      </button>
                    </>
                  )}
                  {selectedBooking.status === 'Accepted' && (
                    <button
                      type="button"
                      onClick={() =>
                        handleStatusUpdate(selectedBooking.id, 'Provider on the way')
                      }
                      className="px-4 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg cursor-pointer"
                    >
                      Mark On The Way
                    </button>
                  )}
                  {(selectedBooking.status === 'Accepted' ||
                    selectedBooking.status === 'Provider on the way') && (
                    <button
                      type="button"
                      onClick={() => handleStatusUpdate(selectedBooking.id, 'In progress')}
                      className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
                    >
                      Start Work (In Progress)
                    </button>
                  )}
                  {selectedBooking.status === 'In progress' && (
                    <button
                      type="button"
                      onClick={() => handleStatusUpdate(selectedBooking.id, 'Completed')}
                      className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Mark Service Completed</span>
                    </button>
                  )}
                </div>

                <BookingChatPanel
                  bookingId={selectedBooking.id}
                  bookingCode={selectedBooking.bookingCode}
                  currentUserId={authState.user.id}
                  incomingMessage={incomingMessage}
                />
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
                Select a booking to manage job progress and message the customer.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'services' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 font-display text-sm font-bold text-navy-900">
              Your Published Services
            </div>
            <div className="divide-y divide-slate-100">
              {data.services.map((srv) => (
                <div key={srv.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-500">{srv.categoryName}</p>
                    <p className="text-sm font-bold text-navy-900">{srv.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{srv.description}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="font-mono text-sm font-bold text-navy-900 tabular-nums">
                      KSh {srv.priceKsh.toLocaleString('en-KE')}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleToggleService(srv.id, srv.isActive)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-md cursor-pointer ${
                        srv.isActive
                          ? 'bg-teal-50 text-teal-800 border border-teal-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {srv.isActive ? 'Active' : 'Paused'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleAddService}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
          >
            <h3 className="font-display text-base font-bold text-navy-900 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-teal-600" />
              <span>Add Service Offering</span>
            </h3>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">Category</label>
              <select
                value={newCategoryId}
                onChange={(e) => setNewCategoryId(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">Service Title</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Solar Water Heater Servicing"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1">Description</label>
              <textarea
                rows={2}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-navy-900 mb-1">Price (KSh)</label>
                <input
                  type="number"
                  min={200}
                  required
                  value={newPriceKsh}
                  onChange={(e) => setNewPriceKsh(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-navy-900 mb-1">Unit</label>
                <input
                  type="text"
                  value={newUnitLabel}
                  onChange={(e) => setNewUnitLabel(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
            >
              Publish Service
            </button>
          </form>
        </div>
      )}

      {tab === 'earnings' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-navy-900 flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-teal-600" />
              <span>Commission &amp; Payout Transaction History</span>
            </h3>
            <span className="text-xs text-slate-500">85% Provider · 15% Platform</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 font-semibold">Booking</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold text-right">Gross (KSh)</th>
                  <th className="px-5 py-3 font-semibold text-right">15% Fee</th>
                  <th className="px-5 py-3 font-semibold text-right">85% Net</th>
                  <th className="px-5 py-3 font-semibold text-right">Payout Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                {data.transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-500 font-sans">
                      Completed jobs will appear here with itemized commission deductions.
                    </td>
                  </tr>
                ) : (
                  data.transactions.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-semibold text-navy-900">{t.bookingCode}</td>
                      <td className="px-5 py-3 text-slate-600">{t.scheduledDate}</td>
                      <td className="px-5 py-3 text-right">
                        {t.grossAmountKsh.toLocaleString('en-KE')}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500">
                        -{t.commissionKsh.toLocaleString('en-KE')}
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-teal-700">
                        {t.netEarningsKsh.toLocaleString('en-KE')}
                      </td>
                      <td className="px-5 py-3 text-right capitalize font-sans font-medium">
                        {t.payoutStatus}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
