import React, { useEffect, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
} from '@vis.gl/react-google-maps';
import { Search, Star, MapPin, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { PublicProvider, ServiceCategory } from '../types';
import { LocationAutocompleteInput } from './LocationAutocompleteInput';

interface Props {
  categories: ServiceCategory[];
  initialCategoryId: number | null;
  customerLocation: { address: string; lat: number; lng: number };
  onCustomerLocationChange: (loc: { address: string; lat: number; lng: number }) => void;
  onSelectProviderToBook: (provider: PublicProvider, preselectedCategoryId?: number | null) => void;
  mapsAvailable: boolean;
}

const MapViewportSync: React.FC<{ center: { lat: number; lng: number } }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo(center);
  }, [map, center]);
  return null;
};

const ProviderMapPin: React.FC<{
  provider: PublicProvider;
  isSelected: boolean;
  onSelect: () => void;
  onBook: () => void;
}> = ({ provider, isSelected, onSelect, onBook }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const minPrice = provider.services.length
    ? Math.min(...provider.services.map((s) => s.priceKsh))
    : 2000;

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: provider.lat, lng: provider.lng }}
        onClick={onSelect}
        title={provider.businessName}
      >
        <Pin
          background={isSelected ? '#0f2342' : '#0d9488'}
          borderColor="#ffffff"
          glyphColor="#ffffff"
          scale={isSelected ? 1.25 : 1.05}
        />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onSelect} maxWidth={260}>
          <div className="p-1 text-slate-900">
            <p className="font-display text-sm font-bold text-navy-900">
              {provider.businessName}
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              {provider.distanceKm} km away · {provider.averageRating.toFixed(1)} ★
            </p>
            <p className="text-xs font-mono font-semibold text-teal-700 mt-1 tabular-nums">
              From KSh {minPrice.toLocaleString('en-KE')}
            </p>
            <button
              type="button"
              onClick={onBook}
              className="mt-2 w-full px-3 py-1.5 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-md cursor-pointer"
            >
              View &amp; Book
            </button>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

export const MarketplaceMapSearch: React.FC<Props> = ({
  categories,
  initialCategoryId,
  customerLocation,
  onCustomerLocationChange,
  onSelectProviderToBook,
  mapsAvailable,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(initialCategoryId);
  const [searchQuery, setSearchQuery] = useState('');
  const [maxDistanceKm, setMaxDistanceKm] = useState<string>('all');
  const [providers, setProviders] = useState<PublicProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedPinId, setSelectedPinId] = useState<number | null>(null);
  const [addressText, setAddressText] = useState(customerLocation.address);

  useEffect(() => {
    setSelectedCategoryId(initialCategoryId);
  }, [initialCategoryId]);

  useEffect(() => {
    setAddressText(customerLocation.address);
  }, [customerLocation.address]);

  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCategoryId) params.set('categoryId', String(selectedCategoryId));
    if (searchQuery.trim()) params.set('search', searchQuery.trim());
    params.set('lat', String(customerLocation.lat));
    params.set('lng', String(customerLocation.lng));
    if (maxDistanceKm !== 'all') params.set('maxDistanceKm', maxDistanceKm);

    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/providers?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Unable to load verified providers');
        }
        return res.json();
      })
      .then((data: PublicProvider[]) => {
        if (!cancelled) {
          setProviders(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load verified providers');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedCategoryId,
    searchQuery,
    customerLocation.lat,
    customerLocation.lng,
    maxDistanceKm,
    reloadNonce,
  ]);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8">
      {/* Search & Location Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-5">
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">
              Your Service Location
            </label>
            <LocationAutocompleteInput
              value={addressText}
              onChange={setAddressText}
              onSelectLocation={(loc) => onCustomerLocationChange(loc)}
              placeholder="Search Kilimani, Westlands, Karen, Mombasa..."
            />
          </div>

          <div className="lg:col-span-4">
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">
              Search Service or Provider
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Plumber, AC repair, deep clean..."
                className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-xs font-semibold text-navy-900 mb-1.5">
              Distance Radius
            </label>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {[
                { label: '5 km', value: '5' },
                { label: '10 km', value: '10' },
                { label: '25 km', value: '25' },
                { label: 'All', value: 'all' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMaxDistanceKm(opt.value)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    maxDistanceKm === opt.value
                      ? 'bg-white text-navy-900 shadow-sm'
                      : 'text-slate-600 hover:text-navy-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive Category Segmented Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategoryId(null)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedCategoryId === null
                ? 'bg-navy-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedCategoryId === cat.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split: Nearby Providers List + Interactive Google Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-navy-900">
              Verified Providers Nearby
            </h2>
            <span className="text-xs font-mono text-slate-600 tabular-nums">
              {providers.length} matching pros
            </span>
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-teal-600 mb-2" />
              <p className="text-sm">Calculating distances and fetching providers...</p>
            </div>
          ) : error ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-sm text-rose-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => setReloadNonce((n) => n + 1)}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                Retry Search
              </button>
            </div>
          ) : providers.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
              <p className="font-display text-base font-bold text-navy-900">
                No verified providers match this filter
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Try expanding your distance radius or clearing the category filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryId(null);
                  setSearchQuery('');
                  setMaxDistanceKm('all');
                }}
                className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            providers.map((provider) => {
              const filteredServices = selectedCategoryId
                ? provider.services.filter((s) => s.categoryId === selectedCategoryId)
                : provider.services;
              const displayServices =
                filteredServices.length > 0 ? filteredServices : provider.services;

              return (
                <article
                  key={provider.id}
                  onMouseEnter={() => setSelectedPinId(provider.id)}
                  className={`bg-white border rounded-xl p-5 transition-colors ${
                    selectedPinId === provider.id
                      ? 'border-teal-600'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {provider.profilePhotoUrl ? (
                        <img
                          src={provider.profilePhotoUrl}
                          alt={provider.businessName}
                          referrerPolicy="no-referrer"
                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-navy-900 text-white font-display font-bold text-lg flex items-center justify-center shrink-0">
                          {provider.businessName
                            .split(' ')
                            .slice(0, 2)
                            .map((w) => w[0])
                            .join('')}
                        </div>
                      )}
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="inline-flex items-center gap-1 text-teal-700 font-medium">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Verified Pro
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {provider.distanceKm} km away
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{provider.yearsExperience} yrs exp</span>
                        </div>

                        <h3 className="font-display text-lg font-bold text-navy-900 mt-1">
                          {provider.businessName}
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Lead Technician: {provider.fullName} · Areas: {provider.serviceLocations}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0">
                      <div className="flex items-center gap-1 text-sm font-semibold text-navy-900 font-mono tabular-nums">
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                        <span>{provider.averageRating.toFixed(1)}</span>
                        <span className="text-xs font-normal text-slate-500">
                          ({provider.totalReviews})
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 font-mono tabular-nums">
                        {provider.completedJobs} completed jobs
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                    {provider.bio}
                  </p>

                  {/* Services Offered List */}
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                    {displayServices.slice(0, 3).map((srv) => (
                      <div
                        key={srv.id}
                        className="flex items-center justify-between gap-4 text-sm py-1"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-slate-900">{srv.title}</span>
                          <span className="text-xs text-slate-500 ml-2">
                            {srv.categoryName}
                          </span>
                        </div>
                        <span className="font-mono text-sm font-semibold text-navy-900 whitespace-nowrap shrink-0 tabular-nums">
                          KSh {srv.priceKsh.toLocaleString('en-KE')}{' '}
                          <span className="text-xs font-normal text-slate-500">
                            {srv.unitLabel}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500 flex items-center gap-1 truncate">
                      <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                      {provider.baseAddress}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectProviderToBook(provider, selectedCategoryId)}
                      className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                    >
                      <span>Select &amp; Book</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* Sticky Interactive Google Map */}
        <div className="lg:col-span-5 lg:sticky lg:top-24">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-navy-900">
                  Live Provider Coverage Map
                </h3>
                <p className="text-xs text-slate-500 truncate max-w-[280px]">
                  Centered on {customerLocation.address}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-600">
                <span>Navy: You</span>
                <span>Teal: Providers</span>
              </div>
            </div>

            <div className="h-[460px] w-full relative bg-slate-100">
              {mapsAvailable ? (
                <GoogleMap
                  defaultCenter={{ lat: customerLocation.lat, lng: customerLocation.lng }}
                  defaultZoom={12}
                  mapId="DEMO_MAP_ID"
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  className="w-full h-full"
                >
                  <MapViewportSync
                    center={{ lat: customerLocation.lat, lng: customerLocation.lng }}
                  />

                  <AdvancedMarker
                    position={{ lat: customerLocation.lat, lng: customerLocation.lng }}
                    title={`Your Location: ${customerLocation.address}`}
                  >
                    <Pin
                      background="#0f2342"
                      borderColor="#ffffff"
                      glyphColor="#ffffff"
                      scale={1.15}
                    />
                  </AdvancedMarker>

                  {providers.map((p) => (
                    <ProviderMapPin
                      key={p.id}
                      provider={p}
                      isSelected={selectedPinId === p.id}
                      onSelect={() =>
                        setSelectedPinId((curr) => (curr === p.id ? null : p.id))
                      }
                      onBook={() => onSelectProviderToBook(p, selectedCategoryId)}
                    />
                  ))}
                </GoogleMap>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-600">
                  <MapPin className="w-8 h-8 text-teal-600 mb-2" />
                  <p className="text-sm font-semibold text-navy-900">
                    Distance Sorting Active
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Map tiles unavailable; all provider distances are calculated in kilometers from {customerLocation.address}.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
