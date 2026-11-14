export const PLATFORM_COMMISSION_RATE = 0.15;

export function calculateCommissionBreakdown(totalAmountKsh: number) {
  const gross = Math.max(0, Math.round(totalAmountKsh));
  const commissionKsh = Math.round(gross * PLATFORM_COMMISSION_RATE);
  const providerEarningsKsh = gross - commissionKsh;
  return {
    grossAmountKsh: gross,
    commissionRate: PLATFORM_COMMISSION_RATE,
    commissionKsh,
    providerEarningsKsh,
  };
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export function normalizeKenyanPhone(phone: string): string | null {
  const digits = phone.replace(/[\s\-+()]/g, '');
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

export function formatKsh(amount: number): string {
  return `KSh ${Math.round(amount).toLocaleString('en-KE')}`;
}
