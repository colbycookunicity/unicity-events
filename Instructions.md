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
