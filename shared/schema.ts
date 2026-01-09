import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Page type enum for event CMS pages
export const pageTypeEnum = ["login", "registration", "thank_you"] as const;
export type PageType = typeof pageTypeEnum[number];

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
export const swagStatusEnum = ["pending", "assigned", "picked_up"] as const;
export type SwagStatus = typeof swagStatusEnum[number];

// Guest policy enum (event-level setting)
export const guestPolicyEnum = ["not_allowed", "allowed_free", "allowed_paid", "allowed_mixed"] as const;
export type GuestPolicy = typeof guestPolicyEnum[number];

// Reimbursement status enum
export const reimbursementStatusEnum = ["pending", "processing", "completed"] as const;
export type ReimbursementStatus = typeof reimbursementStatusEnum[number];

// Market codes for regional scoping (Phase 1: scaffolding only, not enforced)
export const marketCodeEnum = ["US", "CA", "PR", "EU", "MX", "CO", "TH", "KR", "JP", "AU", "NZ", "SG", "HK", "TW", "PH", "MY", "ID", "VN"] as const;
export type MarketCode = typeof marketCodeEnum[number];

// Users table - for admin/staff accounts
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("readonly"),
  unicityId: text("unicity_id"),
  customerId: integer("customer_id"),
  language: text("language").notNull().default("en"),
  // Market-based scoping (Phase 1: nullable, not enforced yet)
  // null = global access (or feature not enabled), array = access to specific markets
  assignedMarkets: text("assigned_markets").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Form Templates table - predefined registration form configurations
export const formTemplates = pgTable("form_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g., "success_trip", "method"
  name: text("name").notNull(), // Display name: "Success Trip", "Method"
  nameEs: text("name_es"), // Spanish display name
  description: text("description"),
  descriptionEs: text("description_es"),
  fields: jsonb("fields").notNull(), // Array of form field definitions
  isDefault: boolean("is_default").default(false), // If true, used when no template specified
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

export const insertFormTemplateSchema = createInsertSchema(formTemplates).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});
export type InsertFormTemplate = z.infer<typeof insertFormTemplateSchema>;
export type FormTemplate = typeof formTemplates.$inferSelect;

// Registration page layout options
export const registrationLayoutEnum = ["standard", "split", "hero-background"] as const;
export type RegistrationLayout = typeof registrationLayoutEnum[number];

// Registration mode enum - consolidates requiresQualification + requiresVerification
// - qualified_verified: Only pre-qualified users can register, OTP verification required
// - open_verified: Anyone can register, OTP verification required
// - open_anonymous: Anyone can register, no verification (NOT YET ENABLED)
export const registrationModeEnum = ["qualified_verified", "open_verified", "open_anonymous"] as const;
export type RegistrationMode = typeof registrationModeEnum[number];

// Helper to derive legacy boolean flags from registrationMode
export function deriveRegistrationFlags(mode: RegistrationMode): { requiresQualification: boolean; requiresVerification: boolean } {
  switch (mode) {
    case "qualified_verified":
      return { requiresQualification: true, requiresVerification: true };
    case "open_verified":
      return { requiresQualification: false, requiresVerification: true };
    case "open_anonymous":
      return { requiresQualification: false, requiresVerification: false };
    default:
      return { requiresQualification: false, requiresVerification: true };
  }
}

// Helper to derive registrationMode from legacy boolean flags (for migration/compat)
export function deriveRegistrationMode(requiresQualification: boolean | null | undefined, requiresVerification: boolean | null | undefined): RegistrationMode {
  if (requiresQualification) {
    return "qualified_verified";
  }
  if (requiresVerification === false) {
    return "open_anonymous";
  }
  return "open_verified";
}

/**
 * @deprecated PHASE 4 COMPLETE (Dec 22, 2025)
 * This type is no longer used. All settings have been migrated to:
 * - events.registrationLayout column (layout)
 * - events.requiresVerification column (requiresVerification)
 * - CMS hero sections (heading, subheading, heroImagePath)
 * - CMS form sections (ctaLabel)
 * 
 * The registrationSettings column remains in the database for safety
 * but is no longer read or written by the application.
 */
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
  requiresVerification?: boolean;
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
  // Guest policy: not_allowed, allowed_free, allowed_paid
  guestPolicy: text("guest_policy").notNull().default("not_allowed"),
  buyInPrice: integer("buy_in_price"),
  // Registration mode: consolidated field for qualification + verification logic
  // Default to "open_verified" for backward compatibility with existing events
  registrationMode: text("registration_mode").notNull().default("open_verified"),
  /** @deprecated Use registrationMode instead. Kept for backward compatibility during migration. */
  requiresQualification: boolean("requires_qualification").default(false),
  qualificationStartDate: timestamp("qualification_start_date"),
  qualificationEndDate: timestamp("qualification_end_date"),
  // Form template reference - if set, uses template fields; if null, uses formFields
  formTemplateId: varchar("form_template_id").references(() => formTemplates.id),
  formFields: jsonb("form_fields"), // Custom fields override or standalone (when no template)
  /** @deprecated Use registrationLayout and requiresVerification columns + CMS sections instead */
  registrationSettings: jsonb("registration_settings").$type<RegistrationSettings>(),
  // CMS cutover columns (replace registrationSettings)
  registrationLayout: text("registration_layout").notNull().default("standard"),
  /** @deprecated Use registrationMode instead. Kept for backward compatibility during migration. */
  requiresVerification: boolean("requires_verification").notNull().default(true),
  // Default language for public pages (en or es) - only affects initial page load
  defaultLanguage: text("default_language").notNull().default("en"),
  // Thank you page customization (post-registration)
  thankYouHeadline: text("thank_you_headline"),
  thankYouHeadlineEs: text("thank_you_headline_es"),
  thankYouMessage: text("thank_you_message"),
  thankYouMessageEs: text("thank_you_message_es"),
  thankYouQrInstructions: text("thank_you_qr_instructions"),
  thankYouQrInstructionsEs: text("thank_you_qr_instructions_es"),
  createdBy: varchar("created_by").references(() => users.id),
  // Market-based scoping (Phase 1: nullable, not enforced yet)
  // null = no market assigned (legacy), string = market code (e.g., "US", "CA")
  marketCode: text("market_code"),
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
  adaAccommodationsAt: timestamp("ada_accommodations_at"),
  adaAccommodationsIp: text("ada_accommodations_ip"),
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
  // Badge printing
  badgePrintedAt: timestamp("badge_printed_at"),
  badgePrintCount: integer("badge_print_count").default(0),
  // Verification source
  verifiedByHydra: boolean("verified_by_hydra").default(false),
  // Admin notes
  notes: text("notes"),
  // Multi-attendee order grouping (for open_anonymous mode)
  orderId: varchar("order_id"), // UUID to group attendees in same submission
  attendeeIndex: integer("attendee_index"), // 0-based index within order
  // Payment info
  paymentStatus: text("payment_status").default("not_required"), // not_required, pending, paid, failed
  paymentIntentId: text("payment_intent_id"),
  amountPaidCents: integer("amount_paid_cents"),
  paidAt: timestamp("paid_at"),
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
  // Guest allowance tracking for mixed policy
  isComplimentary: boolean("is_complimentary").default(false), // True if guest is free (from allowance)
  amountPaidCents: integer("amount_paid_cents"), // Actual amount paid (0 for complimentary)
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
  redirectToken: text("redirect_token"),
  redirectTokenExpiresAt: timestamp("redirect_token_expires_at"),
  redirectTokenConsumed: boolean("redirect_token_consumed").default(false),
  customerData: jsonb("customer_data"),
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

// Attendee Sessions table - for attendee portal access (separate from admin auth)
export const attendeeSessions = pgTable("attendee_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
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

// Page section types enum - includes registration page sections (intro, thank_you, form)
export const pageSectionTypeEnum = ["hero", "agenda", "speakers", "stats", "cta", "faq", "richtext", "gallery", "intro", "thank_you", "form"] as const;
export type PageSectionType = typeof pageSectionTypeEnum[number];

// Page status enum
export const pageStatusEnum = ["draft", "published"] as const;
export type PageStatus = typeof pageStatusEnum[number];

// Hero section content type
export type HeroSectionContent = {
  headline?: string;
  headlineEs?: string;
  subheadline?: string;
  subheadlineEs?: string;
  backgroundImage?: string;
  primaryCtaLabel?: string;
  primaryCtaLabelEs?: string;
  secondaryCtaLabel?: string;
  secondaryCtaLabelEs?: string;
  secondaryCtaUrl?: string;
};

// Agenda section content type
export type AgendaSectionContent = {
  title?: string;
  titleEs?: string;
  items: Array<{
    time: string;
    label: string;
    labelEs?: string;
    description?: string;
    descriptionEs?: string;
  }>;
};

// Speakers section content type
export type SpeakersSectionContent = {
  title?: string;
  titleEs?: string;
  layout?: "grid" | "carousel";
  speakers: Array<{
    name: string;
    title?: string;
    titleEs?: string;
    headshot?: string;
    bio?: string;
    bioEs?: string;
  }>;
};

// Stats section content type
export type StatsSectionContent = {
  title?: string;
  titleEs?: string;
  stats: Array<{
    value: string;
    label: string;
    labelEs?: string;
  }>;
};

// CTA section content type
export type CTASectionContent = {
  headline?: string;
  headlineEs?: string;
  subheadline?: string;
  subheadlineEs?: string;
  buttonLabel?: string;
  buttonLabelEs?: string;
  backgroundColor?: string;
};

// FAQ section content type
export type FAQSectionContent = {
  title?: string;
  titleEs?: string;
  items: Array<{
    question: string;
    questionEs?: string;
    answer: string;
    answerEs?: string;
  }>;
};

// Rich text section content type
export type RichTextSectionContent = {
  title?: string;
  titleEs?: string;
  content: string;
  contentEs?: string;
};

// Gallery section content type
export type GallerySectionContent = {
  title?: string;
  titleEs?: string;
  images: Array<{
    url: string;
    caption?: string;
    captionEs?: string;
  }>;
};

// Intro section content type (for registration page verification step)
export type IntroSectionContent = {
  headline?: string;
  headlineEs?: string;
  subheadline?: string;
  subheadlineEs?: string;
  backgroundImage?: string;
  eventDetails?: string;
  eventDetailsEs?: string;
  showEventInfo?: boolean;
};

// Thank You section content type (for registration success page)
export type ThankYouSectionContent = {
  headline?: string;
  headlineEs?: string;
  message?: string;
  messageEs?: string;
  backgroundImage?: string;
  showConfirmationDetails?: boolean;
  additionalInfo?: string;
  additionalInfoEs?: string;
};

// Form section content type (for registration form customization)
export type FormSectionContent = {
  submitButtonLabel?: string;      // Default: "Register"
  submitButtonLabelEs?: string;    // Default: "Registrar"
};

// Union type for all section content
export type PageSectionContent = 
  | HeroSectionContent 
  | AgendaSectionContent 
  | SpeakersSectionContent 
  | StatsSectionContent 
  | CTASectionContent 
  | FAQSectionContent 
  | RichTextSectionContent 
  | GallerySectionContent
  | IntroSectionContent
  | ThankYouSectionContent
  | FormSectionContent;

// Event Pages table - Landing page configuration per event (supports multiple page types per event)
export const eventPages = pgTable("event_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  pageType: text("page_type").notNull().default("registration"),
  status: text("status").notNull().default("draft"),
  language: text("language").notNull().default("en"),
  seoTitle: text("seo_title"),
  seoDescription: text("seo_description"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
}, (table) => ({
  eventPageTypeUnique: uniqueIndex("event_page_type_unique").on(table.eventId, table.pageType),
}));

// Event Page Sections table - Individual sections within a landing page
export const eventPageSections = pgTable("event_page_sections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pageId: varchar("page_id").references(() => eventPages.id).notNull(),
  type: text("type").notNull(),
  position: integer("position").notNull().default(0),
  isEnabled: boolean("is_enabled").notNull().default(true),
  content: jsonb("content").$type<PageSectionContent>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Guest Allowance Rules table - Defines guest allowance tiers for mixed policy events
export const guestAllowanceRules = pgTable("guest_allowance_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  name: text("name").notNull(), // e.g., "Gold Tier", "Standard"
  nameEs: text("name_es"),
  description: text("description"),
  descriptionEs: text("description_es"),
  freeGuestCount: integer("free_guest_count").notNull().default(0), // Number of complimentary guests
  maxPaidGuests: integer("max_paid_guests").default(0), // Max additional paid guests (0 = unlimited)
  paidGuestPriceCents: integer("paid_guest_price_cents"), // Price per additional guest in cents
  isDefault: boolean("is_default").default(false), // Default rule for qualifiers without specific assignment
  sortOrder: integer("sort_order").default(0),
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
  // Guest allowance fields for mixed policy
  guestAllowanceRuleId: varchar("guest_allowance_rule_id").references(() => guestAllowanceRules.id),
  freeGuestOverride: integer("free_guest_override"), // Override free guest count (null = use rule)
  maxPaidGuestOverride: integer("max_paid_guest_override"), // Override max paid guests (null = use rule)
  guestPriceOverride: integer("guest_price_override"), // Override price in cents (null = use rule)
  importedAt: timestamp("imported_at").defaultNow().notNull(),
  importedBy: varchar("imported_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

// Event Manager Assignments table - Tracks which event managers have access to which events
export const eventManagerAssignments = pgTable("event_manager_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  assignedBy: varchar("assigned_by").references(() => users.id),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
}, (table) => ({
  uniqueEventUser: uniqueIndex("event_manager_unique_idx").on(table.eventId, table.userId),
}));

export const insertEventManagerAssignmentSchema = createInsertSchema(eventManagerAssignments).omit({
  id: true,
  assignedAt: true,
});
export type InsertEventManagerAssignment = z.infer<typeof insertEventManagerAssignmentSchema>;
export type EventManagerAssignment = typeof eventManagerAssignments.$inferSelect;

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  events: many(events),
  checkIns: many(registrations),
  eventAssignments: many(eventManagerAssignments),
}));

export const eventManagerAssignmentsRelations = relations(eventManagerAssignments, ({ one }) => ({
  event: one(events, {
    fields: [eventManagerAssignments.eventId],
    references: [events.id],
  }),
  user: one(users, {
    fields: [eventManagerAssignments.userId],
    references: [users.id],
  }),
  assignedByUser: one(users, {
    fields: [eventManagerAssignments.assignedBy],
    references: [users.id],
  }),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [events.createdBy],
    references: [users.id],
  }),
  registrations: many(registrations),
  swagItems: many(swagItems),
  guestAllowanceRules: many(guestAllowanceRules),
  qualifiedRegistrants: many(qualifiedRegistrants),
  managerAssignments: many(eventManagerAssignments),
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

export const eventPagesRelations = relations(eventPages, ({ one, many }) => ({
  event: one(events, {
    fields: [eventPages.eventId],
    references: [events.id],
  }),
  sections: many(eventPageSections),
}));

export const eventPageSectionsRelations = relations(eventPageSections, ({ one }) => ({
  page: one(eventPages, {
    fields: [eventPageSections.pageId],
    references: [eventPages.id],
  }),
}));

export const guestAllowanceRulesRelations = relations(guestAllowanceRules, ({ one, many }) => ({
  event: one(events, {
    fields: [guestAllowanceRules.eventId],
    references: [events.id],
  }),
  qualifiedRegistrants: many(qualifiedRegistrants),
}));

export const qualifiedRegistrantsRelations = relations(qualifiedRegistrants, ({ one }) => ({
  event: one(events, {
    fields: [qualifiedRegistrants.eventId],
    references: [events.id],
  }),
  guestAllowanceRule: one(guestAllowanceRules, {
    fields: [qualifiedRegistrants.guestAllowanceRuleId],
    references: [guestAllowanceRules.id],
  }),
  importedByUser: one(users, {
    fields: [qualifiedRegistrants.importedBy],
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
}).extend({
  formTemplateId: z.string().uuid().nullable().optional(),
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

export const insertAttendeeSessionSchema = createInsertSchema(attendeeSessions).omit({
  id: true,
  createdAt: true,
});
export type InsertAttendeeSession = z.infer<typeof insertAttendeeSessionSchema>;

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

export const insertGuestAllowanceRuleSchema = createInsertSchema(guestAllowanceRules).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});

export const insertEventPageSchema = createInsertSchema(eventPages).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});

export const insertEventPageSectionSchema = createInsertSchema(eventPageSections).omit({
  id: true,
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
export type AttendeeSession = typeof attendeeSessions.$inferSelect;

export type InsertSwagItem = z.infer<typeof insertSwagItemSchema>;
export type SwagItem = typeof swagItems.$inferSelect;

export type InsertSwagAssignment = z.infer<typeof insertSwagAssignmentSchema>;
export type SwagAssignment = typeof swagAssignments.$inferSelect;

export type InsertQualifiedRegistrant = z.infer<typeof insertQualifiedRegistrantSchema>;
export type QualifiedRegistrant = typeof qualifiedRegistrants.$inferSelect;

export type InsertGuestAllowanceRule = z.infer<typeof insertGuestAllowanceRuleSchema>;
export type GuestAllowanceRule = typeof guestAllowanceRules.$inferSelect;

export type InsertEventPage = z.infer<typeof insertEventPageSchema>;
export type EventPage = typeof eventPages.$inferSelect;

export type InsertEventPageSection = z.infer<typeof insertEventPageSectionSchema>;
export type EventPageSection = typeof eventPageSections.$inferSelect;

// Printers table - for badge printing at events
export const printers = pgTable("printers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  name: text("name").notNull(),
  location: text("location"),
  ipAddress: text("ip_address").notNull(),
  port: integer("port").default(9100),
  status: text("status").default("unknown"),
  lastSeenAt: timestamp("last_seen_at"),
  capabilities: jsonb("capabilities"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

export const insertPrinterSchema = createInsertSchema(printers).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});
export type InsertPrinter = z.infer<typeof insertPrinterSchema>;
export type Printer = typeof printers.$inferSelect;

// Print status enum
export const printStatusEnum = ["pending", "sent", "success", "failed"] as const;
export type PrintStatus = typeof printStatusEnum[number];

// Print logs table - for tracking badge print jobs
export const printLogs = pgTable("print_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id").references(() => registrations.id).notNull(),
  guestId: varchar("guest_id").references(() => guests.id),
  printerId: varchar("printer_id").references(() => printers.id),
  status: text("status").notNull().default("pending"),
  zplSnapshot: text("zpl_snapshot"),
  requestedBy: varchar("requested_by").references(() => users.id).notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
});

export const insertPrintLogSchema = createInsertSchema(printLogs).omit({
  id: true,
  requestedAt: true,
});
export type InsertPrintLog = z.infer<typeof insertPrintLogSchema>;
export type PrintLog = typeof printLogs.$inferSelect;

// Badge Templates table - customizable ZPL templates for badge printing
export const badgeTemplates = pgTable("badge_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id), // null = global template
  name: text("name").notNull(),
  description: text("description"),
  zplTemplate: text("zpl_template").notNull(), // Raw ZPL with {{placeholders}}
  isDefault: boolean("is_default").default(false), // Default template for the event
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});

export const insertBadgeTemplateSchema = createInsertSchema(badgeTemplates).omit({
  id: true,
  createdAt: true,
  lastModified: true,
});
export type InsertBadgeTemplate = z.infer<typeof insertBadgeTemplateSchema>;
export type BadgeTemplate = typeof badgeTemplates.$inferSelect;

// Default ZPL template for badge printing (matches current hardcoded template)
export const DEFAULT_BADGE_ZPL_TEMPLATE = `^XA
^PW812
^LL1218

^FO0,80^A0N,60,60^FB812,1,0,C^FD{{eventName}}^FS
^FO100,160^GB612,4,4^FS
^FO0,250^A0N,100,100^FB812,1,0,C^FD{{firstName}}^FS
^FO0,370^A0N,100,100^FB812,1,0,C^FD{{lastName}}^FS
^FO306,520^BQN,2,6^FDQA,{{qrData}}^FS
^FO0,820^A0N,35,35^FB812,1,0,C^FDID: {{unicityId}}^FS

^XZ`;

// Check-in Tokens table - Secure tokens for email QR check-in
// Each registration gets a unique, non-guessable token for QR scanning
// QR payload format: CHECKIN:<eventId>:<registrationId>:<token>
export const checkInTokens = pgTable("check_in_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id").references(() => registrations.id, { onDelete: "cascade" }).notNull(),
  eventId: varchar("event_id").references(() => events.id, { onDelete: "cascade" }).notNull(),
  token: varchar("token", { length: 64 }).notNull(), // Cryptographically secure random token
  expiresAt: timestamp("expires_at"), // Optional expiration (null = never expires)
  usedAt: timestamp("used_at"), // When the token was first used for check-in
  emailSentAt: timestamp("email_sent_at"), // When QR email was sent
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueRegistration: uniqueIndex("check_in_token_registration_idx").on(table.registrationId),
  tokenLookup: uniqueIndex("check_in_token_token_idx").on(table.token),
}));

export const insertCheckInTokenSchema = createInsertSchema(checkInTokens).omit({
  id: true,
  createdAt: true,
});
export type InsertCheckInToken = z.infer<typeof insertCheckInTokenSchema>;
export type CheckInToken = typeof checkInTokens.$inferSelect;

// Helper function to generate a cryptographically secure token
export function generateCheckInToken(): string {
  const crypto = globalThis.crypto || require('crypto');
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// Helper to build QR payload string
export function buildCheckInQRPayload(eventId: string, registrationId: string, token: string): string {
  return `CHECKIN:${eventId}:${registrationId}:${token}`;
}

// Helper to parse QR payload string
export function parseCheckInQRPayload(payload: string): { eventId: string; registrationId: string; token: string } | null {
  if (!payload.startsWith('CHECKIN:')) return null;
  const parts = payload.substring(8).split(':');
  if (parts.length !== 3) return null;
  const [eventId, registrationId, token] = parts;
  if (!eventId || !registrationId || !token) return null;
  return { eventId, registrationId, token };
}

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
