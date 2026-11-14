import React, { useState } from 'react';
import { Upload, CheckCircle2, ShieldAlert, Plus, Trash2 } from 'lucide-react';
import { AuthStateResponse, ServiceCategory } from '../types';
import { apiFetch, uploadFileToServer } from '../lib/api';
import { LocationAutocompleteInput } from './LocationAutocompleteInput';

interface Props {
  authState: AuthStateResponse;
  categories: ServiceCategory[];
  initialMode?: 'customer' | 'provider';
  onCompleted: (targetView: 'customer' | 'provider' | 'admin') => void;
}

interface OfferingDraft {
  categoryId: number;
  title: string;
  description: string;
  priceKsh: string;
  unitLabel: string;
}

export const OnboardingView: React.FC<Props> = ({
  authState,
  categories,
  initialMode = 'customer',
  onCompleted,
}) => {
  const [accountType, setAccountType] = useState<'customer' | 'provider'>(
    authState.user.role === 'provider' ? 'provider' : initialMode
  );

  // Customer form state
  const [custName, setCustName] = useState(authState.user.fullName || '');
  const [custPhone, setCustPhone] = useState(authState.user.phone || '');
  const [custAddress, setCustAddress] = useState(
    authState.customerProfile?.defaultAddress || 'Kilimani, Nairobi'
  );
  const [custCoords, setCustCoords] = useState({
    lat: authState.customerProfile?.lat ?? -1.2921,
    lng: authState.customerProfile?.lng ?? 36.7879,
  });

  // Provider form state
  const [provName, setProvName] = useState(authState.user.fullName || '');
  const [provPhone, setProvPhone] = useState(authState.user.phone || '');
  const [businessName, setBusinessName] = useState(
    authState.providerProfile?.businessName || ''
  );
  const [bio, setBio] = useState(authState.providerProfile?.bio || '');
  const [serviceLocations, setServiceLocations] = useState(
    authState.providerProfile?.serviceLocations || 'Kilimani, Westlands, Kileleshwa'
  );
  const [baseAddress, setBaseAddress] = useState(
    authState.providerProfile?.baseAddress || 'Kilimani, Nairobi'
  );
  const [provCoords, setProvCoords] = useState({
    lat: authState.providerProfile?.lat ?? -1.2921,
    lng: authState.providerProfile?.lng ?? 36.7879,
  });
  const [yearsExperience, setYearsExperience] = useState(
    String(authState.providerProfile?.yearsExperience ?? 3)
  );
  const [idNumber, setIdNumber] = useState(authState.providerProfile?.idNumber || '');
  const [profilePhotoFileId, setProfilePhotoFileId] = useState<number | null>(
    authState.providerProfile?.profilePhotoFileId ?? null
  );
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(
    authState.providerProfile?.profilePhotoFileId
      ? `/api/files/${authState.providerProfile.profilePhotoFileId}`
      : null
  );
  const [idDocumentFileId, setIdDocumentFileId] = useState<number | null>(
    authState.providerProfile?.idDocumentFileId ?? null
  );
  const [idDocumentName, setIdDocumentName] = useState<string>(
    authState.providerProfile?.idDocumentFileId ? 'ID document uploaded' : ''
  );
  const [offerings, setOfferings] = useState<OfferingDraft[]>([
    {
      categoryId: categories[0]?.id ?? 1,
      title: 'Standard Home Service Visit',
      description: 'Diagnostic inspection and standard repair labor.',
      priceKsh: '2000',
      unitLabel: 'per visit',
    },
  ]);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingId, setUploadingId] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError('');
    try {
      const res = await uploadFileToServer(file, 'profile_photo');
      setProfilePhotoFileId(res.id);
      setProfilePhotoPreview(res.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleIdDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingId(true);
    setError('');
    try {
      const res = await uploadFileToServer(file, 'id_document');
      setIdDocumentFileId(res.id);
      setIdDocumentName(res.fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ID document upload failed');
    } finally {
      setUploadingId(false);
    }
  };

  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      await apiFetch('/api/auth/register-customer', {
        method: 'POST',
        body: JSON.stringify({
          fullName: custName,
          phone: custPhone,
          defaultAddress: custAddress,
          city: 'Nairobi',
          lat: custCoords.lat,
          lng: custCoords.lng,
        }),
      });
      setSuccessMsg('Customer profile saved.');
      onCompleted('customer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProviderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      await apiFetch('/api/auth/register-provider', {
        method: 'POST',
        body: JSON.stringify({
          fullName: provName,
          phone: provPhone,
          businessName,
          bio,
          serviceLocations,
          baseAddress,
          lat: provCoords.lat,
          lng: provCoords.lng,
          yearsExperience: Number(yearsExperience),
          idNumber,
          idDocumentFileId,
          profilePhotoFileId,
          offerings: offerings.map((o) => ({
            categoryId: Number(o.categoryId),
            title: o.title,
            description: o.description,
            priceKsh: Number(o.priceKsh),
            unitLabel: o.unitLabel,
          })),
        }),
      });
      setSuccessMsg('Provider application submitted for administrator verification.');
      onCompleted('provider');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provider registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOwnerPreviewSwitch = async (role: 'customer' | 'provider' | 'admin') => {
    setError('');
    try {
      await apiFetch('/api/auth/owner-role-preview', {
        method: 'POST',
        body: JSON.stringify({ role }),
      });
      onCompleted(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Role switch failed');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium text-teal-700">
          Account &amp; Role Registration · {authState.user.email}
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-navy-900 mt-1">
          Configure Your JAMII CONNECT Account
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Choose whether you are booking home services as a Customer or offering verified trade services as a Service Provider.
        </p>
      </div>

      {/* Platform Owner Multi-Role Testing Switcher (only shown to verified owner email) */}
      {authState.isPlatformOwner && (
        <div className="mb-6 bg-navy-900 text-white rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-teal-300">
              Platform Owner Workspace Switcher
            </p>
            <p className="text-xs text-slate-300 mt-0.5">
              Active role: <span className="font-mono font-semibold">{authState.user.role}</span>. Switch directly between Customer, Provider, and Administrator dashboards.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(['customer', 'provider', 'admin'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleOwnerPreviewSwitch(r)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize cursor-pointer ${
                  authState.user.role === r
                    ? 'bg-teal-600 text-white'
                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Segmented Account Type Selector */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-full sm:w-fit mb-6">
        <button
          type="button"
          onClick={() => setAccountType('customer')}
          className={`flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            accountType === 'customer'
              ? 'bg-white text-navy-900 shadow-sm'
              : 'text-slate-600 hover:text-navy-900'
          }`}
        >
          Customer Account
        </button>
        <button
          type="button"
          onClick={() => setAccountType('provider')}
          className={`flex-1 sm:flex-none px-5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
            accountType === 'provider'
              ? 'bg-white text-navy-900 shadow-sm'
              : 'text-slate-600 hover:text-navy-900'
          }`}
        >
          Service Provider Account
        </button>
      </div>

      {error && (
        <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="mb-5 p-3.5 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {accountType === 'customer' ? (
        <form
          onSubmit={handleCustomerSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <h2 className="font-display text-lg font-bold text-navy-900">
            Customer Registration &amp; Location
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="e.g. Amina Wanjiku"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                Kenyan Phone Number (M-Pesa Enabled)
              </label>
              <input
                type="tel"
                required
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="e.g. 0712 345 678"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              disabled
              value={authState.user.email}
              className="w-full px-3.5 py-2.5 text-sm bg-slate-100 border border-slate-200 rounded-lg text-slate-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">
              Default Home / Service Address
            </label>
            <LocationAutocompleteInput
              value={custAddress}
              onChange={setCustAddress}
              onSelectLocation={(loc) => {
                setCustAddress(loc.address);
                setCustCoords({ lat: loc.lat, lng: loc.lng });
              }}
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {submitting ? 'Saving Profile...' : 'Save Customer Profile'}
            </button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={handleProviderSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div>
            <h2 className="font-display text-lg font-bold text-navy-900">
              Service Provider Registration &amp; Verification
            </h2>
            <p className="text-xs text-slate-600 mt-1">
              Submit your trade details, service rates, profile photo, and national ID for administrator approval.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                Full Legal Name
              </label>
              <input
                type="text"
                required
                value={provName}
                onChange={(e) => setProvName(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                Phone Number (M-Pesa Payouts)
              </label>
              <input
                type="tel"
                required
                value={provPhone}
                onChange={(e) => setProvPhone(e.target.value)}
                placeholder="e.g. 0720 441 210"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                Business / Trade Name
              </label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Kamau Precision Plumbing"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                Years of Experience
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">
              Professional Bio &amp; Certifications
            </label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Describe your experience, licenses (NCA, EPRA, NEMA), and equipment..."
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                Neighborhoods / Service Areas Covered
              </label>
              <input
                type="text"
                required
                value={serviceLocations}
                onChange={(e) => setServiceLocations(e.target.value)}
                placeholder="Kilimani, Westlands, Karen, South C"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-900 mb-1.5">
                Base Map Location
              </label>
              <LocationAutocompleteInput
                value={baseAddress}
                onChange={setBaseAddress}
                onSelectLocation={(loc) => {
                  setBaseAddress(loc.address);
                  setProvCoords({ lat: loc.lat, lng: loc.lng });
                }}
              />
            </div>
          </div>

          {/* Photo & Verification Document Uploads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div className="border border-slate-200 rounded-lg p-4">
              <label className="block text-xs font-semibold text-navy-900 mb-2">
                Profile Photograph (Public)
              </label>
              <div className="flex items-center gap-3">
                {profilePhotoPreview ? (
                  <img
                    src={profilePhotoPreview}
                    alt="Provider preview"
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                    <Upload className="w-4 h-4" />
                  </div>
                )}
                <label className="px-3 py-2 text-xs font-semibold text-navy-900 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer">
                  <span>{uploadingPhoto ? 'Uploading...' : 'Upload Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 space-y-2">
              <label className="block text-xs font-semibold text-navy-900">
                National ID Number &amp; Verification Document (Private)
              </label>
              <input
                type="text"
                required
                value={idNumber}
                onChange={(e) => setIdNumber(e.target.value)}
                placeholder="Kenyan National ID / Passport No."
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              <div className="flex items-center justify-between gap-2">
                <label className="px-3 py-1.5 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-md cursor-pointer inline-flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploadingId ? 'Uploading...' : 'Upload ID / Permit'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleIdDocUpload}
                    className="hidden"
                  />
                </label>
                {idDocumentName && (
                  <span className="text-[11px] text-teal-700 font-medium truncate">
                    {idDocumentName}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Service Offerings & Prices */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-navy-900">
                Services Offered &amp; Pricing (KSh)
              </h3>
              <button
                type="button"
                onClick={() =>
                  setOfferings((prev) => [
                    ...prev,
                    {
                      categoryId: categories[0]?.id ?? 1,
                      title: '',
                      description: '',
                      priceKsh: '2000',
                      unitLabel: 'per visit',
                    },
                  ])
                }
                className="text-xs font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Service
              </button>
            </div>

            {offerings.map((off, idx) => {
              const gross = Number(off.priceKsh) || 0;
              const net = gross - Math.round(gross * 0.15);
              return (
                <div
                  key={idx}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-4">
                      <select
                        value={off.categoryId}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setOfferings((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, categoryId: val } : item
                            )
                          );
                        }}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        required
                        value={off.title}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOfferings((prev) =>
                            prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                          );
                        }}
                        placeholder="Service title"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        min={200}
                        required
                        value={off.priceKsh}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOfferings((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, priceKsh: val } : item
                            )
                          );
                        }}
                        placeholder="KSh"
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-md font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-1">
                      <input
                        type="text"
                        value={off.unitLabel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOfferings((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, unitLabel: val } : item
                            )
                          );
                        }}
                        placeholder="per visit"
                        className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-md"
                      />
                      {offerings.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setOfferings((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                    Your 85% earnings: KSh {net.toLocaleString('en-KE')} · 15% platform fee: KSh{' '}
                    {(gross - net).toLocaleString('en-KE')}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              {submitting ? 'Submitting Application...' : 'Submit Provider Application'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
