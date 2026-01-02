# Attendee Portal Implementation Plan

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
