import {
  users, events, registrations, guests, flights, reimbursements, otpSessions, authSessions, attendeeSessions,
  swagItems, swagAssignments, qualifiedRegistrants, eventPages, eventPageSections, guestAllowanceRules,
  formTemplates, eventManagerAssignments, printers, printLogs,
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
  type EventPage, type InsertEventPage,
  type EventPageSection, type InsertEventPageSection,
  type GuestAllowanceRule, type InsertGuestAllowanceRule,
  type FormTemplate,
  type EventManagerAssignment, type InsertEventManagerAssignment,
  type Printer, type InsertPrinter,
  type PrintLog, type InsertPrintLog,
  type EventWithStats, type RegistrationWithDetails,
  type SwagItemWithStats, type SwagAssignmentWithDetails,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, sql, count, or } from "drizzle-orm";

export interface IStorage {
  // Users
  getAllUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // Events
  getEvents(): Promise<EventWithStats[]>;
  getEvent(id: string): Promise<Event | undefined>;
  getEventBySlug(slug: string): Promise<Event | undefined>;
  getEventByIdOrSlug(idOrSlug: string): Promise<Event | undefined>;
  getRecentEvents(limit?: number): Promise<Event[]>;
  getPublicEvents(): Promise<Event[]>;
  createEvent(event: InsertEvent): Promise<Event>;
  updateEvent(id: string, data: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: string): Promise<boolean>;

  // Registrations
  getRegistrations(eventId?: string): Promise<Registration[]>;
  getRegistration(id: string): Promise<RegistrationWithDetails | undefined>;
  getRegistrationByEmail(eventId: string, email: string): Promise<Registration | undefined>;
  getRegistrationWithDetailsByEmail(eventId: string, email: string): Promise<RegistrationWithDetails | undefined>;
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
  getOtpSessionForRegistration(email: string, eventId: string): Promise<OtpSession | undefined>;
  getOtpSessionForAttendeePortal(email: string): Promise<OtpSession | undefined>;
  getOtpSessionByRedirectToken(token: string): Promise<OtpSession | undefined>;
  createOtpSession(session: InsertOtpSession): Promise<OtpSession>;
  updateOtpSession(id: string, data: Partial<OtpSession>): Promise<OtpSession | undefined>;
  deleteOtpSession(id: string): Promise<boolean>;

  // Auth Sessions
  getAuthSession(token: string): Promise<AuthSession | undefined>;
  createAuthSession(session: InsertAuthSession): Promise<AuthSession>;
  deleteAuthSession(token: string): Promise<boolean>;

  // Attendee Sessions
  createAttendeeSession(email: string): Promise<{ token: string; expiresAt: Date }>;
  getAttendeeSessionByToken(token: string): Promise<{ email: string; expiresAt: Date } | undefined>;
  deleteAttendeeSession(token: string): Promise<boolean>;

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

  // Form Templates
  getFormTemplates(): Promise<FormTemplate[]>;
  getFormTemplate(id: string): Promise<FormTemplate | undefined>;
  getFormTemplateByKey(key: string): Promise<FormTemplate | undefined>;

  // Qualified Registrants
  getAllQualifiedRegistrants(): Promise<(QualifiedRegistrant & { eventName: string })[]>;
  getQualifiedRegistrantsByEvent(eventId: string): Promise<QualifiedRegistrant[]>;
  getQualifiedRegistrant(id: string): Promise<QualifiedRegistrant | undefined>;
  getQualifiedRegistrantByEmail(eventId: string, email: string): Promise<QualifiedRegistrant | undefined>;
  getQualifyingEventsForEmail(email: string): Promise<{ event: Event; registration: Registration | null; qualifiedRegistrant: QualifiedRegistrant | null }[]>;
  createQualifiedRegistrant(registrant: InsertQualifiedRegistrant): Promise<QualifiedRegistrant>;
  createQualifiedRegistrantsBulk(registrants: InsertQualifiedRegistrant[]): Promise<QualifiedRegistrant[]>;
  updateQualifiedRegistrant(id: string, data: Partial<InsertQualifiedRegistrant>): Promise<QualifiedRegistrant | undefined>;
  deleteQualifiedRegistrant(id: string): Promise<boolean>;
  deleteQualifiedRegistrantsByEvent(eventId: string): Promise<number>;

  // Event Pages
  getEventPageByEventId(eventId: string, pageType?: string): Promise<EventPage | undefined>;
  getEventPageWithSections(eventId: string, pageType?: string): Promise<{ page: EventPage; sections: EventPageSection[] } | undefined>;
  createEventPage(page: InsertEventPage): Promise<EventPage>;
  updateEventPage(id: string, data: Partial<InsertEventPage>): Promise<EventPage | undefined>;
  deleteEventPage(id: string): Promise<boolean>;

  // Event Page Sections
  getEventPageSections(pageId: string): Promise<EventPageSection[]>;
  getEventPageSection(id: string): Promise<EventPageSection | undefined>;
  createEventPageSection(section: InsertEventPageSection): Promise<EventPageSection>;
  updateEventPageSection(id: string, data: Partial<InsertEventPageSection>): Promise<EventPageSection | undefined>;
  deleteEventPageSection(id: string): Promise<boolean>;
  reorderEventPageSections(pageId: string, sectionIds: string[]): Promise<void>;

  // Guest Allowance Rules
  getGuestAllowanceRulesByEvent(eventId: string): Promise<GuestAllowanceRule[]>;
  getGuestAllowanceRule(id: string): Promise<GuestAllowanceRule | undefined>;
  getDefaultGuestAllowanceRule(eventId: string): Promise<GuestAllowanceRule | undefined>;
  createGuestAllowanceRule(rule: InsertGuestAllowanceRule): Promise<GuestAllowanceRule>;
  updateGuestAllowanceRule(id: string, data: Partial<InsertGuestAllowanceRule>): Promise<GuestAllowanceRule | undefined>;
  deleteGuestAllowanceRule(id: string): Promise<boolean>;
  setDefaultGuestAllowanceRule(eventId: string, ruleId: string): Promise<void>;

  // Event Manager Assignments
  getEventManagerAssignments(eventId: string): Promise<(EventManagerAssignment & { user: User })[]>;
  getEventsForManager(userId: string): Promise<EventWithStats[]>;
  canUserAccessEvent(userId: string, eventId: string, userRole: string): Promise<boolean>;
  assignEventManager(eventId: string, userId: string, assignedBy: string): Promise<EventManagerAssignment>;
  removeEventManager(eventId: string, userId: string): Promise<boolean>;

  // Printers
  getPrintersByEvent(eventId: string): Promise<Printer[]>;
  getPrinter(id: string): Promise<Printer | undefined>;
  createPrinter(printer: InsertPrinter): Promise<Printer>;
  updatePrinter(id: string, data: Partial<InsertPrinter>): Promise<Printer | undefined>;
  deletePrinter(id: string): Promise<boolean>;

  // Print Logs
  getPrintLogsByRegistration(registrationId: string): Promise<PrintLog[]>;
  getPrintLogsByEvent(eventId: string): Promise<PrintLog[]>;
  getPrintLog(id: string): Promise<PrintLog | undefined>;
  createPrintLog(log: InsertPrintLog): Promise<PrintLog>;
  updatePrintLog(id: string, data: Partial<InsertPrintLog>): Promise<PrintLog | undefined>;
  recordBadgePrint(registrationId: string): Promise<Registration | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

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

  async deleteUser(id: string): Promise<boolean> {
    // First delete any auth sessions for this user
    await db.delete(authSessions).where(eq(authSessions.userId, id));
    
    // Set foreign key references to NULL to avoid constraint violations
    // Events created by this user
    await db.update(events).set({ createdBy: null }).where(eq(events.createdBy, id));
    
    // Registrations checked in by this user
    await db.update(registrations).set({ checkedInBy: null }).where(eq(registrations.checkedInBy, id));
    
    // Reimbursements processed by this user
    await db.update(reimbursements).set({ processedBy: null }).where(eq(reimbursements.processedBy, id));
    
    // Qualified registrants imported by this user
    await db.update(qualifiedRegistrants).set({ importedBy: null }).where(eq(qualifiedRegistrants.importedBy, id));
    
    // Event manager assignments where this user assigned someone (assignedBy field)
    // Note: eventManagerAssignments.userId has ON DELETE CASCADE, so those rows will be deleted automatically
    await db.update(eventManagerAssignments).set({ assignedBy: null }).where(eq(eventManagerAssignments.assignedBy, id));
    
    // Then delete the user
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
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

  async getPublicEvents(): Promise<Event[]> {
    return db.select().from(events)
      .where(eq(events.status, "published"))
      .orderBy(desc(events.startDate));
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
    // Get all registrations for this event to delete their related data
    const eventRegistrations = await db.select({ id: registrations.id }).from(registrations).where(eq(registrations.eventId, id));
    
    // Delete all registration-related data (guests, flights, reimbursements)
    for (const reg of eventRegistrations) {
      await db.delete(guests).where(eq(guests.registrationId, reg.id));
      await db.delete(flights).where(eq(flights.registrationId, reg.id));
      await db.delete(reimbursements).where(eq(reimbursements.registrationId, reg.id));
    }
    
    // Delete registrations
    await db.delete(registrations).where(eq(registrations.eventId, id));
    
    // Delete qualified registrants
    await db.delete(qualifiedRegistrants).where(eq(qualifiedRegistrants.eventId, id));
    
    // Delete swag assignments for this event's swag items
    const eventSwagItems = await db.select({ id: swagItems.id }).from(swagItems).where(eq(swagItems.eventId, id));
    for (const item of eventSwagItems) {
      await db.delete(swagAssignments).where(eq(swagAssignments.swagItemId, item.id));
    }
    
    // Delete swag items
    await db.delete(swagItems).where(eq(swagItems.eventId, id));
    
    // Delete guest allowance rules
    await db.delete(guestAllowanceRules).where(eq(guestAllowanceRules.eventId, id));
    
    // Delete event manager assignments
    await db.delete(eventManagerAssignments).where(eq(eventManagerAssignments.eventId, id));
    
    // Delete event pages and sections (eventPages has ON DELETE CASCADE for sections)
    const pages = await db.select({ id: eventPages.id }).from(eventPages).where(eq(eventPages.eventId, id));
    for (const page of pages) {
      await db.delete(eventPageSections).where(eq(eventPageSections.pageId, page.id));
    }
    await db.delete(eventPages).where(eq(eventPages.eventId, id));
    
    // Finally delete the event
    await db.delete(events).where(eq(events.id, id));
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

  async getRegistrationWithDetailsByEmail(eventId: string, email: string): Promise<RegistrationWithDetails | undefined> {
    const [reg] = await db.select().from(registrations)
      .where(and(eq(registrations.eventId, eventId), eq(registrations.email, email)));
    if (!reg) return undefined;

    const regGuests = await db.select().from(guests).where(eq(guests.registrationId, reg.id));
    const regFlights = await db.select().from(flights).where(eq(flights.registrationId, reg.id));
    const regReimbursements = await db.select().from(reimbursements).where(eq(reimbursements.registrationId, reg.id));

    return {
      ...reg,
      guests: regGuests,
      flights: regFlights,
      reimbursements: regReimbursements,
    };
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
    // Delete related data first (cascade)
    await db.delete(guests).where(eq(guests.registrationId, id));
    await db.delete(flights).where(eq(flights.registrationId, id));
    await db.delete(reimbursements).where(eq(reimbursements.registrationId, id));
    // Set swag assignments to null (preserve history)
    await db.update(swagAssignments).set({ registrationId: null }).where(eq(swagAssignments.registrationId, id));
    // Then delete the registration
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

  async getOtpSessionForRegistration(email: string, eventId: string): Promise<OtpSession | undefined> {
    // Fetch all active sessions for this email and filter for the specific event
    const sessions = await db.select().from(otpSessions)
      .where(and(eq(otpSessions.email, email), gte(otpSessions.expiresAt, new Date())))
      .orderBy(desc(otpSessions.createdAt));
    
    // Find session scoped to this registration event
    const registrationSession = sessions.find(s => {
      const data = s.customerData as any;
      return data?.registrationEventId === eventId;
    });
    return registrationSession || undefined;
  }

  async getOtpSessionForAttendeePortal(email: string): Promise<OtpSession | undefined> {
    const sessions = await db.select().from(otpSessions)
      .where(and(eq(otpSessions.email, email), gte(otpSessions.expiresAt, new Date())))
      .orderBy(desc(otpSessions.createdAt));
    
    // Find the most recent session with attendeePortal flag set
    const attendeeSession = sessions.find(s => {
      const data = s.customerData as any;
      return data?.attendeePortal === true;
    });
    return attendeeSession || undefined;
  }

  async createOtpSession(session: InsertOtpSession): Promise<OtpSession> {
    const [newSession] = await db.insert(otpSessions).values(session).returning();
    return newSession;
  }

  async updateOtpSession(id: string, data: Partial<InsertOtpSession>): Promise<OtpSession | undefined> {
    const [updated] = await db.update(otpSessions).set(data).where(eq(otpSessions.id, id)).returning();
    return updated || undefined;
  }

  async getOtpSessionByRedirectToken(token: string): Promise<OtpSession | undefined> {
    const [session] = await db.select().from(otpSessions)
      .where(eq(otpSessions.redirectToken, token));
    return session || undefined;
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

  // Attendee Sessions
  async createAttendeeSession(email: string): Promise<{ token: string; expiresAt: Date }> {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await db.insert(attendeeSessions).values({
      token,
      email: email.toLowerCase().trim(),
      expiresAt,
    });
    return { token, expiresAt };
  }

  async getAttendeeSessionByToken(token: string): Promise<{ email: string; expiresAt: Date } | undefined> {
    const [session] = await db.select()
      .from(attendeeSessions)
      .where(and(eq(attendeeSessions.token, token), gte(attendeeSessions.expiresAt, new Date())));
    if (!session) return undefined;
    return { email: session.email, expiresAt: session.expiresAt };
  }

  async deleteAttendeeSession(token: string): Promise<boolean> {
    await db.delete(attendeeSessions).where(eq(attendeeSessions.token, token));
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

  // Reports
  async getRegistrationTrends(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const trends = await db
      .select({
        date: sql<string>`DATE(${registrations.createdAt})`,
        count: count(),
      })
      .from(registrations)
      .where(gte(registrations.createdAt, startDate))
      .groupBy(sql`DATE(${registrations.createdAt})`)
      .orderBy(sql`DATE(${registrations.createdAt})`);
    
    return trends.map(t => ({
      date: t.date,
      count: Number(t.count),
    }));
  }

  async getRevenueStats() {
    const [guestRevenue] = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${guests.amountPaidCents}), 0)`,
        paidGuestCount: sql<number>`COUNT(*) FILTER (WHERE ${guests.paymentStatus} = 'paid')`,
        pendingCount: sql<number>`COUNT(*) FILTER (WHERE ${guests.paymentStatus} = 'pending')`,
      })
      .from(guests);

    const revenueByEvent = await db
      .select({
        eventId: registrations.eventId,
        eventName: events.name,
        revenue: sql<number>`COALESCE(SUM(${guests.amountPaidCents}), 0)`,
        guestCount: count(guests.id),
      })
      .from(guests)
      .innerJoin(registrations, eq(guests.registrationId, registrations.id))
      .innerJoin(events, eq(registrations.eventId, events.id))
      .where(eq(guests.paymentStatus, 'paid'))
      .groupBy(registrations.eventId, events.name)
      .orderBy(desc(sql`COALESCE(SUM(${guests.amountPaidCents}), 0)`));

    return {
      totalRevenue: Number(guestRevenue?.totalRevenue) || 0,
      paidGuestCount: Number(guestRevenue?.paidGuestCount) || 0,
      pendingCount: Number(guestRevenue?.pendingCount) || 0,
      revenueByEvent: revenueByEvent.map(r => ({
        eventId: r.eventId,
        eventName: r.eventName,
        revenue: Number(r.revenue),
        guestCount: Number(r.guestCount),
      })),
    };
  }

  async getCheckInRates() {
    const rates = await db
      .select({
        eventId: registrations.eventId,
        eventName: events.name,
        eventDate: events.startDate,
        totalRegistrations: count(),
        checkedInCount: sql<number>`COUNT(*) FILTER (WHERE ${registrations.status} = 'checked_in')`,
      })
      .from(registrations)
      .innerJoin(events, eq(registrations.eventId, events.id))
      .groupBy(registrations.eventId, events.name, events.startDate)
      .orderBy(desc(events.startDate));

    return rates.map(r => ({
      eventId: r.eventId,
      eventName: r.eventName,
      eventDate: r.eventDate,
      totalRegistrations: Number(r.totalRegistrations),
      checkedInCount: Number(r.checkedInCount),
      checkInRate: r.totalRegistrations > 0 
        ? Math.round((Number(r.checkedInCount) / Number(r.totalRegistrations)) * 100)
        : 0,
    }));
  }

  async getExportData(type: 'registrations' | 'guests' | 'events', eventId?: string) {
    if (type === 'registrations') {
      let query = db
        .select({
          id: registrations.id,
          eventName: events.name,
          firstName: registrations.firstName,
          lastName: registrations.lastName,
          email: registrations.email,
          phone: registrations.phone,
          unicityId: registrations.unicityId,
          status: registrations.status,
          createdAt: registrations.createdAt,
        })
        .from(registrations)
        .innerJoin(events, eq(registrations.eventId, events.id));
      
      if (eventId) {
        query = query.where(eq(registrations.eventId, eventId)) as any;
      }
      
      return query.orderBy(desc(registrations.createdAt));
    }

    if (type === 'guests') {
      let query = db
        .select({
          id: guests.id,
          eventName: events.name,
          registrantName: sql<string>`${registrations.firstName} || ' ' || ${registrations.lastName}`,
          guestFirstName: guests.firstName,
          guestLastName: guests.lastName,
          guestEmail: guests.email,
          paymentStatus: guests.paymentStatus,
          amountPaidCents: guests.amountPaidCents,
        })
        .from(guests)
        .innerJoin(registrations, eq(guests.registrationId, registrations.id))
        .innerJoin(events, eq(registrations.eventId, events.id));
      
      if (eventId) {
        query = query.where(eq(registrations.eventId, eventId)) as any;
      }
      
      return query.orderBy(desc(guests.createdAt));
    }

    if (type === 'events') {
      return db
        .select({
          id: events.id,
          name: events.name,
          status: events.status,
          startDate: events.startDate,
          endDate: events.endDate,
          location: events.location,
          capacity: events.capacity,
        })
        .from(events)
        .orderBy(desc(events.startDate));
    }

    return [];
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

  // Form Templates
  async getFormTemplates(): Promise<FormTemplate[]> {
    return db.select().from(formTemplates).orderBy(formTemplates.name);
  }

  async getFormTemplate(id: string): Promise<FormTemplate | undefined> {
    const [template] = await db.select().from(formTemplates).where(eq(formTemplates.id, id));
    return template || undefined;
  }

  async getFormTemplateByKey(key: string): Promise<FormTemplate | undefined> {
    const [template] = await db.select().from(formTemplates).where(eq(formTemplates.key, key));
    return template || undefined;
  }

  // Qualified Registrants
  async getAllQualifiedRegistrants(): Promise<(QualifiedRegistrant & { eventName: string })[]> {
    const results = await db.select({
      qualifier: qualifiedRegistrants,
      eventName: events.name,
    })
      .from(qualifiedRegistrants)
      .leftJoin(events, eq(qualifiedRegistrants.eventId, events.id))
      .orderBy(qualifiedRegistrants.lastName, qualifiedRegistrants.firstName);
    
    return results.map(r => ({
      ...r.qualifier,
      eventName: r.eventName || 'Unknown Event',
    }));
  }

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

  // Event Pages
  async getEventPageByEventId(eventId: string, pageType: string = "registration"): Promise<EventPage | undefined> {
    const [page] = await db.select().from(eventPages)
      .where(and(eq(eventPages.eventId, eventId), eq(eventPages.pageType, pageType)));
    return page || undefined;
  }

  async getEventPageWithSections(eventId: string, pageType: string = "registration"): Promise<{ page: EventPage; sections: EventPageSection[] } | undefined> {
    const page = await this.getEventPageByEventId(eventId, pageType);
    if (!page) return undefined;

    const sections = await db.select().from(eventPageSections)
      .where(eq(eventPageSections.pageId, page.id))
      .orderBy(eventPageSections.position);
    
    return { page, sections };
  }

  async createEventPage(page: InsertEventPage): Promise<EventPage> {
    const [created] = await db.insert(eventPages).values(page).returning();
    return created;
  }

  async updateEventPage(id: string, data: Partial<InsertEventPage>): Promise<EventPage | undefined> {
    const [updated] = await db.update(eventPages)
      .set({ ...data, lastModified: new Date() })
      .where(eq(eventPages.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteEventPage(id: string): Promise<boolean> {
    // Delete sections first
    await db.delete(eventPageSections).where(eq(eventPageSections.pageId, id));
    await db.delete(eventPages).where(eq(eventPages.id, id));
    return true;
  }

  // Event Page Sections
  async getEventPageSections(pageId: string): Promise<EventPageSection[]> {
    return db.select().from(eventPageSections)
      .where(eq(eventPageSections.pageId, pageId))
      .orderBy(eventPageSections.position);
  }

  async getEventPageSection(id: string): Promise<EventPageSection | undefined> {
    const [section] = await db.select().from(eventPageSections).where(eq(eventPageSections.id, id));
    return section || undefined;
  }

  async createEventPageSection(section: InsertEventPageSection): Promise<EventPageSection> {
    const [created] = await db.insert(eventPageSections).values(section).returning();
    return created;
  }

  async updateEventPageSection(id: string, data: Partial<InsertEventPageSection>): Promise<EventPageSection | undefined> {
    const [updated] = await db.update(eventPageSections)
      .set({ ...data, lastModified: new Date() })
      .where(eq(eventPageSections.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteEventPageSection(id: string): Promise<boolean> {
    await db.delete(eventPageSections).where(eq(eventPageSections.id, id));
    return true;
  }

  async reorderEventPageSections(pageId: string, sectionIds: string[]): Promise<void> {
    for (let i = 0; i < sectionIds.length; i++) {
      await db.update(eventPageSections)
        .set({ position: i, lastModified: new Date() })
        .where(and(
          eq(eventPageSections.id, sectionIds[i]),
          eq(eventPageSections.pageId, pageId)
        ));
    }
  }

  // Guest Allowance Rules
  async getGuestAllowanceRulesByEvent(eventId: string): Promise<GuestAllowanceRule[]> {
    return db.select().from(guestAllowanceRules)
      .where(eq(guestAllowanceRules.eventId, eventId))
      .orderBy(guestAllowanceRules.sortOrder);
  }

  async getGuestAllowanceRule(id: string): Promise<GuestAllowanceRule | undefined> {
    const [rule] = await db.select().from(guestAllowanceRules).where(eq(guestAllowanceRules.id, id));
    return rule || undefined;
  }

  async getDefaultGuestAllowanceRule(eventId: string): Promise<GuestAllowanceRule | undefined> {
    const [rule] = await db.select().from(guestAllowanceRules)
      .where(and(
        eq(guestAllowanceRules.eventId, eventId),
        eq(guestAllowanceRules.isDefault, true)
      ));
    return rule || undefined;
  }

  async createGuestAllowanceRule(rule: InsertGuestAllowanceRule): Promise<GuestAllowanceRule> {
    const [created] = await db.insert(guestAllowanceRules).values(rule).returning();
    return created;
  }

  async updateGuestAllowanceRule(id: string, data: Partial<InsertGuestAllowanceRule>): Promise<GuestAllowanceRule | undefined> {
    const [updated] = await db.update(guestAllowanceRules)
      .set({ ...data, lastModified: new Date() })
      .where(eq(guestAllowanceRules.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteGuestAllowanceRule(id: string): Promise<boolean> {
    // First, remove rule assignments from qualified registrants
    await db.update(qualifiedRegistrants)
      .set({ guestAllowanceRuleId: null })
      .where(eq(qualifiedRegistrants.guestAllowanceRuleId, id));
    
    await db.delete(guestAllowanceRules).where(eq(guestAllowanceRules.id, id));
    return true;
  }

  async setDefaultGuestAllowanceRule(eventId: string, ruleId: string): Promise<void> {
    // First, unset all defaults for this event
    await db.update(guestAllowanceRules)
      .set({ isDefault: false, lastModified: new Date() })
      .where(eq(guestAllowanceRules.eventId, eventId));
    
    // Then set the new default
    await db.update(guestAllowanceRules)
      .set({ isDefault: true, lastModified: new Date() })
      .where(eq(guestAllowanceRules.id, ruleId));
  }

  // Event Manager Assignments
  async getEventManagerAssignments(eventId: string): Promise<(EventManagerAssignment & { user: User })[]> {
    const assignments = await db
      .select()
      .from(eventManagerAssignments)
      .innerJoin(users, eq(eventManagerAssignments.userId, users.id))
      .where(eq(eventManagerAssignments.eventId, eventId))
      .orderBy(eventManagerAssignments.assignedAt);
    
    return assignments.map(row => ({
      ...row.event_manager_assignments,
      user: row.users,
    }));
  }

  async getEventsForManager(userId: string): Promise<EventWithStats[]> {
    // Get events where user is creator OR assigned manager
    const assignedEventIds = await db
      .select({ eventId: eventManagerAssignments.eventId })
      .from(eventManagerAssignments)
      .where(eq(eventManagerAssignments.userId, userId));
    
    const assignedIds = assignedEventIds.map(r => r.eventId);
    
    // Get all events where user is creator or assigned
    const eventsData = await db.select().from(events)
      .where(or(
        eq(events.createdBy, userId),
        ...assignedIds.map(id => eq(events.id, id))
      ))
      .orderBy(desc(events.startDate));
    
    // Add stats to each event
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

  async canUserAccessEvent(userId: string, eventId: string, userRole: string): Promise<boolean> {
    // Admins can access all events
    if (userRole === 'admin') {
      return true;
    }
    
    // Marketing and readonly can access all events (view only)
    if (userRole === 'marketing' || userRole === 'readonly') {
      return true;
    }
    
    // Event managers can only access events they created or are assigned to
    const event = await this.getEvent(eventId);
    if (!event) return false;
    
    // Check if creator
    if (event.createdBy === userId) {
      return true;
    }
    
    // Check if assigned
    const [assignment] = await db.select()
      .from(eventManagerAssignments)
      .where(and(
        eq(eventManagerAssignments.eventId, eventId),
        eq(eventManagerAssignments.userId, userId)
      ));
    
    return !!assignment;
  }

  async assignEventManager(eventId: string, userId: string, assignedBy: string): Promise<EventManagerAssignment> {
    const [assignment] = await db.insert(eventManagerAssignments)
      .values({
        eventId,
        userId,
        assignedBy,
      })
      .returning();
    return assignment;
  }

  async removeEventManager(eventId: string, userId: string): Promise<boolean> {
    const result = await db.delete(eventManagerAssignments)
      .where(and(
        eq(eventManagerAssignments.eventId, eventId),
        eq(eventManagerAssignments.userId, userId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  // Printers
  async getPrintersByEvent(eventId: string): Promise<Printer[]> {
    return db.select().from(printers).where(eq(printers.eventId, eventId)).orderBy(desc(printers.createdAt));
  }

  async getPrinter(id: string): Promise<Printer | undefined> {
    const [printer] = await db.select().from(printers).where(eq(printers.id, id));
    return printer || undefined;
  }

  async createPrinter(printer: InsertPrinter): Promise<Printer> {
    const [newPrinter] = await db.insert(printers).values(printer).returning();
    return newPrinter;
  }

  async updatePrinter(id: string, data: Partial<InsertPrinter>): Promise<Printer | undefined> {
    const [updated] = await db.update(printers)
      .set({ ...data, lastModified: new Date() })
      .where(eq(printers.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePrinter(id: string): Promise<boolean> {
    const result = await db.delete(printers).where(eq(printers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Print Logs
  async getPrintLogsByRegistration(registrationId: string): Promise<PrintLog[]> {
    return db.select().from(printLogs).where(eq(printLogs.registrationId, registrationId)).orderBy(desc(printLogs.requestedAt));
  }

  async getPrintLogsByEvent(eventId: string): Promise<PrintLog[]> {
    const logs = await db.select({ printLog: printLogs })
      .from(printLogs)
      .innerJoin(registrations, eq(printLogs.registrationId, registrations.id))
      .where(eq(registrations.eventId, eventId))
      .orderBy(desc(printLogs.requestedAt));
    return logs.map(l => l.printLog);
  }

  async getPrintLog(id: string): Promise<PrintLog | undefined> {
    const [log] = await db.select().from(printLogs).where(eq(printLogs.id, id));
    return log || undefined;
  }

  async createPrintLog(log: InsertPrintLog): Promise<PrintLog> {
    const [newLog] = await db.insert(printLogs).values(log).returning();
    return newLog;
  }

  async updatePrintLog(id: string, data: Partial<InsertPrintLog>): Promise<PrintLog | undefined> {
    const [updated] = await db.update(printLogs)
      .set(data)
      .where(eq(printLogs.id, id))
      .returning();
    return updated || undefined;
  }

  async recordBadgePrint(registrationId: string): Promise<Registration | undefined> {
    const [updated] = await db.update(registrations)
      .set({
        badgePrintedAt: new Date(),
        badgePrintCount: sql`COALESCE(${registrations.badgePrintCount}, 0) + 1`,
        lastModified: new Date(),
      })
      .where(eq(registrations.id, registrationId))
      .returning();
    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();
