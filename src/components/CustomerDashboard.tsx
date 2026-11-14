import React, { useEffect, useState } from 'react';
import {
  Calendar,
  CreditCard,
  Loader2,
  MapPin,
  MessageSquare,
  Phone,
  Smartphone,
  Star,
  User,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { AuthStateResponse, BookingItem, ChatMessage } from '../types';
import { apiFetch } from '../lib/api';
import { BookingChatPanel } from './BookingChatPanel';
import { LocationAutocompleteInput } from './LocationAutocompleteInput';

interface Props {
  authState: AuthStateResponse;
  onRefreshAuth: () => void;
  onExploreServices: () => void;
  latestBookingEvent: BookingItem | null;
  incomingMessage: ChatMessage | null;
}

export const CustomerDashboard: React.FC<Props> = ({
  authState,
  onRefreshAuth,
  onExploreServices,
  latestBookingEvent,
  incomingMessage,
}) => {
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Profile editor state
  const [editingProfile, setEditingProfile] = useState(false);
  const [fullName, setFullName] = useState(authState.user.fullName);
  const [phone, setPhone] = useState(authState.user.phone);
  const [defaultAddress, setDefaultAddress] = useState(
    authState.customerProfile?.defaultAddress || 'Kilimani, Nairobi'
  );
  const [coords, setCoords] = useState({
    lat: authState.customerProfile?.lat ?? -1.2921,
    lng: authState.customerProfile?.lng ?? 36.7879,
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Payment form state
  const [payMethod, setPayMethod] = useState<'mpesa_stk' | 'card'>('mpesa_stk');
  const [mpesaPhone, setMpesaPhone] = useState(authState.user.phone || '0712345678');
  const [cardLast4, setCardLast4] = useState('');
  const [initiatingPay, setInitiatingPay] = useState(false);

  // Cancel & Review state
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelBox, setShowCancelBox] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [disputeNotes, setDisputeNotes] = useState('');
  const [showDisputeBox, setShowDisputeBox] = useState(false);

  const loadBookings = async () => {
    try {
      const data = await apiFetch<BookingItem[]>('/api/customer/bookings');
      setBookings(data);
      if (data.length > 0 && !selectedBookingId) {
        setSelectedBookingId(data[0].id);
      }
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load bookings');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  useEffect(() => {
    if (latestBookingEvent) {
      loadBookings();
    }
  }, [latestBookingEvent]);

  const filteredBookings = bookings.filter((b) => {
    if (filter === 'active') {
      return ['Pending', 'Accepted', 'Provider on the way', 'In progress'].includes(b.status);
    }
    if (filter === 'completed') return b.status === 'Completed';
    if (filter === 'cancelled') return b.status === 'Cancelled' || b.status === 'Rejected';
    return true;
  });

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) || null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setError('');
    setNotice('');
    try {
      await apiFetch('/api/customer/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          phone,
          defaultAddress,
          city: 'Nairobi',
          lat: coords.lat,
          lng: coords.lng,
        }),
      });
      setEditingProfile(false);
      setNotice('Customer profile updated.');
      onRefreshAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleInitiatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) return;
    setInitiatingPay(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<{ message: string }>('/api/payments/initiate', {
        method: 'POST',
        body: JSON.stringify({
          bookingId: selectedBooking.id,
          method: payMethod,
          mpesaPhone: payMethod === 'mpesa_stk' ? mpesaPhone : undefined,
          cardLast4: payMethod === 'card' ? cardLast4 : undefined,
        }),
      });
      setNotice(res.message);
      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment request failed');
    } finally {
      setInitiatingPay(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedBooking) return;
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/bookings/${selectedBooking.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason || 'Schedule changed' }),
      });
      setShowCancelBox(false);
      setCancelReason('');
      setNotice(`Booking ${selectedBooking.bookingCode} cancelled.`);
      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cannot cancel booking');
    }
  };

  const handleConfirmAndReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBooking) return;
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/bookings/${selectedBooking.id}/confirm-completion`, {
        method: 'POST',
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
      });
      setReviewComment('');
      setNotice('Completion confirmed and review published.');
      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit review');
    }
  };

  const handleOpenDispute = async () => {
    if (!selectedBooking) return;
    setError('');
    setNotice('');
    try {
      await apiFetch(`/api/bookings/${selectedBooking.id}/dispute`, {
        method: 'POST',
        body: JSON.stringify({ disputeNotes }),
      });
      setShowDisputeBox(false);
      setDisputeNotes('');
      setNotice('Dispute logged for administrator review.');
      await loadBookings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit dispute');
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 space-y-6">
      {/* Header & Profile Summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-teal-700">Customer Dashboard</p>
          <h1 className="font-display text-2xl font-bold text-navy-900 mt-0.5">
            Welcome, {authState.user.fullName}
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            {authState.user.email} · {authState.user.phone || 'Add phone number'} ·{' '}
            {authState.customerProfile?.defaultAddress || 'Set Nairobi address'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setEditingProfile((v) => !v)}
            className="px-4 py-2 text-xs font-semibold text-navy-900 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
          >
            <User className="w-3.5 h-3.5" />
            <span>{editingProfile ? 'Close Profile' : 'Edit Profile'}</span>
          </button>
          <button
            type="button"
            onClick={onExploreServices}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
          >
            Book New Service
          </button>
        </div>
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

      {editingProfile && (
        <form
          onSubmit={handleSaveProfile}
          className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
        >
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">Phone Number</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712 345 678"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">Default Location</label>
            <LocationAutocompleteInput
              value={defaultAddress}
              onChange={setDefaultAddress}
              onSelectLocation={(loc) => {
                setDefaultAddress(loc.address);
                setCoords({ lat: loc.lat, lng: loc.lng });
              }}
            />
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="px-5 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg cursor-pointer"
            >
              {savingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* Bookings Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Bookings List */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-navy-900">Your Bookings</h2>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {filteredBookings.length} items
              </span>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'active', 'completed', 'cancelled'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md capitalize cursor-pointer ${
                    filter === tab
                      ? 'bg-white text-navy-900 shadow-sm'
                      : 'text-slate-600 hover:text-navy-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-teal-600" />
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-navy-900">No bookings in this view</p>
              <p className="text-xs text-slate-500 mt-1">
                Browse verified providers across Kenya to schedule your first service.
              </p>
              <button
                type="button"
                onClick={onExploreServices}
                className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-teal-600 rounded-lg cursor-pointer"
              >
                Browse Services
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
              {filteredBookings.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBookingId(b.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    selectedBookingId === b.id ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-semibold text-navy-900">
                      {b.bookingCode}
                    </span>
                    <span className="font-medium text-teal-700">{b.status}</span>
                  </div>
                  <p className="text-sm font-bold text-navy-900 mt-1">{b.serviceTitle}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{b.providerBusinessName}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span>
                      {b.scheduledDate} · {b.scheduledTime}
                    </span>
                    <span className="font-semibold text-navy-900">
                      KSh {b.totalAmountKsh.toLocaleString('en-KE')}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Booking Workspace */}
        <div className="lg:col-span-7 space-y-5">
          {selectedBooking ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <p className="text-xs text-slate-500 font-mono">
                    {selectedBooking.bookingCode} · {selectedBooking.categoryName}
                  </p>
                  <h2 className="font-display text-xl font-bold text-navy-900 mt-0.5">
                    {selectedBooking.serviceTitle}
                  </h2>
                  <p className="text-sm text-slate-600 mt-1">
                    Provider: <span className="font-semibold">{selectedBooking.providerBusinessName}</span>
                    {selectedBooking.providerPhone && (
                      <span className="ml-2 text-xs font-mono text-slate-500">
                        <Phone className="w-3 h-3 inline mr-0.5" />
                        {selectedBooking.providerPhone}
                      </span>
                    )}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-slate-500">Current Status</p>
                  <p className="text-sm font-bold text-teal-700 mt-0.5">
                    {selectedBooking.status}
                  </p>
                  <p className="font-mono text-base font-bold text-navy-900 mt-1 tabular-nums">
                    KSh {selectedBooking.totalAmountKsh.toLocaleString('en-KE')}
                  </p>
                </div>
              </div>

              {/* Status Timeline */}
              <div className="grid grid-cols-5 gap-2 text-center">
                {['Pending', 'Accepted', 'Provider on the way', 'In progress', 'Completed'].map(
                  (step, idx) => {
                    const order = ['Pending', 'Accepted', 'Provider on the way', 'In progress', 'Completed'];
                    const activeIdx = order.indexOf(selectedBooking.status);
                    const reached = activeIdx >= idx;
                    return (
                      <div key={step} className="space-y-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            selectedBooking.status === 'Cancelled' ||
                            selectedBooking.status === 'Rejected'
                              ? 'bg-slate-200'
                              : reached
                              ? 'bg-teal-600'
                              : 'bg-slate-200'
                          }`}
                        />
                        <p
                          className={`text-[11px] leading-tight ${
                            reached ? 'font-semibold text-navy-900' : 'text-slate-400'
                          }`}
                        >
                          {step}
                        </p>
                      </div>
                    );
                  }
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-navy-900">Location</p>
                    <p className="text-slate-600">
                      {selectedBooking.customerAddress} ({selectedBooking.distanceKm} km)
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-navy-900">Scheduled Window</p>
                    <p className="text-slate-600 font-mono tabular-nums">
                      {selectedBooking.scheduledDate} at {selectedBooking.scheduledTime}
                    </p>
                  </div>
                </div>
              </div>

              {/* Payment Gateway Initiation Panel (M-Pesa STK Push & Card) */}
              {selectedBooking.status !== 'Cancelled' && selectedBooking.status !== 'Rejected' && (
                <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-navy-900">
                      Payment &amp; M-Pesa Checkout
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                      15% fee: KSh {selectedBooking.commissionKsh.toLocaleString('en-KE')} · Provider: KSh{' '}
                      {selectedBooking.providerEarningsKsh.toLocaleString('en-KE')}
                    </span>
                  </div>

                  {selectedBooking.payments && selectedBooking.payments.length > 0 && (
                    <div className="space-y-2">
                      {selectedBooking.payments.map((p) => (
                        <div
                          key={p.id}
                          className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <p className="font-mono font-semibold text-navy-900">
                              {p.gatewayReference} ·{' '}
                              {p.method === 'mpesa_stk' ? 'M-Pesa STK Push' : 'Card Checkout'}
                            </p>
                            <p className="text-slate-600 mt-0.5">{p.notes}</p>
                          </div>
                          <span className="font-mono font-semibold text-teal-700 capitalize shrink-0">
                            {p.status.replace('_', ' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleInitiatePayment} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPayMethod('mpesa_stk')}
                        className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer ${
                          payMethod === 'mpesa_stk'
                            ? 'border-teal-600 bg-teal-50 text-teal-900'
                            : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>M-Pesa STK Push</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayMethod('card')}
                        className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 cursor-pointer ${
                          payMethod === 'card'
                            ? 'border-teal-600 bg-teal-50 text-teal-900'
                            : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Card Payment</span>
                      </button>
                    </div>

                    {payMethod === 'mpesa_stk' ? (
                      <div className="flex gap-2">
                        <input
                          type="tel"
                          required
                          value={mpesaPhone}
                          onChange={(e) => setMpesaPhone(e.target.value)}
                          placeholder="M-Pesa number (0712 345 678)"
                          className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                        />
                        <button
                          type="submit"
                          disabled={initiatingPay}
                          className="px-4 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg whitespace-nowrap cursor-pointer"
                        >
                          {initiatingPay ? 'Recording...' : 'Send STK Request'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={4}
                          value={cardLast4}
                          onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ''))}
                          placeholder="Card last 4 digits (e.g. 4242)"
                          className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                        />
                        <button
                          type="submit"
                          disabled={initiatingPay}
                          className="px-4 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg whitespace-nowrap cursor-pointer"
                        >
                          {initiatingPay ? 'Recording...' : 'Record Card Intent'}
                        </button>
                      </div>
                    )}
                  </form>
                </div>
              )}

              {/* Completion Confirmation & Review */}
              {selectedBooking.status === 'Completed' && !selectedBooking.review && (
                <form
                  onSubmit={handleConfirmAndReview}
                  className="border border-teal-200 bg-teal-50/40 rounded-lg p-4 space-y-3"
                >
                  <p className="text-xs font-bold text-navy-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    Confirm Job Completion &amp; Rate Provider
                  </p>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className="p-1 cursor-pointer"
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= reviewRating
                              ? 'text-amber-500 fill-amber-500'
                              : 'text-slate-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    required
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Share your feedback on punctuality, workmanship, and cleanliness..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
                  >
                    Confirm Completion &amp; Submit Review
                  </button>
                </form>
              )}

              {selectedBooking.review && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <p className="font-semibold text-navy-900">
                    Your Review ({selectedBooking.review.rating}/5 Stars)
                  </p>
                  <p className="text-slate-600 mt-1">{selectedBooking.review.comment}</p>
                </div>
              )}

              {/* Real-Time Chat */}
              <div>
                <p className="text-xs font-semibold text-navy-900 mb-2 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-teal-600" />
                  <span>Message {selectedBooking.providerBusinessName}</span>
                </p>
                <BookingChatPanel
                  bookingId={selectedBooking.id}
                  bookingCode={selectedBooking.bookingCode}
                  currentUserId={authState.user.id}
                  incomingMessage={incomingMessage}
                />
              </div>

              {/* Cancellation & Dispute Controls */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                {['Pending', 'Accepted', 'Provider on the way'].includes(
                  selectedBooking.status
                ) && (
                  <button
                    type="button"
                    onClick={() => setShowCancelBox((v) => !v)}
                    className="text-xs font-semibold text-rose-700 hover:text-rose-800 cursor-pointer"
                  >
                    Cancel Booking
                  </button>
                )}
                {selectedBooking.disputeStatus === 'none' &&
                  selectedBooking.status !== 'Cancelled' && (
                    <button
                      type="button"
                      onClick={() => setShowDisputeBox((v) => !v)}
                      className="text-xs font-medium text-slate-600 hover:text-navy-900 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Report an Issue</span>
                    </button>
                  )}
              </div>

              {showCancelBox && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-rose-900">
                    Platform Cancellation Policy: Bookings may be cancelled before work begins.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Reason for cancellation..."
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-rose-300 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={handleCancelBooking}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md cursor-pointer"
                    >
                      Confirm Cancel
                    </button>
                  </div>
                </div>
              )}

              {showDisputeBox && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  <p className="text-xs font-semibold text-amber-900">
                    Log Dispute for Administrator Mediation
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={disputeNotes}
                      onChange={(e) => setDisputeNotes(e.target.value)}
                      placeholder="Describe the issue..."
                      className="flex-1 px-3 py-1.5 text-xs bg-white border border-amber-300 rounded-md"
                    />
                    <button
                      type="button"
                      onClick={handleOpenDispute}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md cursor-pointer"
                    >
                      Submit Dispute
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
              Select a booking from the left to view live status, chat with your provider, or initiate M-Pesa checkout.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
