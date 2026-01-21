# Unicity Events Platform

## Overview

Unicity Events is an internal enterprise event management platform designed to replace Bizzabo for managing Unicity International's corporate events, including success trips, leadership retreats, and training seminars. The platform handles event registration, attendee management, check-in, flight tracking, reimbursements, and guest buy-in payments. It integrates directly with Unicity's internal systems via distributor IDs and supports bilingual operations (English/Spanish).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: Zustand for auth and language state, TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom Unicity brand theming (CSS variables for light/dark modes)
- **Build Tool**: Vite with custom plugins for Replit integration

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Pattern**: RESTful endpoints under `/api/` prefix
- **Authentication**: OTP/Magic Link passwordless auth via Unicity Hydra API, with session tokens stored in database

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Drizzle Kit with `db:push` command
- **Connection**: PostgreSQL via `DATABASE_URL` environment variable

### Core Data Models
- **Users**: Admin/staff accounts with role-based access (admin, event_manager, marketing, readonly)
- **Events**: Event definitions with bilingual support, qualification periods, and registration settings
- **Registrations**: Attendee records linked to events and Unicity IDs
- **QualifiedRegistrants**: Pre-approved people who can register for events (managed via unified Attendees page)
- **Guests**: Plus-one guests linked to registrations with payment tracking
- **Flights**: Flight information for transportation coordination
- **Reimbursements**: Expense tracking with receipt uploads

### Key Pages
- **AttendeesPage**: Unified page showing both registered attendees and qualifiers (non-registered people). When an event is selected, shows qualifier management tools (Add Person, Upload CSV, Export List). Supports registration status filter (All/Registered/Not Registered). Features drag-and-drop column reordering and column visibility controls, with preferences stored per-user in localStorage (keys scoped by user ID to prevent cross-user conflicts).

### File Structure Pattern
```
client/           # React frontend
  src/
    components/   # Reusable UI components
    pages/        # Route page components
    lib/          # Utilities (auth, i18n, queryClient)
server/           # Express backend
  routes.ts       # API endpoint definitions
  storage.ts      # Database access layer
  db.ts           # Drizzle connection
shared/           # Shared code between client/server
  schema.ts       # Drizzle schema definitions
```

### Key Design Decisions

1. **Shared Schema**: Drizzle schema in `shared/` allows type-safe data structures across client and server, eliminating type drift.

2. **Passwordless Auth**: Uses Unicity's Hydra OTP API rather than password management, simplifying user experience and security.

3. **Bilingual Support**: All user-facing content supports English and Spanish with `_es` suffixed fields and a language toggle component.

4. **Role-Based Access**: Four distinct roles control feature access in admin interface, enforced at both API and UI levels. Event-level access control allows admins to assign event managers to specific events, ensuring managers only see events they created or were assigned to.

5. **Object Storage**: Google Cloud Storage integration for file uploads (receipts, event images) via Replit's sidecar endpoint.

## External Dependencies

### Unicity Internal Services
- **Hydra API**: OTP generation and validation for passwordless authentication
  - Production: `https://hydra.unicity.net/v6`
  - QA: `https://hydraqa.unicity.net/v6-test`

### Email & Marketing Automation
- **Iterable**: Email and engagement platform for events
  - Confirmation emails, check-in notifications, qualification grants
  - Registration sync on completion (user profile, list subscription, events, purchases)
  - API key via `ITERABLE_API_KEY` environment variable
  - Events can specify `iterableListId` to auto-subscribe registrants
  - **Per-Event Campaign Configuration**: Events can specify event-specific Iterable campaign IDs via `iterableCampaigns` JSONB column to prevent cross-event email sends. Campaign resolution: event-specific → environment variable fallback. Supports 6 email types (confirmation, checkedIn, qualificationGranted, registrationCanceled, registrationTransferred, registrationUpdate) with en/es language variants. Admin UI available in Event Form under "Email Campaigns" section with dropdown selectors that fetch campaigns directly from Iterable API.

### Cloud Storage
- **Google Cloud Storage**: File uploads for receipts and event images
  - Accessed via Replit sidecar at `http://127.0.0.1:1106`
  - Custom ACL system for access control

### Database
- **PostgreSQL**: Primary data store
  - Requires `DATABASE_URL` environment variable
  - Uses `connect-pg-simple` for session storage option

### Frontend Libraries
- **TanStack Query**: Server state management with caching
- **React Hook Form + Zod**: Form validation
- **Uppy**: File upload UI with S3 backend
- **date-fns**: Date formatting

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `REPLIT_DOMAINS`: For webhook URL construction