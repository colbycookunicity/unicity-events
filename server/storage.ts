import {
  users, events, registrations, guests, flights, reimbursements, otpSessions,
  type User, type InsertUser,
  type Event, type InsertEvent,
  type Registration, type InsertRegistration,
  type Guest, type InsertGuest,
  type Flight, type InsertFlight,
  type Reimbursement, type InsertReimbursement,
  type OtpSession, type InsertOtpSession,
  type EventWithStats, type RegistrationWithDetails,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, sql, count } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

  // Events
  getEvents(): Promise<EventWithStats[]>;
  getEvent(id: string): Promise<Event | undefined>;
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

  // Stats
  getDashboardStats(): Promise<{
    totalEvents: number;
    totalRegistrations: number;
    checkedInCount: number;
    upcomingEvents: number;
  }>;
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
}

export const storage = new DatabaseStorage();
