# CMS Cutover Plan: Eliminate registrationSettings

**Date:** December 22, 2025  
**Goal:** Make CMS (event_pages + event_page_sections) the single source of truth for the registration flow.

---

## 1. CURRENT STATE ANALYSIS

### Where `registrationSettings` Is Still Read

| Location | File | Line(s) | Field(s) Used |
|----------|------|---------|---------------|
| Verification check | RegistrationPage.tsx | 232-234 | `requiresVerification` |
| Hero image fetch | RegistrationPage.tsx | 240-251 | `heroImagePath` |
| Custom heading | RegistrationPage.tsx | 467-474 | `heading`, `headingEs` |
| Custom subheading | RegistrationPage.tsx | 476-483 | `subheading`, `subheadingEs` |
| CTA button label | RegistrationPage.tsx | 485-492 | `ctaLabel`, `ctaLabelEs` |
| Layout selection | RegistrationPage.tsx | 494 | `layout` |
| Public API response | routes.ts | 726 | Entire `registrationSettings` object |
| Event update API | routes.ts | 781 | Entire `registrationSettings` object |

### Complete Field Inventory

From `shared/schema.ts` (lines 49-60):

| Field | Type | Currently Used? | Where Used |
|-------|------|-----------------|------------|
| `heroImagePath` | string | YES | Hero image display |
| `heading` | string | YES | Page title (EN) |
| `headingEs` | string | YES | Page title (ES) |
| `subheading` | string | YES | Subtitle (EN) |
| `subheadingEs` | string | YES | Subtitle (ES) |
| `ctaLabel` | string | YES | Submit button (EN) |
| `ctaLabelEs` | string | YES | Submit button (ES) |
| `layout` | enum | YES | Page structure |
| `accentColor` | string | NO | Never referenced |
| `requiresVerification` | boolean | YES | Skip OTP flow |

---

## 2. FIELD DISPOSITION DECISION

### Move to CMS Sections

| Field | Target Section | Target Field | Notes |
|-------|----------------|--------------|-------|
| `heading` | `registration` page → `hero` section | `content.headline` | Already exists in CMS structure |
| `headingEs` | `registration` page → `hero` section | `content.headlineEs` | Already exists in CMS structure |
| `subheading` | `registration` page → `hero` section | `content.subheadline` | Already exists in CMS structure |
| `subheadingEs` | `registration` page → `hero` section | `content.subheadlineEs` | Already exists in CMS structure |
| `heroImagePath` | `registration` page → `hero` section | `content.backgroundImage` | Already exists in CMS structure |
| `ctaLabel` | `registration` page → new `form` section | `content.submitButtonLabel` | NEW: Need to add form section type |
| `ctaLabelEs` | `registration` page → new `form` section | `content.submitButtonLabelEs` | NEW: Need to add form section type |

### Move to Event-Level Settings (NOT CMS)

| Field | Why Not CMS | Target Location |
|-------|-------------|-----------------|
| `requiresVerification` | Behavioral setting, not visual content | `events.requires_verification` column |
| `layout` | Affects ENTIRE registration flow (login, form, thank you), not individual pages | `events.registration_layout` column |

> **CONFIRMED:** Layout is read once in `RegistrationPage.tsx` (line 494) and applies to the entire component, which renders ALL steps: login/verification, OTP entry, registration form, and thank you. This is definitively an **event-level** setting, not a page-level setting.

### Drop Entirely

| Field | Reason |
|-------|--------|
| `accentColor` | Never used in code |

---

## 3. PROPOSED CMS CONTENT MODEL

### New Section Type: `form`

Add to `pageSectionTypeEnum`:
```typescript
export const pageSectionTypeEnum = [
  "hero", "agenda", "speakers", "stats", "cta", 
  "faq", "richtext", "gallery", "intro", "thank_you",
  "form"  // NEW
] as const;
```

Form section content structure:
```typescript
interface FormSectionContent {
  submitButtonLabel?: string;      // Default: "Register"
  submitButtonLabelEs?: string;    // Default: "Registrar"
  // Future expansion possible:
  // showProgressIndicator?: boolean;
  // formInstructions?: string;
}
```

### New Columns on `events` Table

Both behavioral settings move from JSONB to proper columns on the `events` table:

```typescript
// Already exists: requiresQualification
// Add new columns:
registrationLayout: text("registration_layout").notNull().default("standard"),  // "standard" | "split"
requiresVerification: boolean("requires_verification").notNull().default(true),
```

**Rationale for `registration_layout` on events table:**
- Layout affects the ENTIRE registration flow (login → form → thank you), not individual CMS pages
- The `RegistrationPage.tsx` component is a single React component that renders all steps
- Layout is read once and applied uniformly to all steps
- Storing on `event_pages` would create confusion (which page's layout wins?)

---

## 4. CONTENT FLOW: ADMIN → PUBLIC

### Current Flow (Broken)

```
Admin edits CMS "Registration Form Page"
         ↓
CMS saves to event_pages + event_page_sections
         ↓
Public page IGNORES CMS
         ↓
Public page reads event.registrationSettings ← WRONG SOURCE
```

### Future Flow (Correct)

```
Admin edits CMS "Registration Form Page"
         ↓
CMS saves to event_pages + event_page_sections
         ↓
Public API returns event + published page + sections
         ↓
RegistrationPage.tsx reads from appropriate sources:
         ↓
┌─────────────────────────────────────────────┐
│ Layout           ← events.registration_layout │
│ requiresVerify   ← events.requires_verification│
│ Hero content     ← hero section               │
│ Form config      ← form section               │
└─────────────────────────────────────────────┘
```

---

## 5. MIGRATION PLAN

### Phase 1: Add New Infrastructure (No Breaking Changes) - COMPLETED

**Status: COMPLETE** (December 22, 2025)

1. ✅ Add `registration_layout` column to `events` table
2. ✅ Add `requires_verification` column to `events` table
3. ✅ Add `form` section type to schema
4. ✅ Update auto-creation logic to include `form` section with defaults
5. ✅ Add form section editor support in LandingEditorPage

**Database changes:**
```sql
ALTER TABLE events ADD COLUMN registration_layout TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE events ADD COLUMN requires_verification BOOLEAN NOT NULL DEFAULT true;
```

**Schema changes (shared/schema.ts):**
```typescript
// In events table definition, add:
registrationLayout: text("registration_layout").notNull().default("standard"),
requiresVerification: boolean("requires_verification").notNull().default(true),
```

### Phase 2: Data Migration Script - COMPLETED

**Status: COMPLETE** (December 22, 2025)

**Migration Results:**
- Events migrated: 1 (Punta Cana 2026)
- Events skipped: 0
- Hero sections updated: 1 (no legacy content to migrate - used defaults)
- Form sections created: 1
- Registration pages auto-published: 1

For each event that has `registrationSettings`:

1. ✅ **Copy layout** → Set `events.registration_layout` from `registrationSettings.layout`
2. ✅ **Copy requiresVerification** → Set `events.requires_verification` from `registrationSettings.requiresVerification`
3. ✅ **Copy hero content** → Update `registration` page's `hero` section content:
   - `headline` ← `heading` (skipped if null in registrationSettings)
   - `headlineEs` ← `headingEs` (skipped if null)
   - `subheadline` ← `subheading` (skipped if null)
   - `subheadlineEs` ← `subheadingEs` (skipped if null)
   - `backgroundImage` ← `heroImagePath` (skipped if null)
4. ✅ **Create form section** → With:
   - `submitButtonLabel` ← `ctaLabel` (or "Register" if null)
   - `submitButtonLabelEs` ← `ctaLabelEs` (or "Registrar" if null)
5. ✅ **Auto-publish** → Registration pages for published events

### Phase 3: Update RegistrationPage.tsx

Replace all `registrationSettings` reads with new sources:

| Current Code | New Code | Source |
|--------------|----------|--------|
| `event.registrationSettings?.layout` | `event.registrationLayout` | events table |
| `event.registrationSettings?.requiresVerification` | `event.requiresVerification` | events table |
| `settings.heading` | `heroSection.content.headline` | CMS section |
| `settings.heroImagePath` | `heroSection.content.backgroundImage` | CMS section |
| `settings.ctaLabel` | `formSection.content.submitButtonLabel` | CMS section |

**Code paths to update:**

```typescript
// Line 232-234: Verification check
// BEFORE:
(event?.registrationSettings?.requiresVerification !== false)
// AFTER:
(event?.requiresVerification !== false)

// Line 494: Layout selection
// BEFORE:
const layout = event?.registrationSettings?.layout || "standard";
// AFTER:
const layout = event?.registrationLayout || "standard";
```

### Phase 4: Clean Up

1. Remove `registrationSettings` from public API response
2. Remove `registrationSettings` from event update handler
3. Keep `registrationSettings` column in database temporarily (deprecation period)
4. Eventually drop column after confirming no usage

---

## 6. RISKS AND MITIGATIONS

### Risk 1: Existing Events Lose Customizations

**Problem:** If we switch to CMS without migrating data, events that had custom headings/layouts will show defaults.

**Mitigation:** 
- Run migration script BEFORE switching code
- Migration script copies all existing `registrationSettings` values to CMS
- Test with specific event (Punta Cana 2025) before wide rollout

### Risk 2: Unpublished Pages Show No Content

**Problem:** CMS content only appears when page status = "published". Admin might migrate but forget to publish.

**Mitigation:**
- Migration script should auto-publish pages that were previously "live"
- Add prominent warning in admin UI when page is draft
- Consider: For registration page, auto-inherit from login page publish status?

### Risk 3: Breaking Public Registration During Cutover

**Problem:** If code is deployed before data is migrated, public pages break.

**Mitigation:**
- Use feature flag or fallback: 
  - First check CMS for content
  - If CMS empty/missing, fall back to `registrationSettings`
- Remove fallback only after confirming all events migrated

### Risk 4: Layout Stored in Wrong Place

**RESOLVED:** Layout is now stored on `events.registration_layout` (not `event_pages`).

**Rationale:**
- Layout applies to the entire registration flow (login → form → thank you)
- The `RegistrationPage.tsx` component is monolithic - one component renders all steps
- Layout is read once at line 494 and used for the entire page
- Storing on `event_pages` would have created confusion (which page's layout wins?)

**Decision:** Store layout as `events.registration_layout` - single source of truth at the event level.

### Risk 5: Admin Confusion During Transition

**Problem:** During transition, two places might appear to control the same thing.

**Mitigation:**
- Phase 2 removes the EventFormPage registration settings card FIRST (already done)
- CMS becomes the only editing location before code reads from CMS
- Clear messaging in any remaining UI

---

## 7. MAPPING TABLE SUMMARY

### Current → Future Field Mapping

| Legacy Field | Future Location | Future Field | Migration Action |
|--------------|-----------------|--------------|------------------|
| `registrationSettings.heading` | `event_page_sections` (registration page, hero) | `content.headline` | Copy in script |
| `registrationSettings.headingEs` | `event_page_sections` (registration page, hero) | `content.headlineEs` | Copy in script |
| `registrationSettings.subheading` | `event_page_sections` (registration page, hero) | `content.subheadline` | Copy in script |
| `registrationSettings.subheadingEs` | `event_page_sections` (registration page, hero) | `content.subheadlineEs` | Copy in script |
| `registrationSettings.heroImagePath` | `event_page_sections` (registration page, hero) | `content.backgroundImage` | Copy in script |
| `registrationSettings.ctaLabel` | `event_page_sections` (registration page, form) | `content.submitButtonLabel` | Copy in script |
| `registrationSettings.ctaLabelEs` | `event_page_sections` (registration page, form) | `content.submitButtonLabelEs` | Copy in script |
| `registrationSettings.layout` | `events` | `registration_layout` | Copy in script |
| `registrationSettings.requiresVerification` | `events` | `requires_verification` | Copy in script |
| `registrationSettings.accentColor` | (dropped) | — | Do nothing |

---

## 8. IMPLEMENTATION SEQUENCE

1. **Schema Changes**
   - [ ] Add `registration_layout` column to `events` table
   - [ ] Add `requires_verification` column to `events` table
   - [ ] Add `form` to section type enum
   - [ ] Run db:push

2. **Auto-Creation Updates**
   - [ ] Update `getDefaultSectionsForPageType` to include `form` section for registration page
   - [ ] (No layout default needed - layout is event-level with "standard" default)

3. **Data Migration**
   - [ ] Write migration script
   - [ ] Run on development database
   - [ ] Verify Punta Cana 2025 event data migrated correctly

4. **Code Changes**
   - [ ] Update RegistrationPage.tsx to read layout from `event.registrationLayout`
   - [ ] Update RegistrationPage.tsx to read requiresVerification from `event.requiresVerification`
   - [ ] Update RegistrationPage.tsx to read hero content from CMS
   - [ ] Update RegistrationPage.tsx to read form config from CMS
   - [ ] Keep fallback to registrationSettings temporarily

5. **Admin UI Updates**
   - [ ] Add layout selector to EventFormPage.tsx (event-level setting, not CMS page)
   - [ ] Ensure form section editor in LandingEditorPage shows button label fields

6. **Testing**
   - [ ] Test registration flow with CMS-only data
   - [ ] Test with legacy data (fallback works)
   - [ ] Test publish/unpublish behavior

7. **Cleanup**
   - [ ] Remove fallback code
   - [ ] Remove registrationSettings from API responses
   - [ ] Document that registrationSettings is deprecated
   - [ ] (Future) Drop registrationSettings column

---

## 9. SUCCESS CRITERIA

After cutover is complete:

1. Admin edits in CMS → public page reflects changes (when published)
2. No code references `event.registrationSettings`
3. Layout is controlled via `events.registration_layout` (event-level setting)
4. Verification controlled via `events.requires_verification` (event-level setting)
5. All existing events have migrated data
6. New events get proper defaults
7. Zero public-facing regressions during cutover

---

## 10. LAYOUT PLACEMENT CONFIRMATION

**Q: Does registration layout apply to the entire flow or individual steps?**

**A: ENTIRE FLOW.** Confirmed by code analysis:

- `RegistrationPage.tsx` is a **single React component** that renders all steps
- Layout is read **once** at line 494: `const layout = event?.registrationSettings?.layout || "standard"`
- The `if (layout === "standard")` and `if (layout === "split")` conditionals wrap the ENTIRE page output
- All steps (login, OTP, form, success) render inside the same layout wrapper

**Q: Where should layout be stored?**

**A: `events.registration_layout`** - because:

1. It's a property of the event, not of any individual CMS page
2. The public registration flow is a single-page app with steps, not separate pages
3. Storing on `event_pages` would require picking one page arbitrarily (which one?)
4. Event-level storage matches the mental model: "this event uses split layout"

**Q: What code paths read layout?**

| Location | Line | Current Read | Future Read |
|----------|------|--------------|-------------|
| RegistrationPage.tsx | 494 | `event?.registrationSettings?.layout` | `event?.registrationLayout` |

**Single read location = clean cutover.**
