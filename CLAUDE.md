# CLAUDE.md - Unicity Events Platform

## Project Overview

Enterprise event management platform for Unicity International. Handles event registration, attendee management, check-in, flight tracking, reimbursements, guest payments, and CMS-based landing pages. Bilingual (English/Spanish). Replaces Bizzabo.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix UI), Wouter (routing), Zustand (state), TanStack React Query v5
- **Backend:** Node.js, Express 4, TypeScript
- **Database:** PostgreSQL with Drizzle ORM
- **Auth:** Passwordless OTP via Unicity Hydra API, session tokens in PostgreSQL
- **Integrations:** Stripe (payments), Iterable (email), Google Cloud Storage (files), Apple Wallet (passes)
- **Forms:** React Hook Form + Zod validation
- **Build:** Vite (frontend) + esbuild (backend), tsx for dev

## Commands

```bash
npm run dev          # Start dev server (tsx server/index.ts)
npm run build        # Production build (tsx script/build.ts)
npm run start        # Run production build (node dist/index.cjs)
npm run check        # TypeScript type check (tsc)
npm run db:push      # Push schema changes to database (drizzle-kit push)
npm run db:generate  # Generate migration files (drizzle-kit generate)
npm run db:migrate   # Run migrations (tsx server/migrate.ts)
```

## Project Structure

```
client/src/           # React frontend
  pages/              # Route page components (admin & public)
  components/         # Reusable UI components (shadcn/ui based)
  lib/                # Utilities (auth, i18n, queryClient)
  hooks/              # Custom React hooks
server/               # Express backend
  routes.ts           # All API endpoints (~6000 LOC)
  storage.ts          # Database CRUD layer (Drizzle ORM)
  db.ts               # Database connection
  index.ts            # Server entry point
  iterable.ts         # Iterable email integration
  appleWallet.ts      # Apple Wallet pass generation
  objectStorage.ts    # Google Cloud Storage integration
shared/               # Shared between client & server
  schema.ts           # Drizzle ORM schema definitions & Zod types
print-bridge/         # Separate service for Zebra printer communication
docs/                 # Platform documentation
script/               # Build & automation scripts
```

## Path Aliases

- `@/*` → `./client/src/*`
- `@shared/*` → `./shared/*`

## Architecture Conventions

### Database & Schema
- All schema definitions live in `shared/schema.ts` using Drizzle ORM
- Types are shared between client and server via the shared directory
- Zod schemas derived from Drizzle schemas using `drizzle-zod` for validation
- Bilingual fields use `_es` suffix (e.g., `title` / `title_es`)

### API Pattern
- RESTful endpoints under `/api/` prefix defined in `server/routes.ts`
- Authentication via Bearer token in `Authorization` header
- Role-based access: `admin`, `event_manager`, `marketing`, `readonly`
- Event managers have scoped access via `eventManagerAssignments` table

### Frontend Patterns
- Pages in `client/src/pages/`, components in `client/src/components/`
- Server state managed with TanStack React Query (queries + mutations)
- Client state managed with Zustand stores (auth, language)
- Forms use React Hook Form with Zod resolvers
- UI components from shadcn/ui (Radix UI primitives + Tailwind)
- Routing via Wouter (lightweight, not React Router)
- Dark/light theme via CSS variables + ThemeProvider

### Styling
- Tailwind CSS with custom CSS variables for theming
- Component variants via `class-variance-authority` (cva)
- Utility merging with `tailwind-merge` and `clsx`

### CMS / Page Builder
- Three page types: `login`, `registration`, `thank_you`
- Section-based: predefined section types (hero, agenda, speakers, stats, cta, faq, richtext, gallery, intro, thank_you, form)
- Data stored in `eventPages` and `eventPageSections` tables
- Admin editor at `/admin/events/:id/pages/:pageType`

## Key Data Models

- **users** - Admin/staff accounts with roles
- **events** - Event definitions with bilingual support, registration settings, guest policies
- **registrations** - Attendee records linked to events
- **qualifiedRegistrants** - Pre-approved registrants (bulk imported)
- **guests** - Plus-one guests with payment tracking
- **flights** - Flight info for transportation coordination
- **reimbursements** - Expense tracking with receipt uploads
- **swagItems / swagAssignments** - Merchandise management
- **eventPages / eventPageSections** - CMS landing pages
- **guestAllowanceRules** - Guest allowance tiers (free/paid)

## Key Enums

- **EventStatus:** draft, published, private, archived
- **RegistrationStatus:** qualified, registered, not_coming, checked_in
- **GuestPolicy:** not_allowed, allowed_free, allowed_paid, allowed_mixed
- **RegistrationMode:** qualified_verified, open_verified, open_anonymous
- **PaymentStatus:** not_required, pending, paid, failed
- **UserRole:** admin, event_manager, marketing, readonly

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `ITERABLE_API_KEY` - Iterable email platform key
- `ITERABLE_*_CAMPAIGN_ID_*` - Per-email campaign IDs (en/es variants)
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` - Stripe payment keys
- `HYDRA_API_URL` - Unicity Hydra OTP auth endpoint

## Testing

No automated test framework is currently configured. Type checking is available via `npm run check`.

## Important Notes

- Server listens on port 5000 by default
- Production output: `dist/index.cjs` (server) + `dist/public/` (frontend assets)
- Print bridge (`print-bridge/`) is a separate Node.js service for local Zebra printer communication at venues
- The `server/routes.ts` file is very large (~6000 LOC) - contains all API endpoints
- Registration page (`client/src/pages/RegistrationPage.tsx`) is ~3900 LOC with multi-step flow
- All content should support bilingual (EN/ES) where applicable
