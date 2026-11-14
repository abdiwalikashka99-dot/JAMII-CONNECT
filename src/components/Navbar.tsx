import React, { useState } from 'react';
import { Bell, Menu, X } from 'lucide-react';
import { AppNotification, AuthStateResponse } from '../types';
import { BrandLogo } from './BrandLogo';

export type ActiveView =
  | 'welcome'
  | 'explore'
  | 'customer'
  | 'provider'
  | 'admin'
  | 'onboarding';

interface NavbarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  authState: AuthStateResponse | null;
  onSignIn: () => void;
  onSignOut: () => void;
  notifications: AppNotification[];
  onMarkNotificationsRead: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onNavigate,
  authState,
  onSignIn,
  onSignOut,
  notifications,
  onMarkNotificationsRead,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const user = authState?.user;

  const dashboardView: ActiveView =
    user?.role === 'admin'
      ? 'admin'
      : user?.role === 'provider'
      ? 'provider'
      : 'customer';

  const dashboardLabel =
    user?.role === 'admin'
      ? 'Admin Console'
      : user?.role === 'provider'
      ? 'Provider Hub'
      : 'My Bookings';

  const navLinkClass = (isActive: boolean) =>
    `text-sm font-medium transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b-2 cursor-pointer ${
      isActive
        ? 'text-navy-900 border-teal-600'
        : 'text-slate-600 border-transparent hover:text-navy-900 hover:border-slate-300'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand mark with uploaded JAMII CONNECT logo */}
        <button
          type="button"
          onClick={() => onNavigate('welcome')}
          className="whitespace-nowrap shrink-0 cursor-pointer flex items-center"
        >
          <BrandLogo size="md" />
        </button>

        {/* Zone 2: 4 clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7">
          <button
            type="button"
            onClick={() => onNavigate('welcome')}
            className={navLinkClass(activeView === 'welcome')}
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => onNavigate('explore')}
            className={navLinkClass(activeView === 'explore')}
          >
            Find Services
          </button>
          {user && (
            <button
              type="button"
              onClick={() => onNavigate(dashboardView)}
              className={navLinkClass(activeView === dashboardView)}
            >
              {dashboardLabel}
            </button>
          )}
          {user && (
            <button
              type="button"
              onClick={() => onNavigate('onboarding')}
              className={navLinkClass(activeView === 'onboarding')}
            >
              Account Setup
            </button>
          )}
        </nav>

        {/* Zone 3: 1 primary action (plus notification bell only when signed in & mobile menu toggle) */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotifOpen((o) => !o);
                    if (unreadCount > 0) onMarkNotificationsRead();
                  }}
                  aria-label="Notifications"
                  className="relative p-2 text-slate-600 hover:text-navy-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-teal-600 text-white text-[10px] font-mono font-semibold rounded-full flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-50">
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-navy-900">
                        Notifications
                      </span>
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Close
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <p className="px-4 py-6 text-xs text-slate-500 text-center">
                          No notifications yet.
                        </p>
                      ) : (
                        notifications.map((n) => (
                          <div key={n.id} className="px-4 py-3 hover:bg-slate-50">
                            <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                            <p className="text-xs text-slate-600 mt-0.5">{n.body}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onSignOut}
                className="hidden md:inline-flex px-4 py-2 text-xs font-semibold text-white bg-navy-900 hover:bg-navy-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign Out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle Menu"
            className="md:hidden p-2 text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2">
          <button
            type="button"
            onClick={() => {
              onNavigate('welcome');
              setMobileOpen(false);
            }}
            className="block w-full text-left py-2 text-sm font-medium text-slate-800"
          >
            Home
          </button>
          <button
            type="button"
            onClick={() => {
              onNavigate('explore');
              setMobileOpen(false);
            }}
            className="block w-full text-left py-2 text-sm font-medium text-slate-800"
          >
            Find Services
          </button>
          {user && (
            <>
              <button
                type="button"
                onClick={() => {
                  onNavigate(dashboardView);
                  setMobileOpen(false);
                }}
                className="block w-full text-left py-2 text-sm font-medium text-slate-800"
              >
                {dashboardLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigate('onboarding');
                  setMobileOpen(false);
                }}
                className="block w-full text-left py-2 text-sm font-medium text-slate-800"
              >
                Account Setup
              </button>
              <button
                type="button"
                onClick={() => {
                  onSignOut();
                  setMobileOpen(false);
                }}
                className="block w-full text-left py-2 text-sm font-semibold text-rose-600"
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
};
