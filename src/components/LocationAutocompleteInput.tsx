import React, { useEffect, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { MapPin, LocateFixed, Loader2 } from 'lucide-react';
import { NAIROBI_LOCATIONS } from '../lib/api';

interface PlacePredictionLike {
  text: { text: string };
  toPlace: () => {
    formattedAddress?: string;
    displayName?: string;
    location?: { lat: () => number; lng: () => number };
    fetchFields: (opts: { fields: string[] }) => Promise<void>;
  };
}

interface AutocompleteSuggestionLike {
  placePrediction?: PlacePredictionLike;
}

interface PlacesLibraryLike {
  AutocompleteSessionToken: new () => unknown;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (request: {
      input: string;
      sessionToken: unknown;
      includedRegionCodes?: string[];
    }) => Promise<{ suggestions?: AutocompleteSuggestionLike[] }>;
  };
}

interface LocationResult {
  address: string;
  lat: number;
  lng: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelectLocation: (loc: LocationResult) => void;
  placeholder?: string;
}

export const LocationAutocompleteInput: React.FC<Props> = ({
  value,
  onChange,
  onSelectLocation,
  placeholder = 'Enter estate, street, or neighborhood in Kenya...',
}) => {
  const placesLib = useMapsLibrary('places') as unknown as PlacesLibraryLike | null;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sessionTokenRef = useRef<unknown>(null);
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestionLike[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpenDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!placesLib || !value.trim() || value.trim().length < 3 || !openDropdown) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    setIsLoading(true);
    AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: value,
      sessionToken: sessionTokenRef.current,
      includedRegionCodes: ['ke'],
    })
      .then((res) => {
        if (!cancelled) {
          setSuggestions(res.suggestions || []);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setIsLoading(false);
          setSuggestions([]);
          const msg = String(err);
          if (
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('429') ||
            msg.includes('OVER_QUERY_LIMIT') ||
            msg.includes('QuotaExceededError')
          ) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
        }
      });

    return () => {
      cancelled = true;
    };
  }, [placesLib, value, openDropdown]);

  const handleSelectSuggestion = async (suggestion: AutocompleteSuggestionLike) => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['location', 'formattedAddress', 'displayName'],
      });
      const label =
        place.formattedAddress ||
        place.displayName ||
        suggestion.placePrediction.text.text;
      const lat = place.location?.lat() ?? -1.2921;
      const lng = place.location?.lng() ?? 36.7879;

      onChange(label);
      onSelectLocation({ address: label, lat, lng });
      setOpenDropdown(false);
      setSuggestions([]);
      sessionTokenRef.current = null;
    } catch (err: unknown) {
      const msg = String(err);
      if (
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('429') ||
        msg.includes('OVER_QUERY_LIMIT') ||
        msg.includes('QuotaExceededError')
      ) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
    }
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) return;
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        const label = `Current GPS (${lat}, ${lng})`;
        onChange(label);
        onSelectLocation({ address: label, lat, lng });
        setLocatingGps(false);
        setOpenDropdown(false);
      },
      () => {
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MapPin className="w-4 h-4 text-teal-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={value}
            onFocus={() => setOpenDropdown(true)}
            onChange={(e) => {
              onChange(e.target.value);
              setOpenDropdown(true);
            }}
            placeholder={placeholder}
            className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
          />
          {isLoading && (
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
          )}
        </div>
        <button
          type="button"
          onClick={handleUseCurrentGps}
          disabled={locatingGps}
          title="Use current GPS location"
          className="px-3 py-2.5 text-xs font-medium text-navy-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
        >
          <LocateFixed className="w-3.5 h-3.5 text-teal-600" />
          <span className="hidden sm:inline">{locatingGps ? 'Locating...' : 'GPS'}</span>
        </button>
      </div>

      {openDropdown && (suggestions.length > 0 || value.trim().length < 3) && (
        <div className="absolute z-40 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
          {suggestions.length > 0 ? (
            <ul className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {suggestions.map((sug, idx) => (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => handleSelectSuggestion(sug)}
                    className="w-full text-left px-3.5 py-2.5 text-sm text-slate-800 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="truncate">{sug.placePrediction?.text.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-2">
              <div className="px-2 py-1 text-xs font-medium text-slate-500">
                Popular Nairobi Areas
              </div>
              <div className="grid grid-cols-2 gap-1 mt-1">
                {NAIROBI_LOCATIONS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      onChange(preset.label);
                      onSelectLocation({
                        address: preset.label,
                        lat: preset.lat,
                        lng: preset.lng,
                      });
                      setOpenDropdown(false);
                    }}
                    className="text-left px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md truncate cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
