import {
  users, events, registrations, guests, flights, reimbursements, otpSessions, authSessions,
  swagItems, swagAssignments, qualifiedRegistrants,
  type User, type InsertUser,
  type Event, type InsertEvent,
  type Registration, type InsertRegistration,
  type Guest, type InsertGuest,
  type Flight, type InsertFlight,
  type Reimbursement, type InsertReimbursement,
  type OtpSession, type InsertOtpSession,
  type AuthSession, type InsertAuthSession,
  type SwagItem, type InsertSwagItem,
  type SwagAssignment, type InsertSwagAssignment,
  type QualifiedRegistrant, type InsertQualifiedRegistrant,
  type EventWithStats, type RegistrationWithDetails,
  type SwagItemWithStats, type SwagAssignmentWithDetails,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, sql, count, or } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

  // Events
  getEvents(): Promise<EventWithStats[]>;
  getEvent(id: string): Promise<Event | undefined>;
  getEventBySlug(slug: string): Promise<Event | undefined>;
  getEventByIdOrSlug(idOrSlug: string): Promise<Event | undefined>;
  getRecentEvents(limit?: number): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<boolean>;

  // Registrations
  getRegistrations(eventId?: string): Promise<Registration[]>;
  getRegistration(id: string): Promise<RegistrationWithDetails | undefined>;
  getRegistrationByEmail(eventId: string, email: string): Promise<Registration | undefined>;
  getRecentRegistrations(limit?: number): Promise<Registration[]>;
  getRegistrationsByUser(email: string): Promise<RegistrationWithDetails[]>;
  createRegistration(registration: InsertRegistration): Promise<Registration>;
  updateRegistration(id: string, data: Partial<InsertRegistration>): Promise<Registration | undefined>;
  deleteRegistration(id: string): Promise<boolean>;
  checkInRegistration(id: string, checkedInBy: string): Promise<Registration | undefined>;

  // Guests
  getGuestsByRegistration(registrationId: string): Promise<Guest[]>;
  createGuest(guest: InsertGuest): Promise<Guest>;
  updateGuest(id: string, data: Partial<InsertGuest>): Promise<Guest | undefined>;
  deleteGuest(id: string): Promise<boolean>;

  // Flights
  getFlightsByRegistration(registrationId: string): Promise<Flight[]>;
  createFlight(flight: InsertFlight): Promise<Flight>;
  updateFlight(id: string, data: Partial<InsertFlight>): Promise<Flight | undefined>;
  deleteFlight(id: string): Promise<boolean>;

  // Reimbursements
  getReimbursementsByRegistration(registrationId: string): Promise<Reimbursement[]>;
  createReimbursement(reimbursement: InsertReimbursement): Promise<Reimbursement>;
  updateReimbursement(id: string, data: Partial<InsertReimbursement>): Promise<Reimbursement | undefined>;
  deleteReimbursement(id: string): Promise<boolean>;

  // OTP Sessions
  getOtpSession(email: string): Promise<OtpSession | undefined>;
  createOtpSession(session: InsertOtpSession): Promise<OtpSession>;
  updateOtpSession(id: string, data: Partial<InsertOtpSession>): Promise<OtpSession | undefined>;
  deleteOtpSession(id: string): Promise<boolean>;

  // Auth Sessions
  getAuthSession(token: string): Promise<AuthSession | undefined>;
  createAuthSession(session: InsertAuthSession): Promise<AuthSession>;
  deleteAuthSession(token: string): Promise<boolean>;

  // Stats
  getDashboardStats(): Promise<{
    totalEvents: number;
    totalRegistrations: number;
    checkedInCount: number;
    upcomingEvents: number;
  }>;

  // Swag Items
  getSwagItemsByEvent(eventId: string): Promise<SwagItemWithStats[]>;
  getSwagItem(id: string): Promise<SwagItem | undefined>;
  createSwagItem(item: InsertSwagItem): Promise<SwagItem>;
  updateSwagItem(id: string, data: Partial<InsertSwagItem>): Promise<SwagItem | undefined>;
  deleteSwagItem(id: string): Promise<boolean>;

  // Swag Assignments
  getSwagAssignmentsByItem(swagItemId: string): Promise<SwagAssignmentWithDetails[]>;
  getSwagAssignmentsByRegistration(registrationId: string): Promise<SwagAssignmentWithDetails[]>;
  getSwagAssignmentsByGuest(guestId: string): Promise<SwagAssignmentWithDetails[]>;
  getSwagAssignmentsByEvent(eventId: string): Promise<SwagAssignmentWithDetails[]>;
  createSwagAssignment(assignment: InsertSwagAssignment): Promise<SwagAssignment>;
  updateSwagAssignment(id: string, data: Partial<InsertSwagAssignment>): Promise<SwagAssignment | undefined>;
  deleteSwagAssignment(id: string): Promise<boolean>;
  markSwagReceived(id: string, receivedBy: string): Promise<SwagAssignment | undefined>;

  // Qualified Registrants
  getQualifiedRegistrantsByEvent(eventId: string): Promise<QualifiedRegistrant[]>;
  getQualifiedRegistrant(id: string): Promise<QualifiedRegistrant | undefined>;
  getQualifiedRegistrantByEmail(eventId: string, email: string): Promise<QualifiedRegistrant | undefined>;
  getQualifyingEventsForEmail(email: string): Promise<{ event: Event; registration: Registration | null; qualifiedRegistrant: QualifiedRegistrant | null }[]>;
  createQualifiedRegistrant(registrant: InsertQualifiedRegistrant): Promise<QualifiedRegistrant>;
  createQualifiedRegistrantsBulk(registrants: InsertQualifiedRegistrant[]): Promise<QualifiedRegistrant[]>;
  updateQualifiedRegistrant(id: string, data: Partial<InsertQualifiedRegistrant>): Promise<QualifiedRegistrant | undefined>;
  deleteQualifiedRegistrant(id: string): Promise<boolean>;
  deleteQualifiedRegistrantsByEvent(eventId: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set({ ...data, lastModified: new Date() }).where(eq(users.id, id)).returning();
    return updated || undefined;
  }

  // Events
  async getEvents(): Promise<EventWithStats[]> {
    const eventsData = await db.select().from(events).orderBy(desc(events.startDate));
    
    const eventsWithStats: EventWithStats[] = await Promise.all(
      eventsData.map(async (event) => {
        const [regStats] = await db
          .select({
            total: count(),
            checkedIn: sql<number>`count(*) filter (where ${registrations.status} = 'checked_in')`,
          })
          .from(registrations)
          .where(eq(registrations.eventId, event.id));

        return {
          ...event,
          totalRegistrations: Number(regStats?.total) || 0,
          checkedInCount: Number(regStats?.checkedIn) || 0,
        };
      })
    );

    return eventsWithStats;
  }

  async getEvent(id: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event || undefined;
  }

  async getEventBySlug(slug: string): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.slug, slug));
    return event || undefined;
  }

  async getEventByIdOrSlug(idOrSlug: string): Promise<Event | undefined> {
    // Try by ID first (UUIDs are specific format), then by slug
    const [event] = await db.select().from(events).where(
      or(eq(events.id, idOrSlug), eq(events.slug, idOrSlug))
    );
    return event || undefined;
  }

  async getRecentEvents(limit = 5): Promise<Event[]> {
    return db.select().from(events).orderBy(desc(events.startDate)).limit(limit);
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [newEvent] = await db.insert(events).values(event).returning();
    return newEvent;
  }

  async updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined> {
    const [updated] = await db.update(events).set({ ...data, lastModified: new Date() }).where(eq(events.id, id)).returning();
    return updated || undefined;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const result = await db.delete(events).where(eq(events.id, id));
    return true;
  }

  // Registrations
  async getRegistrations(eventId?: string): Promise<Registration[]> {
    if (eventId && eventId !== "all") {
      return db.select().from(registrations).where(eq(registrations.eventId, eventId)).orderBy(desc(registrations.createdAt));
    }
    return db.select().from(registrations).orderBy(desc(registrations.createdAt));
  }

  async getRegistration(id: string): Promise<RegistrationWithDetails | undefined> {
    const [reg] = await db.select().from(registrations).where(eq(registrations.id, id));
    if (!reg) return undefined;

    const regGuests = await db.select().from(guests).where(eq(guests.registrationId, id));
    const regFlights = await db.select().from(flights).where(eq(flights.registrationId, id));
    const regReimbursements = await db.select().from(reimbursements).where(eq(reimbursements.registrationId, id));

    return {
      ...reg,
      guests: regGuests,
      flights: regFlights,
      reimbursements: regReimbursements,
    };
  }

  async getRegistrationByEmail(eventId: string, email: string): Promise<Registration | undefined> {
    const [reg] = await db.select().from(registrations)
      .where(and(eq(registrations.eventId, eventId), eq(registrations.email, email)));
    return reg || undefined;
  }

  async getRecentRegistrations(limit = 10): Promise<Registration[]> {
    return db.select().from(registrations).orderBy(desc(registrations.createdAt)).limit(limit);
  }

  async getRegistrationsByUser(email: string): Promise<RegistrationWithDetails[]> {
    const regs = await db.select().from(registrations).where(eq(registrations.email, email));
    
    return Promise.all(
      regs.map(async (reg) => {
        const regGuests = await db.select().from(guests).where(eq(guests.registrationId, reg.id));
        const regFlights = await db.select().from(flights).where(eq(flights.registrationId, reg.id));
        const regReimbursements = await db.select().from(reimbursements).where(eq(reimbursements.registrationId, reg.id));

        return {
          ...reg,
          guests: regGuests,
          flights: regFlights,
          reimbursements: regReimbursements,
        };
      })
    );
  }

  async createRegistration(registration: InsertRegistration): Promise<Registration> {
    const [newReg] = await db.insert(registrations).values(registration).returning();
    return newReg;
  }

  async updateRegistration(id: string, data: Partial<InsertRegistration>): Promise<Registration | undefined> {
    const [updated] = await db.update(registrations).set({ ...data, lastModified: new Date() }).where(eq(registrations.id, id)).returning();
    return updated || undefined;
  }

  async deleteRegistration(id: string): Promise<boolean> {
    await db.delete(registrations).where(eq(registrations.id, id));
    return true;
  }

  async checkInRegistration(id: string, checkedInBy: string): Promise<Registration | undefined> {
    const [updated] = await db.update(registrations).set({
      status: "checked_in",
      checkedInAt: new Date(),
      checkedInBy,
      lastModified: new Date(),
    }).where(eq(registrations.id, id)).returning();
    return updated || undefined;
  }

  // Guests
  async getGuestsByRegistration(registrationId: string): Promise<Guest[]> {
    return db.select().from(guests).where(eq(guests.registrationId, registrationId));
  }

  async createGuest(guest: InsertGuest): Promise<Guest> {
    const [newGuest] = await db.insert(guests).values(guest).returning();
    return newGuest;
  }

  async updateGuest(id: string, data: Partial<InsertGuest>): Promise<Guest | undefined> {
    const [updated] = await db.update(guests).set({ ...data, lastModified: new Date() }).where(eq(guests.id, id)).returning();
    return updated || undefined;
  }

  async deleteGuest(id: string): Promise<boolean> {
    await db.delete(guests).where(eq(guests.id, id));
    return true;
  }

  // Flights
  async getFlightsByRegistration(registrationId: string): Promise<Flight[]> {
    return db.select().from(flights).where(eq(flights.registrationId, registrationId));
  }

  async createFlight(flight: InsertFlight): Promise<Flight> {
    const [newFlight] = await db.insert(flights).values(flight).returning();
    return newFlight;
  }

  async updateFlight(id: string, data: Partial<InsertFlight>): Promise<Flight | undefined> {
    const [updated] = await db.update(flights).set({ ...data, lastModified: new Date() }).where(eq(flights.id, id)).returning();
    return updated || undefined;
  }

  async deleteFlight(id: string): Promise<boolean> {
    await db.delete(flights).where(eq(flights.id, id));
    return true;
  }

  // Reimbursements
  async getReimbursementsByRegistration(registrationId: string): Promise<Reimbursement[]> {
    return db.select().from(reimbursements).where(eq(reimbursements.registrationId, registrationId));
  }

  async createReimbursement(reimbursement: InsertReimbursement): Promise<Reimbursement> {
    const [newReimb] = await db.insert(reimbursements).values(reimbursement).returning();
    return newReimb;
  }

  async updateReimbursement(id: string, data: Partial<InsertReimbursement>): Promise<Reimbursement | undefined> {
    const [updated] = await db.update(reimbursements).set({ ...data, lastModified: new Date() }).where(eq(reimbursements.id, id)).returning();
    return updated || undefined;
  }

  async deleteReimbursement(id: string): Promise<boolean> {
    await db.delete(reimbursements).where(eq(reimbursements.id, id));
    return true;
  }

  // OTP Sessions
  async getOtpSession(email: string): Promise<OtpSession | undefined> {
    const [session] = await db.select().from(otpSessions)
      .where(and(eq(otpSessions.email, email), gte(otpSessions.expiresAt, new Date())))
      .orderBy(desc(otpSessions.createdAt));
    return session || undefined;
  }

  async createOtpSession(session: InsertOtpSession): Promise<OtpSession> {
    const [newSession] = await db.insert(otpSessions).values(session).returning();
    return newSession;
  }

  async updateOtpSession(id: string, data: Partial<InsertOtpSession>): Promise<OtpSession | undefined> {
    const [updated] = await db.update(otpSessions).set(data).where(eq(otpSessions.id, id)).returning();
    return updated || undefined;
  }

  async deleteOtpSession(id: string): Promise<boolean> {
    await db.delete(otpSessions).where(eq(otpSessions.id, id));
    return true;
  }

  // Auth Sessions
  async getAuthSession(token: string): Promise<AuthSession | undefined> {
    const [session] = await db.select().from(authSessions)
      .where(and(eq(authSessions.token, token), gte(authSessions.expiresAt, new Date())));
    return session || undefined;
  }

  async createAuthSession(session: InsertAuthSession): Promise<AuthSession> {
    const [newSession] = await db.insert(authSessions).values(session).returning();
    return newSession;
  }

  async deleteAuthSession(token: string): Promise<boolean> {
    await db.delete(authSessions).where(eq(authSessions.token, token));
    return true;
  }

  // Stats
  async getDashboardStats() {
    const [eventStats] = await db.select({ total: count() }).from(events);
    const [regStats] = await db.select({
      total: count(),
      checkedIn: sql<number>`count(*) filter (where ${registrations.status} = 'checked_in')`,
    }).from(registrations);
    const [upcomingStats] = await db.select({ total: count() })
      .from(events)
      .where(and(gte(events.startDate, new Date()), eq(events.status, "published")));

    return {
      totalEvents: Number(eventStats?.total) || 0,
      totalRegistrations: Number(regStats?.total) || 0,
      checkedInCount: Number(regStats?.checkedIn) || 0,
      upcomingEvents: Number(upcomingStats?.total) || 0,
    };
  }

  // Swag Items
  async getSwagItemsByEvent(eventId: string): Promise<SwagItemWithStats[]> {
    const items = await db.select().from(swagItems)
      .where(eq(swagItems.eventId, eventId))
      .orderBy(swagItems.sortOrder, swagItems.name);
    
    const itemsWithStats: SwagItemWithStats[] = await Promise.all(
      items.map(async (item) => {
        const [stats] = await db
          .select({
            assignedCount: count(),
            receivedCount: sql<number>`count(*) filter (where ${swagAssignments.status} = 'received')`,
          })
          .from(swagAssignments)
          .where(eq(swagAssignments.swagItemId, item.id));
        
        const assignedCount = Number(stats?.assignedCount) || 0;
        return {
          ...item,
          assignedCount,
          receivedCount: Number(stats?.receivedCount) || 0,
          remainingQuantity: item.totalQuantity - assignedCount,
        };
      })
    );
    
    return itemsWithStats;
  }

  async getSwagItem(id: string): Promise<SwagItem | undefined> {
    const [item] = await db.select().from(swagItems).where(eq(swagItems.id, id));
    return item || undefined;
  }

  async createSwagItem(item: InsertSwagItem): Promise<SwagItem> {
    const [newItem] = await db.insert(swagItems).values(item).returning();
    return newItem;
  }

  async updateSwagItem(id: string, data: Partial<InsertSwagItem>): Promise<SwagItem | undefined> {
    const [updated] = await db.update(swagItems)
      .set({ ...data, lastModified: new Date() })
      .where(eq(swagItems.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSwagItem(id: string): Promise<boolean> {
    await db.delete(swagAssignments).where(eq(swagAssignments.swagItemId, id));
    await db.delete(swagItems).where(eq(swagItems.id, id));
    return true;
  }

  // Swag Assignments
  async getSwagAssignmentsByItem(swagItemId: string): Promise<SwagAssignmentWithDetails[]> {
    const assignments = await db.select().from(swagAssignments)
      .where(eq(swagAssignments.swagItemId, swagItemId));
    
    return Promise.all(assignments.map(async (assignment) => {
      const [item] = await db.select().from(swagItems).where(eq(swagItems.id, assignment.swagItemId));
      const registration = assignment.registrationId 
        ? (await db.select().from(registrations).where(eq(registrations.id, assignment.registrationId)))[0]
        : undefined;
      const guest = assignment.guestId 
        ? (await db.select().from(guests).where(eq(guests.id, assignment.guestId)))[0]
        : undefined;
      
      return { ...assignment, swagItem: item, registration, guest };
    }));
  }

  async getSwagAssignmentsByRegistration(registrationId: string): Promise<SwagAssignmentWithDetails[]> {
    const assignments = await db.select().from(swagAssignments)
      .where(eq(swagAssignments.registrationId, registrationId));
    
    return Promise.all(assignments.map(async (assignment) => {
      const [item] = await db.select().from(swagItems).where(eq(swagItems.id, assignment.swagItemId));
      return { ...assignment, swagItem: item };
    }));
  }

  async getSwagAssignmentsByGuest(guestId: string): Promise<SwagAssignmentWithDetails[]> {
    const assignments = await db.select().from(swagAssignments)
      .where(eq(swagAssignments.guestId, guestId));
    
    return Promise.all(assignments.map(async (assignment) => {
      const [item] = await db.select().from(swagItems).where(eq(swagItems.id, assignment.swagItemId));
      return { ...assignment, swagItem: item };
    }));
  }

  async getSwagAssignmentsByEvent(eventId: string): Promise<SwagAssignmentWithDetails[]> {
    const items = await db.select().from(swagItems).where(eq(swagItems.eventId, eventId));
    const itemIds = items.map(i => i.id);
    
    if (itemIds.length === 0) return [];
    
    const assignments = await db.select().from(swagAssignments)
      .where(sql`${swagAssignments.swagItemId} = ANY(${itemIds})`);
    
    return Promise.all(assignments.map(async (assignment) => {
      const [item] = await db.select().from(swagItems).where(eq(swagItems.id, assignment.swagItemId));
      const registration = assignment.registrationId 
        ? (await db.select().from(registrations).where(eq(registrations.id, assignment.registrationId)))[0]
        : undefined;
      const guest = assignment.guestId 
        ? (await db.select().from(guests).where(eq(guests.id, assignment.guestId)))[0]
        : undefined;
      
      return { ...assignment, swagItem: item, registration, guest };
    }));
  }

  async createSwagAssignment(assignment: InsertSwagAssignment): Promise<SwagAssignment> {
    const [newAssignment] = await db.insert(swagAssignments).values(assignment).returning();
    return newAssignment;
  }

  async updateSwagAssignment(id: string, data: Partial<InsertSwagAssignment>): Promise<SwagAssignment | undefined> {
    const [updated] = await db.update(swagAssignments)
      .set({ ...data, lastModified: new Date() })
      .where(eq(swagAssignments.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteSwagAssignment(id: string): Promise<boolean> {
    await db.delete(swagAssignments).where(eq(swagAssignments.id, id));
    return true;
  }

  async markSwagReceived(id: string, receivedBy: string): Promise<SwagAssignment | undefined> {
    const [updated] = await db.update(swagAssignments)
      .set({ 
        status: 'received', 
        receivedAt: new Date(), 
        receivedBy,
        lastModified: new Date() 
      })
      .where(eq(swagAssignments.id, id))
      .returning();
    return updated || undefined;
  }

  // Qualified Registrants
  async getQualifiedRegistrantsByEvent(eventId: string): Promise<QualifiedRegistrant[]> {
    return db.select().from(qualifiedRegistrants)
      .where(eq(qualifiedRegistrants.eventId, eventId))
      .orderBy(qualifiedRegistrants.lastName, qualifiedRegistrants.firstName);
  }

  async getQualifiedRegistrant(id: string): Promise<QualifiedRegistrant | undefined> {
    const [registrant] = await db.select().from(qualifiedRegistrants).where(eq(qualifiedRegistrants.id, id));
    return registrant || undefined;
  }

  async getQualifiedRegistrantByEmail(eventId: string, email: string): Promise<QualifiedRegistrant | undefined> {
    const [registrant] = await db.select().from(qualifiedRegistrants)
      .where(and(
        eq(qualifiedRegistrants.eventId, eventId),
        sql`LOWER(${qualifiedRegistrants.email}) = LOWER(${email})`
      ));
    return registrant || undefined;
  }

  async createQualifiedRegistrant(registrant: InsertQualifiedRegistrant): Promise<QualifiedRegistrant> {
    const [newRegistrant] = await db.insert(qualifiedRegistrants).values(registrant).returning();
    return newRegistrant;
  }

  async createQualifiedRegistrantsBulk(registrants: InsertQualifiedRegistrant[]): Promise<QualifiedRegistrant[]> {
    if (registrants.length === 0) return [];
    return db.insert(qualifiedRegistrants).values(registrants).returning();
  }

  async updateQualifiedRegistrant(id: string, data: Partial<InsertQualifiedRegistrant>): Promise<QualifiedRegistrant | undefined> {
    const [updated] = await db.update(qualifiedRegistrants)
      .set({ ...data, lastModified: new Date() })
      .where(eq(qualifiedRegistrants.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteQualifiedRegistrant(id: string): Promise<boolean> {
    await db.delete(qualifiedRegistrants).where(eq(qualifiedRegistrants.id, id));
    return true;
  }

  async deleteQualifiedRegistrantsByEvent(eventId: string): Promise<number> {
    const result = await db.delete(qualifiedRegistrants)
      .where(eq(qualifiedRegistrants.eventId, eventId))
      .returning();
    return result.length;
  }

  async getQualifyingEventsForEmail(email: string): Promise<{ event: Event; registration: Registration | null; qualifiedRegistrant: QualifiedRegistrant | null }[]> {
    // Get all published events
    const publishedEvents = await db.select().from(events)
      .where(eq(events.status, 'published'))
      .orderBy(desc(events.startDate));

    const results: { event: Event; registration: Registration | null; qualifiedRegistrant: QualifiedRegistrant | null }[] = [];

    for (const event of publishedEvents) {
      // Check if user has existing registration
      const [existingReg] = await db.select().from(registrations)
        .where(and(
          eq(registrations.eventId, event.id),
          sql`LOWER(${registrations.email}) = LOWER(${email})`
        ));

      if (existingReg) {
        results.push({ event, registration: existingReg, qualifiedRegistrant: null });
        continue;
      }

      // Check if event requires qualification
      if (event.requiresQualification) {
        // Check qualified registrants list
        const [qualifiedReg] = await db.select().from(qualifiedRegistrants)
          .where(and(
            eq(qualifiedRegistrants.eventId, event.id),
            sql`LOWER(${qualifiedRegistrants.email}) = LOWER(${email})`
          ));

        if (qualifiedReg) {
          // Check if qualification period is active (check each boundary independently)
          const now = new Date();
          let isWithinWindow = true;
          
          if (event.qualificationStartDate) {
            const start = new Date(event.qualificationStartDate);
            if (now < start) {
              isWithinWindow = false;
            }
          }
          
          if (event.qualificationEndDate) {
            const end = new Date(event.qualificationEndDate);
            if (now > end) {
              isWithinWindow = false;
            }
          }
          
          if (isWithinWindow) {
            results.push({ event, registration: null, qualifiedRegistrant: qualifiedReg });
          }
        }
      } else {
        // Open event - anyone can register
        results.push({ event, registration: null, qualifiedRegistrant: null });
      }
    }

    return results;
  }
}

export const storage = new DatabaseStorage();
