import React, { useCallback, useEffect, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { onIdTokenChanged, signInWithPopup, signOut } from 'firebase/auth';
import { Loader2 } from 'lucide-react';

import { auth, googleAuthProvider } from './lib/firebase';
import { apiFetch, SESSION_EXPIRED_EVENT } from './lib/api';
import {
  AppNotification,
  AuthStateResponse,
  BookingItem,
  ChatMessage,
  PublicProvider,
  ServiceCategory,
} from './types';
import { ActiveView, Navbar } from './components/Navbar';
import { BrandLogo } from './components/BrandLogo';
import { WelcomeLanding } from './components/WelcomeLanding';
import { MarketplaceMapSearch } from './components/MarketplaceMapSearch';
import { BookingFlowModal } from './components/BookingFlowModal';
import { OnboardingView } from './components/OnboardingView';
import { CustomerDashboard } from './components/CustomerDashboard';
import { ProviderDashboard } from './components/ProviderDashboard';
import { AdminDashboard } from './components/AdminDashboard';

export default function App() {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [activeView, setActiveView] = useState<ActiveView>('welcome');
  const [onboardingMode, setOnboardingMode] = useState<'customer' | 'provider'>('customer');
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const [authReady, setAuthReady] = useState(false);
  const [authState, setAuthState] = useState<AuthStateResponse | null>(null);
  const [authError, setAuthError] = useState('');

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const [customerLocation, setCustomerLocation] = useState({
    address: 'Kilimani, Nairobi',
    lat: -1.2921,
    lng: 36.7879,
  });

  const [bookingModalTarget, setBookingModalTarget] = useState<{
    provider: PublicProvider;
    preselectedCategoryId?: number | null;
  } | null>(null);

  const [latestBookingEvent, setLatestBookingEvent] = useState<BookingItem | null>(null);
  const [incomingMessage, setIncomingMessage] = useState<ChatMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Listen for Google Maps Platform quota events
  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  // Load Maps API key fallback from server config if not injected via VITE_
  useEffect(() => {
    if (!mapsApiKey) {
      fetch('/api/config/public')
        .then((r) => r.json())
        .then((d: { mapsApiKey?: string }) => {
          if (d.mapsApiKey) setMapsApiKey(d.mapsApiKey);
        })
        .catch(() => {});
    }
  }, [mapsApiKey]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data: ServiceCategory[] = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const refreshAuthProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setAuthState(null);
      setNotifications([]);
      return;
    }
    try {
      const me = await apiFetch<AuthStateResponse>('/api/auth/me');
      setAuthState(me);
      if (me.customerProfile) {
        setCustomerLocation({
          address: me.customerProfile.defaultAddress,
          lat: me.customerProfile.lat,
          lng: me.customerProfile.lng,
        });
      }
      const notifs = await apiFetch<AppNotification[]>('/api/notifications');
      setNotifications(notifs);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to authenticate session');
    }
  }, []);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        await refreshAuthProfile();
      } else {
        setAuthState(null);
        setNotifications([]);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [refreshAuthProfile]);

  // Redirect user to sign in cleanly if refresh token expires or session is invalidated
  useEffect(() => {
    const onSessionExpired = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setAuthState(null);
      setNotifications([]);
      setAuthError(
        detail?.message || 'Your session has expired. Please sign in again.'
      );
      setActiveView((curr) =>
        curr === 'customer' || curr === 'provider' || curr === 'admin' || curr === 'onboarding'
          ? 'welcome'
          : curr
      );
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  // Real-time WebSocket connection authenticated with Firebase ID token
  useEffect(() => {
    if (!authState || !auth.currentUser) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let forceNextTokenRefresh = false;

    const connectWs = async () => {
      if (cancelled || !auth.currentUser) return;
      let token: string;
      try {
        token = await auth.currentUser.getIdToken(forceNextTokenRefresh);
        forceNextTokenRefresh = false;
      } catch {
        await signOut(auth).catch(() => {});
        window.dispatchEvent(
          new CustomEvent(SESSION_EXPIRED_EVENT, {
            detail: { message: 'Your session expired. Please sign in again.' },
          })
        );
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = socket;

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: 'auth', token }));
      };

      socket.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.event === 'auth:error') {
            forceNextTokenRefresh = true;
            socket.close();
          } else if (msg.event === 'booking:created' || msg.event === 'booking:updated') {
            setLatestBookingEvent({ ...msg.payload });
          } else if (msg.event === 'message:created') {
            setIncomingMessage(msg.payload);
          } else if (msg.event === 'notification:created') {
            setNotifications((prev) => [msg.payload, ...prev]);
          } else if (msg.event === 'provider:verified') {
            refreshAuthProfile();
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      socket.onclose = () => {
        if (!cancelled) {
          reconnectTimer = setTimeout(connectWs, 4000);
        }
      };
    };

    connectWs();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [authState?.user.id, refreshAuthProfile]);

  const handleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleAuthProvider);
      await refreshAuthProfile();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-blocked') {
        setAuthError(
          'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.'
        );
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('Sign-in was cancelled before completion.');
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError(
          'This domain is not authorized for Firebase sign-in. Add this host to Firebase Auth authorized domains.'
        );
      } else {
        setAuthError(err instanceof Error ? err.message : 'Sign-in cancelled or failed');
      }
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setAuthState(null);
    setNotifications([]);
    setAuthError('');
    setActiveView('welcome');
  };

  const handleMarkNotificationsRead = async () => {
    try {
      await apiFetch('/api/notifications/read', { method: 'PATCH' });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // Ignore
    }
  };

  const handleOpenOnboarding = async (mode: 'customer' | 'provider') => {
    setOnboardingMode(mode);
    if (!auth.currentUser) {
      await handleSignIn();
    }
    setActiveView('onboarding');
  };

  const renderMainContent = () => {
    if (!authReady) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        </div>
      );
    }

    if (activeView === 'welcome') {
      return (
        <WelcomeLanding
          categories={categories}
          isSignedIn={Boolean(authState)}
          onSelectCategory={(catId) => {
            setSelectedCategoryId(catId);
            setActiveView('explore');
          }}
          onExploreMap={() => {
            setSelectedCategoryId(null);
            setActiveView('explore');
          }}
          onOpenOnboarding={handleOpenOnboarding}
        />
      );
    }

    if (activeView === 'explore') {
      return (
        <MarketplaceMapSearch
          categories={categories}
          initialCategoryId={selectedCategoryId}
          customerLocation={customerLocation}
          onCustomerLocationChange={setCustomerLocation}
          onSelectProviderToBook={(provider, preCat) =>
            setBookingModalTarget({ provider, preselectedCategoryId: preCat })
          }
          mapsAvailable={Boolean(mapsApiKey)}
        />
      );
    }

    if (activeView === 'onboarding') {
      if (!authState) {
        return (
          <div className="max-w-lg mx-auto px-4 py-16 text-center">
            <h2 className="font-display text-2xl font-bold text-navy-900">
              Sign in to Configure Your Account
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Authenticate securely to register as a Customer or Service Provider.
            </p>
            <button
              type="button"
              onClick={handleSignIn}
              className="mt-6 px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
            >
              Continue with Google Sign-In
            </button>
          </div>
        );
      }

      return (
        <OnboardingView
          authState={authState}
          categories={categories}
          initialMode={onboardingMode}
          onCompleted={async (targetRole) => {
            await refreshAuthProfile();
            setActiveView(targetRole);
          }}
        />
      );
    }

    if (activeView === 'customer') {
      if (!authState) {
        return (
          <div className="max-w-lg mx-auto px-4 py-16 text-center">
            <h2 className="font-display text-2xl font-bold text-navy-900">
              Sign in to View Your Bookings
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Your session has ended or you have not signed in yet. Sign in to manage bookings and payments.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleSignIn}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
              >
                Sign In with Google
              </button>
              <button
                type="button"
                onClick={() => setActiveView('explore')}
                className="px-5 py-2.5 text-sm font-semibold text-navy-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Browse Providers
              </button>
            </div>
          </div>
        );
      }
      return (
        <CustomerDashboard
          authState={authState}
          onRefreshAuth={refreshAuthProfile}
          onExploreServices={() => setActiveView('explore')}
          latestBookingEvent={latestBookingEvent}
          incomingMessage={incomingMessage}
        />
      );
    }

    if (activeView === 'provider') {
      if (!authState) {
        return (
          <div className="max-w-lg mx-auto px-4 py-16 text-center">
            <h2 className="font-display text-2xl font-bold text-navy-900">
              Sign in to Access Provider Hub
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Sign in with your JAMII CONNECT provider account to manage services, jobs, and earnings.
            </p>
            <button
              type="button"
              onClick={handleSignIn}
              className="mt-6 px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
            >
              Sign In with Google
            </button>
          </div>
        );
      }
      return (
        <ProviderDashboard
          authState={authState}
          categories={categories}
          onGoToOnboarding={() => {
            setOnboardingMode('provider');
            setActiveView('onboarding');
          }}
          latestBookingEvent={latestBookingEvent}
          incomingMessage={incomingMessage}
        />
      );
    }

    if (activeView === 'admin') {
      if (!authState || authState.user.role !== 'admin') {
        return (
          <div className="max-w-xl mx-auto px-4 py-16 text-center">
            <h2 className="font-display text-xl font-bold text-navy-900">
              Protected Administrator Console
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              Only authorized JAMII CONNECT administrators can access marketplace operations.
            </p>
          </div>
        );
      }
      return <AdminDashboard onCategoriesChanged={loadCategories} />;
    }

    return null;
  };

  const appContent = (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {quotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      <Navbar
        activeView={activeView}
        onNavigate={setActiveView}
        authState={authState}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        notifications={notifications}
        onMarkNotificationsRead={handleMarkNotificationsRead}
      />

      {authError && (
        <div className="max-w-[1440px] mx-auto w-full px-4 sm:px-8 pt-4">
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between">
            <span>{authError}</span>
            <button
              type="button"
              onClick={() => setAuthError('')}
              className="font-semibold underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">{renderMainContent()}</main>

      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <span aria-hidden="true">·</span>
            <span>Your Home. Your Services. One Connection.</span>
          </div>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setActiveView('explore')}
              className="hover:text-navy-900 cursor-pointer"
            >
              Explore Providers
            </button>
            <button
              type="button"
              onClick={() => handleOpenOnboarding('provider')}
              className="hover:text-navy-900 cursor-pointer"
            >
              Become a Provider
            </button>
            <span>© {new Date().getFullYear()} JAMII CONNECT Kenya</span>
          </div>
        </div>
      </footer>

      {bookingModalTarget && (
        <BookingFlowModal
          provider={bookingModalTarget.provider}
          preselectedCategoryId={bookingModalTarget.preselectedCategoryId}
          customerLocation={customerLocation}
          authState={authState}
          onRequireSignIn={handleSignIn}
          onClose={() => setBookingModalTarget(null)}
          onBookingCreated={() => {
            setBookingModalTarget(null);
            setActiveView(
              authState?.user.role === 'admin' ? 'customer' : 'customer'
            );
          }}
        />
      )}
    </div>
  );

  if (mapsApiKey) {
    return (
      <APIProvider
        apiKey={mapsApiKey}
        libraries={['marker', 'places']}
        language="en"
        region="KE"
      >
        {appContent}
      </APIProvider>
    );
  }

  return appContent;
}
