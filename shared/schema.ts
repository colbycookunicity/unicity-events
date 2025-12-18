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

// Events table
export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
  // Swag info
  shirtSize: text("shirt_size"),
  swagStatus: text("swag_status").default("pending"),
  // Dietary
  dietaryRestrictions: text("dietary_restrictions"),
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
}));

export const guestsRelations = relations(guests, ({ one }) => ({
  registration: one(registrations, {
    fields: [guests.registrationId],
    references: [registrations.id],
  }),
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
