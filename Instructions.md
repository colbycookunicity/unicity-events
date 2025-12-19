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
