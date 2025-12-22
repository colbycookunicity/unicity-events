# Registration Page / Page Builder System - Current State Audit

**Date:** December 22, 2025  
**Purpose:** Factual snapshot of the current system architecture

---

## 1. PAGE TYPES & CONCEPTS

### Page Types That Exist

| Page Type | Internal Key | Purpose | Rendered to Users? |
|-----------|--------------|---------|-------------------|
| Login/Verification | `login` | Email + OTP verification before registration | Yes - first step at `/register/:slug` |
| Registration Form | `registration` | Main form for collecting attendee data | Yes - after verification at `/register/:slug` |
| Thank You | `thank_you` | Confirmation after successful registration | Yes - after form submit |

### How Pages Are Organized

- **Shared Route:** All three page types render on the SAME public URL: `/register/:eventId` or `/register/:slug`
- **State Machine:** The `RegistrationPage.tsx` component uses `verificationStep` state to determine which "page" to show:
  - `email` step → shows Login/Verification content
  - `otp` step → shows OTP entry
  - `form` step → shows Registration Form
  - Success → shows Thank You content
- **Admin Editor:** Each page type has its own editable sections in the CMS at `/admin/events/:id/pages/:pageType`

### Page Type Enum

Defined in `shared/schema.ts` (line 8-9):
```typescript
export const pageTypeEnum = ["login", "registration", "thank_you"] as const;
```

---

## 2. DATA MODEL

### Database Tables

#### `event_pages` Table
Stores page metadata for each event + page type combination.

| Column | Type | Purpose |
|--------|------|---------|
| id | varchar (UUID) | Primary key |
| event_id | varchar (FK) | References events table |
| page_type | text | One of: login, registration, thank_you |
| status | text | "draft" or "published" |
| language | text | Default "en" |
| seo_title | text | Optional SEO title |
| seo_description | text | Optional SEO description |
| published_at | timestamp | When page was published |
| created_at | timestamp | Auto-set |
| last_modified | timestamp | Auto-updated |

**Constraint:** Unique index on `(event_id, page_type)` - one page per type per event.

#### `event_page_sections` Table
Stores individual content blocks within a page.

| Column | Type | Purpose |
|--------|------|---------|
| id | varchar (UUID) | Primary key |
| page_id | varchar (FK) | References event_pages table |
| type | text | Section type (hero, thank_you, etc.) |
| position | integer | Sort order (0-indexed) |
| is_enabled | boolean | Whether section is visible |
| content | jsonb | Section-specific content data |
| created_at | timestamp | Auto-set |
| last_modified | timestamp | Auto-updated |

#### Section Types Enum

Defined in `shared/schema.ts` (line 245-247):
```typescript
export const pageSectionTypeEnum = [
  "hero", "agenda", "speakers", "stats", "cta", 
  "faq", "richtext", "gallery", "intro", "thank_you"
] as const;
```

### Legacy: `registrationSettings` Field

The `events` table still contains a `registrationSettings` JSONB column (line 80):
```typescript
registrationSettings: jsonb("registration_settings").$type<RegistrationSettings>()
```

**RegistrationSettings Type** (lines 49-60):
```typescript
export type RegistrationSettings = {
  heroImagePath?: string;
  heading?: string;
  headingEs?: string;
  subheading?: string;
  subheadingEs?: string;
  ctaLabel?: string;
  ctaLabelEs?: string;
  layout?: RegistrationLayout;      // "standard" | "split" | "hero-background"
  accentColor?: string;
  requiresVerification?: boolean;
};
```

**Status:** This field is DEPRECATED but still exists in database. The `RegistrationPage.tsx` still reads `layout` and `requiresVerification` from it. The EventFormPage no longer writes to it (removed on Dec 22).

### Page Auto-Creation

Pages are auto-created with default sections when accessed via admin GET route (`/api/events/:id/pages/:pageType`).

**Default Sections by Page Type** (from `getDefaultSectionsForPageType` in routes.ts):

| Page Type | Default Sections |
|-----------|-----------------|
| login | 1x hero section with "Verify Your Identity" |
| registration | 1x hero section with event name |
| thank_you | 1x thank_you section with confirmation message |

---

## 3. API ROUTES

### Public Routes (No Auth)

| Route | Method | Purpose | Used By |
|-------|--------|---------|---------|
| `/api/events/:eventId` | GET | Get event details | RegistrationPage |
| `/api/public/event-pages/:eventId?pageType=` | GET | Get PUBLISHED page + sections | RegistrationPage |

**Important:** Public route ONLY returns pages with `status = 'published'`. Draft pages return 404.

### Admin Routes (Auth Required)

| Route | Method | Purpose | Auto-creates? |
|-------|--------|---------|---------------|
| `/api/events/:eventId/pages/:pageType` | GET | Get page + sections (any status) | YES |
| `/api/events/:eventId/pages/:pageType` | POST | Create/update page | YES (with defaults) |
| `/api/events/:eventId/pages/:pageType/publish` | POST | Set status to published | No |
| `/api/events/:eventId/pages/:pageType/unpublish` | POST | Set status to draft | No |
| `/api/events/:eventId/pages/:pageType/sections` | POST | Add new section | No |
| `/api/events/:eventId/pages/:pageType/sections/:sectionId` | PATCH | Update section | No |
| `/api/events/:eventId/pages/:pageType/sections/:sectionId` | DELETE | Delete section | No |
| `/api/events/:eventId/pages/:pageType/sections/reorder` | POST | Reorder sections | No |

### Legacy Routes (Still Exist)

| Route | Purpose | Status |
|-------|---------|--------|
| `/api/events/:eventId/page` | Single-page CRUD (registration only) | DEPRECATED but functional |
| `/api/events/:eventId/page/publish` | Legacy publish | DEPRECATED |
| `/api/events/:eventId/page/unpublish` | Legacy unpublish | DEPRECATED |

### Recently Fixed (Dec 22)

**500 Error Fix:** The database had a unique constraint `event_pages_event_id_key` on just `event_id`, which prevented multiple pages per event. This was dropped and replaced with the correct composite unique index on `(event_id, page_type)`.

---

## 4. ADMIN UI

### Entry Points

| Location | Action | Route |
|----------|--------|-------|
| Event Form Page | "Edit Registration Flow" button | Links to `/admin/events/:id/pages/registration` |

### Registration Flow Editor (LandingEditorPage.tsx)

**URL Pattern:** `/admin/events/:id/pages/:pageType`

**Features:**
- Three tabs at top: Login, Form, Thank You
- Tab selection changes URL and loads different page type
- Sections panel on left with:
  - Add Section dropdown
  - Drag-and-drop reordering
  - Toggle visibility (on/off)
  - Edit button (pencil icon)
  - Delete button (trash icon)
- Live preview panel on right (50% scale)
- Publish/Unpublish button in header
- Status badge (Draft/Published)

### Section Editor (Inline)

When clicking edit (pencil) on a section:
- Opens inline editor below sections list
- Form fields depend on section type
- Save/Cancel buttons
- Bilingual fields (English + Spanish) for text content

### What Was Removed (Dec 22)

The EventFormPage previously had a "Registration Page Customization" card with:
- Layout selector (standard/split/hero-background)
- Hero Image upload
- Custom Headings (English/Spanish)
- Subheadings (English/Spanish)
- CTA Button text (English/Spanish)

**This was removed** to eliminate duplicate editing locations. Only the slug field remains in EventFormPage.

---

## 5. PAGE BUILDER CAPABILITIES

### What Admins Can Edit

| Capability | Supported? | Notes |
|------------|-----------|-------|
| Add sections | Yes | Dropdown menu with section types |
| Remove sections | Yes | Delete button per section |
| Reorder sections | Yes | Drag and drop |
| Toggle visibility | Yes | Switch per section |
| Edit section content | Yes | Form-based editor |
| Free-form layout | No | Fixed vertical stack only |
| Custom CSS/styling | No | No custom styles |
| Background images | Yes | Hero sections support backgroundImage |
| Bilingual content | Yes | All text fields have _es variants |

### Section Types Available

| Type | Fields | Used On |
|------|--------|---------|
| hero | headline, headlineEs, subheadline, subheadlineEs, backgroundImage | login, registration |
| thank_you | headline, headlineEs, message, messageEs, showConfetti | thank_you |
| intro | headline, headlineEs, description, descriptionEs | registration (optional) |
| agenda | items array | Any (unused in practice) |
| speakers | speakers array | Any (unused in practice) |
| stats | stats array | Any (unused in practice) |
| cta | headline, buttonText, buttonUrl | Any (unused in practice) |
| faq | items array | Any (unused in practice) |
| richtext | content (HTML) | Any (unused in practice) |
| gallery | images array | Any (unused in practice) |

### Is This a "True" Builder?

**No.** It is a **structured section-based CMS**:
- Admins pick from predefined section types
- Each section type has fixed fields
- No free-form drag-and-drop of arbitrary elements
- No visual WYSIWYG editing
- No custom styling per section

---

## 6. REGISTRATION FLOW

### User Journey Map

```
Public URL: /register/punta-cana-2025
                    │
                    ▼
        ┌───────────────────────┐
        │   RegistrationPage    │
        │   (Single Component)  │
        └───────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
┌─────────┐   ┌─────────┐   ┌─────────┐
│  EMAIL  │ → │   OTP   │ → │  FORM   │ → SUCCESS
│  STEP   │   │  STEP   │   │  STEP   │
└─────────┘   └─────────┘   └─────────┘
    │               │               │
    ▼               ▼               ▼
  Uses:           Uses:           Uses:
  - loginHeroContent    (hardcoded)   - event.formFields
  from CMS if               - event.registrationSettings.layout
  published                 (for layout only)
```

### Data Flow: CMS → Public Page

| Step | CMS Page Type | What Content is Used | Source |
|------|---------------|---------------------|--------|
| Email entry | login | headline, subheadline | `loginHeroContent` from CMS (if published) |
| OTP entry | login | (none currently) | Hardcoded |
| Form | registration | layout only | `event.registrationSettings.layout` |
| Success | thank_you | headline, message | `thankYouSection` from CMS (if published) |

### Current CMS Integration Status

| Page Type | CMS Content Used? | Notes |
|-----------|------------------|-------|
| login | PARTIAL | Hero headline/subheadline read from CMS, but only if page is PUBLISHED |
| registration | NO | Uses legacy `registrationSettings.layout` from events table |
| thank_you | YES | Uses CMS thank_you section content |

---

## 7. KNOWN ISSUES / TECH DEBT

### Critical Issues

1. **registrationSettings Still Used**
   - `RegistrationPage.tsx` still reads `event.registrationSettings.layout` for page layout
   - `RegistrationPage.tsx` still reads `event.registrationSettings.requiresVerification`
   - This data is stored in events table, NOT in the CMS
   - Creates split data source (some content from CMS, some from event)

2. **Publish Requirement Not Obvious**
   - CMS content only shows on public page if page status = "published"
   - Admins may edit content and not understand why changes don't appear
   - No warning in UI that page is in draft mode

### Incomplete Features

3. **Registration Form Page CMS Not Connected**
   - CMS `registration` page exists but its content is NOT used
   - The actual form layout comes from `event.registrationSettings.layout`
   - Hero content on registration page could theoretically come from CMS but doesn't

4. **OTP Step Has No CMS Connection**
   - Hardcoded text: "Enter Verification Code"
   - Cannot be customized via CMS

### Dead/Unused Concepts

5. **Many Section Types Unused**
   - agenda, speakers, stats, cta, faq, richtext, gallery sections exist in schema
   - None are used in practice for registration flow
   - May have been intended for a "landing page" feature

6. **Legacy Routes Still Active**
   - `/api/events/:eventId/page` (singular) still works
   - No current UI uses it, but could cause confusion

### Potential Confusion Points

7. **"Page" vs "Step" Terminology**
   - Admin UI shows 3 "pages" (Login, Form, Thank You)
   - But public URL is ONE page with steps
   - This mismatch may confuse admins

8. **Hero Section on Multiple Page Types**
   - login page has hero → used for verification screen
   - registration page has hero → NOT currently used
   - Could lead to "I edited this but nothing changed" scenarios

---

## 8. DATABASE CURRENT STATE

### Pages in Database

```
page_type    | count
-------------+-------
login        | 1
registration | 1  
thank_you    | 1
```

### Sections in Database

```
type      | count
----------+-------
hero      | 2      (1 on login, 1 on registration)
thank_you | 1      (on thank_you page)
```

---

## 9. FILE LOCATIONS

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Database schema, types, enums |
| `server/storage.ts` | Database CRUD operations |
| `server/routes.ts` | API endpoints |
| `client/src/pages/LandingEditorPage.tsx` | Admin CMS editor |
| `client/src/pages/EventFormPage.tsx` | Event edit form (contains "Edit Registration Flow" link) |
| `client/src/pages/RegistrationPage.tsx` | Public registration flow |
| `client/src/App.tsx` | Route definitions |

---

## 10. SUMMARY

**What Works Today:**
- Three page types exist in database (login, registration, thank_you)
- Admin can edit sections for each page type in a tabbed interface
- Login page CMS hero content flows to public verification screen (when published)
- Thank you page CMS content flows to public success screen
- Pages auto-create with default sections on first admin access

**What Doesn't Work / Is Incomplete:**
- Registration form page CMS content is NOT used (layout comes from legacy `registrationSettings`)
- Two data sources exist (CMS pages vs event.registrationSettings)
- Many section types defined but unused
- Publish status not clearly communicated to admins
