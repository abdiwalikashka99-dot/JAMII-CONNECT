export type UserRole = 'customer' | 'provider' | 'admin';

export type BookingStatus =
  | 'Pending'
  | 'Accepted'
  | 'Rejected'
  | 'Provider on the way'
  | 'In progress'
  | 'Completed'
  | 'Cancelled';

export interface AppUser {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  status: 'active' | 'suspended';
  avatarFileId: number | null;
  createdAt: string;
}

export interface CustomerProfile {
  id: number;
  userId: number;
  defaultAddress: string;
  city: string;
  lat: number;
  lng: number;
}

export interface ProviderProfile {
  id: number;
  userId: number;
  businessName: string;
  bio: string;
  serviceLocations: string;
  baseAddress: string;
  lat: number;
  lng: number;
  yearsExperience: number;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  idNumber: string;
  idDocumentFileId: number | null;
  profilePhotoFileId: number | null;
  verificationNotes: string;
  averageRating: number;
  totalReviews: number;
  completedJobs: number;
}

export interface ServiceCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  iconKey: string;
  isActive: boolean;
  sortOrder: number;
  serviceCount?: number;
}

export interface ProviderServiceItem {
  id: number;
  providerId: number;
  categoryId: number;
  categoryName: string;
  title: string;
  description: string;
  priceKsh: number;
  unitLabel: string;
  isActive: boolean;
}

export interface ProviderReviewItem {
  id: number;
  bookingId: number;
  rating: number;
  comment: string;
  customerName: string;
  createdAt: string;
}

export interface PublicProvider extends ProviderProfile {
  fullName: string;
  phone: string;
  profilePhotoUrl: string | null;
  distanceKm: number;
  services: ProviderServiceItem[];
  reviews: ProviderReviewItem[];
}

export interface PaymentRecord {
  id: number;
  bookingId: number;
  method: 'mpesa_stk' | 'card';
  status: 'awaiting_gateway' | 'pending_stk' | 'confirmed' | 'failed';
  amountKsh: number;
  mpesaPhone: string;
  mpesaReceiptNumber: string;
  cardLast4: string;
  gatewayReference: string;
  notes: string;
  createdAt: string;
}

export interface BookingItem {
  id: number;
  bookingCode: string;
  customerId: number;
  providerId: number;
  serviceId: number;
  categoryId: number;
  status: BookingStatus;
  scheduledDate: string;
  scheduledTime: string;
  customerAddress: string;
  customerLat: number;
  customerLng: number;
  distanceKm: number;
  notes: string;
  totalAmountKsh: number;
  commissionKsh: number;
  providerEarningsKsh: number;
  customerConfirmedCompletion: boolean;
  cancellationReason: string;
  disputeStatus: 'none' | 'open' | 'resolved';
  disputeNotes: string;
  createdAt: string;
  serviceTitle: string;
  unitLabel?: string;
  categoryName: string;
  providerBusinessName?: string;
  providerPhone?: string;
  providerLat?: number;
  providerLng?: number;
  customerName?: string;
  customerPhone?: string;
  payments?: PaymentRecord[];
  review?: { id: number; rating: number; comment: string } | null;
}

export interface ChatMessage {
  id: number;
  bookingId: number;
  senderUserId: number;
  senderName: string;
  senderRole: string;
  body: string;
  createdAt: string;
}

export interface AppNotification {
  id: number;
  userId: number;
  title: string;
  body: string;
  bookingId: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuthStateResponse {
  user: AppUser;
  isPlatformOwner: boolean;
  customerProfile: CustomerProfile | null;
  providerProfile: ProviderProfile | null;
  unreadNotifications: number;
}
