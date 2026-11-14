import { count } from 'drizzle-orm';
import { db } from './index.ts';
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
  users,
} from './schema.ts';
import { calculateCommissionBreakdown, haversineDistanceKm } from '../lib/commission.ts';

const INITIAL_CATEGORIES = [
  {
    name: 'Plumbing',
    slug: 'plumbing',
    description: 'Pipe repairs, leak detection, water heater installation, and drainage.',
    iconKey: 'wrench',
    sortOrder: 1,
  },
  {
    name: 'Electrical services',
    slug: 'electrical-services',
    description: 'Wiring, circuit breakers, inverter setup, lighting, and fault diagnosis.',
    iconKey: 'zap',
    sortOrder: 2,
  },
  {
    name: 'House cleaning',
    slug: 'house-cleaning',
    description: 'Deep home cleaning, post-tenancy sanitization, and upholstery care.',
    iconKey: 'sparkles',
    sortOrder: 3,
  },
  {
    name: 'Laundry services',
    slug: 'laundry-services',
    description: 'Wash, dry-clean, press, and duvet care with doorstep pickup.',
    iconKey: 'shirt',
    sortOrder: 4,
  },
  {
    name: 'Painting',
    slug: 'painting',
    description: 'Interior and exterior wall finishes, waterproofing, and texture coats.',
    iconKey: 'paintbrush',
    sortOrder: 5,
  },
  {
    name: 'Carpentry',
    slug: 'carpentry',
    description: 'Custom cabinetry, door locks, wardrobe repairs, and hardwood finishing.',
    iconKey: 'hammer',
    sortOrder: 6,
  },
  {
    name: 'Air conditioning repair',
    slug: 'air-conditioning-repair',
    description: 'Split-unit AC servicing, refrigerant recharge, and duct cleaning.',
    iconKey: 'wind',
    sortOrder: 7,
  },
  {
    name: 'Appliance repair',
    slug: 'appliance-repair',
    description: 'Fridge, washing machine, cooker, and microwave diagnostics.',
    iconKey: 'cpu',
    sortOrder: 8,
  },
  {
    name: 'Gardening',
    slug: 'gardening',
    description: 'Lawn care, hedge trimming, landscaping, and irrigation setups.',
    iconKey: 'trees',
    sortOrder: 9,
  },
  {
    name: 'Pest control',
    slug: 'pest-control',
    description: 'NEMA-certified fumigation, termite treatment, and rodent proofing.',
    iconKey: 'shield-check',
    sortOrder: 10,
  },
  {
    name: 'Moving services',
    slug: 'moving-services',
    description: 'Insured household relocation, packing, and furniture assembly.',
    iconKey: 'truck',
    sortOrder: 11,
  },
  {
    name: 'Construction and maintenance',
    slug: 'construction-and-maintenance',
    description: 'Masonry, tiling, roof repairs, waterproofing, and general renovations.',
    iconKey: 'hard-hat',
    sortOrder: 12,
  },
];

let seeded = false;
let seedPromise: Promise<void> | null = null;

export async function seedIfEmpty() {
  if (seeded) return;
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const existingCats = await db.select({ value: count() }).from(serviceCategories);
      if ((existingCats[0]?.value ?? 0) > 0) {
        seeded = true;
        return;
      }

    const insertedCats = await db
      .insert(serviceCategories)
      .values(INITIAL_CATEGORIES)
      .returning();

    const catBySlug: Record<string, number> = {};
    for (const c of insertedCats) {
      catBySlug[c.slug] = c.id;
    }

    // Sample Customers in Nairobi
    const sampleCustomers = await db
      .insert(users)
      .values([
        {
          uid: 'seed_cust_amina',
          email: 'amina.wanjiku@example.co.ke',
          fullName: 'Amina Wanjiku',
          phone: '+254 712 345 678',
          role: 'customer',
          status: 'active',
        },
        {
          uid: 'seed_cust_brian',
          email: 'brian.otieno@example.co.ke',
          fullName: 'Brian Otieno',
          phone: '+254 722 891 044',
          role: 'customer',
          status: 'active',
        },
        {
          uid: 'seed_cust_faith',
          email: 'faith.mutua@example.co.ke',
          fullName: 'Faith Mutua',
          phone: '+254 733 410 920',
          role: 'customer',
          status: 'active',
        },
      ])
      .returning();

    await db.insert(customerProfiles).values([
      {
        userId: sampleCustomers[0].id,
        defaultAddress: 'Yaya Centre Area, Kilimani, Nairobi',
        city: 'Nairobi',
        lat: -1.2925,
        lng: 36.7879,
      },
      {
        userId: sampleCustomers[1].id,
        defaultAddress: 'Rhapta Road, Westlands, Nairobi',
        city: 'Nairobi',
        lat: -1.2635,
        lng: 36.7985,
      },
      {
        userId: sampleCustomers[2].id,
        defaultAddress: 'Karen Hardy, Nairobi',
        city: 'Nairobi',
        lat: -1.3372,
        lng: 36.7311,
      },
    ]);

    // Sample Providers across Nairobi
    const sampleProviderUsers = await db
      .insert(users)
      .values([
        {
          uid: 'seed_prov_kamau',
          email: 'david.kamau@jamiipro.ke',
          fullName: 'David Kamau',
          phone: '+254 720 441 210',
          role: 'provider',
          status: 'active',
        },
        {
          uid: 'seed_prov_njeri',
          email: 'grace.njeri@jamiipro.ke',
          fullName: 'Grace Njeri',
          phone: '+254 711 552 389',
          role: 'provider',
          status: 'active',
        },
        {
          uid: 'seed_prov_omondi',
          email: 'peter.omondi@jamiipro.ke',
          fullName: 'Peter Omondi',
          phone: '+254 724 918 332',
          role: 'provider',
          status: 'active',
        },
        {
          uid: 'seed_prov_hassan',
          email: 'yusuf.hassan@jamiipro.ke',
          fullName: 'Yusuf Hassan',
          phone: '+254 718 773 401',
          role: 'provider',
          status: 'active',
        },
        {
          uid: 'seed_prov_chebet',
          email: 'sharon.chebet@jamiipro.ke',
          fullName: 'Sharon Chebet',
          phone: '+254 726 309 114',
          role: 'provider',
          status: 'active',
        },
        {
          uid: 'seed_prov_mwangi_pending',
          email: 'kelvin.mwangi@jamiipro.ke',
          fullName: 'Kelvin Mwangi',
          phone: '+254 714 220 981',
          role: 'provider',
          status: 'active',
        },
      ])
      .returning();

    const insertedProviders = await db
      .insert(providerProfiles)
      .values([
        {
          userId: sampleProviderUsers[0].id,
          businessName: 'Kamau Precision Plumbing & Solar',
          bio: 'NCA-registered master plumber with 9 years serving Kilimani, Kileleshwa, and Lavington apartments.',
          serviceLocations: 'Kilimani, Kileleshwa, Lavington, Upper Hill',
          baseAddress: 'Argwings Kodhek Rd, Kilimani, Nairobi',
          lat: -1.2912,
          lng: 36.7834,
          yearsExperience: 9,
          verificationStatus: 'approved',
          idNumber: '28491022',
          verificationNotes: 'National ID and NCA Plumber License verified.',
          averageRating: 4.9,
          totalReviews: 2,
          completedJobs: 2,
        },
        {
          userId: sampleProviderUsers[1].id,
          businessName: 'SafiHome Care & Laundry',
          bio: 'Eco-safe residential deep cleaning, sofa steam extraction, and crisp laundry turnaround across Westlands and Parklands.',
          serviceLocations: 'Westlands, Parklands, Spring Valley, Riverside',
          baseAddress: 'Waiyaki Way, Westlands, Nairobi',
          lat: -1.2651,
          lng: 36.8032,
          yearsExperience: 6,
          verificationStatus: 'approved',
          idNumber: '31048291',
          verificationNotes: 'National ID and business permit verified.',
          averageRating: 5.0,
          totalReviews: 1,
          completedJobs: 1,
        },
        {
          userId: sampleProviderUsers[2].id,
          businessName: 'Omondi Volt & Appliance Tech',
          bio: 'EPRA-certified residential electrician, inverter specialist, and washing machine / fridge repair technician.',
          serviceLocations: 'South B, South C, Langata, Kilimani',
          baseAddress: 'Mombasa Rd / South C, Nairobi',
          lat: -1.3189,
          lng: 36.8261,
          yearsExperience: 8,
          verificationStatus: 'approved',
          idNumber: '27319044',
          verificationNotes: 'EPRA Class C1 license verified.',
          averageRating: 4.8,
          totalReviews: 1,
          completedJobs: 1,
        },
        {
          userId: sampleProviderUsers[3].id,
          businessName: 'Rift Valley Timber & Finishes',
          bio: 'Bespoke kitchen cabinetry, door repairs, interior painting, and masonry maintenance in Karen and Langata.',
          serviceLocations: 'Karen, Langata, Ngong Road, Runda',
          baseAddress: 'Karen Shopping Centre, Nairobi',
          lat: -1.3204,
          lng: 36.7069,
          yearsExperience: 11,
          verificationStatus: 'approved',
          idNumber: '25901183',
          verificationNotes: 'Trade test certificate & ID verified.',
          averageRating: 4.9,
          totalReviews: 0,
          completedJobs: 0,
        },
        {
          userId: sampleProviderUsers[4].id,
          businessName: 'Kijani Gardens, Pest & Moving',
          bio: 'NEMA-licensed fumigation, lush compound landscaping, and insured local home relocations.',
          serviceLocations: 'Kitisuru, Runda, Gigiri, Westlands, Lavington',
          baseAddress: 'Limuru Rd, Gigiri, Nairobi',
          lat: -1.2335,
          lng: 36.8112,
          yearsExperience: 7,
          verificationStatus: 'approved',
          idNumber: '30291844',
          verificationNotes: 'NEMA Pest Control certification verified.',
          averageRating: 4.7,
          totalReviews: 0,
          completedJobs: 0,
        },
        {
          userId: sampleProviderUsers[5].id,
          businessName: 'Mwangi CoolAir HVAC Services',
          bio: 'Split AC installation, compressor diagnostics, and commercial chiller servicing.',
          serviceLocations: 'Kilimani, Westlands, CBD, Upper Hill',
          baseAddress: 'Ngong Rd, Adams Arcade, Nairobi',
          lat: -1.3001,
          lng: 36.7812,
          yearsExperience: 5,
          verificationStatus: 'pending',
          idNumber: '33910455',
          verificationNotes: 'Awaiting administrator verification review.',
          averageRating: 5.0,
          totalReviews: 0,
          completedJobs: 0,
        },
      ])
      .returning();

    const insertedServices = await db
      .insert(services)
      .values([
        {
          providerId: insertedProviders[0].id,
          categoryId: catBySlug['plumbing'],
          title: 'Leak Repair & Bathroom Pipe Inspection',
          description: 'Full pressure test, tap & mixer replacement, and drainage unblocking.',
          priceKsh: 2000,
          unitLabel: 'per visit',
        },
        {
          providerId: insertedProviders[0].id,
          categoryId: catBySlug['construction-and-maintenance'],
          title: 'Waterproofing & Bathroom Tiling Repair',
          description: 'Silicone resealing, grout restoration, and minor masonry works.',
          priceKsh: 4500,
          unitLabel: 'per job',
        },
        {
          providerId: insertedProviders[1].id,
          categoryId: catBySlug['house-cleaning'],
          title: '3-Bedroom Apartment Deep Clean',
          description: 'Kitchen degreasing, bathroom descaling, window tracks, and floor polish.',
          priceKsh: 4000,
          unitLabel: 'per session',
        },
        {
          providerId: insertedProviders[1].id,
          categoryId: catBySlug['laundry-services'],
          title: 'Family Wash, Press & Duvet Care (15kg)',
          description: 'Sorted wash, fabric conditioning, steam ironing, and folded delivery.',
          priceKsh: 1800,
          unitLabel: 'per basket',
        },
        {
          providerId: insertedProviders[2].id,
          categoryId: catBySlug['electrical-services'],
          title: 'Circuit Fault Diagnosis & Socket Fitting',
          description: 'DB breaker testing, surge protection, and earthing verification.',
          priceKsh: 2500,
          unitLabel: 'per visit',
        },
        {
          providerId: insertedProviders[2].id,
          categoryId: catBySlug['appliance-repair'],
          title: 'Fridge & Washing Machine Diagnostics',
          description: 'Thermostat, pump, and PCB inspection with genuine spare quotes.',
          priceKsh: 2200,
          unitLabel: 'per appliance',
        },
        {
          providerId: insertedProviders[2].id,
          categoryId: catBySlug['air-conditioning-repair'],
          title: 'Split AC Servicing & Filter Deep Clean',
          description: 'Indoor/outdoor coil wash, drain flush, and refrigerant check.',
          priceKsh: 3500,
          unitLabel: 'per unit',
        },
        {
          providerId: insertedProviders[3].id,
          categoryId: catBySlug['carpentry'],
          title: 'Cabinet Hinge, Lock & Wardrobe Repair',
          description: 'Soft-close hinges, sliding rail alignment, and timber door planing.',
          priceKsh: 2800,
          unitLabel: 'per visit',
        },
        {
          providerId: insertedProviders[3].id,
          categoryId: catBySlug['painting'],
          title: 'Single Room Interior Repainting',
          description: 'Crack filling, two-coat silk vinyl finish, and furniture masking.',
          priceKsh: 6500,
          unitLabel: 'per room',
        },
        {
          providerId: insertedProviders[4].id,
          categoryId: catBySlug['gardening'],
          title: 'Compound Lawn Mowing & Hedge Shaping',
          description: 'Lawn trim, flowerbed weeding, and green waste clearing.',
          priceKsh: 3000,
          unitLabel: 'per visit',
        },
        {
          providerId: insertedProviders[4].id,
          categoryId: catBySlug['pest-control'],
          title: 'Whole-Home Eco Fumigation',
          description: 'Odorless gel & mist treatment for cockroaches, ants, and mosquitoes.',
          priceKsh: 4800,
          unitLabel: 'per residence',
        },
        {
          providerId: insertedProviders[4].id,
          categoryId: catBySlug['moving-services'],
          title: 'Nairobi 2-Bedroom Home Relocation',
          description: 'Closed box truck, 4-person crew, bubble wrap, and bed reassembly.',
          priceKsh: 14000,
          unitLabel: 'per move',
        },
        {
          providerId: insertedProviders[5].id,
          categoryId: catBySlug['air-conditioning-repair'],
          title: 'AC Gas Refill & Thermostat Calibration',
          description: 'R410A/R32 refrigerant top-up and pressure testing.',
          priceKsh: 4200,
          unitLabel: 'per unit',
        },
      ])
      .returning();

    // Seed Bookings across realistic lifecycle statuses
    const b1Breakdown = calculateCommissionBreakdown(2000);
    const b2Breakdown = calculateCommissionBreakdown(4000);
    const b3Breakdown = calculateCommissionBreakdown(2500);
    const b4Breakdown = calculateCommissionBreakdown(2800);
    const b5Breakdown = calculateCommissionBreakdown(1800);

    const insertedBookings = await db
      .insert(bookings)
      .values([
        {
          bookingCode: 'JC-2026-1001',
          customerId: sampleCustomers[0].id,
          providerId: insertedProviders[0].id,
          serviceId: insertedServices[0].id,
          categoryId: catBySlug['plumbing'],
          status: 'Completed',
          scheduledDate: '2026-11-10',
          scheduledTime: '09:30',
          customerAddress: 'Yaya Centre Area, Kilimani, Nairobi',
          customerLat: -1.2925,
          customerLng: 36.7879,
          distanceKm: haversineDistanceKm(-1.2925, 36.7879, -1.2912, 36.7834),
          notes: 'Kitchen sink mixer leaking underneath cabinet.',
          totalAmountKsh: b1Breakdown.grossAmountKsh,
          commissionKsh: b1Breakdown.commissionKsh,
          providerEarningsKsh: b1Breakdown.providerEarningsKsh,
          customerConfirmedCompletion: true,
        },
        {
          bookingCode: 'JC-2026-1002',
          customerId: sampleCustomers[1].id,
          providerId: insertedProviders[1].id,
          serviceId: insertedServices[2].id,
          categoryId: catBySlug['house-cleaning'],
          status: 'Completed',
          scheduledDate: '2026-11-11',
          scheduledTime: '10:00',
          customerAddress: 'Rhapta Road, Westlands, Nairobi',
          customerLat: -1.2635,
          customerLng: 36.7985,
          distanceKm: haversineDistanceKm(-1.2635, 36.7985, -1.2651, 36.8032),
          notes: 'Post-renovation deep clean for 3-bedroom duplex.',
          totalAmountKsh: b2Breakdown.grossAmountKsh,
          commissionKsh: b2Breakdown.commissionKsh,
          providerEarningsKsh: b2Breakdown.providerEarningsKsh,
          customerConfirmedCompletion: true,
        },
        {
          bookingCode: 'JC-2026-1003',
          customerId: sampleCustomers[0].id,
          providerId: insertedProviders[2].id,
          serviceId: insertedServices[4].id,
          categoryId: catBySlug['electrical-services'],
          status: 'In progress',
          scheduledDate: '2026-11-14',
          scheduledTime: '11:00',
          customerAddress: 'Yaya Centre Area, Kilimani, Nairobi',
          customerLat: -1.2925,
          customerLng: 36.7879,
          distanceKm: haversineDistanceKm(-1.2925, 36.7879, -1.3189, 36.8261),
          notes: 'Living room breaker trips when water heater runs.',
          totalAmountKsh: b3Breakdown.grossAmountKsh,
          commissionKsh: b3Breakdown.commissionKsh,
          providerEarningsKsh: b3Breakdown.providerEarningsKsh,
          customerConfirmedCompletion: false,
        },
        {
          bookingCode: 'JC-2026-1004',
          customerId: sampleCustomers[2].id,
          providerId: insertedProviders[3].id,
          serviceId: insertedServices[7].id,
          categoryId: catBySlug['carpentry'],
          status: 'Pending',
          scheduledDate: '2026-11-16',
          scheduledTime: '14:00',
          customerAddress: 'Karen Hardy, Nairobi',
          customerLat: -1.3372,
          customerLng: 36.7311,
          distanceKm: haversineDistanceKm(-1.3372, 36.7311, -1.3204, 36.7069),
          notes: 'Master wardrobe sliding door off track.',
          totalAmountKsh: b4Breakdown.grossAmountKsh,
          commissionKsh: b4Breakdown.commissionKsh,
          providerEarningsKsh: b4Breakdown.providerEarningsKsh,
          customerConfirmedCompletion: false,
        },
        {
          bookingCode: 'JC-2026-1005',
          customerId: sampleCustomers[1].id,
          providerId: insertedProviders[1].id,
          serviceId: insertedServices[3].id,
          categoryId: catBySlug['laundry-services'],
          status: 'Cancelled',
          scheduledDate: '2026-11-09',
          scheduledTime: '08:30',
          customerAddress: 'Rhapta Road, Westlands, Nairobi',
          customerLat: -1.2635,
          customerLng: 36.7985,
          distanceKm: 0.6,
          notes: 'Two duvets and weekly laundry.',
          totalAmountKsh: b5Breakdown.grossAmountKsh,
          commissionKsh: b5Breakdown.commissionKsh,
          providerEarningsKsh: b5Breakdown.providerEarningsKsh,
          customerConfirmedCompletion: false,
          cancellationReason: 'Customer travelled out of Nairobi before pickup window.',
        },
      ])
      .returning();

    // Completed Earnings & Commission Ledger for completed bookings
    await db.insert(providerEarnings).values([
      {
        providerId: insertedProviders[0].id,
        bookingId: insertedBookings[0].id,
        grossAmountKsh: b1Breakdown.grossAmountKsh,
        commissionKsh: b1Breakdown.commissionKsh,
        netEarningsKsh: b1Breakdown.providerEarningsKsh,
        payoutStatus: 'settled',
      },
      {
        providerId: insertedProviders[1].id,
        bookingId: insertedBookings[1].id,
        grossAmountKsh: b2Breakdown.grossAmountKsh,
        commissionKsh: b2Breakdown.commissionKsh,
        netEarningsKsh: b2Breakdown.providerEarningsKsh,
        payoutStatus: 'pending',
      },
    ]);

    await db.insert(commissionTransactions).values([
      {
        bookingId: insertedBookings[0].id,
        grossAmountKsh: b1Breakdown.grossAmountKsh,
        commissionRate: 0.15,
        commissionAmountKsh: b1Breakdown.commissionKsh,
      },
      {
        bookingId: insertedBookings[1].id,
        grossAmountKsh: b2Breakdown.grossAmountKsh,
        commissionRate: 0.15,
        commissionAmountKsh: b2Breakdown.commissionKsh,
      },
    ]);

    await db.insert(payments).values([
      {
        bookingId: insertedBookings[0].id,
        customerId: sampleCustomers[0].id,
        method: 'mpesa_stk',
        status: 'confirmed',
        amountKsh: 2000,
        mpesaPhone: '254712345678',
        mpesaReceiptNumber: 'UK94JM281Q',
        gatewayReference: 'JC-PAY-1001',
        notes: 'Historical sample M-Pesa confirmation',
      },
      {
        bookingId: insertedBookings[1].id,
        customerId: sampleCustomers[1].id,
        method: 'card',
        status: 'awaiting_gateway',
        amountKsh: 4000,
        cardLast4: '4242',
        gatewayReference: 'JC-PAY-1002',
        notes: 'Awaiting live payment gateway settlement webhook',
      },
    ]);

    await db.insert(reviews).values([
      {
        bookingId: insertedBookings[0].id,
        customerId: sampleCustomers[0].id,
        providerId: insertedProviders[0].id,
        rating: 5,
        comment:
          'David arrived on time in Kilimani, replaced the brass valve cleanly, and left zero mess.',
      },
      {
        bookingId: insertedBookings[1].id,
        customerId: sampleCustomers[1].id,
        providerId: insertedProviders[1].id,
        rating: 5,
        comment:
          'SafiHome team did an incredible job with our Westlands apartment. Spotless kitchen and windows.',
      },
    ]);

    await db.insert(messages).values([
      {
        bookingId: insertedBookings[2].id,
        senderUserId: sampleCustomers[0].id,
        body: 'Hi Peter, the gate guard has your name. Ring Bell 4B on arrival.',
      },
      {
        bookingId: insertedBookings[2].id,
        senderUserId: sampleProviderUsers[2].id,
        body: 'Thank you Amina, I am on site inspecting the distribution board now.',
      },
    ]);

    await db.insert(notifications).values([
      {
        userId: sampleProviderUsers[3].id,
        title: 'New Booking Request JC-2026-1004',
        body: 'Faith Mutua requested Cabinet Hinge, Lock & Wardrobe Repair in Karen Hardy.',
        bookingId: insertedBookings[3].id,
        isRead: false,
      },
    ]);

      seeded = true;
      console.log('Seeded JAMII CONNECT marketplace database successfully.');
    } catch (err) {
      console.error('Seed error:', err);
    } finally {
      seedPromise = null;
    }
  })();

  return seedPromise;
}
