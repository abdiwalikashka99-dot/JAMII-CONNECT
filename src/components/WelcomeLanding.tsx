import React, { useState } from 'react';
import {
  ArrowRight,
  Cpu,
  Hammer,
  HardHat,
  MapPin,
  Paintbrush,
  ShieldCheck,
  Shirt,
  Sparkles,
  Trees,
  Truck,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react';
import { ServiceCategory } from '../types';
import heroHomeImg from '../assets/images/hero_home_services_1794677202313.jpg';
import plumbingElectricalImg from '../assets/images/service_plumbing_electrical_1794677203461.jpg';
import cleaningCareImg from '../assets/images/service_cleaning_care_1794677202150.jpg';
import carpentryPaintingImg from '../assets/images/service_carpentry_painting_1794677202856.jpg';

interface Props {
  categories: ServiceCategory[];
  onSelectCategory: (categoryId: number) => void;
  onExploreMap: () => void;
  onOpenOnboarding: (mode: 'customer' | 'provider') => void;
  isSignedIn: boolean;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  wrench: Wrench,
  zap: Zap,
  sparkles: Sparkles,
  shirt: Shirt,
  paintbrush: Paintbrush,
  hammer: Hammer,
  wind: Wind,
  cpu: Cpu,
  trees: Trees,
  'shield-check': ShieldCheck,
  truck: Truck,
  'hard-hat': HardHat,
};

function ImageWithFallback({
  src,
  alt,
  className,
  fallbackTitle,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`bg-gradient-to-br from-navy-900 to-teal-700 flex flex-col items-center justify-center p-6 text-white ${className}`}
      >
        <ShieldCheck className="w-8 h-8 text-teal-300 mb-2" />
        <span className="font-display text-sm font-semibold text-center">
          {fallbackTitle}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export const WelcomeLanding: React.FC<Props> = ({
  categories,
  onSelectCategory,
  onExploreMap,
  onOpenOnboarding,
}) => {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-slate-50/70">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between py-2">
              <div>
                <p className="text-xs font-medium text-teal-700 tracking-wide mb-4">
                  Kenya Home Services Marketplace · Nairobi &amp; Beyond
                </p>
                <h1 className="font-display text-4xl sm:text-5xl font-extrabold text-navy-900 tracking-tight leading-[1.08] text-balance">
                  Your Home. Your Services. One Connection.
                </h1>
                <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  Book verified Kenyan plumbers, electricians, cleaners, carpenters, and home specialists with upfront KSh pricing, live distance tracking, and M-Pesa-ready checkout.
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onExploreMap}
                  className="px-6 py-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Find Nearby Providers</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenOnboarding('provider')}
                  className="px-5 py-3 text-sm font-semibold text-navy-900 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Register as a Provider
                </button>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-72 sm:h-96 lg:h-full min-h-[340px] rounded-xl overflow-hidden border border-slate-200 bg-navy-900">
                <ImageWithFallback
                  src={heroHomeImg}
                  alt="Verified JAMII CONNECT home services specialist arriving at a Nairobi residence"
                  fallbackTitle="JAMII CONNECT Verified Technicians"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-950/90 via-navy-950/50 to-transparent p-6 text-white">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-200">
                    <span>National ID &amp; Trade Vetted</span>
                    <span aria-hidden="true">·</span>
                    <span>Kilimani, Westlands, Karen &amp; Nairobi Metro</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 4-column marketplace guarantees strip */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-slate-200 rounded-xl bg-white divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
            <div className="p-5">
              <p className="font-mono text-2xl font-bold text-navy-900 tabular-nums">12+</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">Home Service Categories</p>
              <p className="text-xs text-slate-600 mt-0.5">From emergency plumbing to full renovations</p>
            </div>
            <div className="p-5">
              <p className="font-mono text-2xl font-bold text-teal-700 tabular-nums">85%</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">Direct to Service Providers</p>
              <p className="text-xs text-slate-600 mt-0.5">Transparent 15% platform commission model</p>
            </div>
            <div className="p-5">
              <p className="font-mono text-2xl font-bold text-navy-900 tabular-nums">100%</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">ID-Verified Professionals</p>
              <p className="text-xs text-slate-600 mt-0.5">Admin-reviewed documents before listing</p>
            </div>
            <div className="p-5">
              <p className="font-mono text-2xl font-bold text-navy-900 tabular-nums">Live</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">Map Distance &amp; Status Sync</p>
              <p className="text-xs text-slate-600 mt-0.5">Real-time chat and dispatch tracking</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Craftsmanship Showcase */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14 border-b border-slate-200">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-navy-900 tracking-tight">
              01. Core Residential Specialties
            </h2>
            <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
              Every service listing displays verified neighborhood coverage, upfront KSh pricing, and real customer ratings.
            </p>
          </div>
          <button
            type="button"
            onClick={onExploreMap}
            className="text-sm font-semibold text-teal-700 hover:text-teal-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Open Interactive Map</span>
            <MapPin className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <article className="border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col">
            <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
              <ImageWithFallback
                src={plumbingElectricalImg}
                alt="Plumbing and electrical home diagnostics"
                fallbackTitle="Plumbing & Electrical"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-500">
                  Plumbing · Electrical · Appliances
                </p>
                <h3 className="font-display text-lg font-bold text-navy-900 mt-1">
                  Licensed Technical Repairs
                </h3>
                <p className="text-sm text-slate-600 mt-1.5">
                  Leak detection, breaker diagnostics, inverter backups, and split-unit AC servicing.
                </p>
              </div>
              <p className="mt-4 pt-3 border-t border-slate-100 text-xs font-mono text-slate-700 tabular-nums">
                From KSh 2,000 per visit
              </p>
            </div>
          </article>

          <article className="border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col">
            <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
              <ImageWithFallback
                src={cleaningCareImg}
                alt="Residential deep cleaning and laundry service"
                fallbackTitle="Cleaning & Laundry"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-500">
                  House Cleaning · Laundry · Pest Control
                </p>
                <h3 className="font-display text-lg font-bold text-navy-900 mt-1">
                  Home Hygiene &amp; Care
                </h3>
                <p className="text-sm text-slate-600 mt-1.5">
                  Post-tenancy sanitization, duvet laundry pickup, and NEMA-certified fumigation.
                </p>
              </div>
              <p className="mt-4 pt-3 border-t border-slate-100 text-xs font-mono text-slate-700 tabular-nums">
                From KSh 1,800 per session
              </p>
            </div>
          </article>

          <article className="border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col">
            <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
              <ImageWithFallback
                src={carpentryPaintingImg}
                alt="Custom carpentry and residential painting craftsmanship"
                fallbackTitle="Carpentry & Renovations"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <p className="text-xs text-slate-500">
                  Carpentry · Painting · Maintenance
                </p>
                <h3 className="font-display text-lg font-bold text-navy-900 mt-1">
                  Timber, Paint &amp; Renovations
                </h3>
                <p className="text-sm text-slate-600 mt-1.5">
                  Cabinetry, door alignment, interior painting, tiling, gardening, and home moves.
                </p>
              </div>
              <p className="mt-4 pt-3 border-t border-slate-100 text-xs font-mono text-slate-700 tabular-nums">
                From KSh 2,800 per job
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* All 12+ Service Categories */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14 border-b border-slate-200">
        <div className="mb-8">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-navy-900 tracking-tight">
            02. Browse All Service Categories
          </h2>
          <p className="text-sm text-slate-600 mt-1.5">
            Select any category to inspect verified providers near your location on the map.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.iconKey] || Wrench;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.id)}
                className="text-left p-5 bg-white border border-slate-200 hover:border-teal-600 rounded-xl transition-colors group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Icon className="w-5 h-5 text-teal-600" />
                    <span className="text-xs font-mono text-slate-500 tabular-nums">
                      {cat.serviceCount ?? 0} listings
                    </span>
                  </div>
                  <h3 className="font-display text-base font-bold text-navy-900 group-hover:text-teal-700 transition-colors">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                    {cat.description}
                  </p>
                </div>
                <span className="mt-4 text-xs font-semibold text-navy-900 group-hover:text-teal-700 inline-flex items-center gap-1">
                  <span>View Providers</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Transparent Commission & Dual Onboarding Section */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8 py-14">
        <div className="bg-navy-900 text-white rounded-2xl p-8 sm:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7">
            <p className="text-xs font-medium text-teal-300 mb-2">
              Fair Kenyan Marketplace Economics
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
              Transparent 85% / 15% Split on Every Completed Booking
            </h2>
            <p className="text-sm text-slate-300 mt-3 max-w-2xl leading-relaxed">
              For a standard KSh 2,000 service call, KSh 1,700 goes directly to the verified technician and KSh 300 funds platform trust, verification, real-time tracking, and payment operations.
            </p>
          </div>
          <div className="lg:col-span-5 flex flex-wrap gap-3 lg:justify-end">
            <button
              type="button"
              onClick={() => onOpenOnboarding('customer')}
              className="px-5 py-3 text-sm font-semibold text-navy-950 bg-white hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Join as Customer
            </button>
            <button
              type="button"
              onClick={() => onOpenOnboarding('provider')}
              className="px-5 py-3 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Apply as Provider
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
