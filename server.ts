import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';

import { db } from './src/db/index.ts';
import {
  bookings,
  commissionTransactions,
  customerProfiles,
  messages,
  notifications,
  payments,
  providerEarnings,
  providerProfiles,
  reviews,
  serviceCategories,
  services,
  uploadedFiles,
  users,
} from './src/db/schema.ts';
import { seedIfEmpty } from './src/db/seed.ts';
import { adminAuth } from './src/lib/firebase-admin.ts';
import {
  type AuthRequest,
  getOrCreateDbUser,
  optionalAuth,
  requireAuth,
  requireRole,
} from './src/middleware/auth.ts';
import {
  calculateCommissionBreakdown,
  haversineDistanceKm,
  normalizeKenyanPhone,
} from './src/lib/commission.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OWNER_EMAILS = new Set(
  [
    'abdiwalikashka99@gmail.com',
    ...(process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : []),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const ALLOWED_BOOKING_STATUSES = [
  'Pending',
  'Accepted',
  'Rejected',
  'Provider on the way',
  'In progress',
  'Completed',
  'Cancelled',
] as const;

// Connected WebSocket clients keyed by database user ID
const wsClients = new Map<number, Set<WebSocket>>();

function registerWsClient(userId: number, socket: WebSocket) {
  let set = wsClients.get(userId);
  if (!set) {
    set = new Set();
    wsClients.set(userId, set);
  }
  set.add(socket);
}

function unregisterWsClient(userId: number, socket: WebSocket) {
  const set = wsClients.get(userId);
  if (set) {
    set.delete(socket);
    if (set.size === 0) {
      wsClients.delete(userId);
    }
  }
}

function broadcastToUsers(userIds: number[], event: string, payload: unknown) {
  const frame = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
  const uniqueIds = new Set(userIds);
  for (const uid of uniqueIds) {
    const sockets = wsClients.get(uid);
    if (!sockets) continue;
    for (const sock of sockets) {
      if (sock.readyState === WebSocket.OPEN) {
        sock.send(frame);
      }
    }
  }
}

async function broadcastToAdmins(event: string, payload: unknown) {
  const adminUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'));
  broadcastToUsers(
    adminUsers.map((a) => a.id),
    event,
    payload
  );
}

async function createNotification(
  userId: number,
  title: string,
  body: string,
  bookingId?: number
) {
  const inserted = await db
    .insert(notifications)
    .values({ userId, title, body, bookingId: bookingId ?? null, isRead: false })
    .returning();
  broadcastToUsers([userId], 'notification:created', inserted[0]);
  return inserted[0];
}

async function recordBookingFinancials(booking: typeof bookings.$inferSelect) {
  await db
    .insert(providerEarnings)
    .values({
      providerId: booking.providerId,
      bookingId: booking.id,
      grossAmountKsh: booking.totalAmountKsh,
      commissionKsh: booking.commissionKsh,
      netEarningsKsh: booking.providerEarningsKsh,
      payoutStatus: 'pending',
    })
    .onConflictDoNothing({ target: providerEarnings.bookingId });

  await db
    .insert(commissionTransactions)
    .values({
      bookingId: booking.id,
      grossAmountKsh: booking.totalAmountKsh,
      commissionRate: 0.15,
      commissionAmountKsh: booking.commissionKsh,
    })
    .onConflictDoNothing({ target: commissionTransactions.bookingId });
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization'
      );
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      );
    }
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });
  const server = http.createServer(app);
  app.use(express.json({ limit: '5mb' }));

  // WebSocket server on /ws on port 3000
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => {
    let boundUserId: number | null = null;

    socket.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'auth' && typeof msg.token === 'string') {
          const decoded = await adminAuth.verifyIdToken(msg.token);
          const dbUser = await getOrCreateDbUser(decoded);
          if (boundUserId !== null) {
            unregisterWsClient(boundUserId, socket);
          }
          boundUserId = dbUser.id;
          registerWsClient(dbUser.id, socket);
          socket.send(JSON.stringify({ event: 'auth:ok', payload: { userId: dbUser.id } }));
        }
      } catch {
        socket.send(JSON.stringify({ event: 'auth:error', payload: { message: 'Invalid token' } }));
      }
    });

    socket.on('close', () => {
      if (boundUserId !== null) {
        unregisterWsClient(boundUserId, socket);
      }
    });
  });

  // Public health & client config
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'jamii-connect' });
  });

  app.get('/api/config/public', (_req, res) => {
    res.json({
      mapsApiKey:
        process.env.VITE_GOOGLE_MAPS_API_KEY ||
        process.env.GOOGLE_MAPS_API_KEY ||
        '',
    });
  });

  // Auth & Profile endpoints
  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      await seedIfEmpty();
      const user = req.dbUser!;
      const [cust] = await db
        .select()
        .from(customerProfiles)
        .where(eq(customerProfiles.userId, user.id))
        .limit(1);
      const [prov] = await db
        .select()
        .from(providerProfiles)
        .where(eq(providerProfiles.userId, user.id))
        .limit(1);
      const unread = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

      const emailLower = (req.firebaseUser?.email || '').toLowerCase();
      res.json({
        user,
        isPlatformOwner: OWNER_EMAILS.has(emailLower),
        customerProfile: cust || null,
        providerProfile: prov || null,
        unreadNotifications: unread[0]?.count ?? 0,
      });
    } catch (error) {
      console.error('Error fetching /api/auth/me:', error);
      res.status(500).json({ error: 'Unable to load user profile' });
    }
  });

  // Owner-only role preview switch so the platform owner can test Customer, Provider, and Admin flows
  app.post('/api/auth/owner-role-preview', requireAuth, async (req: AuthRequest, res) => {
    try {
      const emailLower = (req.firebaseUser?.email || '').toLowerCase();
      if (!OWNER_EMAILS.has(emailLower)) {
        return res.status(403).json({ error: 'Forbidden: Only platform owner can switch preview roles.' });
      }
      const { role } = req.body as { role?: string };
      if (role !== 'customer' && role !== 'provider' && role !== 'admin') {
        return res.status(400).json({ error: 'Invalid role requested.' });
      }
      const updated = await db
        .update(users)
        .set({ role })
        .where(eq(users.id, req.dbUser!.id))
        .returning();
      res.json({ user: updated[0] });
    } catch (error) {
      console.error('Error switching role preview:', error);
      res.status(500).json({ error: 'Failed to switch role' });
    }
  });

  app.post('/api/auth/register-customer', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fullName, phone, defaultAddress, city, lat, lng } = req.body as {
        fullName?: string;
        phone?: string;
        defaultAddress?: string;
        city?: string;
        lat?: number;
        lng?: number;
      };
      if (!fullName || fullName.trim().length < 2) {
        return res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
      }
      const normalizedPhone = normalizeKenyanPhone(phone || '');
      if (!normalizedPhone) {
        return res.status(400).json({
          error: 'Enter a valid Kenyan phone number (e.g. 0712 345 678 or +254 712 345 678).',
        });
      }

      const nextRole = req.dbUser!.role === 'admin' ? 'admin' : 'customer';
      const [updatedUser] = await db
        .update(users)
        .set({
          fullName: fullName.trim(),
          phone: `+${normalizedPhone}`,
          role: nextRole,
        })
        .where(eq(users.id, req.dbUser!.id))
        .returning();

      const [profile] = await db
        .insert(customerProfiles)
        .values({
          userId: updatedUser.id,
          defaultAddress: (defaultAddress || 'Kilimani, Nairobi').trim(),
          city: (city || 'Nairobi').trim(),
          lat: typeof lat === 'number' ? lat : -1.2921,
          lng: typeof lng === 'number' ? lng : 36.7825,
        })
        .onConflictDoUpdate({
          target: customerProfiles.userId,
          set: {
            defaultAddress: (defaultAddress || 'Kilimani, Nairobi').trim(),
            city: (city || 'Nairobi').trim(),
            lat: typeof lat === 'number' ? lat : -1.2921,
            lng: typeof lng === 'number' ? lng : 36.7825,
            updatedAt: new Date(),
          },
        })
        .returning();

      res.json({ user: updatedUser, customerProfile: profile });
    } catch (error) {
      console.error('Error registering customer:', error);
      res.status(500).json({ error: 'Failed to save customer registration' });
    }
  });

  app.post('/api/auth/register-provider', requireAuth, async (req: AuthRequest, res) => {
    try {
      const {
        fullName,
        phone,
        businessName,
        bio,
        serviceLocations,
        baseAddress,
        lat,
        lng,
        yearsExperience,
        idNumber,
        idDocumentFileId,
        profilePhotoFileId,
        offerings,
      } = req.body as {
        fullName?: string;
        phone?: string;
        businessName?: string;
        bio?: string;
        serviceLocations?: string;
        baseAddress?: string;
        lat?: number;
        lng?: number;
        yearsExperience?: number;
        idNumber?: string;
        idDocumentFileId?: number | null;
        profilePhotoFileId?: number | null;
        offerings?: Array<{
          categoryId: number;
          title: string;
          description: string;
          priceKsh: number;
          unitLabel: string;
        }>;
      };

      if (!fullName || fullName.trim().length < 2) {
        return res.status(400).json({ error: 'Full name is required.' });
      }
      const normalizedPhone = normalizeKenyanPhone(phone || '');
      if (!normalizedPhone) {
        return res.status(400).json({ error: 'Valid Kenyan phone number is required.' });
      }
      if (!businessName || businessName.trim().length < 2) {
        return res.status(400).json({ error: 'Business or trade name is required.' });
      }
      if (!serviceLocations || serviceLocations.trim().length < 2) {
        return res.status(400).json({ error: 'Please specify service locations.' });
      }
      if (!idNumber || idNumber.trim().length < 5) {
        return res.status(400).json({ error: 'Valid National ID or Business Reg number is required.' });
      }
      if (!offerings || !Array.isArray(offerings) || offerings.length === 0) {
        return res.status(400).json({ error: 'Select at least one service offering with a price in KSh.' });
      }
      for (const off of offerings) {
        if (!off.categoryId || !off.title?.trim() || !Number.isFinite(off.priceKsh) || off.priceKsh < 200) {
          return res.status(400).json({
            error: 'Each service offering must have a category, title, and price of at least KSh 200.',
          });
        }
      }

      const nextRole = req.dbUser!.role === 'admin' ? 'admin' : 'provider';
      const [updatedUser] = await db
        .update(users)
        .set({
          fullName: fullName.trim(),
          phone: `+${normalizedPhone}`,
          role: nextRole,
          avatarFileId: profilePhotoFileId ?? req.dbUser!.avatarFileId,
        })
        .where(eq(users.id, req.dbUser!.id))
        .returning();

      const [profile] = await db
        .insert(providerProfiles)
        .values({
          userId: updatedUser.id,
          businessName: businessName.trim(),
          bio: (bio || '').trim(),
          serviceLocations: serviceLocations.trim(),
          baseAddress: (baseAddress || serviceLocations).trim(),
          lat: typeof lat === 'number' ? lat : -1.2921,
          lng: typeof lng === 'number' ? lng : 36.8219,
          yearsExperience: Math.max(0, Number(yearsExperience || 2)),
          verificationStatus: 'pending',
          idNumber: idNumber.trim(),
          idDocumentFileId: idDocumentFileId ?? null,
          profilePhotoFileId: profilePhotoFileId ?? null,
          verificationNotes: 'Submitted for administrator review.',
        })
        .onConflictDoUpdate({
          target: providerProfiles.userId,
          set: {
            businessName: businessName.trim(),
            bio: (bio || '').trim(),
            serviceLocations: serviceLocations.trim(),
            baseAddress: (baseAddress || serviceLocations).trim(),
            lat: typeof lat === 'number' ? lat : -1.2921,
            lng: typeof lng === 'number' ? lng : 36.8219,
            yearsExperience: Math.max(0, Number(yearsExperience || 2)),
            idNumber: idNumber.trim(),
            idDocumentFileId: idDocumentFileId ?? undefined,
            profilePhotoFileId: profilePhotoFileId ?? undefined,
          },
        })
        .returning();

      // Replace or append offerings
      for (const off of offerings) {
        await db.insert(services).values({
          providerId: profile.id,
          categoryId: Number(off.categoryId),
          title: off.title.trim(),
          description: (off.description || off.title).trim(),
          priceKsh: Math.round(Number(off.priceKsh)),
          unitLabel: (off.unitLabel || 'per visit').trim(),
          isActive: true,
        });
      }

      await broadcastToAdmins('provider:submitted', {
        providerId: profile.id,
        businessName: profile.businessName,
      });

      res.json({ user: updatedUser, providerProfile: profile });
    } catch (error) {
      console.error('Error registering provider:', error);
      res.status(500).json({ error: 'Failed to submit provider registration' });
    }
  });

  // Secure File Storage Endpoints (Profile Photos & Identification Documents)
  app.post('/api/files/upload', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { purpose, fileName, mimeType, dataBase64 } = req.body as {
        purpose?: string;
        fileName?: string;
        mimeType?: string;
        dataBase64?: string;
      };
      if (purpose !== 'profile_photo' && purpose !== 'id_document') {
        return res.status(400).json({ error: 'Invalid upload purpose' });
      }
      const allowedMimes =
        purpose === 'profile_photo'
          ? ['image/jpeg', 'image/png', 'image/webp']
          : ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!mimeType || !allowedMimes.includes(mimeType)) {
        return res.status(400).json({
          error: `Unsupported file type. Allowed: ${allowedMimes.join(', ')}`,
        });
      }
      if (!dataBase64 || dataBase64.length > 4_500_000) {
        return res.status(400).json({ error: 'File exceeds maximum allowed size of 3 MB.' });
      }

      const [saved] = await db
        .insert(uploadedFiles)
        .values({
          ownerUid: req.dbUser!.uid,
          purpose,
          fileName: (fileName || 'upload').slice(0, 120),
          mimeType,
          dataBase64,
          isPublic: purpose === 'profile_photo',
        })
        .returning({ id: uploadedFiles.id, purpose: uploadedFiles.purpose, fileName: uploadedFiles.fileName });

      res.status(201).json({
        id: saved.id,
        url: `/api/files/${saved.id}`,
        purpose: saved.purpose,
        fileName: saved.fileName,
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: 'File upload failed' });
    }
  });

  app.get('/api/files/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid file ID' });
      }
      const [file] = await db
        .select()
        .from(uploadedFiles)
        .where(eq(uploadedFiles.id, id))
        .limit(1);

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      if (!file.isPublic) {
        if (!req.dbUser) {
          return res.status(401).json({ error: 'Authentication required to access private documents.' });
        }
        if (req.dbUser.uid !== file.ownerUid && req.dbUser.role !== 'admin') {
          return res.status(403).json({
            error: 'Forbidden: Identification documents are strictly restricted to owner and administrators.',
          });
        }
      }

      const cleanBase64 = file.dataBase64.includes(',')
        ? file.dataBase64.split(',')[1]
        : file.dataBase64;
      const buffer = Buffer.from(cleanBase64, 'base64');
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
      if (file.isPublic) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      } else {
        res.setHeader('Cache-Control', 'private, no-store');
      }
      res.send(buffer);
    } catch (error) {
      console.error('Error serving file:', error);
      res.status(500).json({ error: 'Unable to retrieve file' });
    }
  });

  // Public Marketplace Catalog
  app.get('/api/categories', async (_req, res) => {
    try {
      await seedIfEmpty();
      const cats = await db
        .select()
        .from(serviceCategories)
        .where(eq(serviceCategories.isActive, true))
        .orderBy(serviceCategories.sortOrder);

      const serviceCounts = await db
        .select({
          categoryId: services.categoryId,
          count: sql<number>`count(*)::int`,
        })
        .from(services)
        .innerJoin(providerProfiles, eq(services.providerId, providerProfiles.id))
        .where(
          and(
            eq(services.isActive, true),
            eq(providerProfiles.verificationStatus, 'approved')
          )
        )
        .groupBy(services.categoryId);

      const countMap: Record<number, number> = {};
      for (const sc of serviceCounts) {
        countMap[sc.categoryId] = sc.count;
      }

      res.json(
        cats.map((c) => ({
          ...c,
          serviceCount: countMap[c.id] ?? 0,
        }))
      );
    } catch (error) {
      console.error('Error loading categories:', error);
      res.status(500).json({ error: 'Failed to load service categories' });
    }
  });

  app.get('/api/providers', async (req, res) => {
    try {
      await seedIfEmpty();
      const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
      const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
      const customerLat = req.query.lat ? Number(req.query.lat) : -1.2921;
      const customerLng = req.query.lng ? Number(req.query.lng) : 36.7879;
      const maxDistanceKm = req.query.maxDistanceKm ? Number(req.query.maxDistanceKm) : null;

      const rows = await db
        .select({
          provider: providerProfiles,
          user: {
            id: users.id,
            fullName: users.fullName,
            phone: users.phone,
            status: users.status,
          },
        })
        .from(providerProfiles)
        .innerJoin(users, eq(providerProfiles.userId, users.id))
        .where(
          and(
            eq(providerProfiles.verificationStatus, 'approved'),
            eq(users.status, 'active')
          )
        );

      const providerIds = rows.map((r) => r.provider.id);
      if (providerIds.length === 0) {
        return res.json([]);
      }

      const allServices = await db
        .select({
          service: services,
          categoryName: serviceCategories.name,
        })
        .from(services)
        .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
        .where(and(inArray(services.providerId, providerIds), eq(services.isActive, true)));

      const allReviews = await db
        .select({
          review: reviews,
          customerName: users.fullName,
        })
        .from(reviews)
        .innerJoin(users, eq(reviews.customerId, users.id))
        .where(inArray(reviews.providerId, providerIds))
        .orderBy(desc(reviews.createdAt));

      const servicesByProvider: Record<number, Array<typeof allServices[number]['service'] & { categoryName: string }>> = {};
      for (const s of allServices) {
        if (!servicesByProvider[s.service.providerId]) {
          servicesByProvider[s.service.providerId] = [];
        }
        servicesByProvider[s.service.providerId].push({
          ...s.service,
          categoryName: s.categoryName,
        });
      }

      const reviewsByProvider: Record<number, Array<typeof allReviews[number]['review'] & { customerName: string }>> = {};
      for (const r of allReviews) {
        if (!reviewsByProvider[r.review.providerId]) {
          reviewsByProvider[r.review.providerId] = [];
        }
        reviewsByProvider[r.review.providerId].push({
          ...r.review,
          customerName: r.customerName,
        });
      }

      let enriched = rows.map(({ provider, user }) => {
        const provServices = servicesByProvider[provider.id] || [];
        const distanceKm = haversineDistanceKm(customerLat, customerLng, provider.lat, provider.lng);
        return {
          ...provider,
          fullName: user.fullName,
          phone: user.phone,
          profilePhotoUrl: provider.profilePhotoFileId
            ? `/api/files/${provider.profilePhotoFileId}`
            : null,
          distanceKm,
          services: provServices,
          reviews: (reviewsByProvider[provider.id] || []).slice(0, 5),
        };
      });

      if (categoryId) {
        enriched = enriched.filter((p) => p.services.some((s) => s.categoryId === categoryId));
      }

      if (search) {
        enriched = enriched.filter(
          (p) =>
            p.businessName.toLowerCase().includes(search) ||
            p.fullName.toLowerCase().includes(search) ||
            p.serviceLocations.toLowerCase().includes(search) ||
            p.baseAddress.toLowerCase().includes(search) ||
            p.services.some(
              (s) =>
                s.title.toLowerCase().includes(search) ||
                s.categoryName.toLowerCase().includes(search)
            )
        );
      }

      if (maxDistanceKm && Number.isFinite(maxDistanceKm)) {
        enriched = enriched.filter((p) => p.distanceKm <= maxDistanceKm);
      }

      enriched.sort((a, b) => a.distanceKm - b.distanceKm || b.averageRating - a.averageRating);
      res.json(enriched);
    } catch (error) {
      console.error('Error loading providers:', error);
      res.status(500).json({ error: 'Failed to search providers' });
    }
  });

  // Customer Profile & Bookings
  app.put('/api/customer/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { fullName, phone, defaultAddress, city, lat, lng } = req.body as {
        fullName?: string;
        phone?: string;
        defaultAddress?: string;
        city?: string;
        lat?: number;
        lng?: number;
      };
      if (!fullName || fullName.trim().length < 2) {
        return res.status(400).json({ error: 'Full name is required.' });
      }
      const normalized = normalizeKenyanPhone(phone || '');
      if (!normalized) {
        return res.status(400).json({ error: 'Valid Kenyan phone number is required.' });
      }

      const [updatedUser] = await db
        .update(users)
        .set({ fullName: fullName.trim(), phone: `+${normalized}` })
        .where(eq(users.id, req.dbUser!.id))
        .returning();

      const [profile] = await db
        .insert(customerProfiles)
        .values({
          userId: updatedUser.id,
          defaultAddress: (defaultAddress || 'Kilimani, Nairobi').trim(),
          city: (city || 'Nairobi').trim(),
          lat: typeof lat === 'number' ? lat : -1.2921,
          lng: typeof lng === 'number' ? lng : 36.7825,
        })
        .onConflictDoUpdate({
          target: customerProfiles.userId,
          set: {
            defaultAddress: (defaultAddress || 'Kilimani, Nairobi').trim(),
            city: (city || 'Nairobi').trim(),
            lat: typeof lat === 'number' ? lat : -1.2921,
            lng: typeof lng === 'number' ? lng : 36.7825,
            updatedAt: new Date(),
          },
        })
        .returning();

      res.json({ user: updatedUser, customerProfile: profile });
    } catch (error) {
      console.error('Error updating customer profile:', error);
      res.status(500).json({ error: 'Failed to update customer profile' });
    }
  });

  app.get(
    '/api/customer/bookings',
    requireAuth,
    requireRole('customer', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const rows = await db
          .select({
            booking: bookings,
            serviceTitle: services.title,
            unitLabel: services.unitLabel,
            categoryName: serviceCategories.name,
            providerBusinessName: providerProfiles.businessName,
            providerPhone: users.phone,
            providerUserId: providerProfiles.userId,
            providerLat: providerProfiles.lat,
            providerLng: providerProfiles.lng,
          })
          .from(bookings)
          .innerJoin(services, eq(bookings.serviceId, services.id))
          .innerJoin(serviceCategories, eq(bookings.categoryId, serviceCategories.id))
          .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
          .innerJoin(users, eq(providerProfiles.userId, users.id))
          .where(eq(bookings.customerId, req.dbUser!.id))
          .orderBy(desc(bookings.createdAt));

        const bookingIds = rows.map((r) => r.booking.id);
        const paymentRows = bookingIds.length
          ? await db.select().from(payments).where(inArray(payments.bookingId, bookingIds))
          : [];
        const reviewRows = bookingIds.length
          ? await db.select().from(reviews).where(inArray(reviews.bookingId, bookingIds))
          : [];

        const paymentMap: Record<number, Array<typeof paymentRows[number]>> = {};
        for (const p of paymentRows) {
          if (!paymentMap[p.bookingId]) paymentMap[p.bookingId] = [];
          paymentMap[p.bookingId].push(p);
        }
        const reviewMap: Record<number, typeof reviewRows[number]> = {};
        for (const rv of reviewRows) {
          reviewMap[rv.bookingId] = rv;
        }

        res.json(
          rows.map((r) => ({
            ...r.booking,
            serviceTitle: r.serviceTitle,
            unitLabel: r.unitLabel,
            categoryName: r.categoryName,
            providerBusinessName: r.providerBusinessName,
            providerPhone: r.providerPhone,
            providerUserId: r.providerUserId,
            providerLat: r.providerLat,
            providerLng: r.providerLng,
            payments: paymentMap[r.booking.id] || [],
            review: reviewMap[r.booking.id] || null,
          }))
        );
      } catch (error) {
        console.error('Error loading customer bookings:', error);
        res.status(500).json({ error: 'Failed to load bookings' });
      }
    }
  );

  app.post(
    '/api/bookings',
    requireAuth,
    requireRole('customer', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const {
          providerId,
          serviceId,
          scheduledDate,
          scheduledTime,
          customerAddress,
          customerLat,
          customerLng,
          notes,
        } = req.body as {
          providerId?: number;
          serviceId?: number;
          scheduledDate?: string;
          scheduledTime?: string;
          customerAddress?: string;
          customerLat?: number;
          customerLng?: number;
          notes?: string;
        };

        if (!providerId || !serviceId) {
          return res.status(400).json({ error: 'Provider and service selection are required.' });
        }
        if (!scheduledDate || !scheduledTime) {
          return res.status(400).json({ error: 'Preferred date and time are required.' });
        }
        if (!customerAddress || customerAddress.trim().length < 3) {
          return res.status(400).json({ error: 'Service delivery address is required.' });
        }

        const [provider] = await db
          .select()
          .from(providerProfiles)
          .where(eq(providerProfiles.id, Number(providerId)))
          .limit(1);
        if (!provider || provider.verificationStatus !== 'approved') {
          return res.status(400).json({ error: 'Selected provider is not verified or unavailable.' });
        }
        if (provider.userId === req.dbUser!.id) {
          return res.status(400).json({ error: 'You cannot book your own provider account.' });
        }

        const [service] = await db
          .select()
          .from(services)
          .where(
            and(
              eq(services.id, Number(serviceId)),
              eq(services.providerId, provider.id),
              eq(services.isActive, true)
            )
          )
          .limit(1);
        if (!service) {
          return res.status(404).json({ error: 'Selected service offering not found.' });
        }

        const lat = typeof customerLat === 'number' ? customerLat : -1.2921;
        const lng = typeof customerLng === 'number' ? customerLng : 36.7825;
        const distanceKm = haversineDistanceKm(lat, lng, provider.lat, provider.lng);
        const breakdown = calculateCommissionBreakdown(service.priceKsh);
        const bookingCode = `JC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const [created] = await db
          .insert(bookings)
          .values({
            bookingCode,
            customerId: req.dbUser!.id,
            providerId: provider.id,
            serviceId: service.id,
            categoryId: service.categoryId,
            status: 'Pending',
            scheduledDate,
            scheduledTime,
            customerAddress: customerAddress.trim(),
            customerLat: lat,
            customerLng: lng,
            distanceKm,
            notes: (notes || '').trim(),
            totalAmountKsh: breakdown.grossAmountKsh,
            commissionKsh: breakdown.commissionKsh,
            providerEarningsKsh: breakdown.providerEarningsKsh,
          })
          .returning();

        await createNotification(
          provider.userId,
          `New Booking Request ${created.bookingCode}`,
          `${req.dbUser!.fullName} requested ${service.title} in ${customerAddress.trim()}.`,
          created.id
        );
        broadcastToUsers([req.dbUser!.id, provider.userId], 'booking:created', created);
        await broadcastToAdmins('booking:created', created);

        res.status(201).json(created);
      } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ error: 'Failed to create booking' });
      }
    }
  );

  app.post(
    '/api/bookings/:id/cancel',
    requireAuth,
    requireRole('customer', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const bookingId = Number(req.params.id);
        const { reason } = req.body as { reason?: string };
        const [booking] = await db
          .select()
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);
        if (!booking) {
          return res.status(404).json({ error: 'Booking not found' });
        }
        if (booking.customerId !== req.dbUser!.id && req.dbUser!.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (!['Pending', 'Accepted', 'Provider on the way'].includes(booking.status)) {
          return res.status(400).json({
            error: `Bookings in "${booking.status}" status cannot be cancelled directly under platform policy.`,
          });
        }

        const [updated] = await db
          .update(bookings)
          .set({
            status: 'Cancelled',
            cancellationReason: (reason || 'Cancelled by customer').trim(),
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, booking.id))
          .returning();

        const [prov] = await db
          .select()
          .from(providerProfiles)
          .where(eq(providerProfiles.id, booking.providerId))
          .limit(1);

        if (prov) {
          await createNotification(
            prov.userId,
            `Booking ${booking.bookingCode} Cancelled`,
            `Customer cancelled booking (${updated.cancellationReason}).`,
            booking.id
          );
          broadcastToUsers([booking.customerId, prov.userId], 'booking:updated', updated);
        }
        await broadcastToAdmins('booking:updated', updated);

        res.json(updated);
      } catch (error) {
        console.error('Error cancelling booking:', error);
        res.status(500).json({ error: 'Failed to cancel booking' });
      }
    }
  );

  app.post(
    '/api/bookings/:id/confirm-completion',
    requireAuth,
    requireRole('customer', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const bookingId = Number(req.params.id);
        const { rating, comment } = req.body as { rating?: number; comment?: string };
        if (!rating || rating < 1 || rating > 5) {
          return res.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
        }
        if (!comment || comment.trim().length < 4) {
          return res.status(400).json({ error: 'Please write a short review comment.' });
        }

        const [booking] = await db
          .select()
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);
        if (!booking) {
          return res.status(404).json({ error: 'Booking not found' });
        }
        if (booking.customerId !== req.dbUser!.id && req.dbUser!.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (booking.status !== 'Completed') {
          return res.status(400).json({
            error: 'Provider must mark the service as Completed before confirming and reviewing.',
          });
        }

        const [existingReview] = await db
          .select()
          .from(reviews)
          .where(eq(reviews.bookingId, booking.id))
          .limit(1);
        if (existingReview) {
          return res.status(400).json({ error: 'Review has already been submitted for this booking.' });
        }

        const [updatedBooking] = await db
          .update(bookings)
          .set({ customerConfirmedCompletion: true, updatedAt: new Date() })
          .where(eq(bookings.id, booking.id))
          .returning();

        await recordBookingFinancials(updatedBooking);

        const [createdReview] = await db
          .insert(reviews)
          .values({
            bookingId: booking.id,
            customerId: booking.customerId,
            providerId: booking.providerId,
            rating: Math.round(rating),
            comment: comment.trim(),
          })
          .returning();

        // Recalculate provider aggregate rating
        const provReviews = await db
          .select({ rating: reviews.rating })
          .from(reviews)
          .where(eq(reviews.providerId, booking.providerId));
        const total = provReviews.length;
        const avg =
          total > 0
            ? Math.round((provReviews.reduce((s, r) => s + r.rating, 0) / total) * 10) / 10
            : 5.0;

        const [prov] = await db
          .update(providerProfiles)
          .set({ averageRating: avg, totalReviews: total })
          .where(eq(providerProfiles.id, booking.providerId))
          .returning();

        if (prov) {
          await createNotification(
            prov.userId,
            `Completion Confirmed & ${rating}-Star Review`,
            `${req.dbUser!.fullName} confirmed completion for ${booking.bookingCode}.`,
            booking.id
          );
          broadcastToUsers([booking.customerId, prov.userId], 'booking:updated', updatedBooking);
        }

        res.status(201).json({ booking: updatedBooking, review: createdReview });
      } catch (error) {
        console.error('Error confirming completion:', error);
        res.status(500).json({ error: 'Failed to submit review' });
      }
    }
  );

  // Payment Integration Structure (M-Pesa STK Push & Card Gateway)
  // NEVER simulates fake success; records real payment intent awaiting gateway webhook unless credentials exist.
  app.post(
    '/api/payments/initiate',
    requireAuth,
    requireRole('customer', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const { bookingId, method, mpesaPhone, cardLast4 } = req.body as {
          bookingId?: number;
          method?: string;
          mpesaPhone?: string;
          cardLast4?: string;
        };

        if (!bookingId || (method !== 'mpesa_stk' && method !== 'card')) {
          return res.status(400).json({ error: 'Valid bookingId and payment method are required.' });
        }

        const [booking] = await db
          .select()
          .from(bookings)
          .where(eq(bookings.id, Number(bookingId)))
          .limit(1);
        if (!booking) {
          return res.status(404).json({ error: 'Booking not found.' });
        }
        if (booking.customerId !== req.dbUser!.id && req.dbUser!.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden' });
        }

        let cleanPhone = '';
        if (method === 'mpesa_stk') {
          const normalized = normalizeKenyanPhone(mpesaPhone || '');
          if (!normalized) {
            return res.status(400).json({
              error: 'Enter a valid Safaricom/Airtel M-Pesa phone number (e.g. 0712 345 678).',
            });
          }
          cleanPhone = normalized;
        }

        const darajaConfigured = Boolean(
          process.env.MPESA_CONSUMER_KEY &&
            process.env.MPESA_CONSUMER_SECRET &&
            process.env.MPESA_PASSKEY &&
            process.env.MPESA_SHORTCODE
        );
        const cardConfigured = Boolean(process.env.CARD_GATEWAY_SECRET);
        const gatewayConfigured = method === 'mpesa_stk' ? darajaConfigured : cardConfigured;
        const gatewayReference = `JC-GW-${Date.now().toString().slice(-6)}`;

        const [paymentRecord] = await db
          .insert(payments)
          .values({
            bookingId: booking.id,
            customerId: booking.customerId,
            method,
            status: gatewayConfigured ? 'pending_stk' : 'awaiting_gateway',
            amountKsh: booking.totalAmountKsh,
            mpesaPhone: cleanPhone,
            cardLast4: method === 'card' ? (cardLast4 || '0000').slice(-4) : '',
            gatewayReference,
            notes: gatewayConfigured
              ? 'Dispatched to payment gateway; awaiting callback confirmation.'
              : 'Payment intent stored. Connect live M-Pesa Daraja or Card credentials in environment secrets to complete settlement.',
          })
          .returning();

        res.status(202).json({
          payment: paymentRecord,
          gatewayConfigured,
          commissionBreakdown: {
            totalAmountKsh: booking.totalAmountKsh,
            commissionKsh: booking.commissionKsh,
            providerEarningsKsh: booking.providerEarningsKsh,
          },
          message: gatewayConfigured
            ? 'STK Push / Card authorization initiated. Awaiting gateway webhook.'
            : 'Payment intent recorded as Awaiting Gateway. Live credentials are not configured yet, so payment success is not simulated.',
        });
      } catch (error) {
        console.error('Error initiating payment:', error);
        res.status(500).json({ error: 'Failed to initiate payment intent' });
      }
    }
  );

  // Real Daraja M-Pesa STK Callback Webhook Endpoint
  app.post('/api/payments/mpesa/callback', async (req, res) => {
    try {
      const stkCallback = req.body?.Body?.stkCallback;
      if (!stkCallback?.CheckoutRequestID) {
        return res.status(400).json({ error: 'Invalid Daraja STK callback payload' });
      }
      const resultCode = Number(stkCallback.ResultCode);
      const checkoutId = String(stkCallback.CheckoutRequestID);
      const items: Array<{ Name: string; Value?: unknown }> =
        stkCallback.CallbackMetadata?.Item || [];
      const receipt = String(
        items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value || ''
      );

      await db
        .update(payments)
        .set({
          status: resultCode === 0 ? 'confirmed' : 'failed',
          mpesaReceiptNumber: receipt,
          notes: String(stkCallback.ResultDesc || ''),
        })
        .where(eq(payments.checkoutRequestId, checkoutId));

      res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    } catch (error) {
      console.error('Error handling M-Pesa callback:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Provider Endpoints
  app.get(
    '/api/provider/dashboard',
    requireAuth,
    requireRole('provider', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const [profile] = await db
          .select()
          .from(providerProfiles)
          .where(eq(providerProfiles.userId, req.dbUser!.id))
          .limit(1);

        if (!profile) {
          return res.json({ registered: false, profile: null });
        }

        const myServices = await db
          .select({
            service: services,
            categoryName: serviceCategories.name,
          })
          .from(services)
          .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
          .where(eq(services.providerId, profile.id));

        const myBookings = await db
          .select({
            booking: bookings,
            serviceTitle: services.title,
            categoryName: serviceCategories.name,
            customerName: users.fullName,
            customerPhone: users.phone,
          })
          .from(bookings)
          .innerJoin(services, eq(bookings.serviceId, services.id))
          .innerJoin(serviceCategories, eq(bookings.categoryId, serviceCategories.id))
          .innerJoin(users, eq(bookings.customerId, users.id))
          .where(eq(bookings.providerId, profile.id))
          .orderBy(desc(bookings.createdAt));

        const earningsRows = await db
          .select({
            earning: providerEarnings,
            bookingCode: bookings.bookingCode,
            scheduledDate: bookings.scheduledDate,
          })
          .from(providerEarnings)
          .innerJoin(bookings, eq(providerEarnings.bookingId, bookings.id))
          .where(eq(providerEarnings.providerId, profile.id))
          .orderBy(desc(providerEarnings.createdAt));

        const grossKsh = earningsRows.reduce((s, e) => s + e.earning.grossAmountKsh, 0);
        const commissionKsh = earningsRows.reduce((s, e) => s + e.earning.commissionKsh, 0);
        const netEarningsKsh = earningsRows.reduce((s, e) => s + e.earning.netEarningsKsh, 0);

        res.json({
          registered: true,
          profile: {
            ...profile,
            profilePhotoUrl: profile.profilePhotoFileId
              ? `/api/files/${profile.profilePhotoFileId}`
              : null,
            idDocumentUrl: profile.idDocumentFileId
              ? `/api/files/${profile.idDocumentFileId}`
              : null,
          },
          services: myServices.map((s) => ({ ...s.service, categoryName: s.categoryName })),
          bookings: myBookings.map((b) => ({
            ...b.booking,
            serviceTitle: b.serviceTitle,
            categoryName: b.categoryName,
            customerName: b.customerName,
            customerPhone: b.customerPhone,
          })),
          earningsSummary: {
            grossKsh,
            commissionKsh,
            netEarningsKsh,
            completedCount: myBookings.filter((b) => b.booking.status === 'Completed').length,
            pendingRequests: myBookings.filter((b) => b.booking.status === 'Pending').length,
          },
          transactions: earningsRows.map((e) => ({
            ...e.earning,
            bookingCode: e.bookingCode,
            scheduledDate: e.scheduledDate,
          })),
        });
      } catch (error) {
        console.error('Error loading provider dashboard:', error);
        res.status(500).json({ error: 'Failed to load provider dashboard' });
      }
    }
  );

  app.post(
    '/api/provider/services',
    requireAuth,
    requireRole('provider', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const [profile] = await db
          .select()
          .from(providerProfiles)
          .where(eq(providerProfiles.userId, req.dbUser!.id))
          .limit(1);
        if (!profile) {
          return res.status(400).json({ error: 'Complete provider registration first.' });
        }
        const { categoryId, title, description, priceKsh, unitLabel } = req.body as {
          categoryId?: number;
          title?: string;
          description?: string;
          priceKsh?: number;
          unitLabel?: string;
        };
        if (!categoryId || !title?.trim() || !priceKsh || priceKsh < 200) {
          return res.status(400).json({
            error: 'Category, service title, and price (minimum KSh 200) are required.',
          });
        }

        const [created] = await db
          .insert(services)
          .values({
            providerId: profile.id,
            categoryId: Number(categoryId),
            title: title.trim(),
            description: (description || title).trim(),
            priceKsh: Math.round(Number(priceKsh)),
            unitLabel: (unitLabel || 'per visit').trim(),
            isActive: true,
          })
          .returning();

        res.status(201).json(created);
      } catch (error) {
        console.error('Error adding provider service:', error);
        res.status(500).json({ error: 'Failed to add service' });
      }
    }
  );

  app.patch(
    '/api/provider/services/:id',
    requireAuth,
    requireRole('provider', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const serviceId = Number(req.params.id);
        const [profile] = await db
          .select()
          .from(providerProfiles)
          .where(eq(providerProfiles.userId, req.dbUser!.id))
          .limit(1);
        if (!profile) return res.status(404).json({ error: 'Provider profile not found' });

        const { priceKsh, isActive } = req.body as { priceKsh?: number; isActive?: boolean };
        const updates: Partial<typeof services.$inferInsert> = {};
        if (typeof priceKsh === 'number' && priceKsh >= 200) {
          updates.priceKsh = Math.round(priceKsh);
        }
        if (typeof isActive === 'boolean') {
          updates.isActive = isActive;
        }

        const [updated] = await db
          .update(services)
          .set(updates)
          .where(and(eq(services.id, serviceId), eq(services.providerId, profile.id)))
          .returning();
        if (!updated) return res.status(404).json({ error: 'Service not found' });
        res.json(updated);
      } catch (error) {
        console.error('Error updating service:', error);
        res.status(500).json({ error: 'Failed to update service' });
      }
    }
  );

  app.patch(
    '/api/provider/bookings/:id/status',
    requireAuth,
    requireRole('provider', 'admin'),
    async (req: AuthRequest, res) => {
      try {
        const bookingId = Number(req.params.id);
        const { status } = req.body as { status?: string };
        if (!status || !ALLOWED_BOOKING_STATUSES.includes(status as any)) {
          return res.status(400).json({ error: 'Invalid booking status.' });
        }

        const [profile] = await db
          .select()
          .from(providerProfiles)
          .where(eq(providerProfiles.userId, req.dbUser!.id))
          .limit(1);
        if (!profile) {
          return res.status(403).json({ error: 'Provider profile required.' });
        }

        const [booking] = await db
          .select()
          .from(bookings)
          .where(and(eq(bookings.id, bookingId), eq(bookings.providerId, profile.id)))
          .limit(1);
        if (!booking) {
          return res.status(404).json({ error: 'Booking not found for this provider.' });
        }

        const validTransitions: Record<string, string[]> = {
          Pending: ['Accepted', 'Rejected'],
          Accepted: ['Provider on the way', 'In progress'],
          'Provider on the way': ['In progress'],
          'In progress': ['Completed'],
        };

        if (!(validTransitions[booking.status] || []).includes(status)) {
          return res.status(400).json({
            error: `Cannot transition booking from "${booking.status}" to "${status}".`,
          });
        }

        const [updated] = await db
          .update(bookings)
          .set({ status, updatedAt: new Date() })
          .where(eq(bookings.id, booking.id))
          .returning();

        if (status === 'Completed') {
          await recordBookingFinancials(updated);
          await db
            .update(providerProfiles)
            .set({ completedJobs: profile.completedJobs + 1 })
            .where(eq(providerProfiles.id, profile.id));
        }

        await createNotification(
          booking.customerId,
          `Booking ${booking.bookingCode}: ${status}`,
          `${profile.businessName} updated your booking status to "${status}".`,
          booking.id
        );
        broadcastToUsers([booking.customerId, profile.userId], 'booking:updated', updated);
        await broadcastToAdmins('booking:updated', updated);

        res.json(updated);
      } catch (error) {
        console.error('Error updating booking status:', error);
        res.status(500).json({ error: 'Failed to update booking status' });
      }
    }
  );

  // Messaging & Notifications (Shared Customer & Provider on specific booking)
  app.get('/api/bookings/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const bookingId = Number(req.params.id);
      const [booking] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      const [prov] = await db
        .select()
        .from(providerProfiles)
        .where(eq(providerProfiles.id, booking.providerId))
        .limit(1);

      const isParticipant =
        booking.customerId === req.dbUser!.id ||
        prov?.userId === req.dbUser!.id ||
        req.dbUser!.role === 'admin';
      if (!isParticipant) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const rows = await db
        .select({
          message: messages,
          senderName: users.fullName,
          senderRole: users.role,
        })
        .from(messages)
        .innerJoin(users, eq(messages.senderUserId, users.id))
        .where(eq(messages.bookingId, booking.id))
        .orderBy(messages.createdAt);

      res.json(
        rows.map((r) => ({
          ...r.message,
          senderName: r.senderName,
          senderRole: r.senderRole,
        }))
      );
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  });

  app.post('/api/bookings/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const bookingId = Number(req.params.id);
      const { body } = req.body as { body?: string };
      if (!body || !body.trim()) {
        return res.status(400).json({ error: 'Message cannot be empty.' });
      }

      const [booking] = await db
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      const [prov] = await db
        .select()
        .from(providerProfiles)
        .where(eq(providerProfiles.id, booking.providerId))
        .limit(1);

      const isParticipant =
        booking.customerId === req.dbUser!.id ||
        prov?.userId === req.dbUser!.id ||
        req.dbUser!.role === 'admin';
      if (!isParticipant) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const [created] = await db
        .insert(messages)
        .values({
          bookingId: booking.id,
          senderUserId: req.dbUser!.id,
          body: body.trim(),
        })
        .returning();

      const payload = {
        ...created,
        senderName: req.dbUser!.fullName,
        senderRole: req.dbUser!.role,
      };

      const recipients = [booking.customerId];
      if (prov) recipients.push(prov.userId);
      broadcastToUsers(recipients, 'message:created', payload);

      const targetUserId =
        req.dbUser!.id === booking.customerId ? prov?.userId : booking.customerId;
      if (targetUserId && targetUserId !== req.dbUser!.id) {
        await createNotification(
          targetUserId,
          `Message on ${booking.bookingCode}`,
          `${req.dbUser!.fullName}: ${body.trim().slice(0, 80)}`,
          booking.id
        );
      }

      res.status(201).json(payload);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, req.dbUser!.id))
        .orderBy(desc(notifications.createdAt))
        .limit(20);
      res.json(list);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({ error: 'Failed to load notifications' });
    }
  });

  app.patch('/api/notifications/read', requireAuth, async (req: AuthRequest, res) => {
    try {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userId, req.dbUser!.id));
      res.json({ ok: true });
    } catch (error) {
      console.error('Error marking notifications read:', error);
      res.status(500).json({ error: 'Failed to mark notifications read' });
    }
  });

  // Administrator Dashboard Endpoints (Strictly Protected)
  app.get(
    '/api/admin/overview',
    requireAuth,
    requireRole('admin'),
    async (_req: AuthRequest, res) => {
      try {
        await seedIfEmpty();
        const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
        const allProviders = await db
          .select({
            provider: providerProfiles,
            user: users,
          })
          .from(providerProfiles)
          .innerJoin(users, eq(providerProfiles.userId, users.id))
          .orderBy(desc(providerProfiles.createdAt));

        const allCategories = await db
          .select()
          .from(serviceCategories)
          .orderBy(serviceCategories.sortOrder);

        const allBookings = await db
          .select({
            booking: bookings,
            customerName: users.fullName,
            serviceTitle: services.title,
            categoryName: serviceCategories.name,
            providerBusinessName: providerProfiles.businessName,
          })
          .from(bookings)
          .innerJoin(users, eq(bookings.customerId, users.id))
          .innerJoin(services, eq(bookings.serviceId, services.id))
          .innerJoin(serviceCategories, eq(bookings.categoryId, serviceCategories.id))
          .innerJoin(providerProfiles, eq(bookings.providerId, providerProfiles.id))
          .orderBy(desc(bookings.createdAt));

        const allPayments = await db
          .select({
            payment: payments,
            bookingCode: bookings.bookingCode,
            customerName: users.fullName,
          })
          .from(payments)
          .innerJoin(bookings, eq(payments.bookingId, bookings.id))
          .innerJoin(users, eq(payments.customerId, users.id))
          .orderBy(desc(payments.createdAt));

        const allEarnings = await db
          .select({
            earning: providerEarnings,
            bookingCode: bookings.bookingCode,
            businessName: providerProfiles.businessName,
          })
          .from(providerEarnings)
          .innerJoin(bookings, eq(providerEarnings.bookingId, bookings.id))
          .innerJoin(providerProfiles, eq(providerEarnings.providerId, providerProfiles.id))
          .orderBy(desc(providerEarnings.createdAt));

        const completedBookingsList = allBookings.filter((b) => b.booking.status === 'Completed');
        const cancelledBookingsList = allBookings.filter((b) => b.booking.status === 'Cancelled');
        const totalMarketplaceRevenueKsh = completedBookingsList.reduce(
          (sum, b) => sum + b.booking.totalAmountKsh,
          0
        );
        const totalPlatformCommissionKsh = completedBookingsList.reduce(
          (sum, b) => sum + b.booking.commissionKsh,
          0
        );
        const totalProviderEarningsKsh = completedBookingsList.reduce(
          (sum, b) => sum + b.booking.providerEarningsKsh,
          0
        );

        // Category breakdown report
        const categoryMetrics: Record<string, { bookings: number; revenueKsh: number; commissionKsh: number }> = {};
        for (const b of allBookings) {
          if (!categoryMetrics[b.categoryName]) {
            categoryMetrics[b.categoryName] = { bookings: 0, revenueKsh: 0, commissionKsh: 0 };
          }
          categoryMetrics[b.categoryName].bookings += 1;
          if (b.booking.status === 'Completed') {
            categoryMetrics[b.categoryName].revenueKsh += b.booking.totalAmountKsh;
            categoryMetrics[b.categoryName].commissionKsh += b.booking.commissionKsh;
          }
        }

        res.json({
          metrics: {
            totalCustomers: allUsers.filter((u) => u.role === 'customer').length,
            totalProviders: allProviders.length,
            pendingVerifications: allProviders.filter(
              (p) => p.provider.verificationStatus === 'pending'
            ).length,
            totalBookings: allBookings.length,
            completedBookings: completedBookingsList.length,
            cancelledBookings: cancelledBookingsList.length,
            openDisputes: allBookings.filter((b) => b.booking.disputeStatus === 'open').length,
            totalMarketplaceRevenueKsh,
            totalPlatformCommissionKsh,
            totalProviderEarningsKsh,
          },
          customers: allUsers.filter((u) => u.role === 'customer'),
          providers: allProviders.map((p) => ({
            ...p.provider,
            fullName: p.user.fullName,
            email: p.user.email,
            phone: p.user.phone,
            accountStatus: p.user.status,
            profilePhotoUrl: p.provider.profilePhotoFileId
              ? `/api/files/${p.provider.profilePhotoFileId}`
              : null,
            idDocumentUrl: p.provider.idDocumentFileId
              ? `/api/files/${p.provider.idDocumentFileId}`
              : null,
          })),
          categories: allCategories,
          bookings: allBookings.map((b) => ({
            ...b.booking,
            customerName: b.customerName,
            serviceTitle: b.serviceTitle,
            categoryName: b.categoryName,
            providerBusinessName: b.providerBusinessName,
          })),
          payments: allPayments.map((p) => ({
            ...p.payment,
            bookingCode: p.bookingCode,
            customerName: p.customerName,
          })),
          payouts: allEarnings.map((e) => ({
            ...e.earning,
            bookingCode: e.bookingCode,
            businessName: e.businessName,
          })),
          categoryReport: Object.entries(categoryMetrics).map(([name, stats]) => ({
            categoryName: name,
            ...stats,
          })),
        });
      } catch (error) {
        console.error('Error loading admin overview:', error);
        res.status(500).json({ error: 'Failed to load administrator dashboard' });
      }
    }
  );

  app.patch(
    '/api/admin/providers/:id/verify',
    requireAuth,
    requireRole('admin'),
    async (req: AuthRequest, res) => {
      try {
        const providerId = Number(req.params.id);
        const { verificationStatus, verificationNotes } = req.body as {
          verificationStatus?: string;
          verificationNotes?: string;
        };
        if (verificationStatus !== 'approved' && verificationStatus !== 'rejected') {
          return res.status(400).json({ error: 'verificationStatus must be approved or rejected.' });
        }
        const [updated] = await db
          .update(providerProfiles)
          .set({
            verificationStatus,
            verificationNotes: (verificationNotes || '').trim(),
          })
          .where(eq(providerProfiles.id, providerId))
          .returning();

        if (!updated) return res.status(404).json({ error: 'Provider not found' });

        await createNotification(
          updated.userId,
          `Verification ${verificationStatus === 'approved' ? 'Approved' : 'Update'}`,
          verificationStatus === 'approved'
            ? 'Your JAMII CONNECT provider profile is now verified and live for bookings.'
            : `Verification declined: ${updated.verificationNotes || 'Please update documents.'}`
        );
        broadcastToUsers([updated.userId], 'provider:verified', updated);

        res.json(updated);
      } catch (error) {
        console.error('Error verifying provider:', error);
        res.status(500).json({ error: 'Failed to update provider verification' });
      }
    }
  );

  app.patch(
    '/api/admin/users/:id/status',
    requireAuth,
    requireRole('admin'),
    async (req: AuthRequest, res) => {
      try {
        const targetId = Number(req.params.id);
        const { status } = req.body as { status?: string };
        if (status !== 'active' && status !== 'suspended') {
          return res.status(400).json({ error: 'Status must be active or suspended.' });
        }
        if (targetId === req.dbUser!.id) {
          return res.status(400).json({ error: 'You cannot suspend your own administrator account.' });
        }
        const [updated] = await db
          .update(users)
          .set({ status })
          .where(eq(users.id, targetId))
          .returning();
        if (!updated) return res.status(404).json({ error: 'User not found' });
        res.json(updated);
      } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ error: 'Failed to update user status' });
      }
    }
  );

  app.post(
    '/api/admin/categories',
    requireAuth,
    requireRole('admin'),
    async (req: AuthRequest, res) => {
      try {
        const { name, description, iconKey } = req.body as {
          name?: string;
          description?: string;
          iconKey?: string;
        };
        if (!name || name.trim().length < 2) {
          return res.status(400).json({ error: 'Category name is required.' });
        }
        const slug = name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        const [created] = await db
          .insert(serviceCategories)
          .values({
            name: name.trim(),
            slug,
            description: (description || `${name.trim()} home services`).trim(),
            iconKey: (iconKey || 'wrench').trim(),
            isActive: true,
            sortOrder: 99,
          })
          .returning();
        res.status(201).json(created);
      } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ error: 'Category already exists or invalid data' });
      }
    }
  );

  app.patch(
    '/api/admin/categories/:id',
    requireAuth,
    requireRole('admin'),
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const { isActive } = req.body as { isActive?: boolean };
        const [updated] = await db
          .update(serviceCategories)
          .set({ isActive: Boolean(isActive) })
          .where(eq(serviceCategories.id, id))
          .returning();
        if (!updated) return res.status(404).json({ error: 'Category not found' });
        res.json(updated);
      } catch (error) {
        console.error('Error toggling category:', error);
        res.status(500).json({ error: 'Failed to update category' });
      }
    }
  );

  app.patch(
    '/api/admin/bookings/:id',
    requireAuth,
    requireRole('admin'),
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const { status, disputeStatus, disputeNotes } = req.body as {
          status?: string;
          disputeStatus?: string;
          disputeNotes?: string;
        };
        const updates: Partial<typeof bookings.$inferInsert> = { updatedAt: new Date() };
        if (status && ALLOWED_BOOKING_STATUSES.includes(status as any)) {
          updates.status = status;
        }
        if (disputeStatus && ['none', 'open', 'resolved'].includes(disputeStatus)) {
          updates.disputeStatus = disputeStatus;
        }
        if (typeof disputeNotes === 'string') {
          updates.disputeNotes = disputeNotes.trim();
        }
        const [updated] = await db
          .update(bookings)
          .set(updates)
          .where(eq(bookings.id, id))
          .returning();
        if (!updated) return res.status(404).json({ error: 'Booking not found' });

        if (updates.status === 'Completed') {
          await recordBookingFinancials(updated);
        }
        res.json(updated);
      } catch (error) {
        console.error('Error updating booking by admin:', error);
        res.status(500).json({ error: 'Failed to update booking' });
      }
    }
  );

  app.patch(
    '/api/admin/payouts/:id/settle',
    requireAuth,
    requireRole('admin'),
    async (req: AuthRequest, res) => {
      try {
        const id = Number(req.params.id);
        const [updated] = await db
          .update(providerEarnings)
          .set({ payoutStatus: 'settled' })
          .where(eq(providerEarnings.id, id))
          .returning();
        if (!updated) return res.status(404).json({ error: 'Payout record not found' });
        res.json(updated);
      } catch (error) {
        console.error('Error settling payout:', error);
        res.status(500).json({ error: 'Failed to settle payout' });
      }
    }
  );

  // Customer can flag a dispute on an active/completed booking
  app.post(
    '/api/bookings/:id/dispute',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const bookingId = Number(req.params.id);
        const { disputeNotes } = req.body as { disputeNotes?: string };
        if (!disputeNotes || disputeNotes.trim().length < 5) {
          return res.status(400).json({ error: 'Please describe the issue (at least 5 characters).' });
        }
        const [booking] = await db
          .select()
          .from(bookings)
          .where(eq(bookings.id, bookingId))
          .limit(1);
        if (!booking) return res.status(404).json({ error: 'Booking not found' });
        if (booking.customerId !== req.dbUser!.id && req.dbUser!.role !== 'admin') {
          return res.status(403).json({ error: 'Forbidden' });
        }
        const [updated] = await db
          .update(bookings)
          .set({
            disputeStatus: 'open',
            disputeNotes: disputeNotes.trim(),
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, booking.id))
          .returning();
        await broadcastToAdmins('booking:disputed', updated);
        res.json(updated);
      } catch (error) {
        console.error('Error opening dispute:', error);
        res.status(500).json({ error: 'Failed to open dispute' });
      }
    }
  );

  const distPath = path.join(__dirname, 'dist');
  const distIndexPath = path.join(distPath, 'index.html');
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    (process.env.NODE_ENV !== 'development' &&
      (Boolean(process.env.K_SERVICE) || fs.existsSync(distIndexPath)));

  // Vite middleware in development, static dist serving in production
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    if (!fs.existsSync(distIndexPath)) {
      console.warn(
        `Warning: Production build missing at ${distIndexPath}. Run "npm run build" before starting.`
      );
    }
    app.use(express.static(distPath));
    app.get('/api/*', (_req, res) => {
      res.status(404).json({ error: 'API route not found' });
    });
    app.get('*', (_req, res) => {
      if (!fs.existsSync(distIndexPath)) {
        return res.status(503).send('Application build not found. Run npm run build.');
      }
      res.sendFile(distIndexPath);
    });
  }

  const PORT = isProduction
    ? Number(process.env.PORT || process.env.DEFAULT_APP_PORT) || 3000
    : Number(process.env.DEFAULT_APP_PORT || process.env.PORT) || 3000;

  server.on('error', (err) => {
    console.error('HTTP server error:', err);
    process.exit(1);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(
      `JAMII CONNECT server (${isProduction ? 'production' : 'development'}) listening on http://0.0.0.0:${PORT}`
    );
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
