# Admin Authentication Audit & Fix Plan

## Executive Summary

This document outlines the root causes of admin authentication bugs and the proposed fixes to ensure a secure, single-source-of-truth authorization system.

---

## Root Cause Analysis

### Bug #1: Valid Admin (carolina.martinez@unicity.com) Blocked at Login

**Root Cause**: The `isAdminEmail()` function checks two things:
1. Database: Does user exist with `role="admin"`?
2. Fallback: Is email in `FALLBACK_ADMIN_EMAILS` hardcoded list?

Carolina fails both checks:
- She is **not** in the `FALLBACK_ADMIN_EMAILS` list (only 4 emails: colby.cook, biani.gonzalez, ashley.milliken, william.hall)
- She either:
  - Was never added to the `users` table, OR
  - Was added with `role="readonly"` instead of `role="admin"`, OR
  - There's a **case-sensitivity issue** - emails are stored/compared without consistent normalization

**File**: `server/routes.ts` (lines 25-41)

### Bug #2: Non-Admin User (colby.cook+001@unicity.com) Added as "Read Only"

**Root Cause**: Two code paths auto-create users in the `users` table:

#### Path A: Admin OTP Validate (lines 269-289)
```javascript
// After successful OTP validation
if (!user) {
  const role = await isAdminEmail(email) ? "admin" : "readonly";
  user = await storage.createUser({...});  // Creates user!
}
```

This is gated by `isAdminEmail()` check at the generate step, but if bypassed, creates "readonly" users.

#### Path B: Registration OTP Validate (lines 647-658) - PRIMARY CULPRIT
```javascript
// For ANY @unicity.com email during event registration
if (email.toLowerCase().endsWith("@unicity.com")) {
  let user = await storage.getUserByEmail(email);
  if (!user) {
    const role = await isAdminEmail(email) ? "admin" : "readonly";
    user = await storage.createUser({...});  // Auto-creates users!
  }
}
```

This code runs during **attendee registration** when a @unicity.com employee verifies their email. It incorrectly treats the `users` table (admin accounts) as a general user store.

**Files Involved**:
- `server/routes.ts` (lines 269-289, 647-671)
- `server/storage.ts` (lines 211-214 - case-sensitive email lookup)

### Bug #3: Case-Sensitive Email Comparison

**Root Cause**: `storage.getUserByEmail()` does exact string matching:
```javascript
const [user] = await db.select().from(users).where(eq(users.email, email));
```

But `isAdminEmail()` normalizes to lowercase before querying. If a user was added with mixed-case email, lookups will fail.

---

## Files Involved

| File | Lines | Issue |
|------|-------|-------|
| `server/routes.ts` | 17-22 | `FALLBACK_ADMIN_EMAILS` - hardcoded bootstrap list |
| `server/routes.ts` | 25-41 | `isAdminEmail()` - authorization check |
| `server/routes.ts` | 143-153 | `/api/auth/otp/generate` - blocks non-admins |
| `server/routes.ts` | 269-289 | `/api/auth/otp/validate` - auto-creates users |
| `server/routes.ts` | 647-671 | `/api/register/otp/validate` - auto-creates admin users during registration |
| `server/storage.ts` | 211-214 | `getUserByEmail()` - case-sensitive lookup |
| `shared/schema.ts` | 12-13 | `userRoleEnum` - role definitions |
| `client/src/pages/SettingsPage.tsx` | 54 | Admin UI uses correct roles |

---

## Authorization Flow: Before vs After

### BEFORE (Current - Broken)

```
Admin Login:
  Email -> isAdminEmail() check -> If passes, send OTP
  OTP -> Validate -> If user !exists, CREATE USER with role
  
Registration:
  Email -> Send OTP (no admin check)
  OTP -> Validate -> If @unicity.com, CREATE USER in admin table!
```

**Problems**:
- Registration flow pollutes admin users table
- Auto-creation bypasses explicit admin approval
- Case-sensitivity causes lookups to fail

### AFTER (Fixed)

```
Admin Login:
  Email -> isAdminEmail() check (case-insensitive) -> If passes, send OTP
  OTP -> Validate -> If user !exists in admin table, REJECT (no auto-create)
  
Registration:
  Email -> Send OTP
  OTP -> Validate -> DO NOT touch admin users table at all
  
Admin Creation:
  ONLY via Settings Page UI by existing administrator
```

---

## Fix Plan

### Fix 1: Remove Auto-Creation from Admin OTP Validate

**Location**: `server/routes.ts` lines 269-289

**Change**: If user doesn't exist after successful OTP validation, return error instead of creating user.

```javascript
// BEFORE
if (!user) {
  const role = await isAdminEmail(email) ? "admin" : "readonly";
  user = await storage.createUser({...});
}

// AFTER  
if (!user) {
  return res.status(403).json({ 
    error: "Account not found. Please contact an administrator to create your account." 
  });
}
```

### Fix 2: Remove Admin User Creation from Registration Flow

**Location**: `server/routes.ts` lines 647-671

**Change**: Remove the entire block that creates admin users during registration. The registration flow should never touch the admin users table.

### Fix 3: Make Email Lookups Case-Insensitive

**Location**: `server/storage.ts` line 212

**Change**: Normalize email to lowercase before lookup.

### Fix 4: Normalize Email on User Creation

**Location**: `server/storage.ts` line 216

**Change**: Always store emails in lowercase.

### Fix 5: Add Carolina to FALLBACK_ADMIN_EMAILS (Temporary)

**Location**: `server/routes.ts` line 17

**Change**: Add Carolina to bootstrap list so she can log in and manage users.

### Fix 6: Database Cleanup

**Action**: Remove any non-admin users from the `users` table that were incorrectly added.

---

## Confirmation Checklist

After implementing fixes, verify:

- [ ] Carolina can successfully log in to admin dashboard
- [ ] Non-admin @unicity.com employees registering for events do NOT get added to users table
- [ ] Emails with plus signs (aliases) are rejected at admin login
- [ ] Case variations of admin emails work (e.g., Carolina.Martinez vs carolina.martinez)
- [ ] New admin accounts can ONLY be created via Settings page by existing admin
- [ ] Existing readonly users who shouldn't be admins are removed from database
- [ ] Role values are consistently enforced (admin, event_manager, marketing, readonly)

---

## Approval Required

Please review this plan before implementation begins. Respond with approval to proceed with code changes.

---

# Event Printer & Badge Printing Audit

## Root Cause Analysis

### Bug #1: Printer Dropdown Shows "No printers configured" in Attendee Modal

**Root Cause**: In `AttendeesPage.tsx` lines 284-291, the printer fetch uses a **custom `queryFn`** with raw `fetch()` that doesn't include auth headers:

```javascript
// BUG: No Authorization header sent!
const { data: eventPrinters } = useQuery<Printer[]>({
  queryKey: ['/api/events', selectedAttendee?.eventId, 'printers'],
  enabled: !!selectedAttendee && drawerOpen,
  queryFn: async () => {
    const response = await fetch(`/api/events/${selectedAttendee?.eventId}/printers`);
    // Missing: Authorization header
    if (!response.ok) throw new Error("Failed to fetch printers");
    return response.json();
  },
});
```

The default `queryFn` in `queryClient.ts` includes `getAuthHeaders()`, but custom implementations bypass it.

### Bug #2: Same Issue with Print Logs

Lines 274-282 have the identical problem for `printLogs`:

```javascript
queryFn: async () => {
  const response = await fetch(`/api/registrations/${selectedAttendee?.id}/print-logs`);
  // Missing: Authorization header
}
```

### Bug #3: 401 Unauthorized + HTML Response

When `fetch()` is called without the `Authorization` header:
1. Server middleware rejects with 401
2. Vite dev server or error boundary returns HTML error page
3. Frontend calls `response.json()` which fails: `"Unexpected token '<'..."`

### Why Check-In Page Works

`CheckInPage.tsx` line 60-62 does NOT define a custom `queryFn`:

```javascript
const { data: printers } = useQuery<PrinterType[]>({
  queryKey: [`/api/events/${selectedEvent}/printers`],
  enabled: !!selectedEvent,
  // Uses default queryFn with auth headers
});
```

---

## Files Involved

| File | Lines | Issue |
|------|-------|-------|
| `client/src/pages/AttendeesPage.tsx` | 274-291 | Custom queryFn missing auth headers |
| `client/src/lib/queryClient.ts` | 46-64 | Default queryFn correctly includes auth |
| `server/routes.ts` | 4218 | `/api/events/:eventId/printers` requires `authenticateToken` |

---

## Fix Plan

### Fix 1: Remove Custom queryFn for Printer Fetch

**Location**: `client/src/pages/AttendeesPage.tsx` lines 284-292

**Change**: Use default queryFn by removing the custom one, and fix the queryKey format.

```javascript
// BEFORE
const { data: eventPrinters } = useQuery<Printer[]>({
  queryKey: ['/api/events', selectedAttendee?.eventId, 'printers'],
  enabled: !!selectedAttendee && drawerOpen,
  queryFn: async () => {
    const response = await fetch(`/api/events/${selectedAttendee?.eventId}/printers`);
    if (!response.ok) throw new Error("Failed to fetch printers");
    return response.json();
  },
});

// AFTER (uses default queryFn with auth)
const { data: eventPrinters } = useQuery<Printer[]>({
  queryKey: [`/api/events/${selectedAttendee?.eventId}/printers`],
  enabled: !!selectedAttendee && drawerOpen,
});
```

### Fix 2: Remove Custom queryFn for Print Logs

**Location**: `client/src/pages/AttendeesPage.tsx` lines 274-282

**Change**: Same fix - use default queryFn.

```javascript
// AFTER
const { data: printLogs, isLoading: printLogsLoading } = useQuery<(PrintLog & { printer?: Printer })[]>({
  queryKey: [`/api/registrations/${selectedAttendee?.id}/print-logs`],
  enabled: !!selectedAttendee && drawerOpen,
});
```

---

## Confirmation Checklist

After implementing fixes, verify:

- [ ] Printers visible in Admin > Printers page
- [ ] Printers visible in Attendee print modal dropdown
- [ ] Printers visible in Check-in flow
- [ ] Badge prints successfully with no 401 errors
- [ ] No "Unexpected token '<'" JSON parse errors
- [ ] Print logs load in attendee modal

---

# HTML Response Bug Fix (January 2026)

## Root Cause

When API routes don't match or fail to send a response, Vite's catch-all SPA handler (`app.use("*", ...)` in `server/vite.ts`) returns `index.html` with HTTP 200. Since the response is "OK" but contains HTML, `response.json()` fails with "Unexpected token '<'".

## Files Changed

| File | Change |
|------|--------|
| `server/index.ts` | Added `/api/*` catch-all returning JSON 404 before Vite |
| `client/src/lib/queryClient.ts` | Hardened `throwIfResNotOk` to detect HTML responses for API routes |

## Behavior After Fix

- API endpoints return JSON on success, failure, and 404
- Non-JSON responses to `/api/*` routes are detected and throw helpful error
- Console logs `API returned non-JSON response:` for debugging
- User sees "Server returned HTML instead of JSON" instead of cryptic parse error

---

# Record-Print 404 Fix (January 2026)

## Problem

Frontend called `POST /api/registrations/:registrationId/record-print` but endpoint didn't exist, causing 404.

## Solution

**Option A chosen**: Implemented the missing endpoint.

## Endpoint Details

| Path | Method | Auth | Purpose |
|------|--------|------|---------|
| `/api/registrations/:registrationId/record-print` | POST | admin, event_manager | Records badge print after successful print bridge call |

## Request Body

```json
{
  "printerId": "uuid",
  "guestId": "uuid" // optional
}
```

## Response

```json
{
  "success": true,
  "printLogId": "uuid"
}
```

## What It Does

1. Validates registration exists
2. Creates a print log entry with status "success"
3. Updates print log with completedAt timestamp
4. Increments badge print count on registration via `storage.recordBadgePrint()`

## Files Changed

| File | Change |
|------|--------|
| `server/routes.ts` | Added `POST /api/registrations/:registrationId/record-print` endpoint (lines ~4308-4343) |

---
---

# Attendee Portal Implementation Plan (Previous Documentation)

## Overview

Added a dedicated attendee entry point at `/my-events` where users qualified for events can see and manage their registrations without affecting admin login or existing event registration pages.

**The attendee portal is now the default entry point for the site.** Visiting `events.unicity.com/` redirects to `/my-events`.

## Routing Architecture (Updated December 2024)

| Route | Purpose | OTP Scope |
|-------|---------|-----------|
| `/` | Redirects to `/my-events` | N/A |
| `/my-events` | Attendee portal (default entry) | Attendee-scoped |
| `/admin/login` | Admin-only login | Admin-scoped |
| `/admin/*` | Admin dashboard pages | Requires admin session |
| `/register/:eventSlug` | Event registration | Registration-scoped |

### Key Routing Decisions

1. **Default Entry Point**: `/` → `/my-events`
   - Attendees should never hit admin OTP logic by default
   - Clean separation of concerns

2. **Admin Login Moved**: `/login` → `/admin/login`
   - Explicit route for administrators
   - Shows "Admin access only" messaging
   - Non-admin users see friendly "Access Denied" with link to attendee portal

3. **Deep Links Preserved**:
   - `/register/:eventSlug` continues to work
   - Event landing pages at `/events/:slug` unchanged

## Authentication Flows

### 1. Attendee Portal at `/my-events` (DEFAULT)
- **Purpose**: Let qualified users see ALL events they're eligible for
- **OTP Login**: Uses Hydra API with `attendeePortal: true` flag
- **Session Type**: Creates `attendee_sessions` (NOT admin sessions)
- **Data Source**: Queries `qualified_registrants` and `registrations` tables
- **No Admin Access**: Attendee tokens cannot access admin routes

### 2. Admin Login at `/admin/login`
- Uses OTP verification via Hydra API
- Checks admin whitelist + database users
- Creates admin auth session (`auth_sessions` table)
- Routes to `/admin` dashboard
- **Non-admin users see**: "This login is for authorized administrators only" with link to attendee portal

### 3. Public Event Registration at `/register/:eventSlug`
- Event-scoped OTP verification
- Session stored in `otp_sessions` with `registrationEventId` in customerData
- No persistent session - scoped to single event

## Security Boundaries

1. **Admin tokens** (`auth_sessions`) grant access to `/admin/*` routes
2. **Attendee tokens** (`attendee_sessions`) only work with `/api/attendee/*` endpoints
3. **Registration OTP sessions** are event-scoped and temporary
4. **Email normalization**: All lookups use `toLowerCase().trim()`
5. **OTP Isolation**: Each flow has dedicated session validation - `getOtpSessionForAttendeePortal` filters by `customerData.attendeePortal === true`

## Database Changes

### New Table: `attendee_sessions`
```sql
CREATE TABLE attendee_sessions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

## API Endpoints

### POST `/api/attendee/otp/generate`
- Input: `{ email: string }`
- Validates user has at least one qualifying event
- Sends OTP via Hydra (or dev mode: 123456)
- Returns: `{ success: true, message: string }`

### POST `/api/attendee/otp/validate`
- Input: `{ email: string, code: string }`
- Validates OTP with Hydra
- Creates attendee session (24-hour expiry)
- Returns: `{ success: true, token: string, email: string, expiresAt: string }`

### GET `/api/attendee/events`
- Requires: `Authorization: Bearer <attendee_token>`
- Returns: `{ email: string, events: AttendeeEvent[] }`
- Each event includes: id, slug, name, location, dates, registrationStatus, lastUpdated

### POST `/api/attendee/logout`
- Requires: `Authorization: Bearer <attendee_token>`
- Deletes attendee session

## Frontend Components

### `AttendeeEventsPage.tsx`
- Three-step flow: Email → OTP → Events Dashboard
- Stores attendee token in localStorage (key: `attendeeAuthToken`)
- Displays event cards with:
  - Event name (bilingual)
  - Date and location
  - Status badge ("Registered" or "Qualified")
  - Last updated timestamp
  - Action button → links to `/register/:eventSlug`

## Routing

```typescript
// In PublicRouter
<Route path="/my-events" component={AttendeeEventsPage} />
```

## Security Boundaries

1. **Admin tokens** (`auth_sessions`) grant access to `/admin/*` routes
2. **Attendee tokens** (`attendee_sessions`) only work with `/api/attendee/*` endpoints
3. **Registration OTP sessions** are event-scoped and temporary
4. **Email normalization**: All lookups use `toLowerCase().trim()`

## Testing Instructions

1. Visit `/my-events`
2. Enter a qualified email (e.g., `colby.cook+method@unicity.com` in production)
3. In dev mode, use code `123456`
4. Verify events list shows with correct status
5. Click "View/Edit" or "Register" to navigate to event registration
6. Confirm admin login at `/` still works independently

## Assumptions & Notes

- Users must be in `qualified_registrants` OR have an existing `registration` to see events
- Session expiry is 24 hours for attendee portal
- Event hero images are displayed if available
- Logout clears localStorage token

---

# Registration Pages System Overhaul

## Root Cause Analysis

### Current Problems

**1. Dual Editing Locations (UX Confusion)**
- **Location A**: Event Form (`EventFormPage.tsx`) has `registrationSettings` embedded with:
  - heroImagePath, heading, headingEs, subheading, layout, accentColor, etc.
- **Location B**: CMS Page Editor (`LandingEditorPage.tsx`) for 3 page types:
  - Login / Verification Page
  - Registration Form Page  
  - Thank You / Confirmation Page

Admins see both and don't know which one controls what the registrant actually sees.

**2. Empty Database (500 Error Root Cause)**
- The `event_pages` table is EMPTY - no page records exist
- When admin clicks "Create Login Page", the POST to `/api/events/:eventId/pages/login` tries to create a page
- This creates a confusing state where public pages work (hardcoded fallbacks) but admin can't edit them

**3. Hardcoded Fallbacks Hide the Problem**
- `RegistrationPage.tsx` uses hardcoded defaults when no CMS data exists
- This makes public pages work, but admin CMS editor shows "no page exists"

### Why the 500 Error Happens
Traced to the storage layer - when inserting into `event_pages`, the unique constraint on `(eventId, pageType)` or a field type mismatch causes the failure.

---

## Recommended Architecture: Unified Registration Flow Editor

### Design Decision: Option A - Single Registration Flow Editor

**Why This Approach:**
1. **One Mental Model**: Admins edit ONE thing - "The Registration Flow"
2. **Auto-Created Pages**: All 3 pages created automatically when event is created
3. **Tab-Based UI**: Switch between Login / Form / Thank You in the same editor
4. **No "Create Page" Button**: Pages always exist, just edit them
5. **Phase out duplicate settings**: Keep `registrationSettings` for now but migrate to CMS

### Implementation Plan

#### Phase 1: Fix the 500 Error (Immediate)
1. Debug exact error in createEventPage
2. Auto-create pages on event creation
3. Ensure pages exist when fetching (idempotent create)

#### Phase 2: Auto-Create Pages on Event Creation
1. Modify event creation to also create 3 default pages with sections
2. Add helper to ensure pages exist for existing events

#### Phase 3: Unified UI
1. Replace 3 separate page links with tabbed "Edit Registration Flow" editor
2. Remove confusing "Create Page" button - pages auto-exist
3. Update labels for clarity

#### Phase 4: Cleanup (Later)
1. Migrate registrationSettings to CMS sections
2. Remove legacy API routes

---

# Swag Feature Implementation Plan

## Current State Analysis

### Existing Database Structure
- **events** table: Stores event info (id, name, dates, settings, etc.)
- **registrations** table: Attendees with a simple `swagStatus` field (`pending` | `picked_up`)
- **guests** table: Plus-ones with a similar `swagStatus` field

### Existing UI Structure
- **EventFormPage.tsx**: Single form for creating/editing events (no tabs)
- **AttendeesPage.tsx**: Lists attendees with filtering, CSV export
- **CheckInPage.tsx**: Check-in interface with basic swag pickup button
- No dedicated event admin tabs currently

### Limitations of Current Approach
- Only tracks a single binary swag status per attendee
- No concept of multiple swag items per event
- No inventory tracking
- No way to see which specific items were given

---

## Proposed Data Model

### New Tables

#### 1. `swag_items` - Event-specific swag catalog
```typescript
export const swagItems = pgTable("swag_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  name: text("name").notNull(),
  nameEs: text("name_es"),
  description: text("description"),
  category: text("category"), // e.g., "apparel", "accessory", "gift"
  sizeRequired: boolean("size_required").default(false), // true for shirts, pants
  sizeField: text("size_field"), // "shirtSize" or "pantSize" - which field to use
  totalQuantity: integer("total_quantity").notNull().default(0),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});
```

#### 2. `swag_assignments` - Links swag items to attendees/guests
```typescript
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
// Constraint: Either registrationId OR guestId must be set, not both
```

### Type Definitions
```typescript
export type SwagItem = typeof swagItems.$inferSelect;
export type InsertSwagItem = typeof insertSwagItemSchema._type;
export type SwagAssignment = typeof swagAssignments.$inferSelect;
export type InsertSwagAssignment = typeof insertSwagAssignmentSchema._type;

// Extended type for UI
export type SwagItemWithStats = SwagItem & {
  assignedCount: number;
  receivedCount: number;
  remainingQuantity: number;
};
```

### Relations
```typescript
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
}));
```

---

## API Endpoints

### Swag Items (CRUD)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events/:eventId/swag` | List all swag items for event with stats |
| POST | `/api/events/:eventId/swag` | Create new swag item |
| PATCH | `/api/swag/:id` | Update swag item |
| DELETE | `/api/swag/:id` | Delete swag item (soft delete or archive) |

### Swag Assignments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/registrations/:id/swag` | Get swag assignments for attendee |
| POST | `/api/registrations/:id/swag` | Assign swag item(s) to attendee |
| PATCH | `/api/swag-assignments/:id` | Update assignment (mark received, etc.) |
| DELETE | `/api/swag-assignments/:id` | Remove assignment |
| POST | `/api/registrations/:id/swag/bulk-assign` | Bulk assign swag to attendee |

### Bulk Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/events/:eventId/swag/bulk-assign` | Assign swag to all/filtered attendees |
| GET | `/api/events/:eventId/swag/report` | Get swag report data |
| GET | `/api/events/:eventId/swag/export` | Export swag report as CSV |

---

## Admin UI Flow

### Option A: Event Admin Tabs (Recommended)
Convert `EventFormPage.tsx` into a tabbed interface for existing events:

```
Event Admin Tabs:
├── Details (existing form)
├── Registration Settings (existing, move from form)
├── Attendees (move from AttendeesPage, scoped to event)
├── Swag (NEW)
├── Check-In (move from CheckInPage, scoped to event)
└── Reports (NEW - future)
```

### Option B: Minimal Change Approach
Add Swag as a separate page accessible from Events list:
- Events list shows "Swag" icon button per event
- Navigate to `/admin/events/:id/swag`

### Recommended: Option A with Tab Navigation
This provides a cleaner UX and keeps all event management in one place.

---

## UI Components to Build

### 1. Event Admin Tabs Layout (`EventAdminPage.tsx`)
- Tab navigation: Details | Attendees | Swag | Check-In
- Replaces current EventFormPage for existing events
- New events still use simple form

### 2. Swag Management Tab (`SwagTab.tsx`)
```
┌─────────────────────────────────────────────────────────────────┐
│ Swag Items                                        [+ Add Item]  │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🎽 Event T-Shirt           50 total │ 45 assigned │ 5 left │ │
│ │    Size required                    [Edit] [Assign to All] │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 🎒 Welcome Bag              100 total │ 98 assigned │ 2 left│ │
│ │                                     [Edit] [Assign to All] │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Add/Edit Swag Item Dialog
- Name (EN/ES)
- Description
- Category dropdown
- Total Quantity
- Size Required toggle
- If size required: which size field to use

### 4. Swag Assignment on Attendee Detail
Inside attendee drawer/detail view:
```
┌─────────────────────────────────────────────────────────────────┐
│ Swag                                           [+ Assign Item]  │
├─────────────────────────────────────────────────────────────────┤
│ ☑ Event T-Shirt (Large)                      [Received ✓]     │
│ ☐ Welcome Bag                                [Mark Received]   │
│ ☑ Sunglasses                                 [Received ✓]     │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Check-In Swag Quick Actions
On check-in cards, show:
- Swag items assigned with checkboxes
- One-click to mark all as received
- Visual indicator of swag status

### 6. Swag Report Page (`SwagReportPage.tsx`)
```
┌─────────────────────────────────────────────────────────────────┐
│ Swag Report - Punta Cana 2025                   [Export CSV]   │
├─────────────────────────────────────────────────────────────────┤
│ Summary:                                                        │
│   Event T-Shirt: 45/50 assigned, 40 received                   │
│   Welcome Bag: 98/100 assigned, 95 received                    │
├─────────────────────────────────────────────────────────────────┤
│ Filter: [All Items ▼] [All Status ▼] [Search...]               │
├─────────────────────────────────────────────────────────────────┤
│ Name           │ Item         │ Size    │ Status    │ Received │
│ John Smith     │ T-Shirt      │ L       │ ✓ Yes     │ Dec 15   │
│ Jane Doe       │ T-Shirt      │ M       │ ○ No      │ -        │
│ John Smith     │ Welcome Bag  │ -       │ ✓ Yes     │ Dec 15   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Database & Backend (Day 1-2)
1. **Add schema definitions** to `shared/schema.ts`
   - `swagItems` table
   - `swagAssignments` table
   - Relations and types
   - Insert schemas with drizzle-zod

2. **Run database migration**
   ```bash
   npm run db:push
   ```

3. **Update storage interface** in `server/storage.ts`
   - `getSwagItemsByEvent(eventId)`
   - `createSwagItem(data)`
   - `updateSwagItem(id, data)`
   - `deleteSwagItem(id)`
   - `getSwagAssignments(registrationId | guestId)`
   - `createSwagAssignment(data)`
   - `updateSwagAssignment(id, data)`
   - `deleteSwagAssignment(id)`
   - `getSwagReport(eventId)`

4. **Add API routes** in `server/routes.ts`
   - CRUD for swag items
   - Assignment management
   - Bulk operations
   - Report endpoints

### Phase 2: Admin Swag Management (Day 2-3)
5. **Create Event Admin Tabs layout**
   - New `EventAdminPage.tsx` with tabs
   - Move existing form content to "Details" tab
   - Keep EventFormPage for "new" events only

6. **Build Swag Tab component**
   - List swag items with stats
   - Add/Edit item dialog
   - Delete confirmation
   - Bulk assign action

7. **Update AttendeesPage to scope by event**
   - Make it work as both standalone and embedded tab
   - Add swag column/indicators

### Phase 3: Attendee Swag Management (Day 3-4)
8. **Enhance attendee detail drawer**
   - Show assigned swag items
   - Quick toggle to mark received
   - Assign new items dialog

9. **Update CheckInPage**
   - Show swag items per attendee
   - Quick actions to mark all received
   - Visual swag status indicators

### Phase 4: Reporting (Day 4-5)
10. **Build Swag Report page**
    - Summary stats
    - Filterable table
    - CSV export

11. **Add swag indicators to attendee lists**
    - Badge/icon showing swag status
    - Tooltip with details

### Phase 5: Polish & Testing (Day 5)
12. **Edge cases**
    - Handle guests with swag
    - Inventory warnings
    - Over-assignment prevention

13. **UX improvements**
    - Loading states
    - Error handling
    - Toast notifications
    - Keyboard navigation

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `client/src/pages/EventAdminPage.tsx` | Tabbed event admin interface |
| `client/src/components/swag/SwagTab.tsx` | Swag management tab content |
| `client/src/components/swag/SwagItemForm.tsx` | Add/edit swag item dialog |
| `client/src/components/swag/SwagAssignments.tsx` | Attendee swag section |
| `client/src/pages/SwagReportPage.tsx` | Swag report with export |

### Modified Files
| File | Changes |
|------|---------|
| `shared/schema.ts` | Add swagItems, swagAssignments tables |
| `server/storage.ts` | Add swag CRUD methods |
| `server/routes.ts` | Add swag API endpoints |
| `client/src/App.tsx` | Add route for EventAdminPage |
| `client/src/pages/CheckInPage.tsx` | Enhanced swag display |
| `client/src/pages/AttendeesPage.tsx` | Swag column, embed capability |

---

## Migration Strategy

### Handling Existing swagStatus Field
The existing `swagStatus` field on registrations can be kept for backwards compatibility or migrated:

**Option A: Keep Both (Recommended for MVP)**
- Existing `swagStatus` remains as a "legacy" overall indicator
- New system runs in parallel
- Eventually deprecate the old field

**Option B: Migration Script**
- Create a default "General Swag" item per event
- Convert existing `picked_up` status to assignment records
- Remove old field after migration

---

## Future Enhancements (Post-MVP)
- Size variants per swag item (instead of using attendee sizes)
- Barcode/QR scanning for quick pickup
- Swag request feature (attendees can request items)
- Photo upload for swag items
- Cost tracking per item
- Vendor management

---

## Notes & Constraints
- **Internal only**: No attendee-facing UI needed
- **MVP focus**: Start simple, avoid over-engineering variants
- **Performance**: Use pagination for large attendee lists
- **Mobile-friendly**: Check-in UI must work on tablets

---

## Estimated Timeline
| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1 | 1-2 days | Database, API |
| Phase 2 | 1-2 days | Swag admin tab |
| Phase 3 | 1-2 days | Attendee swag UI |
| Phase 4 | 1 day | Reporting |
| Phase 5 | 1 day | Polish & testing |
| **Total** | **5-8 days** | Full MVP |

---

# Method Form - Dietary Preference Field Update (December 2024)

## Overview

Updated the Method form's dietary field from a single free-text input ("Vegetarian or Vegan Options") to a structured radio button group with a conditional text field.

## Changes Made

### 1. Form Template Update (server/migrate.ts)

Replaced the `vegetarianVeganOptions` text field with two new fields:

- **dietaryPreference** (radio button group)
  - Options: "No dietary restrictions", "Vegetarian", "Vegan", "Other / Allergies"
  - Required field

- **dietaryNotes** (conditional text input)
  - Only visible when "Other / Allergies" is selected
  - Required when visible
  - Placeholder: "Enter dietary needs or allergies..."

### 2. Registration Page (client/src/pages/RegistrationPage.tsx)

Added support for:
- `type: "radio"` field rendering with RadioGroup component
- `conditionalOn` field property for conditional visibility
- Automatic clearing of conditional field values when parent selection changes

### 3. Admin Views (client/src/pages/AttendeesPage.tsx)

Added columns for:
- **Dietary Preference**: Displays the selected radio option with human-readable labels
- **Dietary Notes**: Displays the conditional text field value (only shown when "Other / Allergies" was selected)

Both columns are available in the column selector and CSV exports.

## Data Model

Data is persisted in the registration's `formData` JSON field:

```json
{
  "dietaryPreference": "none" | "vegetarian" | "vegan" | "other",
  "dietaryNotes": "string (only when dietaryPreference is 'other')"
}
```

## Backward Compatibility

- Existing registrations with the old `vegetarianVeganOptions` text field remain intact in `formData`
- New registrations will use the new `dietaryPreference` and `dietaryNotes` fields
- No data migration required; old data preserved

## Field Behavior

1. When user selects a dietary preference other than "Other / Allergies":
   - Dietary Notes field is hidden
   - Any previously entered notes are cleared

2. When user selects "Other / Allergies":
   - Dietary Notes text field appears
   - Field is required

## Bilingual Support

Both fields have Spanish translations:
- "Dietary Preference" -> "Preferencia Alimenticia"
- "Please specify dietary needs" -> "Por favor especifique sus necesidades dieteticas"
- All radio options have Spanish labels

## Testing

To test the changes:
1. Create or edit an event using the Method template
2. Navigate to the public registration page
3. Verify the radio button group appears
4. Select "Other / Allergies" and verify the text field appears
5. Select another option and verify the text field disappears
6. Submit a registration and verify data appears in admin Attendees page

---

# Returning User Registration Fix (December 2024)

## Problem Statement
Returning users who had already registered for an event were receiving a "You are already registered for this event" error when trying to submit their registration again. This prevented them from updating their registration details.

## Root Cause Analysis
1. The POST `/api/events/:eventIdOrSlug/register` endpoint was checking for existing registrations and returning a 400 error if one existed
2. The client-side relied on fetching the existing registration ID before submission, but this could fail if:
   - The OTP session expired (15-minute window)
   - The page was refreshed without session persistence
   - Race conditions prevented the ID from being set

## Solution: UPSERT Pattern
Implemented a server-side UPSERT pattern that eliminates the duplicate error entirely:

### Backend Changes (server/routes.ts)
1. Modified POST `/api/events/:eventIdOrSlug/register` to use UPSERT logic:
   - Check if registration exists for email+eventId combination
   - If exists: UPDATE the existing registration with new data
   - If not exists: CREATE a new registration
   - Return `wasUpdated: true` flag when updating to allow client to show appropriate message

2. The PUT endpoint remains for explicit updates when the client knows the registration ID

3. `lastModified` timestamp is automatically updated on every edit via `storage.updateRegistration()`

### Frontend Changes (client/src/pages/RegistrationPage.tsx)
1. Updated `getCtaLabel()` to show "Update Registration" / "Actualizar Registro" when `existingRegistrationId` is set
2. Updated `onSuccess` handler to detect `wasUpdated` flag and show appropriate success message
3. Session persistence via sessionStorage allows verification to survive page refreshes

## Data Flow
1. User enters email and verifies via OTP
2. After verification, client attempts to fetch existing registration via POST `/api/register/existing`
3. If found, form is pre-filled and `existingRegistrationId` is set
4. On submit:
   - If `existingRegistrationId` is set: Use PUT endpoint
   - Otherwise: Use POST endpoint (which handles UPSERT automatically)
5. Either way, no duplicate error is thrown

## Uniqueness Enforcement
- Registrations are unique by `eventId` + `email` (normalized to lowercase)
- The UPSERT pattern uses `getRegistrationByEmail(eventId, email)` to check existence

## Timestamps
- `createdAt`: Set once on initial creation
- `lastModified`: Updated on every edit (in `storage.updateRegistration()`)
- `registeredAt`: Set once on initial creation
- `termsAcceptedAt`: Updated when terms are re-accepted

## Assumptions
1. A user is identified by their email address (normalized to lowercase)
2. One registration per email per event is the business rule
3. Re-submitting registration is a valid use case for updating information
4. The OTP session provides sufficient security for the 15-minute window

## Testing
Verified with: colby.cook+method@unicity.com
- Fresh registration works
- Page refresh within 15-min window maintains verification
- Re-submitting updates existing registration without error
- Form shows "Update Registration" when editing existing registration
- `lastModified` timestamp is refreshed on every edit

---

# Badge Printing System - Implementation Plan (January 2026)

## Overview

This document outlines the implementation plan for adding badge printing functionality to the Unicity Events web app, replacing Bizzabo's on-site check-in and badge printing flow. The system is designed for **Vegas MVP scope**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VENUE NETWORK                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     HTTPS      ┌──────────────────┐                       │
│  │   iPad       │◄──────────────►│  Events Web App  │                       │
│  │   Safari     │                │  (Replit Cloud)  │                       │
│  │              │                │                  │                       │
│  │  Check-In UI │                │ POST /api/print- │                       │
│  │  + Print Btn │                │      jobs        │                       │
│  └──────────────┘                └────────┬─────────┘                       │
│                                           │                                 │
│                                           │ HTTP (local network)            │
│                                           ▼                                 │
│                               ┌───────────────────────┐                     │
│                               │   Print Bridge        │                     │
│                               │   (Node/Express)      │                     │
│                               │                       │                     │
│                               │   Running on laptop   │                     │
│                               │   at venue            │                     │
│                               │                       │                     │
│                               │   - Receives jobs     │                     │
│                               │   - Renders ZPL       │                     │
│                               │   - Sends to printer  │                     │
│                               └───────────┬───────────┘                     │
│                                           │                                 │
│                              TCP Port 9100│                                 │
│                    ┌──────────────────────┼──────────────────────┐          │
│                    ▼                      ▼                      ▼          │
│            ┌─────────────┐       ┌─────────────┐       ┌─────────────┐      │
│            │ Zebra       │       │ Zebra       │       │ Zebra       │      │
│            │ Printer #1  │       │ Printer #2  │       │ Printer #3  │      │
│            │ (Lobby)     │       │ (VIP)       │       │ (Staff)     │      │
│            └─────────────┘       └─────────────┘       └─────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

**iPad Safari Constraints:**
| Constraint | Impact | Solution |
|------------|--------|----------|
| No raw TCP sockets | Cannot connect directly to Zebra printers | Print Bridge proxy |
| No AirPrint from web | Standard web printing won't work | ZPL over TCP |
| No native iOS APIs | Cannot use iOS printing frameworks | HTTP to Bridge |
| CORS restrictions | Cannot POST to arbitrary local IPs | Bridge handles CORS |

---

## Current Check-in System Analysis

### Existing Components

| Component | Location | Description |
|-----------|----------|-------------|
| Check-in Page | `client/src/pages/CheckInPage.tsx` | UI for searching attendees and checking them in |
| Check-in API | `POST /api/registrations/:id/check-in` | Marks registration as checked in |
| Storage Function | `storage.checkInRegistration()` | Updates `status`, `checkedInAt`, `checkedInBy` |
| Registration Schema | `shared/schema.ts` | Has `checkedInAt`, `checkedInBy` fields |

### Current Check-in Flow

1. Staff selects event from dropdown
2. Staff searches for attendee by name/email/ID
3. Staff clicks "Check In" button
4. API updates registration status to "checked_in"
5. UI refreshes to show checked-in state

---

## Email QR Code Check-In Flow (Added January 2026)

### Overview

A secure QR-based check-in flow where each registration receives a unique token-bearing QR code in their confirmation email. This enables fast on-site check-in by simply scanning the QR code.

### QR Code Format Separation

| Type | Format | Purpose |
|------|--------|---------|
| Badge QR | `REG:<registrationId>` | Printed on physical badges for identification |
| Email QR | `CHECKIN:<eventId>:<registrationId>:<token>` | Sent in confirmation email for secure check-in |

### Security Model

- **Token Generation**: 64-character cryptographically secure tokens (`crypto.randomBytes(32).toString('hex')`)
- **Event Scoping**: Tokens are bound to specific event-registration pairs
- **Idempotent Check-in**: Duplicate scans return success with `alreadyCheckedIn: true`
- **No Token Expiration** (optional field available for future use)

### Database Schema

```typescript
// shared/schema.ts
export const checkInTokens = pgTable("check_in_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id").references(() => registrations.id).notNull(),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  token: text("token").notNull(),
  expiresAt: timestamp("expires_at"),  // Optional expiration
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("check_in_tokens_registration_id_idx").on(table.registrationId),
  uniqueIndex("check_in_tokens_token_idx").on(table.token),
]);
```

### API Endpoints

#### POST `/api/checkin/scan`

Validates and processes check-in QR codes from email.

**Request:**
```json
{
  "qrPayload": "CHECKIN:event-uuid:registration-uuid:64-char-token"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "registration": { /* full registration object */ },
  "alreadyCheckedIn": false
}
```

**Error Responses:**
- `400` - Invalid QR format
- `401` - Invalid check-in token
- `404` - Registration or event not found
- `403` - Event mismatch (registration not for specified event)

### Email Integration

The confirmation email includes:
- `checkInQrPayload`: The full QR string `CHECKIN:<eventId>:<registrationId>:<token>`
- `checkInQrImageUrl`: URL to QR image service (e.g., `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=...`)

Iterable template can render the QR code using:
```html
<img src="{{checkInQrImageUrl}}" alt="Check-in QR Code" />
```

### Frontend Integration

The `CheckInPage.tsx` automatically detects QR format:

1. **CHECKIN: format** → Calls `POST /api/checkin/scan` with full payload
2. **REG: format** → Legacy flow, looks up registration by ID
3. **UUID format** → Legacy flow, direct registration lookup

### Token Lifecycle

1. **Generation**: Token created immediately after registration (`createCheckInToken`)
2. **Storage**: One token per registration (unique index)
3. **Validation**: Token matched against `check_in_tokens` table
4. **Check-in**: Updates registration status to `checked_in`

### Helper Functions

```typescript
// server/routes.ts
function generateCheckInToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function buildCheckInQRPayload(eventId: string, registrationId: string, token: string): string {
  return `CHECKIN:${eventId}:${registrationId}:${token}`;
}

function parseCheckInQRPayload(payload: string): { eventId: string; registrationId: string; token: string } | null {
  if (!payload.startsWith('CHECKIN:')) return null;
  const parts = payload.substring(8).split(':');
  if (parts.length !== 3) return null;
  return { eventId: parts[0], registrationId: parts[1], token: parts[2] };
}
```

---

### Gap Analysis

- **No printer infrastructure** in database schema
- **No print job tracking** or history
- **No ZPL template** system
- **No bridge service** for printer communication

---

## Database Schema Changes

### New Tables Required

#### 1. `printers` Table

```typescript
// shared/schema.ts
export const printers = pgTable("printers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("event_id").references(() => events.id).notNull(),
  name: text("name").notNull(),                    // "Lobby Printer", "VIP Check-in"
  location: text("location"),                       // "Main Entrance", "Ballroom A"
  ipAddress: text("ip_address").notNull(),         // "192.168.1.100"
  port: integer("port").default(9100),              // Default ZPL port
  status: text("status").default("unknown"),        // "online" | "offline" | "unknown"
  lastSeenAt: timestamp("last_seen_at"),
  capabilities: jsonb("capabilities"),              // { "maxWidth": 4, "maxHeight": 6, "dpi": 203 }
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastModified: timestamp("last_modified").defaultNow().notNull(),
});
```

#### 2. `print_logs` Table

```typescript
export const printLogs = pgTable("print_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  registrationId: varchar("registration_id").references(() => registrations.id).notNull(),
  guestId: varchar("guest_id").references(() => guests.id),  // For guest badges
  printerId: varchar("printer_id").references(() => printers.id),
  status: text("status").notNull().default("pending"), // "pending" | "sent" | "success" | "failed"
  zplSnapshot: text("zpl_snapshot"),                    // Store generated ZPL for debugging/reprint
  requestedBy: varchar("requested_by").references(() => users.id).notNull(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
  completedAt: timestamp("completed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
});
```

### Registration Table Addition

Add badge tracking to existing registrations:

```typescript
// Add to registrations table
badgePrintedAt: timestamp("badge_printed_at"),  // When badge was last printed
badgePrintCount: integer("badge_print_count").default(0),  // Number of times printed
```

---

## Print Bridge Service Specification

### Overview

A lightweight Node/Express service that runs on a laptop at the venue, acting as a bridge between the Events web app and local Zebra printers.

### API Contract

#### Base URL
```
http://<bridge-laptop-ip>:3100
```

#### Endpoints

##### 1. Health Check
```
GET /health

Response:
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "connectedPrinters": 3
}
```

##### 2. List Printers
```
GET /printers

Response:
{
  "printers": [
    {
      "id": "printer-001",
      "name": "Lobby Printer",
      "ipAddress": "192.168.1.100",
      "port": 9100,
      "status": "online",
      "lastSeen": "2026-01-02T10:30:00Z"
    }
  ]
}
```

##### 3. Register/Update Printer
```
POST /printers

Body:
{
  "name": "VIP Check-in",
  "ipAddress": "192.168.1.101",
  "port": 9100
}

Response:
{
  "id": "printer-002",
  "name": "VIP Check-in",
  "status": "online"
}
```

##### 4. Print Badge
```
POST /print

Body:
{
  "printerId": "printer-001",
  "badge": {
    "firstName": "John",
    "lastName": "Smith",
    "eventName": "Rise 2026",
    "registrationId": "uuid-here",
    "unicityId": "12345678",
    "role": "Distributor"  // Optional: "VIP", "Staff", "Guest"
  }
}

Response:
{
  "jobId": "job-uuid",
  "status": "sent",
  "sentAt": "2026-01-02T10:30:00Z"
}
```

##### 5. Job Status
```
GET /jobs/:jobId

Response:
{
  "jobId": "job-uuid",
  "status": "success",  // "pending" | "sent" | "success" | "failed"
  "sentAt": "2026-01-02T10:30:00Z",
  "completedAt": "2026-01-02T10:30:02Z",
  "errorMessage": null
}
```

##### 6. Test Print
```
POST /printers/:printerId/test

Response:
{
  "success": true,
  "message": "Test label printed successfully"
}
```

### Configuration

```env
# print-bridge/.env
PORT=3100
ALLOWED_ORIGINS=https://events.unicity.com,http://localhost:5000
PRINTER_TIMEOUT_MS=5000
MAX_RETRIES=3
LOG_LEVEL=info
```

### Error Handling

| Error Code | Description | Action |
|------------|-------------|--------|
| PRINTER_OFFLINE | Cannot connect to printer | Return error, mark printer offline |
| TIMEOUT | Print job timed out | Retry up to MAX_RETRIES |
| INVALID_ZPL | ZPL rendering failed | Return error with details |
| NETWORK_ERROR | Network connectivity issue | Return error, suggest check connection |

---

## ZPL Badge Template

### Badge Specifications

- **Size:** 4" x 6" (101.6mm x 152.4mm)
- **Orientation:** Portrait
- **DPI:** 203 (standard Zebra)
- **Content:** Name, Event, QR Code, Role indicator

### Template Design

```
┌────────────────────────────────────────┐
│                                        │
│              RISE 2026                 │  ← Event name (centered, bold)
│         ─────────────────              │  ← Decorative line
│                                        │
│                                        │
│              JOHN                      │  ← First name (large, bold)
│              SMITH                     │  ← Last name (large, bold)
│                                        │
│                                        │
│           ┌─────────────┐              │
│           │             │              │
│           │   QR CODE   │              │  ← QR containing registration ID
│           │             │              │
│           └─────────────┘              │
│                                        │
│            ID: 12345678                │  ← Unicity ID (if present)
│                                        │
│         ┌───────────────┐              │
│         │  DISTRIBUTOR  │              │  ← Role badge (optional)
│         └───────────────┘              │
│                                        │
└────────────────────────────────────────┘
```

### ZPL Template Code

```zpl
^XA

; Set print width for 4" label at 203 DPI (4 * 203 = 812 dots)
^PW812

; Set label length for 6" label at 203 DPI (6 * 203 = 1218 dots)
^LL1218

; Event Name - centered at top
^FO0,80^A0N,60,60^FB812,1,0,C^FD{{eventName}}^FS

; Decorative line
^FO100,160^GB612,4,4^FS

; First Name - large, centered
^FO0,250^A0N,100,100^FB812,1,0,C^FD{{firstName}}^FS

; Last Name - large, centered
^FO0,370^A0N,100,100^FB812,1,0,C^FD{{lastName}}^FS

; QR Code - centered (contains registration ID for scanning)
; Position: centered horizontally, below name
^FO306,520^BQN,2,6^FDQA,{{qrData}}^FS

; Unicity ID - below QR code
^FO0,820^A0N,35,35^FB812,1,0,C^FDID: {{unicityId}}^FS

; Role Badge (conditional) - bottom of badge
{{#if role}}
^FO256,900^GB300,60,60^FS
^FO256,900^FR^A0N,40,40^FB300,1,0,C^FD{{role}}^FS
{{/if}}

^XZ
```

### QR Code Data Format

Encoded as: `REG:uuid-here:event-uuid:attendee`

---

## Events App API Integration

### New Backend Routes

```typescript
// server/routes.ts

// Printer Management
GET    /api/events/:eventId/printers        // List printers for event
POST   /api/events/:eventId/printers        // Add printer
PATCH  /api/printers/:id                     // Update printer
DELETE /api/printers/:id                     // Remove printer

// Print Jobs
POST   /api/print-jobs                       // Create print job
GET    /api/print-jobs/:id                   // Get job status
GET    /api/registrations/:id/print-history  // Get print history for registration

// Bridge Proxy (optional - if cloud needs to relay)
POST   /api/bridge/print                     // Proxy to local print bridge
GET    /api/bridge/status                    // Check bridge connectivity
```

### Print Job Request Schema

```typescript
interface PrintJobRequest {
  registrationId: string;
  guestId?: string;          // For guest badges
  printerId: string;
  bridgeUrl: string;         // Local bridge URL (e.g., "http://192.168.1.50:3100")
}
```

---

## Frontend Integration

### Check-in Page Enhancements

Add to each attendee card:

1. **Print Badge Button** - Appears after check-in or anytime
2. **Printer Selection** - Dropdown/modal to choose printer
3. **Print Status Indicator** - Shows if badge was printed
4. **Reprint Option** - Allow reprinting with confirmation

### New Components Needed

```
client/src/components/
├── PrintBadgeButton.tsx      // Button with printer selection
├── PrinterSelector.tsx       // Dropdown to select printer
├── PrintStatusBadge.tsx      // Shows print status
├── BridgeStatusIndicator.tsx // Shows if bridge is connected
└── PrinterManagement.tsx     // Admin UI for managing printers
```

### State Management

```typescript
// Store bridge URL in localStorage
const BRIDGE_URL_KEY = "print-bridge-url";

// Bridge connection state
interface BridgeState {
  url: string | null;
  status: "connected" | "disconnected" | "unknown";
  printers: Printer[];
  lastChecked: Date | null;
}
```

---

## MVP Implementation Tasks

### Phase 1: Database & Backend (Est: 4-6 hours)

| Task | Description | Files |
|------|-------------|-------|
| 1.1 | Add `printers` table schema | `shared/schema.ts` |
| 1.2 | Add `printLogs` table schema | `shared/schema.ts` |
| 1.3 | Add `badgePrintedAt`, `badgePrintCount` to registrations | `shared/schema.ts` |
| 1.4 | Create insert schemas and types | `shared/schema.ts` |
| 1.5 | Add printer CRUD to storage interface | `server/storage.ts` |
| 1.6 | Add print log methods to storage | `server/storage.ts` |
| 1.7 | Add printer management API routes | `server/routes.ts` |
| 1.8 | Add print job API routes | `server/routes.ts` |
| 1.9 | Run database migration | `npm run db:push` |

### Phase 2: Print Bridge Service (Est: 4-6 hours)

| Task | Description | Files |
|------|-------------|-------|
| 2.1 | Create bridge project structure | `print-bridge/` |
| 2.2 | Implement Express server with CORS | `print-bridge/src/index.ts` |
| 2.3 | Implement TCP socket to Zebra (port 9100) | `print-bridge/src/printer.ts` |
| 2.4 | Implement ZPL template rendering | `print-bridge/src/zpl.ts` |
| 2.5 | Implement health check endpoint | `print-bridge/src/routes.ts` |
| 2.6 | Implement printer management endpoints | `print-bridge/src/routes.ts` |
| 2.7 | Implement print job endpoint | `print-bridge/src/routes.ts` |
| 2.8 | Add timeout/retry logic | `print-bridge/src/printer.ts` |
| 2.9 | Package for Mac deployment | `print-bridge/package.json` |

### Phase 3: Frontend Integration (Est: 4-6 hours)

| Task | Description | Files |
|------|-------------|-------|
| 3.1 | Add bridge URL settings modal | `client/src/components/BridgeSettings.tsx` |
| 3.2 | Add bridge connection status indicator | `client/src/components/BridgeStatusIndicator.tsx` |
| 3.3 | Create printer management admin page | `client/src/pages/PrinterManagementPage.tsx` |
| 3.4 | Add "Print Badge" button to CheckInPage cards | `client/src/pages/CheckInPage.tsx` |
| 3.5 | Add printer selection dropdown | `client/src/components/PrinterSelector.tsx` |
| 3.6 | Add print status badge component | `client/src/components/PrintStatusBadge.tsx` |
| 3.7 | Add print history to attendee drawer | `client/src/pages/AttendeesPage.tsx` |
| 3.8 | Handle reprint confirmation flow | `client/src/pages/CheckInPage.tsx` |

### Phase 4: Testing & Polish (Est: 2-4 hours)

| Task | Description |
|------|-------------|
| 4.1 | End-to-end test: Check-in → Print flow |
| 4.2 | Test error handling (offline printer, timeout) |
| 4.3 | Test offline bridge scenario |
| 4.4 | Write setup documentation for bridge |
| 4.5 | Create troubleshooting guide |

---

## Deployment & Operations

### Bridge Deployment Checklist

- [ ] Laptop with Node.js 18+ installed
- [ ] Bridge service cloned and configured
- [ ] .env file configured with correct ALLOWED_ORIGINS
- [ ] Laptop connected to venue WiFi (same network as printers)
- [ ] Printer IP addresses documented
- [ ] Test prints verified from each printer
- [ ] Bridge URL shared with check-in staff

### Network Requirements

| Device | IP Range | Ports |
|--------|----------|-------|
| Print Bridge Laptop | Venue LAN | 3100 (inbound) |
| Zebra Printers | Venue LAN | 9100 (outbound from bridge) |
| iPads | Venue LAN or routed | HTTPS to events.unicity.com |

### Fallback Procedures

If bridge is offline:
1. Check-in can continue without printing
2. Badge status shows "pending"
3. When bridge reconnects, batch print pending badges
4. Manual reprint option always available

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Check-in to print roundtrip | < 5 seconds |
| Print success rate | > 99% |
| Bridge uptime during event | > 99.5% |
| Support multiple printers | Yes (3+ per event) |
| Print logs visible in admin | Yes |
| Reprint capability | Yes |
| Works on iPad Safari | Yes |

---

## Future Enhancements (Post-MVP)

- [ ] Guest badge printing
- [ ] Badge design customization per event
- [ ] Batch print for pre-registration
- [ ] QR code scanning for fast check-in
- [ ] Print queue management
- [ ] Printer auto-discovery via mDNS
- [ ] Badge preview before printing
- [ ] Analytics dashboard

---

## Questions for Stakeholders

1. Should badge include attendee photo?
2. Are there different badge types needed (VIP, Staff, Guest)?
3. What information should the QR code contain?
4. Should we support badge reprinting with tracking?
5. Is there a specific Zebra model being used?

---

# Implementation Readiness Summary (January 2026)

## Status: READY FOR IMPLEMENTATION

After analyzing the current codebase against the Badge Printing System plan, the system is well-positioned for implementation with minimal conflicts.

---

## 1. Alignment with Current Codebase

### What Works Well

| Current Component | Alignment with Plan |
|-------------------|---------------------|
| `CheckInPage.tsx` | Existing card-based UI is ideal for adding print buttons; already has event selection, search, and per-attendee actions |
| `storage.checkInRegistration()` | Pattern for updating registration status can be extended for badge tracking |
| React Query mutations | Same pattern can be used for print job creation with optimistic updates |
| Toast feedback system | Ready for print success/failure notifications |
| Admin sidebar (`AppSidebar.tsx`) | Clear location to add "Printers" menu item |
| Admin routing (`App.tsx`) | Pattern established for adding `/admin/printers` route |
| `shared/schema.ts` | Drizzle schema structure supports adding new tables cleanly |

### Current Check-in Flow (No Changes Needed)

```
CheckInPage → POST /api/registrations/:id/check-in → storage.checkInRegistration() → Updates status/checkedInAt/checkedInBy
```

Badge printing will **extend** this flow, not replace it.

---

## 2. Gaps to Fill

### Database Schema (shared/schema.ts)

| Gap | Action Required |
|-----|-----------------|
| No `printers` table | Add table with eventId, name, location, ipAddress, port, status |
| No `print_logs` table | Add table for job tracking, ZPL snapshots, error logging |
| No badge fields on registrations | Add `badgePrintedAt`, `badgePrintCount` columns |
| No types/schemas | Create insert schemas, types, relations |

### Storage Layer (server/storage.ts)

| Gap | Action Required |
|-----|-----------------|
| No printer CRUD methods | Add `getPrinters`, `createPrinter`, `updatePrinter`, `deletePrinter` |
| No print log methods | Add `createPrintLog`, `getPrintLogsByRegistration`, `updatePrintLog` |
| No badge update method | Add `updateBadgePrinted(registrationId)` |

### API Routes (server/routes.ts)

| Gap | Action Required |
|-----|-----------------|
| No printer endpoints | Add `GET/POST /api/events/:eventId/printers`, `PATCH/DELETE /api/printers/:id` |
| No print job endpoint | Add `POST /api/print-jobs` |
| No print history endpoint | Add `GET /api/registrations/:id/print-history` |

### Frontend (client/src/)

| Gap | Action Required |
|-----|-----------------|
| No PrintBadgeButton | Create component with printer selection |
| No BridgeStatusIndicator | Create component showing bridge connectivity |
| No PrinterManagement page | Create admin page for CRUD |
| No sidebar entry for Printers | Add to `AppSidebar.tsx` |
| No route for printers | Add `/admin/printers` to `App.tsx` |

### Print Bridge Service

| Gap | Action Required |
|-----|-----------------|
| Service doesn't exist | Create separate Node/Express project |
| ZPL template generator | Create shared module for badge rendering |
| TCP client for Zebra | Implement port 9100 connection |

---

## 3. Conflicts & Risks

### No Architectural Conflicts Found

The current codebase has no patterns that conflict with the badge printing approach.

### Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Network unreliability between iPads and Print Bridge | Medium | High | Add retry logic, status polling, queue pending jobs |
| Printer misconfiguration at venue | Medium | Medium | Test print endpoint, health checks, clear error messages |
| Bridge goes offline during event | Low | High | Check-in continues without print; batch print when restored |
| CORS/HTTPS issues between cloud app and local bridge | Low | High | Bridge handles CORS; document network config requirements |
| Wrong ZPL for specific Zebra model | Low | Medium | Get exact model specs; test with actual hardware before Vegas |

---

## 4. Where Components Should Live

### Admin Navigation Structure

```
Sidebar
├── Dashboard        (/admin)
├── Events           (/admin/events)
├── Attendees        (/admin/attendees)
├── Check-In         (/admin/check-in)     ← Add Print Badge button here
├── Swag             (/admin/swag)
├── Reports          (/admin/reports)
├── Printers         (/admin/printers)     ← NEW: Printer management
└── Settings         (/admin/settings)
```

### File Organization

```
client/src/
├── pages/
│   ├── CheckInPage.tsx         (MODIFY - add print button)
│   └── PrintersPage.tsx        (NEW - printer management)
├── components/
│   ├── PrintBadgeButton.tsx    (NEW)
│   ├── PrinterSelector.tsx     (NEW)
│   ├── PrintStatusBadge.tsx    (NEW)
│   └── BridgeSettings.tsx      (NEW)

server/
├── routes.ts                   (MODIFY - add printer/print-job routes)
└── storage.ts                  (MODIFY - add printer/log methods)

shared/
└── schema.ts                   (MODIFY - add tables)

print-bridge/                   (NEW - separate project)
├── src/
│   ├── index.ts
│   ├── printer.ts
│   ├── zpl.ts
│   └── routes.ts
└── package.json
```

---

## 5. Minimal MVP Scope for Vegas

### Must Have (MVP)

1. **Database**: `printers` table, `print_logs` table, badge fields on registrations
2. **Backend**: Printer CRUD routes, print job creation route
3. **Frontend**: 
   - Print Badge button in CheckInPage
   - Printer selector modal
   - Basic print status indicator
   - Simple Printers admin page
4. **Print Bridge**: 
   - Health endpoint
   - Print endpoint
   - ZPL template (name + QR only)
   - TCP connection to Zebra

### Nice to Have (Post-Vegas)

- Guest badge printing
- Badge preview
- Batch printing
- Print queue management
- Printer auto-discovery

---

## 6. Print Bridge Approach Validation

### Compatibility Confirmed

| Requirement | Current App Support | Notes |
|-------------|---------------------|-------|
| Safari fetch to HTTP endpoint | Yes | Standard fetch API works |
| React Query mutations | Yes | Same pattern as check-in |
| LocalStorage for bridge URL | Yes | Already used for other settings |
| Admin-only access | Yes | Use existing `authenticateToken` middleware |

### Bridge Discovery Strategy Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| Manual URL entry | Simple, no discovery needed | Staff must know IP | **MVP choice** |
| QR code at venue | Easy onboarding | Requires QR generation | Post-MVP |
| mDNS auto-discovery | Zero config | Complex, browser support varies | Post-MVP |

**Recommendation**: For Vegas MVP, use manual bridge URL entry stored in localStorage. Staff enters `http://192.168.x.x:3100` once on their iPad.

---

## 7. Prep Steps Before Coding

### Immediate (Before Implementation)

- [ ] Confirm Zebra printer model and media specs (4x6 badge stock?)
- [ ] Decide QR code payload format (`REG:uuid:eventId:type`?)
- [ ] Confirm bridge authentication approach (shared secret? admin token?)
- [ ] Get venue network requirements (subnet, firewall rules?)

### During Implementation

- [ ] Test with actual Zebra hardware (borrow/rent if needed)
- [ ] Validate ZPL output before Vegas
- [ ] Create bridge deployment documentation

### Before Vegas

- [ ] Dry run: Full check-in → print flow on venue network
- [ ] Train staff on bridge setup and troubleshooting
- [ ] Document fallback procedures

---

## 8. Implementation Order

### Recommended Sequence

```
Phase 1: Database & Backend
├── 1.1 Add schema tables (printers, print_logs)
├── 1.2 Add registration badge fields
├── 1.3 Run db:push migration
├── 1.4 Add storage interface methods
├── 1.5 Add API routes
└── 1.6 Test with curl/Postman

Phase 2: Print Bridge Service
├── 2.1 Create Node/Express project
├── 2.2 Implement health endpoint
├── 2.3 Implement ZPL template
├── 2.4 Implement TCP printer client
├── 2.5 Test with actual Zebra printer
└── 2.6 Add CORS and error handling

Phase 3: Frontend Integration
├── 3.1 Add Printers page and sidebar entry
├── 3.2 Add Bridge URL settings
├── 3.3 Add Print Badge button to CheckInPage
├── 3.4 Add printer selector modal
├── 3.5 Add print status indicators
└── 3.6 End-to-end testing

Phase 4: Polish & Documentation
├── 4.1 Error handling and edge cases
├── 4.2 Bridge deployment docs
├── 4.3 Staff training materials
└── 4.4 Fallback procedure docs
```

---

## 9. Estimated Effort

| Phase | Estimated Hours | Dependencies |
|-------|-----------------|--------------|
| Phase 1: Database & Backend | 4-6 hours | None |
| Phase 2: Print Bridge Service | 4-6 hours | Access to Zebra printer |
| Phase 3: Frontend Integration | 4-6 hours | Phase 1 complete |
| Phase 4: Polish & Documentation | 2-4 hours | Phase 2-3 complete |
| **Total** | **14-22 hours** | |

---

## 10. Go/No-Go Checklist

Before starting implementation, confirm:

- [ ] Zebra printer model confirmed
- [ ] 4x6 badge stock available
- [ ] QR payload format approved
- [ ] Bridge auth approach decided
- [ ] Vegas network info obtained (or will test on-site)
- [ ] Stakeholder questions answered (see above)

**Status: Awaiting confirmation on the above items before proceeding.**

---

# Iterable Email Integration - Architecture & Implementation Plan

## Executive Summary

This document outlines the complete architecture for integrating Iterable email into the Unicity Events platform. The research covers the existing codebase structure, identifies all email trigger points, and proposes a clean, maintainable email service architecture.

---

## Part 1: Codebase Research Findings

### 1.1 User Registration Flow

**Location:** `server/routes.ts` (lines 353-438, 441-600, 1600-1744)

**Flow:**
1. **Public OTP Request** - `POST /api/register/otp/generate`
   - User submits email + eventId
   - System validates event is published
   - If event requires qualification, checks `qualified_registrants` table
   - Calls Hydra API to generate OTP (dev mode uses "123456")
   - Creates entry in `otp_sessions` table with `customerData.registrationEventId`

2. **OTP Validation** - `POST /api/register/otp/validate`
   - Validates code against Hydra API (or dev test code)
   - Extracts customer data (Unicity ID, name) from Hydra response
   - Marks session as verified, stores `bearerToken`, `customerData`

3. **Existing Registration Check** - `POST /api/register/existing`
   - After OTP verification, checks for existing registration
   - Returns existing data for pre-population

4. **Registration Creation/Update** - `POST /api/events/:eventIdOrSlug/register`
   - Creates new registration in `registrations` table
   - **EXISTING EMAIL TRIGGER**: Calls `iterableService.sendRegistrationConfirmation()`

5. **Registration Update** - `PUT /api/events/:eventIdOrSlug/register/:registrationId`
   - Updates existing registration
   - No email trigger currently exists for public updates

**Schema:** `shared/schema.ts`
- `registrations` table (line 86+)
- `otpSessions` table (line 237+)
- `qualifiedRegistrants` table (line 196+)

---

### 1.2 Login / Magic Link Email Flow

**Admin Login Flow** (`server/routes.ts` lines 143-304):
1. `POST /api/auth/otp/generate` - Admin email whitelist check, calls Hydra API
2. `POST /api/auth/otp/validate` - Validates OTP, creates auth session

**Attendee Portal Login** (`server/routes.ts` lines 600-780):
1. `POST /api/attendee/otp/generate` - For attendee portal access
2. `POST /api/attendee/otp/validate` - Validates and creates attendee session

**Current State:**
- OTP emails are sent by Hydra API (Unicity's identity service)
- No direct Iterable integration for OTP emails exists
- `sendOTPEmail()` method exists in `IterableService` but is NOT called anywhere

**Key Finding:**
The Hydra API (`https://hydra.unicity.net/v6` or `hydraqa.unicity.net/v6-test`) handles OTP email delivery. If Iterable should take over OTP emails, this requires coordination with the Hydra team or bypassing Hydra for OTP delivery.

---

### 1.3 Admin Actions Related to Registrations

| Action | Endpoint | Location | Current Email? |
|--------|----------|----------|----------------|
| **Check-in** | `POST /api/registrations/:id/check-in` | routes.ts:1919 | None |
| **Update Registration** | `PATCH /api/registrations/:id` | routes.ts:1879 | **YES** - `sendRegistrationUpdate()` for status/roomType/shirtSize changes |
| **Delete Registration** | `DELETE /api/registrations/:id` | routes.ts:1976 | None |
| **Transfer to Event** | `POST /api/registrations/:id/transfer` | routes.ts:1933 | None |
| **Bulk Swag Assignment** | `POST /api/swag-assignments/bulk` | routes.ts:2458 | None |
| **Add Qualifier** | `POST /api/events/:eventId/qualifiers` | routes.ts:2577 | None |
| **Bulk Import Qualifiers** | `POST /api/events/:eventId/qualifiers/import` | routes.ts:2603 | None |

---

### 1.4 Existing Email / Notification Logic

**File:** `server/iterable.ts`

**Current Implementation:**
```
IterableService class with methods:
├── upsertUser()                    - Create/update user in Iterable
├── sendEmail()                     - Generic email send (campaignId-based)
├── trackEvent()                    - Track custom events
├── sendOTPEmail()                  - NOT USED (Hydra sends OTPs)
├── sendQualificationEmail()        - NOT USED
├── sendRegistrationConfirmation()  - USED in routes.ts:1725
├── sendRegistrationUpdate()        - USED in routes.ts:1900
└── sendPreEventReminder()          - NOT USED (no cron/scheduler)
```

**Import Issue Found:**
- `server/iterable.ts` line 2 imports from `./iterableClient` which DOES NOT EXIST
- This is dead code that should be removed

**Usage in Routes:**
```typescript
// routes.ts line 10
import { iterableService } from "./iterable";

// routes.ts line 1722-1734 - Registration confirmation
if (process.env.ITERABLE_API_KEY) {
  try {
    await iterableService.sendRegistrationConfirmation(
      registration.email,
      registration,
      event,
      registration.language
    );
  } catch (err) {
    console.error('Failed to send confirmation email:', err);
  }
}

// routes.ts line 1896-1910 - Registration update (admin)
if (process.env.ITERABLE_API_KEY && (req.body.status || req.body.roomType || req.body.shirtSize)) {
  // ... sends update email
}
```

---

### 1.5 Environment Variable Usage Patterns

**Current Pattern:**
- Secrets via `process.env.VARIABLE_NAME`
- Conditional feature flags: `if (process.env.ITERABLE_API_KEY)`
- Dev mode detection: `process.env.NODE_ENV !== "production"`

**Existing Environment Variables:**
| Variable | Purpose | Location |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection | db.ts, drizzle.config.ts |
| `ITERABLE_API_KEY` | Iterable API authentication | iterable.ts |
| `ITERABLE_*_CAMPAIGN_ID_*` | Campaign IDs for each email type | iterable.ts |
| `NODE_ENV` | Production/development mode | routes.ts |
| `REPLIT_DOMAINS` | Current domain for webhooks | index.ts |

**Required Iterable Environment Variables (from iterable.ts):**
```
ITERABLE_API_KEY                    - Main API key
ITERABLE_OTP_CAMPAIGN_ID_EN         - OTP email (English)
ITERABLE_OTP_CAMPAIGN_ID_ES         - OTP email (Spanish)
ITERABLE_QUALIFIED_CAMPAIGN_ID_EN   - Qualification notice (English)
ITERABLE_QUALIFIED_CAMPAIGN_ID_ES   - Qualification notice (Spanish)
ITERABLE_REG_CONFIRM_CAMPAIGN_ID_EN - Registration confirmation (English)
ITERABLE_REG_CONFIRM_CAMPAIGN_ID_ES - Registration confirmation (Spanish)
ITERABLE_REG_UPDATE_CAMPAIGN_ID_EN  - Registration update (English)
ITERABLE_REG_UPDATE_CAMPAIGN_ID_ES  - Registration update (Spanish)
ITERABLE_REMINDER_CAMPAIGN_ID_EN    - Pre-event reminder (English)
ITERABLE_REMINDER_CAMPAIGN_ID_ES    - Pre-event reminder (Spanish)
```

---

### 1.6 Backend vs Frontend Responsibilities

**Backend (server/):**
- Authentication & authorization (OTP, sessions, role checks)
- Data persistence (storage.ts, db.ts)
- External API calls (Hydra, Stripe, Iterable)
- Email sending (all email triggers must be server-side)
- File uploads (objectStorage.ts)

**Frontend (client/):**
- UI rendering and form handling
- API calls via `apiRequest()` from `lib/queryClient`
- No direct external API calls (except printing)
- No secrets/credentials access

**Key Principle:** All Iterable integration lives in the backend. Frontend triggers actions via API, backend handles email delivery.

---

## Part 2: Proposed Email Service Architecture

### 2.1 Service Structure

**Recommended Approach (Simpler):**
Keep in single file but refactor:
```
server/
├── iterable.ts               # Refactored IterableService (remove dead import)
├── routes.ts                 # Uses iterableService
└── index.ts                  # No changes needed
```

**Alternative (If email complexity grows):**
```
server/
├── email/
│   ├── index.ts              # Main export + initialization
│   ├── iterableService.ts    # Iterable API wrapper (refactored)
│   ├── emailEvents.ts        # Event type definitions
│   └── templates.ts          # Campaign ID mapping
├── routes.ts                 # Uses email service
└── index.ts                  # Initializes email service
```

**Recommendation:** Use simpler approach - refactor existing `iterable.ts`.

---

### 2.2 Email Service Interface

```typescript
interface IEmailService {
  // User Management
  upsertUser(email: string, data: UserData): Promise<void>;
  
  // Transactional Emails
  sendRegistrationConfirmation(registration: Registration, event: Event): Promise<void>;
  sendRegistrationUpdate(registration: Registration, event: Event, changes: string[]): Promise<void>;
  sendRegistrationCancelled(email: string, event: Event): Promise<void>;
  sendRegistrationTransferred(registration: Registration, fromEvent: Event, toEvent: Event): Promise<void>;
  sendCheckInConfirmation(registration: Registration, event: Event): Promise<void>;
  sendQualificationNotice(email: string, event: Event, qualifierData: QualifierData): Promise<void>;
  sendPreEventReminder(registration: Registration, event: Event, daysUntil: number): Promise<void>;
  
  // Event Tracking (for analytics)
  trackEvent(email: string, eventName: string, data: Record<string, any>): Promise<void>;
}
```

---

### 2.3 Error Handling Strategy

```typescript
async function sendEmailSafely(fn: () => Promise<any>, context: string): Promise<void> {
  if (!process.env.ITERABLE_API_KEY) {
    console.log(`[Email] Skipping ${context} - ITERABLE_API_KEY not configured`);
    return;
  }
  
  try {
    await fn();
    console.log(`[Email] Sent: ${context}`);
  } catch (error) {
    console.error(`[Email] Failed: ${context}`, error);
    // Do NOT throw - email failures should not break main flow
  }
}
```

---

## Part 3: Email Trigger Events

### 3.1 Complete Event Catalog

| Event | Trigger Point | Route | Priority |
|-------|---------------|-------|----------|
| **Registration Confirmed** | New registration created | `POST /api/events/:id/register` | P0 |
| **Registration Updated** | User/admin updates registration | `PUT /api/events/:id/register/:id`, `PATCH /api/registrations/:id` | P1 |
| **Registration Cancelled** | Admin deletes registration | `DELETE /api/registrations/:id` | P2 |
| **Registration Transferred** | Admin moves to different event | `POST /api/registrations/:id/transfer` | P2 |
| **Check-In Confirmed** | Attendee checked in at event | `POST /api/registrations/:id/check-in` | P3 |
| **Qualified for Event** | Admin adds to qualifier list | `POST /api/events/:id/qualifiers`, bulk import | P1 |
| **Pre-Event Reminder** | Scheduled (X days before event) | Cron job (not implemented) | P2 |
| **Attendee Portal Link** | User requests my-events access | Could replace `POST /api/attendee/otp/generate` | P3 |

### 3.2 Implementation Priority

**Phase 1 (Core):**
- Registration Confirmation (already exists, verify working)
- Registration Update (already exists, verify working)
- Qualification Notice (method exists, needs trigger)

**Phase 2 (Admin Actions):**
- Registration Cancelled
- Registration Transferred

**Phase 3 (Enhanced):**
- Check-In Confirmation
- Pre-Event Reminder (requires cron implementation)

---

## Part 4: File Modification Plan

### 4.1 Files to Modify

| File | Changes |
|------|---------|
| `server/iterable.ts` | Remove dead import, add new email methods, improve error handling |
| `server/routes.ts` | Add email triggers for transfer, cancel, qualifiers, check-in |

### 4.2 Files to Create (Optional)

| File | Purpose |
|------|---------|
| `server/email/templates.ts` | Centralize campaign ID mapping if list grows |

### 4.3 Files NOT to Modify

- `client/*` - No frontend changes needed for email
- `shared/schema.ts` - No schema changes needed
- `server/storage.ts` - No storage changes needed

---

## Part 5: Implementation Checklist

### Pre-Implementation
- [ ] Obtain Iterable API key
- [ ] Create/verify campaign templates in Iterable dashboard
- [ ] Document campaign IDs for each email type
- [ ] Add environment variables to Replit Secrets

### Implementation
- [ ] Fix `server/iterable.ts` - remove dead import line 2
- [ ] Add missing email methods to IterableService
- [ ] Add `sendQualificationEmail` trigger to qualifier endpoints
- [ ] Add `sendRegistrationCancelled` trigger to DELETE endpoint
- [ ] Add `sendRegistrationTransferred` trigger to transfer endpoint
- [ ] Add `sendCheckInConfirmation` trigger to check-in endpoint

### Verification
- [ ] Test registration confirmation email
- [ ] Test registration update email
- [ ] Test qualification notification email
- [ ] Verify emails are NOT blocking main flow on failure
- [ ] Verify multi-language (EN/ES) support works

---

## Part 6: Environment Variables Required

Add these to Replit Secrets:

```
# Core
ITERABLE_API_KEY=your_api_key_here

# Campaign IDs - English
ITERABLE_REG_CONFIRM_CAMPAIGN_ID_EN=123456
ITERABLE_REG_UPDATE_CAMPAIGN_ID_EN=123457
ITERABLE_QUALIFIED_CAMPAIGN_ID_EN=123458
ITERABLE_CANCELLED_CAMPAIGN_ID_EN=123459
ITERABLE_TRANSFERRED_CAMPAIGN_ID_EN=123460
ITERABLE_CHECKIN_CAMPAIGN_ID_EN=123461
ITERABLE_REMINDER_CAMPAIGN_ID_EN=123462

# Campaign IDs - Spanish
ITERABLE_REG_CONFIRM_CAMPAIGN_ID_ES=123463
ITERABLE_REG_UPDATE_CAMPAIGN_ID_ES=123464
ITERABLE_QUALIFIED_CAMPAIGN_ID_ES=123465
ITERABLE_CANCELLED_CAMPAIGN_ID_ES=123466
ITERABLE_TRANSFERRED_CAMPAIGN_ID_ES=123467
ITERABLE_CHECKIN_CAMPAIGN_ID_ES=123468
ITERABLE_REMINDER_CAMPAIGN_ID_ES=123469

# Optional: OTP (if taking over from Hydra)
ITERABLE_OTP_CAMPAIGN_ID_EN=123470
ITERABLE_OTP_CAMPAIGN_ID_ES=123471
```

---

## Part 7: Notes & Considerations

### 7.1 OTP Email Decision
Currently, Hydra API sends OTP emails. Options:
1. **Keep Hydra** - No changes, emails stay with Unicity identity system
2. **Hybrid** - Use Iterable for event emails only, Hydra for auth
3. **Full Iterable** - Intercept OTP code from Hydra, send via Iterable (complex)

**Recommendation:** Start with hybrid approach (option 2).

### 7.2 Pre-Event Reminders
Requires a scheduled job (cron) to:
1. Query registrations for upcoming events
2. Calculate days until event
3. Send appropriate reminder emails

This is NOT currently implemented. Consider:
- Replit Scheduled Workflows
- External cron service (e.g., cron-job.org)
- Iterable's journey/workflow feature (managed in Iterable dashboard)

### 7.3 No Native Replit Iterable Integration
Unlike Stripe or SendGrid, there is no native Replit integration for Iterable. 
Manual API key management via Secrets is required.

---

## Summary

The codebase already has a partial Iterable integration with the foundation in place:
- `IterableService` class exists with core methods
- Registration confirmation and update emails are implemented
- Multi-language support (EN/ES) is structured

**Key work needed:**
1. Fix dead import in `iterable.ts`
2. Add email triggers for missing admin actions
3. Configure environment variables with actual campaign IDs
4. Test end-to-end email delivery

The architecture is clean and follows good patterns - no major refactoring needed, just completion of existing integration.

## Swag Assignment Investigation (January 2026)

### Issue Reported
User reported that swag assignments are not persisting - they assign swag via the admin UI, but the assignments don't appear on the attendee's profile even though the swag management page shows "2 Assigned".

### Investigation Findings

#### Code Flow Trace
1. **UI**: SwagPage.tsx → `handleBulkAssign()` → `bulkAssignMutation`
2. **API**: POST `/api/swag-assignments/bulk` in routes.ts
3. **Storage**: `storage.createSwagAssignment()` in storage.ts
4. **Database**: INSERT into `swag_assignments` table

#### Observations
- The `swag_assignments` table schema is correct with all required columns
- The storage layer correctly inserts and returns assignments
- The assigned count on swag items is calculated from the swag_assignments table
- The attendee profile queries `/api/registrations/:registrationId/swag-assignments`

#### Possible Causes
1. **Size validation gap**: If a swag item requires a size but none is selected, the assignment could fail silently (FIXED - now validates on frontend)
2. **Caching**: React Query cache might not be invalidated after assignment
3. **Registration ID mismatch**: The 2 assignments might be for different registrations, not James Dean

#### Fixes Applied
1. Added frontend validation to require size selection when swag item has `sizeRequired=true`
2. Added comprehensive backend logging for:
   - Bulk assignment requests (request body, registration IDs)
   - Assignment creation success/failure per registration
   - Assignment fetching with details
3. Added frontend debug logging when viewing attendee swag assignments
4. Added loading/error states to the swag assignments display

#### Debugging Steps for Production
1. Open browser DevTools → Console tab
2. Navigate to Attendees page, select the event
3. Click on James Dean's row to open the drawer
4. Check console for `[Swag Debug]` messages showing:
   - Attendee ID and email
   - Assignments array (should show data or empty array)
   - Loading/error states

5. Try assigning swag again via Swag Management page
6. Check Network tab for the POST request to `/api/swag-assignments/bulk`
   - Verify the request body contains correct `registrationIds`
   - Check the response for created assignments

#### Query to Verify Production Data
Run this in the production database to check swag assignments:
```sql
SELECT 
  sa.id as assignment_id,
  sa.registration_id,
  r.email,
  r.first_name,
  r.last_name,
  si.name as swag_item_name,
  sa.size,
  sa.status,
  sa.created_at
FROM swag_assignments sa
JOIN registrations r ON sa.registration_id = r.id
JOIN swag_items si ON sa.swag_item_id = si.id
ORDER BY sa.created_at DESC;
```

## Event Registration + Verification Flow Documentation (January 2026)

This document describes the current registration and OTP verification flow for event registration pages at `/register/:eventId`.

### Key Files Involved

| File | Purpose |
|------|---------|
| `client/src/pages/RegistrationPage.tsx` | Frontend registration page component |
| `server/routes.ts` | Backend API endpoints for OTP and registration |
| `server/storage.ts` | Database operations for registrations, OTP sessions, qualifiers |
| `shared/schema.ts` | Database schema definitions (events, registrations, otp_sessions) |

### Database Schema Properties

**events table:**
- `requiresQualification` (boolean, default: false) - If true, only users in `qualified_registrants` can register
- `requiresVerification` (boolean, default: true) - If true, email OTP verification is required before showing the form

**qualified_registrants table:**
- Links emails to events they are pre-authorized to register for
- Checked when `event.requiresQualification = true`

### Flow Diagram

```
User visits /register/:eventId
         │
         ▼
┌────────────────────────────────────────┐
│  Fetch Event Data (public endpoint)    │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Check URL Params                      │
│  - ?uid=xxx&email=xxx → skip verify    │
│  - ?token=xxx → consume redirect token │
└────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│  Determine if verification required:                              │
│  requiresVerification = (event.requiresVerification === true      │
│                         OR event.requiresQualification === true)  │
│                         AND NOT skipVerification (URL params)     │
└──────────────────────────────────────────────────────────────────┘
         │
         ├─────── verification NOT required ───────┐
         │                                         │
         ▼                                         ▼
┌───────────────────────────────┐     ┌────────────────────────────┐
│  Step 1: Email Input Screen   │     │  Go directly to Form Step  │
│  (verificationStep = "email") │     │  (verificationStep = "form")│
└───────────────────────────────┘     └────────────────────────────┘
         │
         │ User enters email, clicks "Send Code"
         ▼
┌───────────────────────────────────────────────────────────────────┐
│  POST /api/register/otp/generate                                   │
│  { email, eventId }                                                │
│                                                                    │
│  Backend Flow:                                                     │
│  1. Validate event exists and status = "published"                 │
│  2. IF event.requiresQualification = true:                         │
│     - Check qualified_registrants table for email                  │
│     - Check registrations table for existing registration          │
│     - If NEITHER found → 403 "You are not qualified..."            │  ◀── OTP never sent
│  3. Send OTP via Hydra API (production) or dev code (dev)          │
│  4. Create otp_sessions record with eventId scope                  │
└───────────────────────────────────────────────────────────────────┘
         │
         ├─────── 403 Not Qualified ──────────────┐
         │                                         │
         ▼                                         ▼
┌───────────────────────────────┐     ┌────────────────────────────┐
│  Step 2: OTP Input Screen     │     │  Error Toast Displayed     │
│  (verificationStep = "otp")   │     │  "You are not qualified..."│
└───────────────────────────────┘     └────────────────────────────┘
         │
         │ User enters 6-digit code
         ▼
┌───────────────────────────────────────────────────────────────────┐
│  POST /api/register/otp/validate                                   │
│  { email, code, eventId }                                          │
│                                                                    │
│  Backend Flow:                                                     │
│  1. Find otp_sessions by email + eventId scope                     │
│  2. Validate code via Hydra API or dev code                        │
│  3. Mark session as verified                                       │
│  4. Return profile data (unicityId, firstName, lastName, etc.)     │
│  5. Special case: "Customer not found" in Hydra →                  │
│     Check qualified_registrants and use their data                 │
└───────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────────────────┐
│  Step 3: Registration Form    │
│  (verificationStep = "form")  │
│  - Identity fields locked     │
│  - Custom fields editable     │
└───────────────────────────────┘
         │
         │ User submits form
         ▼
┌───────────────────────────────────────────────────────────────────┐
│  POST /api/registrations                                           │
│  - Creates or updates registration in database                     │
│  - Sends confirmation email via Iterable                           │
└───────────────────────────────────────────────────────────────────┘
```

### Conditions for Form Visibility

| Condition | Form Shown? | Notes |
|-----------|-------------|-------|
| `requiresVerification=false` AND `requiresQualification=false` | Immediately | No verification step |
| `requiresVerification=true` AND user verified | Yes | After OTP verification |
| `requiresQualification=true` AND user qualified AND verified | Yes | Must verify, must be in qualified list |
| `requiresQualification=true` AND user NOT qualified | No | 403 error at OTP generate step |
| URL has `?uid=xxx&email=xxx` params | Yes | Pre-populated, verification skipped |

### When Email Verification is Triggered

1. **Explicit**: User clicks "Send Code" button on email input screen
2. **API Call**: `POST /api/register/otp/generate` with `{ email, eventId }`
3. **Pre-check**: If `event.requiresQualification=true`, backend checks qualification BEFORE calling Hydra

### How requiresQualification is Checked

**Backend (server/routes.ts line 373-384):**
```javascript
if (event.requiresQualification) {
  const normalizedEmail = email.toLowerCase().trim();
  const qualifier = await storage.getQualifiedRegistrantByEmail(event.id, normalizedEmail);
  const existingRegistration = await storage.getRegistrationByEmail(event.id, normalizedEmail);
  
  if (!qualifier && !existingRegistration) {
    return res.status(403).json({ 
      error: `You are not qualified for this event...` 
    });
  }
}
```

### What Happens When User is NOT Pre-Authorized

1. User enters email on `/register/:eventId`
2. Clicks "Send Code"
3. Backend receives `POST /api/register/otp/generate`
4. Backend checks `event.requiresQualification`
5. If true, queries `qualified_registrants` table
6. User email NOT found → immediate 403 response
7. **OTP is NEVER sent** - Hydra API is never called
8. Frontend displays error toast with message

### Why OTP Emails Fail to Send (Non-Qualified Path)

**Root Cause:** The OTP email is not failing - it's never attempted.

The server rejects the request at the qualification check (step 5-6 above) BEFORE reaching the Hydra API call that sends the actual OTP email.

**Code flow:**
1. Line 374: `if (event.requiresQualification) {`
2. Line 376-377: Check qualifier and existing registration
3. Line 379-383: If neither found, return 403 immediately
4. Lines 386-432: Hydra API call is AFTER this check - never reached

### Shared Logic Between Qualified and Non-Qualified Flows

| Component | Shared? | Notes |
|-----------|---------|-------|
| OTP generate endpoint | Partially | Same endpoint, but qualification check gates Hydra call |
| OTP validate endpoint | Yes | Same validation logic for both |
| Registration form | Yes | Same component renders for all |
| Registration submission | Yes | Same POST /api/registrations endpoint |
| Session management | Yes | Same otp_sessions table with eventId scope |

### Potential Issues / Coupling Observed

1. **Qualification check blocks OTP entirely**: When `requiresQualification=true`, non-qualified users get a 403 at OTP generate - they cannot even verify their email. This is intentional for closed events.

2. **Two sources of truth for "allowed to register"**:
   - `qualified_registrants` table (pre-authorized list)
   - `registrations` table (existing registration allows updates)
   
3. **Frontend error handling**: The 403 response is displayed as an error toast, but it's a valid business rule, not an error. Consider a friendlier UX for closed events.

4. **Event-scoped OTP sessions**: The `customerData.registrationEventId` field scopes OTP sessions to specific events, preventing cross-event session reuse.

5. **Hydra "Customer not found" fallback**: If Hydra validates OTP but doesn't have the customer, the backend checks the qualified list and uses that data instead. This handles new users who are pre-qualified but not in Hydra's system.

---

### Audit Log

**January 5, 2026 - Audit confirmed – no drift detected**

Re-verified the registration flow documentation against current code:

| Aspect | Documented | Current Code | Status |
|--------|------------|--------------|--------|
| Form visibility logic | `requiresVerification OR requiresQualification AND NOT skipVerification` | RegistrationPage.tsx lines 395-398 | ✓ Match |
| OTP generate endpoint | `/api/register/otp/generate` with qualification pre-check | routes.ts lines 354-438 | ✓ Match |
| Qualification check | Lines 373-384 check `qualified_registrants` + `registrations` tables | routes.ts lines 373-384 | ✓ Match |
| 403 for non-qualified | Returns before Hydra call, OTP never sent | routes.ts line 380 | ✓ Match |
| URL param skip | `?uid=xxx&email=xxx` skips verification | RegistrationPage.tsx line 317 | ✓ Match |
| Event-scoped sessions | `customerData.registrationEventId` stored | routes.ts line 431 | ✓ Match |
| Multi-registration | UPSERT pattern - existing registrations updated, not duplicated | routes.ts lines 1627-1688 | ✓ Match |

**Additional notes from audit:**
- The multi-registration constraint uses an UPSERT pattern at registration submission (not at OTP stage)
- If a user with an existing registration requests OTP, qualification check passes (line 377-378)
- Registration updates are done via the same POST endpoint with `wasUpdated: true` response flag

---

## Registration Modes (January 2026)

### Overview

The `registrationMode` field consolidates the existing `requiresQualification` and `requiresVerification` boolean flags into a single, clearer enum-style field. This improves code clarity and maintainability without changing runtime behavior.

### Registration Mode Values

| Mode | requiresQualification | requiresVerification | Description |
|------|----------------------|---------------------|-------------|
| `qualified_verified` | true | true | Only pre-qualified users can register. OTP verification required. |
| `open_verified` | false | true | Anyone can register. OTP verification required. |
| `open_anonymous` | false | false | Anyone can register. No verification. (**Not enabled yet**) |

### Default Mapping

- Existing events with `requiresQualification=true` → `"qualified_verified"`
- Existing events with `requiresQualification=false, requiresVerification=true` → `"open_verified"`
- Existing events with `requiresQualification=false, requiresVerification=false` → `"open_anonymous"` (not enabled)
- New events default to `"open_verified"`

### Schema Changes

**New field in `events` table:**
```typescript
registrationMode: text("registration_mode").notNull().default("open_verified")
```

**Helper functions in `shared/schema.ts`:**
```typescript
// Derive legacy flags from registrationMode
deriveRegistrationFlags(mode: RegistrationMode): { requiresQualification: boolean; requiresVerification: boolean }

// Derive registrationMode from legacy flags (for migration/compat)
deriveRegistrationMode(requiresQualification, requiresVerification): RegistrationMode
```

### Backward Compatibility

The legacy fields (`requiresQualification`, `requiresVerification`) are preserved and kept in sync with `registrationMode`:

1. **When creating/updating events:**
   - If `registrationMode` is provided, legacy fields are derived from it
   - If only legacy fields are provided, `registrationMode` is derived from them
   - All three fields are always kept in sync in the database

2. **When reading events:**
   - Backend returns all three fields (mode + legacy booleans)
   - Frontend prefers `registrationMode` but falls back to legacy fields

3. **Admin UI:**
   - Currently uses legacy `requiresQualification` toggle
   - Backend syncs this to the correct `registrationMode` automatically

### Files Modified

| File | Changes |
|------|---------|
| `shared/schema.ts` | Added `registrationModeEnum`, `RegistrationMode` type, helper functions, `registrationMode` column |
| `server/routes.ts` | Updated to derive from `registrationMode`, sync legacy fields |
| `client/src/pages/RegistrationPage.tsx` | Updated to use `registrationMode` for verification logic |

### qualified_verified Mode Implementation (January 2026)

The `qualified_verified` mode provides a secure registration experience where:
- Only pre-qualified users (in the `qualified_registrants` table) can register
- Email verification (OTP) is required BEFORE seeing the registration form
- User must enter their email first, receive OTP, then access the form

**User Flow:**
1. User visits `/register/:eventSlug` → Email entry screen is shown
2. User enters email → Backend checks if email is in qualified_registrants
3. If qualified, OTP is sent to email
4. User enters 6-digit OTP code
5. On successful verification → Registration form is shown with pre-populated data
6. User completes form and submits → Registration saved

**Frontend Implementation (RegistrationPage.tsx):**
- `requiresVerification = (registrationMode !== "open_anonymous") && !skipVerification`
- For qualified_verified: `verificationStep` starts as "email" (not "form")
- `openVerifiedMode` is false, so form is NOT shown immediately
- `handleSendOtp()` sends OTP via `/api/register/otp/generate`
- `handleVerifyOtp()` validates OTP via `/api/register/otp/validate`
- On successful verification: `verificationStep` changes to "form", profile data pre-populates form

**Backend Implementation (routes.ts):**
- `/api/register/otp/generate` checks `registrationMode === "qualified_verified"`
- If qualified_verified: looks up email in `qualified_registrants` table
- If not found in qualified list → Returns 403 with helpful error message
- If found → Sends OTP and creates event-scoped session

**Security:**
- OTP sessions are event-scoped (`customerData.registrationEventId`)
- Qualification check happens at OTP generation, not form submission
- Session persistence: sessionStorage key `reg_verified_email_{eventId}` allows refresh without re-verification (30-minute window)

**Admin Form Compatibility Fix (January 2026):**
The admin event form uses the legacy `requiresQualification` boolean toggle. The backend now correctly derives `registrationMode` from this field:
- When `requiresQualification: true` is sent → `registrationMode = "qualified_verified"`
- When `requiresQualification: false` is sent → `registrationMode = "open_verified"`
- Both CREATE and UPDATE endpoints support this derivation

---

### open_verified Mode Implementation (January 2026)

The `open_verified` mode provides a streamlined registration experience where:
- Anyone can register (no qualification list required)
- Email verification (OTP) is required BEFORE saving the registration
- One registration per email per event is enforced

**User Flow:**
1. User visits registration page → Form is immediately visible (no upfront verification step)
2. User fills out form and clicks submit
3. If email not verified → OTP dialog appears, code is sent to email
4. User enters 6-digit OTP code
5. On successful verification → Registration is saved automatically
6. User sees success/thank you page

**Frontend Implementation (RegistrationPage.tsx):**
- `openVerifiedMode` helper detects when event uses this mode
- `useEffect` sets `verificationStep` to "form" immediately for open_verified events
- `onSubmit` checks `isEmailVerified` state before calling mutation
- If not verified: stores form data in `pendingSubmissionData`, triggers `showOtpDialog`
- `handleOpenVerifiedSendOtp()` sends OTP to user's email
- `handleOpenVerifiedVerifyOtp()` validates OTP and auto-submits registration
- `renderOtpDialog()` provides inline OTP verification UI
- Error handler catches `VERIFICATION_REQUIRED` (403) as safety net

**Backend Implementation (routes.ts):**
- Registration endpoint checks `requiresVerification` flag
- If true, looks for valid OTP session for email+event combination
- Valid session: within 30 minutes of verification
- No valid session → Returns 403 with `code: "VERIFICATION_REQUIRED"`
- Valid session → Proceeds with registration save

**Security:**
- OTP sessions are event-scoped (email + eventId)
- Sessions expire 30 minutes after verification
- One registration per email per event enforced by UPSERT pattern
- Attendee tokens from `/my-events` portal are also accepted

### Testing

Behavior should remain identical after this change. Verify:
1. Qualified events still require qualification check at OTP generate
2. Open events still allow anyone to register with OTP
3. Admin UI toggle for "Requires Qualification" now correctly sets `registrationMode`
4. Public event API returns both `registrationMode` and legacy fields

**qualified_verified Mode Testing:**
1. Admin enables "Requires Qualification" toggle → event gets `registrationMode: "qualified_verified"`
2. User visits `/register/:eventSlug` → sees email entry screen (NOT form)
3. User enters email not in qualified list → sees 403 error
4. User enters qualified email → receives OTP
5. User enters correct OTP → sees registration form with pre-populated data
6. Session persists across page refresh (30-minute window)

**open_verified Mode Testing:**
7. Form visible immediately for open_verified events (no email prompt first)
8. Submitting without verification triggers OTP dialog
9. After OTP verification, registration saves automatically
10. Duplicate registration by same email updates existing record

### open_anonymous Mode Implementation (January 2026)

The `open_anonymous` mode provides a fully open registration experience where:
- Anyone can register without verification
- NO email verification or authentication required
- Multiple registrations per email are allowed (no uniqueness enforcement)
- Email is treated as a contact field only
- No user-initiated edits after submission (admin-only edits)

**User Flow:**
1. User visits registration page → Form is visible immediately
2. User fills out form → No verification prompts
3. User submits → Registration created immediately
4. Warning displayed: "Information cannot be edited after submission"
5. Each submission creates a NEW registration record

**Frontend Implementation (RegistrationPage.tsx):**
- `openAnonymousMode` helper detects when event uses this mode
- `useEffect` sets `verificationStep` to "form" immediately for open_anonymous events
- `onSubmit` skips all verification checks for anonymous mode
- Warning banner displayed at top of form explaining no edits after submission
- No OTP dialog triggered, no session checks

**Backend Implementation (routes.ts):**
- Registration endpoint checks `isAnonymousMode` flag
- If true: skips OTP validation entirely
- Creates new registration without checking for existing one (no UPSERT)
- Response includes `isAnonymous: true` flag
- No email uniqueness constraint enforced

**Key Differences from open_verified:**
| Aspect | open_verified | open_anonymous |
|--------|---------------|----------------|
| OTP Required | Yes (before submit) | No |
| Email Uniqueness | Yes (UPSERT) | No (always create) |
| User Edits | Yes (via OTP) | No (admin only) |
| Multiple Registrations | No | Yes |

**Security:**
- No authentication = no edit capability for users
- All edits must go through admin interface
- Email is contact info only, not identity

**open_anonymous Mode Testing:**
1. Form visible immediately (no email prompt, no OTP)
2. Warning banner appears about no edits after submission
3. Submit without verification succeeds
4. Same email can register multiple times (creates new records)
5. No edit links or return-to-edit capability for users

### Multi-Attendee Registration (open_anonymous mode only) - January 2026

The open_anonymous mode supports registering multiple attendees in a single submission:

**Data Model:**
- `orderId`: UUID to group all attendees from the same submission
- `attendeeIndex`: 0-based index within the order (primary registrant = 0)

**User Flow:**
1. User selects ticket count (1-10) from dropdown
2. Primary attendee fills out full registration form
3. Additional attendees require: first name, last name, email (phone optional)
4. Submit creates all registrations atomically with same orderId
5. Response includes orderId and ticketCount

**Frontend Implementation:**
- `ticketCount` state (1-10, default 1)
- `additionalAttendees` array state for simplified attendee data
- Ticket count selector shown only for open_anonymous events
- Dynamic attendee forms rendered for ticketCount > 1
- Validation ensures all additional attendees have required fields
- Mutation builds attendees array and sends to API

**Backend Implementation:**
- Checks for `attendees` array in request body
- Generates shared `orderId` (UUID) for the submission
- Creates each registration with orderId and attendeeIndex
- Returns `{ orderId, ticketCount, registrations[] }`

**API Payload (multi-attendee):**
```json
{
  "email": "primary@email.com",
  "attendees": [
    { "email": "primary@email.com", "firstName": "...", "lastName": "...", ...fullFields },
    { "email": "guest2@email.com", "firstName": "...", "lastName": "...", "termsAccepted": true },
    { "email": "guest3@email.com", "firstName": "...", "lastName": "...", "termsAccepted": true }
  ]
}
```

**Multi-Attendee Testing:**
1. Ticket count selector appears for open_anonymous events
2. Selecting > 1 shows additional attendee forms
3. Validation prevents submit if additional attendee fields are empty
4. Successful submit creates N registrations with same orderId
5. All attendees appear in admin attendee list with correct orderId

---

# Print Bridge Readiness Assessment (January 2026)

## Overview

Verified the Events app and Print Bridge setup for on-site Zebra badge printing at Vegas environment. The system is designed for iPad Safari check-in connecting to a local Print Bridge laptop which communicates with Zebra printers over TCP 9100.

## Architecture

```
┌─────────────┐     HTTPS      ┌────────────────────┐
│   iPad      │ ──────────────▶│  events.unicity.com │
│ (Check-in)  │                │   (Cloud App)       │
└─────────────┘                └────────────────────┘
       │                                 
       │ HTTP (local network)            
       ▼                                 
┌─────────────────────────────────────────────────────┐
│              Print Bridge (venue laptop)            │
│              http://192.168.x.x:3100                │
└─────────────────────────────────────────────────────┘
       │                                 
       │ TCP Port 9100 (ZPL raw)         
       ▼                                 
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Zebra 1   │  │   Zebra 2   │  │   Zebra 3   │
└─────────────┘  └─────────────┘  └─────────────┘
```

## Readiness Checklist

### What is Ready

| Component | Status | Location |
|-----------|--------|----------|
| Print Bridge service | Complete | `print-bridge/` folder |
| Health check endpoint | Complete | `GET /health` in `print-bridge/src/index.ts` |
| ZPL badge rendering | Complete | `print-bridge/src/zpl.ts` |
| TCP 9100 printer communication | Complete | `print-bridge/src/printer.ts` |
| CORS support | Complete | Configurable via `ALLOWED_ORIGINS` env var |
| Bridge URL storage | Complete | localStorage `print-bridge-url` key |
| PrintersPage UI | Complete | `client/src/pages/PrintersPage.tsx` |
| Bridge connectivity check | Complete | `checkBridgeStatus()` function |
| CheckInPage print workflow | Complete | Direct fetch to bridge URL |
| Database schema (printers, print_logs) | Complete | `shared/schema.ts` |
| Server-side print proxy | Complete | `/api/print-bridge/print` in `server/routes.ts` |
| Retry logic for failed prints | Complete | 3 retries with backoff in `printer.ts` |
| Test print functionality | Complete | `POST /printers/:id/test` |

### What is Missing

| Item | Status | Action Required |
|------|--------|-----------------|
| Mixed content handling | Needs testing | iPad Safari may block HTTP requests from HTTPS page |
| ALLOWED_ORIGINS config | Not set | Set in Print Bridge `.env` file on-site |
| PRINT_BRIDGE_URL env var | Uses fallback | Set in cloud app for server-side proxy fallback |

### What Must Be Tested On-Site

1. **Mixed Content Blocker**: Verify iPad Safari allows fetch to `http://192.168.x.x:3100` from `https://events.unicity.com`
   - If blocked, may need to use the server-side proxy instead
   - Alternative: Run Print Bridge with self-signed HTTPS cert

2. **Network Connectivity**: Confirm iPads can reach Print Bridge laptop IP on port 3100

3. **Printer Discovery**: Test that Zebra printers respond on TCP 9100

4. **ZPL Badge Layout**: Print test badges and verify layout on 4x6 labels

5. **Error Handling**: Test printer offline scenarios and retry behavior

6. **Performance**: Verify print latency is acceptable for check-in flow

## Configuration Required On-Site

### Print Bridge Laptop (.env file)

```bash
# print-bridge/.env
PORT=3100
ALLOWED_ORIGINS=https://events.unicity.com,https://your-app.replit.app
PRINTER_TIMEOUT_MS=5000
MAX_RETRIES=3
```

### iPad Configuration

1. Open Check-In page
2. Go to Printers page
3. Enter Print Bridge URL: `http://192.168.x.x:3100`
4. Click "Check Connection" to verify health
5. Add printers with their IP addresses

## Potential Blockers

### 1. Mixed Content (High Risk)

**Issue**: Safari on iOS aggressively blocks HTTP requests from HTTPS pages.

**Workarounds**:
- **Option A**: Use server-side proxy (`/api/print-bridge/print`) - already implemented
- **Option B**: Run Print Bridge with self-signed HTTPS cert
- **Option C**: Access app via HTTP during event (not recommended)

### 2. Local Network Firewall

**Issue**: Venue network may block port 3100 or 9100.

**Solution**: Pre-test with IT team, ensure all devices on same VLAN.

### 3. Printer IP Changes

**Issue**: DHCP may reassign printer IPs.

**Solution**: Configure static IPs or DHCP reservations for printers.

## No Code Changes Made

Per constraints, no production code was added. This is a readiness assessment only.

## Next Steps

1. **Pre-Event Setup (1-2 hours)**
   - Install Node.js on venue laptop
   - Clone/copy `print-bridge/` folder
   - Configure `.env` with correct origins
   - Start service with `npm run start`

2. **Printer Setup**
   - Connect Zebra printers to venue network
   - Note IP addresses
   - Add printers in app via PrintersPage

3. **Test Cycle**
   - Send test prints from PrintersPage
   - Verify badge layout
   - Test full check-in flow with print

4. **Fallback Plan**
   - If direct browser-to-bridge fails, use server-side proxy
   - Set `PRINT_BRIDGE_URL` env var on cloud app to point to bridge
   - Cloud app will forward print requests

## Files Reference

| File | Purpose |
|------|---------|
| `print-bridge/README.md` | Full setup and API documentation |
| `print-bridge/src/index.ts` | Main service with all endpoints |
| `print-bridge/src/zpl.ts` | Badge ZPL template |
| `print-bridge/src/printer.ts` | TCP 9100 communication |
| `client/src/pages/PrintersPage.tsx` | Bridge config UI |
| `client/src/pages/CheckInPage.tsx` | Check-in with print button |
| `server/routes.ts` (lines 4055-4170) | Server-side print proxy |

---

# Apple Wallet (PassKit) Integration

## Overview

The system supports generating Apple Wallet passes (.pkpass files) that contain the attendee's check-in QR code. This allows iOS users to add their event pass to Apple Wallet for quick access during check-in.

## Architecture

### Components

1. **AppleWalletService** (`server/appleWallet.ts`)
   - Generates .pkpass files using `passkit-generator`
   - Creates passes with event details, QR code, and branding
   - Supports bilingual content (English/Spanish)

2. **API Endpoint** (`GET /api/wallet/:token`)
   - Validates check-in token
   - Generates and returns .pkpass file
   - Returns 503 if certificates not configured

3. **UI Components** (`client/src/components/AppleWalletButton.tsx`)
   - `AppleWalletButton` - Basic button
   - `AppleWalletButtonBilingual` - Language-aware button

### Integration Points

- **Registration Success Page**: Shows "Add to Apple Wallet" button after registration
- **Confirmation Email**: Includes Apple Wallet download link via Iterable

## Apple Developer Setup

### 1. Create Pass Type Identifier

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/identifiers/list/passTypeId)
2. Click "+" to create new identifier
3. Select "Pass Type IDs"
4. Enter description: "Unicity Events Check-In Pass"
5. Enter identifier: `pass.com.unicity.events`
6. Click "Register"

### 2. Create Signing Certificate

1. In Apple Developer Portal, go to Certificates
2. Click "+" to create new certificate
3. Select "Pass Type ID Certificate"
4. Select your Pass Type ID (`pass.com.unicity.events`)
5. Follow instructions to create CSR and download certificate
6. Export certificate and private key as .p12 file

### 3. Download WWDR Certificate

1. Download Apple's WWDR (Worldwide Developer Relations) certificate
2. Required for pass signing chain

### 4. Convert Certificates to PEM Format

```bash
# Convert signer certificate and key from .p12
openssl pkcs12 -in Certificates.p12 -out signer.pem -clcerts -nokeys
openssl pkcs12 -in Certificates.p12 -out signer.key -nocerts -nodes

# Download and convert WWDR certificate
curl -O https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
openssl x509 -inform der -in AppleWWDRCAG3.cer -out wwdr.pem
```

## Environment Variables

Configure the following secrets in Replit:

| Variable | Description | Example |
|----------|-------------|---------|
| `APPLE_WALLET_WWDR_CERT` | WWDR certificate (PEM format, base64 encoded) | Base64 of wwdr.pem |
| `APPLE_WALLET_SIGNER_CERT` | Pass signing certificate (PEM format, base64 encoded) | Base64 of signer.pem |
| `APPLE_WALLET_SIGNER_KEY` | Private key (PEM format, base64 encoded) | Base64 of signer.key |
| `APPLE_WALLET_SIGNER_KEY_PASSPHRASE` | Key passphrase (if encrypted) | Optional |
| `APPLE_PASS_TYPE_IDENTIFIER` | Pass Type ID | `pass.com.unicity.events` |
| `APPLE_TEAM_IDENTIFIER` | Apple Team ID | `XXXXXXXXXX` |

### Encoding Certificates

```bash
# Encode certificate files as base64 for environment variables
cat wwdr.pem | base64 > wwdr.pem.b64
cat signer.pem | base64 > signer.pem.b64
cat signer.key | base64 > signer.key.b64
```

## Pass Model Configuration

The pass model is stored in `server/pass-model/` with the following structure:

```
server/pass-model/
├── pass.json          # Pass template (auto-generated if missing)
├── icon.png           # Required: 29x29 icon
├── icon@2x.png        # Required: 58x58 icon (Retina)
├── logo.png           # Optional: Logo displayed on pass
├── logo@2x.png        # Optional: Retina logo
├── strip.png          # Optional: Strip image for event pass
└── strip@2x.png       # Optional: Retina strip image
```

## How It Works

1. **Registration**: When attendee registers, a unique check-in token is generated
2. **Success Page**: Shows QR code and "Add to Apple Wallet" button
3. **Click Button**: Downloads .pkpass file from `/api/wallet/:token`
4. **iOS Opens**: Apple Wallet prompts to add the pass
5. **Check-In**: Attendee shows pass, staff scans QR code

## Security

- Tokens are cryptographically secure (64-char hex)
- Tokens expire with registration validity
- Each token is single-use for wallet generation
- Pass cannot be generated without valid event access

## Troubleshooting

### "Service Unavailable" (503) Error
- Certificates not configured
- Check environment variables are set correctly
- Verify base64 encoding is correct

### "Pass signature invalid"
- Certificate chain issue
- Ensure WWDR certificate is current
- Check signing certificate matches Team ID

### Pass doesn't appear on iOS
- Pass Type ID mismatch
- Ensure `pass.json` has correct `passTypeIdentifier`
- Team ID must match signing certificate

## File Reference

| File | Purpose |
|------|---------|
| `server/appleWallet.ts` | Pass generation service |
| `server/routes.ts` | `/api/wallet/:token` endpoint |
| `server/pass-model/` | Pass template and images |
| `client/src/components/AppleWalletButton.tsx` | UI button components |
| `server/iterable.ts` | Email integration with wallet URL |
