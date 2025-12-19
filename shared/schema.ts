import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// User roles enum
export const userRoleEnum = ["admin", "event_manager", "marketing", "readonly"] as const;
export type UserRole = typeof userRoleEnum[number];

// Event status enum
export const eventStatusEnum = ["draft", "published", "private", "archived"] as const;
export type EventStatus = typeof eventStatusEnum[number];

// Registration status enum
export const registrationStatusEnum = ["qualified", "registered", "not_coming", "checked_in"] as const;
export type RegistrationStatus = typeof registrationStatusEnum[number];

// Swag status enum
export const swagStatusEnum = ["pending", "picked_up"] as const;
export type SwagStatus = typeof swagStatusEnum[number];

// Reimbursement status enum
export const reimbursementStatusEnum = ["pending", "processing", "completed"] as const;
export type ReimbursementStatus = typeof reimbursementStatusEnum[number];

// Users table - for admin/staff accounts
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("readonly"),
  unicityId: text("unicity_id"),
  customerId: integer("customer_id"),
  language: text("language").notNull().default("en"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Registration page layout options
export const registrationLayoutEnum = ["standard", "split", "hero-background"] as const;
export type RegistrationLayout = typeof registrationLayoutEnum[number];

// Registration page settings type
export type RegistrationSettings = {
  heroImagePath?: string;
  heading?: string;
  headingEs?: string;
  subheading?: string;
  subheadingEs?: string;
  ctaLabel?: string;
  ctaLabelEs?: string;
  layout?: RegistrationLayout;
  accentColor?: string;
};

// Events table
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").unique(),
  name: text("name").notNull(),
  nameEs: text("name_es"),
  description: text("description"),
  descriptionEs: text("description_es"),
  location: text("location"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: text("status").notNull().default("draft"),
  capacity: integer("capacity"),
  buyInPrice: integer("buy_in_price"),
  requiresQualification: boolean("requires_qualification").default(false),
  qualificationStartDate: timestamp("qualification_start_date"),
  qualificationEndDate: timestamp("qualification_end_date"),
  formFields: jsonb("form_fields"),
  registrationSettings: jsonb("registration_settings").$type<RegistrationSettings>(),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Registrations table - for event attendees
export const registrations = pgTable("registrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  unicityId: text("unicity_id"),
  customerId: integer("customer_id"),
  phone: text("phone"),
  status: text("status").notNull().default("qualified"),
  language: text("language").notNull().default("en"),
  // Personal info
  gender: text("gender"),
  dateOfBirth: timestamp("date_of_birth"),
  // Passport info
  passportNumber: text("passport_number"),
  passportCountry: text("passport_country"),
  passportExpiration: timestamp("passport_expiration"),
  // Emergency contact
  emergencyContact: text("emergency_contact"),
  emergencyContactPhone: text("emergency_contact_phone"),
  // Swag info
  shirtSize: text("shirt_size"),
  pantSize: text("pant_size"),
  swagStatus: text("swag_status").default("pending"),
  // Dietary & accommodations
  dietaryRestrictions: text("dietary_restrictions").array(),
  adaAccommodations: boolean("ada_accommodations").default(false),
  roomType: text("room_type"),
  // Custom form data for event-specific fields
  formData: jsonb("form_data"),
  // Terms acceptance
  termsAccepted: boolean("terms_accepted").default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  termsAcceptedIp: text("terms_accepted_ip"),
  // Check-in
  checkedInAt: timestamp("checked_in_at"),
  checkedInBy: varchar("checked_in_by").references(() => users.id),
  // Timestamps
  registeredAt: timestamp("registered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Guests table - for plus-ones/spouses linked to a distributor
export const guests = pgTable("guests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id").references(() => registrations.id).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  shirtSize: text("shirt_size"),
  dietaryRestrictions: text("dietary_restrictions"),
  swagStatus: text("swag_status").default("pending"),
  checkedInAt: timestamp("checked_in_at"),
  // Payment info
  paymentStatus: text("payment_status").default("pending"),
  paymentIntentId: text("payment_intent_id"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Flight information table
export const flights = pgTable("flights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id").references(() => registrations.id).notNull(),
  type: text("type").notNull().default("arrival"),
  airline: text("airline"),
  flightNumber: text("flight_number"),
  departureCity: text("departure_city"),
  arrivalCity: text("arrival_city"),
  departureTime: timestamp("departure_time"),
  arrivalTime: timestamp("arrival_time"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Reimbursements table
export const reimbursements = pgTable("reimbursements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id").references(() => registrations.id).notNull(),
  type: text("type").notNull().default("airfare"),
  amount: integer("amount"),
  currency: text("currency").default("USD"),
  receiptPath: text("receipt_path"),
  status: text("status").default("pending"),
  processedBy: varchar("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// OTP Sessions table - for tracking login sessions
export const otpSessions = pgTable("otp_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  validationId: text("validation_id"),
  verified: boolean("verified").default(false),
  verifiedAt: timestamp("verified_at"),
  customerId: integer("customer_id"),
  bearerToken: text("bearer_token"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Auth Sessions table - for persistent login tokens
export const authSessions = pgTable("auth_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Swag Items table - Event-specific swag catalog
export const swagItems = pgTable("swag_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  name: text("name").notNull(),
  nameEs: text("name_es"),
  description: text("description"),
  category: text("category"), // e.g., "apparel", "accessory", "gift"
  sizeRequired: boolean("size_required").default(false),
  sizeField: text("size_field"), // "shirtSize" or "pantSize" - which field to use
  totalQuantity: integer("total_quantity").notNull().default(0),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Swag status for individual assignments
export const swagAssignmentStatusEnum = ["assigned", "received"] as const;
export type SwagAssignmentStatus = typeof swagAssignmentStatusEnum[number];

// Swag Assignments table - Links swag items to attendees/guests
export const swagAssignments = pgTable("swag_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  swagItemId: varchar("swag_item_id").references(() => swagItems.id).notNull(),
  registrationId: varchar("registration_id").references(() => registrations.id),
  guestId: varchar("guest_id").references(() => guests.id),
  size: text("size"), // Captured at assignment time for apparel
  status: text("status").notNull().default("assigned"), // "assigned" | "received"
  receivedAt: timestamp("received_at"),
  receivedBy: varchar("received_by").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Qualified Registrants table - Pre-approved users allowed to register for an event
export const qualifiedRegistrants = pgTable("qualified_registrants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  email: text("email").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  unicityId: text("unicity_id"),
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  importedBy: varchar("imported_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  events: many(events),
  checkIns: many(registrations),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [events.createdBy],
    references: [users.id],
  }),
  registrations: many(registrations),
  swagItems: many(swagItems),
}));

export const registrationsRelations = relations(registrations, ({ one, many }) => ({
  event: one(events, {
    fields: [registrations.eventId],
    references: [events.id],
  }),
  checkedInByUser: one(users, {
    fields: [registrations.checkedInBy],
    references: [users.id],
  }),
  guests: many(guests),
  flights: many(flights),
  reimbursements: many(reimbursements),
  swagAssignments: many(swagAssignments),
}));

export const guestsRelations = relations(guests, ({ one, many }) => ({
  registration: one(registrations, {
    fields: [guests.registrationId],
    references: [registrations.id],
  }),
  swagAssignments: many(swagAssignments),
}));

export const flightsRelations = relations(flights, ({ one }) => ({
  registration: one(registrations, {
    fields: [flights.registrationId],
    references: [registrations.id],
  }),
}));

export const reimbursementsRelations = relations(reimbursements, ({ one }) => ({
  registration: one(registrations, {
    fields: [reimbursements.registrationId],
    references: [registrations.id],
  }),
  processedByUser: one(users, {
    fields: [reimbursements.processedBy],
    references: [users.id],
  }),
}));

export const swagItemsRelations = relations(swagItems, ({ one, many }) => ({
  event: one(events, {
    fields: [swagItems.eventId],
    references: [events.id],
  }),
  assignments: many(swagAssignments),
}));

export const swagAssignmentsRelations = relations(swagAssignments, ({ one }) => ({
  swagItem: one(swagItems, {
    fields: [swagAssignments.swagItemId],
    references: [swagItems.id],
  }),
  registration: one(registrations, {
    fields: [swagAssignments.registrationId],
    references: [registrations.id],
  }),
  guest: one(guests, {
    fields: [swagAssignments.guestId],
    references: [guests.id],
  }),
  receivedByUser: one(users, {
    fields: [swagAssignments.receivedBy],
    references: [users.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});

export const insertEventSchema = createInsertSchema(events).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});

export const insertRegistrationSchema = createInsertSchema(registrations).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});

export const insertGuestSchema = createInsertSchema(guests).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});

export const insertFlightSchema = createInsertSchema(flights).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});

export const insertReimbursementSchema = createInsertSchema(reimbursements).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});

export const insertOtpSessionSchema = createInsertSchema(otpSessions).omit({
  id: true,
  createdAt: true,
});

export const insertAuthSessionSchema = createInsertSchema(authSessions).omit({
  id: true,
  createdAt: true,
});

export const insertSwagItemSchema = createInsertSchema(swagItems).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});

export const insertSwagAssignmentSchema = createInsertSchema(swagAssignments).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});

export const insertQualifiedRegistrantSchema = createInsertSchema(qualifiedRegistrants).omit({
  id: true,
  importedAt: true,
  createdAt: true,
  lastModified: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export type InsertRegistration = z.infer<typeof insertRegistrationSchema>;
export type Registration = typeof registrations.$inferSelect;

export type InsertGuest = z.infer<typeof insertGuestSchema>;
export type Guest = typeof guests.$inferSelect;

export type InsertFlight = z.infer<typeof insertFlightSchema>;
export type Flight = typeof flights.$inferSelect;

export type InsertReimbursement = z.infer<typeof insertReimbursementSchema>;
export type Reimbursement = typeof reimbursements.$inferSelect;

export type InsertOtpSession = z.infer<typeof insertOtpSessionSchema>;
export type OtpSession = typeof otpSessions.$inferSelect;

export type InsertAuthSession = z.infer<typeof insertAuthSessionSchema>;
export type AuthSession = typeof authSessions.$inferSelect;

export type InsertSwagItem = z.infer<typeof insertSwagItemSchema>;
export type SwagItem = typeof swagItems.$inferSelect;

export type InsertSwagAssignment = z.infer<typeof insertSwagAssignmentSchema>;
export type SwagAssignment = typeof swagAssignments.$inferSelect;

export type InsertQualifiedRegistrant = z.infer<typeof insertQualifiedRegistrantSchema>;
export type QualifiedRegistrant = typeof qualifiedRegistrants.$inferSelect;

// Extended types for API responses
export type RegistrationWithDetails = Registration & {
  guests?: Guest[];
  flights?: Flight[];
  reimbursements?: Reimbursement[];
};

export type EventWithStats = Event & {
  totalRegistrations?: number;
  checkedInCount?: number;
  qualifiedCount?: number;
};

export type SwagItemWithStats = SwagItem & {
  assignedCount: number;
  receivedCount: number;
  remainingQuantity: number;
};

export type SwagAssignmentWithDetails = SwagAssignment & {
  swagItem?: SwagItem;
  registration?: Registration;
  guest?: Guest;
};
