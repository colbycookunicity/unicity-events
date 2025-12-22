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
| `requiresVerification` | Behavioral setting, not visual content | Keep in `events` table as separate column |
| `layout` | Affects entire page structure, not section content | New `layout` column on `event_pages` table |

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

### New Column on `event_pages` Table

```typescript
// Add to eventPages table definition
layout: text("layout").notNull().default("standard"),  // "standard" | "split"
```

**Rationale:** Layout affects the entire page rendering, not a single section. It's a page-level property.

### New Column on `events` Table (or keep existing)

The `requiresVerification` field should move from inside the JSONB to a proper column:

```typescript
// Already exists: requiresQualification
// Add new:
requiresVerification: boolean("requires_verification").notNull().default(true),
```

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
Public API returns published page + sections
         ↓
RegistrationPage.tsx reads from CMS data
         ↓
Layout from event_pages.layout
Hero content from hero section
Form config from form section
```

---

## 5. MIGRATION PLAN

### Phase 1: Add New Infrastructure (No Breaking Changes)

1. Add `layout` column to `event_pages` table
2. Add `requiresVerification` column to `events` table
3. Add `form` section type to schema
4. Update auto-creation logic to include `form` section with defaults

**Database changes:**
```sql
ALTER TABLE event_pages ADD COLUMN layout TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE events ADD COLUMN requires_verification BOOLEAN NOT NULL DEFAULT true;
```

### Phase 2: Data Migration Script

For each event that has `registrationSettings`:

1. **Copy layout** → Set `event_pages.layout` from `registrationSettings.layout`
2. **Copy requiresVerification** → Set `events.requires_verification` from `registrationSettings.requiresVerification`
3. **Copy hero content** → Update `registration` page's `hero` section content:
   - `headline` ← `heading`
   - `headlineEs` ← `headingEs`
   - `subheadline` ← `subheading`
   - `subheadlineEs` ← `subheadingEs`
   - `backgroundImage` ← `heroImagePath`
4. **Create form section** → With:
   - `submitButtonLabel` ← `ctaLabel`
   - `submitButtonLabelEs` ← `ctaLabelEs`

### Phase 3: Update RegistrationPage.tsx

Replace all `registrationSettings` reads with CMS reads:

| Current Code | New Code |
|--------------|----------|
| `event.registrationSettings?.layout` | `pageData.page.layout` |
| `event.registrationSettings?.requiresVerification` | `event.requiresVerification` |
| `settings.heading` | `heroSection.content.headline` |
| `settings.heroImagePath` | `heroSection.content.backgroundImage` |
| `settings.ctaLabel` | `formSection.content.submitButtonLabel` |

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

**Problem:** Layout is per-event but we're putting it on event_pages. If someone changes layout for registration, does login page also change?

**Consideration:** 
- Current behavior: One layout applies to all steps (login, form, success)
- This is probably correct - the "registration flow" has one layout
- Could put layout on `events` table instead if truly event-wide

**Decision:** Put layout on `event_pages` table with `registration` page type. Login and thank_you pages don't currently use layout.

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
| `registrationSettings.layout` | `event_pages` | `layout` | Copy in script |
| `registrationSettings.requiresVerification` | `events` | `requires_verification` | Copy in script |
| `registrationSettings.accentColor` | (dropped) | — | Do nothing |

---

## 8. IMPLEMENTATION SEQUENCE

1. **Schema Changes**
   - [ ] Add `layout` column to `event_pages`
   - [ ] Add `requires_verification` column to `events`
   - [ ] Add `form` to section type enum
   - [ ] Run db:push

2. **Auto-Creation Updates**
   - [ ] Update `getDefaultSectionsForPageType` to include `form` section for registration page
   - [ ] Set default layout to "standard" in page creation

3. **Data Migration**
   - [ ] Write migration script
   - [ ] Run on development database
   - [ ] Verify Punta Cana 2025 event data migrated correctly

4. **Code Changes**
   - [ ] Update RegistrationPage.tsx to read layout from CMS
   - [ ] Update RegistrationPage.tsx to read requiresVerification from event
   - [ ] Update RegistrationPage.tsx to read hero content from CMS
   - [ ] Update RegistrationPage.tsx to read form config from CMS
   - [ ] Keep fallback to registrationSettings temporarily

5. **Admin UI Updates**
   - [ ] Add layout selector to registration page in LandingEditorPage
   - [ ] Ensure form section editor shows button label fields

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
3. Layout is controlled via CMS page settings
4. All existing events have migrated data
5. New events get proper defaults from CMS
6. Zero public-facing regressions during cutover
