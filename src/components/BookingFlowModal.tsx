import React, { useMemo, useState } from 'react';
import { X, Calendar, Clock, MapPin, ShieldCheck, Star, CheckCircle2 } from 'lucide-react';
import { AuthStateResponse, BookingItem, PublicProvider } from '../types';
import { apiFetch } from '../lib/api';
import { LocationAutocompleteInput } from './LocationAutocompleteInput';

interface Props {
  provider: PublicProvider;
  preselectedCategoryId?: number | null;
  customerLocation: { address: string; lat: number; lng: number };
  authState: AuthStateResponse | null;
  onRequireSignIn: () => void;
  onClose: () => void;
  onBookingCreated: (booking: BookingItem) => void;
}

export const BookingFlowModal: React.FC<Props> = ({
  provider,
  preselectedCategoryId,
  customerLocation,
  authState,
  onRequireSignIn,
  onClose,
  onBookingCreated,
}) => {
  const initialService = useMemo(() => {
    if (preselectedCategoryId) {
      const match = provider.services.find((s) => s.categoryId === preselectedCategoryId);
      if (match) return match.id;
    }
    return provider.services[0]?.id ?? 0;
  }, [provider, preselectedCategoryId]);

  const [selectedServiceId, setSelectedServiceId] = useState<number>(initialService);
  const [address, setAddress] = useState(customerLocation.address);
  const [coords, setCoords] = useState({ lat: customerLocation.lat, lng: customerLocation.lng });
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [scheduledTime, setScheduledTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectedService = provider.services.find((s) => s.id === selectedServiceId);
  const priceKsh = selectedService?.priceKsh ?? 0;
  const commissionKsh = Math.round(priceKsh * 0.15);
  const providerEarningsKsh = priceKsh - commissionKsh;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authState) {
      onRequireSignIn();
      return;
    }
    if (!selectedService) {
      setError('Please choose a service offering.');
      return;
    }
    if (!address.trim() || address.trim().length < 3) {
      setError('Please enter your service delivery address.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const created = await apiFetch<BookingItem>('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          providerId: provider.id,
          serviceId: selectedService.id,
          scheduledDate,
          scheduledTime,
          customerAddress: address.trim(),
          customerLat: coords.lat,
          customerLng: coords.lng,
          notes: notes.trim(),
        }),
      });
      onBookingCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit booking');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-navy-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-xl my-8">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <p className="text-xs text-teal-700 font-medium flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified Service Provider · {provider.distanceKm} km away
            </p>
            <h2 className="font-display text-lg font-bold text-navy-900">
              Book {provider.businessName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking dialog"
            className="p-2 text-slate-500 hover:text-navy-900 rounded-lg hover:bg-slate-200/60 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Provider Reviews Snapshot */}
          {provider.reviews.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
              <div className="flex items-center justify-between text-xs font-semibold text-navy-900 mb-2">
                <span>Recent Customer Feedback</span>
                <span className="font-mono flex items-center gap-1 tabular-nums">
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                  {provider.averageRating.toFixed(1)} ({provider.totalReviews} reviews)
                </span>
              </div>
              <p className="text-xs text-slate-600 italic">
                &ldquo;{provider.reviews[0].comment}&rdquo; — {provider.reviews[0].customerName}
              </p>
            </div>
          )}

          {/* Step 1: Service Selection */}
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-2">
              01. Select Service &amp; Rate
            </label>
            <div className="space-y-2">
              {provider.services.map((srv) => (
                <label
                  key={srv.id}
                  className={`flex items-start justify-between gap-4 p-3.5 border rounded-lg cursor-pointer transition-colors ${
                    selectedServiceId === srv.id
                      ? 'border-teal-600 bg-teal-50/40'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="service"
                      checked={selectedServiceId === srv.id}
                      onChange={() => setSelectedServiceId(srv.id)}
                      className="mt-1 accent-teal-600"
                    />
                    <div>
                      <p className="text-sm font-semibold text-navy-900">{srv.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{srv.description}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-sm font-bold text-navy-900 tabular-nums">
                      KSh {srv.priceKsh.toLocaleString('en-KE')}
                    </p>
                    <p className="text-[11px] text-slate-500">{srv.unitLabel}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Step 2: Location */}
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">
              02. Confirm Service Location
            </label>
            <LocationAutocompleteInput
              value={address}
              onChange={setAddress}
              onSelectLocation={(loc) => {
                setAddress(loc.address);
                setCoords({ lat: loc.lat, lng: loc.lng });
              }}
            />
          </div>

          {/* Step 3: Preferred Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                <Calendar className="w-3.5 h-3.5 inline mr-1 text-teal-600" />
                Preferred Date
              </label>
              <input
                type="date"
                value={scheduledDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                <Clock className="w-3.5 h-3.5 inline mr-1 text-teal-600" />
                Preferred Time
              </label>
              <select
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
              >
                <option value="08:30">08:30 AM</option>
                <option value="10:00">10:00 AM</option>
                <option value="12:00">12:00 PM</option>
                <option value="14:00">02:00 PM</option>
                <option value="16:00">04:00 PM</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">
              Job Details &amp; Access Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Gate code, apartment number, or specific issue description..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          {/* Transparent Pricing & Commission Breakdown */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Service Total</span>
              <span className="font-mono font-semibold text-navy-900 tabular-nums">
                KSh {priceKsh.toLocaleString('en-KE')}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Provider Share (85%)</span>
              <span className="font-mono tabular-nums">
                KSh {providerEarningsKsh.toLocaleString('en-KE')}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>JAMII CONNECT Commission (15%)</span>
              <span className="font-mono tabular-nums">
                KSh {commissionKsh.toLocaleString('en-KE')}
              </span>
            </div>
            <p className="pt-2 border-t border-slate-200 text-[11px] text-slate-500 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              Payment via M-Pesa STK Push or Card is arranged after submitting your request.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {authState
                ? submitting
                  ? 'Submitting Request...'
                  : 'Submit Booking Request'
                : 'Sign In to Submit Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
