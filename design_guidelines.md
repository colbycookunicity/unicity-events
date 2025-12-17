# Unicity Events Platform - Design Guidelines

## Design Approach

**Selected System:** Material Design principles with Unicity brand customization

**Rationale:** This is an enterprise data management platform requiring efficient information display, clear hierarchy for complex workflows, and robust component patterns for admin dashboards, data tables, and forms.

---

## Typography

**Font Family:** Poppins (Google Fonts CDN)

**Type Scale:**
- **H1 (Page Headers):** Poppins Semibold, 32px
- **H2 (Section Headers):** Poppins Semibold, 24px  
- **H3 (Card/Panel Titles):** Poppins Medium, 18px
- **H4 (List Headers):** Poppins Medium, 16px
- **Body:** Poppins Regular, 14px
- **Small/Meta:** Poppins Regular, 12px
- **Buttons:** Poppins Medium, 14px

**Hierarchy:** Use weight variation (Semibold > Medium > Regular) rather than size changes for subtle distinctions within dense information displays.

---

## Layout System

**Spacing Units:** Tailwind spacing with consistent primitives: `2, 4, 6, 8, 12, 16, 24`

**Common Patterns:**
- Card padding: `p-6`
- Section spacing: `space-y-6` or `gap-6`
- Form field spacing: `space-y-4`
- Button padding: `px-6 py-3`
- Page margins: `mx-auto max-w-7xl px-6`

**Grid System:**
- Dashboard cards: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Data tables: Full-width with horizontal scroll on mobile
- Forms: Single column on mobile, `grid-cols-2 gap-4` on desktop for compact fields

---

## Component Library

### Navigation
**Top Navigation Bar:**
- Fixed header with Unicity logo (left), navigation links (center), user menu (right)
- Height: `h-16`
- Includes language toggle (EN/ES) in top-right
- Role indicator badge for current user

**Sidebar Navigation (Admin Dashboard):**
- Collapsible sidebar on mobile
- Width: `w-64` expanded, `w-16` collapsed
- Grouped menu items: Events, Attendees, Check-in, Reports, Settings

### Cards & Panels
**Event Cards:**
- Elevated card style with subtle shadow
- Event status badge (Draft, Published, Private)
- Quick stats: Registered count, capacity, dates
- Action buttons: Edit, View, Duplicate

**Data Panels:**
- White background with border
- Section headers with count badges
- Toolbar with filters, search, export buttons

### Forms
**Registration Form:**
- Progressive disclosure for complex flows
- Field groups with clear labels
- Required field indicators (*)
- Inline validation messages
- Supporting text below fields for context
- File upload areas with drag-and-drop zones

**Form Controls:**
- Text inputs: Full-width with consistent height (`h-12`)
- Dropdowns: Native select styled consistently
- Checkboxes/radios: Larger touch targets for accessibility
- Date pickers: Calendar popover interface

### Data Display
**Tables:**
- Sticky header row
- Alternating row backgrounds for readability
- Sortable column headers with icons
- Row actions menu (3-dot overflow)
- Pagination controls at bottom
- Empty states with helpful messaging

**Status Badges:**
- Registered: Green background
- Qualified Not Registered: Yellow background
- Not Coming: Gray background
- Checked In: Blue background
- Pill-shaped with medium contrast

**Stats/Metrics:**
- Large number display (48px)
- Label below (12px)
- Grouped in grid layout
- Icons optional for visual anchoring

### Interactive Elements
**Buttons:**
- Primary: Navy background, white text
- Secondary: White background, navy border
- Tertiary: Text only, no background
- Heights: `h-12` for primary actions, `h-10` for secondary
- Icons: 16px, left-aligned with 8px spacing

**Modals/Dialogs:**
- Centered overlay with backdrop
- Max-width: `max-w-2xl`
- Header with close button
- Footer with action buttons (right-aligned)

**Tabs:**
- Underline style for content sections
- Active tab: navy underline, medium weight
- Counts in parentheses where applicable

### Feedback Elements
**Alerts/Notifications:**
- Toast notifications (top-right)
- Inline alerts within forms/sections
- Success: green, Warning: yellow, Error: red, Info: blue

**Loading States:**
- Skeleton screens for table rows
- Spinner for button actions
- Progress indicators for multi-step flows

---

## Animation

**Minimal Motion:**
- Dropdown menus: 150ms ease-out
- Modal entry/exit: 200ms fade + scale
- Tab transitions: 100ms underline slide
- No page transitions, no scroll animations
- Hover states: instant (no transition)

---

## Accessibility

- High contrast text (minimum WCAG AA)
- Focus indicators on all interactive elements (2px navy outline)
- Keyboard navigation support throughout
- ARIA labels for icon-only buttons
- Form error announcements for screen readers
- Skip-to-content link

---

## Bilingual Implementation

**Language Toggle:**
- Prominent EN/ES switcher in top navigation
- Flag icons optional
- Maintains user preference across sessions

**Content Strategy:**
- All UI strings externalized for translation
- Right-to-left layout not required
- Date/time formatting respects locale

---

## Key Screens

1. **Admin Dashboard:** Metrics cards + recent events table + quick actions
2. **Event List:** Filterable table with status, dates, registration counts
3. **Event Creation/Edit:** Multi-section form with save states
4. **Attendee Management:** Searchable table with filters, bulk actions, export
5. **Registration Form (Public):** Clean, minimal form with progress indicator
6. **Check-in Interface:** Large text, simple search, quick status updates
7. **User Dashboard (Attendee):** Profile card + event details + to-do checklist

---

## Images

**Not Applicable:** This is an admin/data interface. Use iconography (Heroicons) for visual enhancement rather than decorative imagery. Event-specific images (if uploaded) appear as thumbnails in cards/lists only.