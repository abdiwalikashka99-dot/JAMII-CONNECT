import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  phone: text('phone').notNull().default(''),
  role: text('role').notNull().default('customer'), // 'customer' | 'provider' | 'admin'
  status: text('status').notNull().default('active'), // 'active' | 'suspended'
  avatarFileId: integer('avatar_file_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const customerProfiles = pgTable('customer_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull()
    .unique(),
  defaultAddress: text('default_address').notNull().default('Kilimani, Nairobi'),
  city: text('city').notNull().default('Nairobi'),
  lat: doublePrecision('lat').notNull().default(-1.2921),
  lng: doublePrecision('lng').notNull().default(36.7825),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const providerProfiles = pgTable('provider_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull()
    .unique(),
  businessName: text('business_name').notNull(),
  bio: text('bio').notNull().default(''),
  serviceLocations: text('service_locations').notNull(),
  baseAddress: text('base_address').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  yearsExperience: integer('years_experience').notNull().default(2),
  verificationStatus: text('verification_status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
  idNumber: text('id_number').notNull().default(''),
  idDocumentFileId: integer('id_document_file_id'),
  profilePhotoFileId: integer('profile_photo_file_id'),
  verificationNotes: text('verification_notes').notNull().default(''),
  averageRating: doublePrecision('average_rating').notNull().default(5.0),
  totalReviews: integer('total_reviews').notNull().default(0),
  completedJobs: integer('completed_jobs').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const uploadedFiles = pgTable('uploaded_files', {
  id: serial('id').primaryKey(),
  ownerUid: text('owner_uid').notNull(),
  purpose: text('purpose').notNull(), // 'profile_photo' | 'id_document'
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  dataBase64: text('data_base64').notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const serviceCategories = pgTable('service_categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),
  iconKey: text('icon_key').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const services = pgTable('services', {
  id: serial('id').primaryKey(),
  providerId: integer('provider_id')
    .references(() => providerProfiles.id)
    .notNull(),
  categoryId: integer('category_id')
    .references(() => serviceCategories.id)
    .notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priceKsh: integer('price_ksh').notNull(),
  unitLabel: text('unit_label').notNull().default('per visit'),
  isActive: boolean('is_active').notNull().default(true),
});

export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  bookingCode: text('booking_code').notNull().unique(),
  customerId: integer('customer_id')
    .references(() => users.id)
    .notNull(),
  providerId: integer('provider_id')
    .references(() => providerProfiles.id)
    .notNull(),
  serviceId: integer('service_id')
    .references(() => services.id)
    .notNull(),
  categoryId: integer('category_id')
    .references(() => serviceCategories.id)
    .notNull(),
  status: text('status').notNull().default('Pending'),
  scheduledDate: text('scheduled_date').notNull(),
  scheduledTime: text('scheduled_time').notNull(),
  customerAddress: text('customer_address').notNull(),
  customerLat: doublePrecision('customer_lat').notNull(),
  customerLng: doublePrecision('customer_lng').notNull(),
  distanceKm: doublePrecision('distance_km').notNull().default(0),
  notes: text('notes').notNull().default(''),
  totalAmountKsh: integer('total_amount_ksh').notNull(),
  commissionKsh: integer('commission_ksh').notNull(),
  providerEarningsKsh: integer('provider_earnings_ksh').notNull(),
  customerConfirmedCompletion: boolean('customer_confirmed_completion').notNull().default(false),
  cancellationReason: text('cancellation_reason').notNull().default(''),
  disputeStatus: text('dispute_status').notNull().default('none'), // 'none' | 'open' | 'resolved'
  disputeNotes: text('dispute_notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .references(() => bookings.id)
    .notNull(),
  customerId: integer('customer_id')
    .references(() => users.id)
    .notNull(),
  method: text('method').notNull(), // 'mpesa_stk' | 'card'
  status: text('status').notNull().default('awaiting_gateway'), // 'awaiting_gateway' | 'pending_stk' | 'confirmed' | 'failed'
  amountKsh: integer('amount_ksh').notNull(),
  mpesaPhone: text('mpesa_phone').notNull().default(''),
  checkoutRequestId: text('checkout_request_id').notNull().default(''),
  merchantRequestId: text('merchant_request_id').notNull().default(''),
  mpesaReceiptNumber: text('mpesa_receipt_number').notNull().default(''),
  cardLast4: text('card_last4').notNull().default(''),
  gatewayReference: text('gateway_reference').notNull(),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const providerEarnings = pgTable('provider_earnings', {
  id: serial('id').primaryKey(),
  providerId: integer('provider_id')
    .references(() => providerProfiles.id)
    .notNull(),
  bookingId: integer('booking_id')
    .references(() => bookings.id)
    .notNull()
    .unique(),
  grossAmountKsh: integer('gross_amount_ksh').notNull(),
  commissionKsh: integer('commission_ksh').notNull(),
  netEarningsKsh: integer('net_earnings_ksh').notNull(),
  payoutStatus: text('payout_status').notNull().default('pending'), // 'pending' | 'settled'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const commissionTransactions = pgTable('commission_transactions', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .references(() => bookings.id)
    .notNull()
    .unique(),
  grossAmountKsh: integer('gross_amount_ksh').notNull(),
  commissionRate: doublePrecision('commission_rate').notNull().default(0.15),
  commissionAmountKsh: integer('commission_amount_ksh').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .references(() => bookings.id)
    .notNull()
    .unique(),
  customerId: integer('customer_id')
    .references(() => users.id)
    .notNull(),
  providerId: integer('provider_id')
    .references(() => providerProfiles.id)
    .notNull(),
  rating: integer('rating').notNull(),
  comment: text('comment').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .references(() => bookings.id)
    .notNull(),
  senderUserId: integer('sender_user_id')
    .references(() => users.id)
    .notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  bookingId: integer('booking_id'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  customerProfile: one(customerProfiles, {
    fields: [users.id],
    references: [customerProfiles.userId],
  }),
  providerProfile: one(providerProfiles, {
    fields: [users.id],
    references: [providerProfiles.userId],
  }),
  bookings: many(bookings),
  notifications: many(notifications),
}));

export const providerProfilesRelations = relations(providerProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [providerProfiles.userId],
    references: [users.id],
  }),
  services: many(services),
  bookings: many(bookings),
  reviews: many(reviews),
  earnings: many(providerEarnings),
}));
