# Stripe Integration

## Overview

Stripe is used for processing guest buy-in payments when events have paid guest policies. Attendees who bring guests to events may be required to pay a buy-in fee, which is collected via Stripe Checkout sessions.

## Current Status

**Payment processing is not yet fully activated.** The API endpoints, database schema, and frontend UI are all in place, but the Stripe API keys have not been configured. All payment endpoints currently return `503 - Payment processing is not currently available`.

Once Stripe keys are added, the system will be ready to process payments without code changes.

## Required Environment Variables

| Variable | Description | Status |
|----------|-------------|--------|
| `STRIPE_SECRET_KEY` | Stripe secret API key (starts with `sk_`) | Not configured |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (starts with `pk_`) | Not configured |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret for verifying Stripe events | Not configured |

These should be added as secrets via the Replit Secrets tab or environment variable management.

## Payment Flow

### Guest Buy-In Payment

1. **Admin configures event** — Sets `guestPolicy` to `allowed_paid` or `allowed_mixed` and sets a `buyInPrice` (stored in cents in the database, displayed in dollars in the admin UI).

2. **Attendee registers a guest** — Via the public guest registration page at `/events/:eventSlug/guest-register`.

3. **System creates guest record** — A guest record is created with `paymentStatus: "pending"` and the appropriate `amountPaidCents`.

4. **Stripe Checkout session created** — The API generates a Stripe Checkout session and returns a `checkoutUrl`.

5. **Redirect to Stripe** — The frontend redirects the user to Stripe's hosted checkout page.

6. **Payment completion** — After successful payment, Stripe redirects the user to `/events/:eventSlug/guest-payment-success?session_id=...&guest_id=...`.

7. **Payment verification** — The success page calls `POST /api/public/verify-guest-payment` with the session ID and guest ID to confirm the payment and update the guest record.

### Registration Payment (Future)

The schema also supports payment on registrations themselves (not just guests). This would use:
- `POST /api/registrations/:id/initiate-payment` — Create a checkout session
- `POST /api/registrations/:id/verify-payment` — Verify payment after completion

## API Endpoints

### Guest Payment

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/public/events/:eventIdOrSlug/register-guest` | Public | Register a guest and create Stripe checkout session |
| POST | `/api/public/verify-guest-payment` | Public | Verify guest payment after Stripe redirect |

### Registration Payment

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/registrations/:id/initiate-payment` | Authenticated | Initiate payment for a registration |
| POST | `/api/registrations/:id/verify-payment` | Authenticated | Verify registration payment |

## Database Schema

### Registrations Table (payment fields)

| Column | Type | Description |
|--------|------|-------------|
| `paymentStatus` | text | `not_required`, `pending`, `paid`, `failed` |
| `paymentIntentId` | text | Stripe Payment Intent ID |
| `amountPaidCents` | integer | Amount paid in cents |
| `paidAt` | timestamp | When payment was completed |

### Guests Table (payment fields)

| Column | Type | Description |
|--------|------|-------------|
| `paymentStatus` | text | `pending`, `paid`, `failed`, `not_required` |
| `paymentIntentId` | text | Stripe Payment Intent ID |
| `isComplimentary` | boolean | True if guest is free (from allowance) |
| `amountPaidCents` | integer | Amount paid in cents (0 for complimentary) |
| `paidAt` | timestamp | When payment was completed |

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Guest Registration | `/events/:eventSlug/guest-register` | Public form for adding a guest with payment flow |
| Payment Success | `/events/:eventSlug/guest-payment-success` | Post-checkout verification and confirmation |

## Event Guest Policies

The `guestPolicy` field on events controls how guests are handled:

| Policy | Description | Payment Required |
|--------|-------------|-----------------|
| `not_allowed` | No guests permitted | N/A |
| `allowed_free` | Guests are free | No |
| `allowed_paid` | All guests require payment | Yes (uses `buyInPrice`) |
| `allowed_mixed` | Per-rule guest allowances | Depends on guest allowance rules |

### Mixed Policy (Guest Allowance Rules)

For `allowed_mixed` events, guest allowance rules define per-tier policies:
- `freeGuestCount` — Number of free guests allowed
- `maxPaidGuests` — Number of additional paid guests allowed
- `paidGuestPriceCents` — Price per paid guest in cents

## Activation Checklist

To enable Stripe payments:

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Get API keys from the Stripe Dashboard (Developers > API Keys)
3. Add `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` as secrets
4. Set up a webhook endpoint pointing to the app's domain for payment event notifications
5. Add `STRIPE_WEBHOOK_SECRET` from the webhook configuration
6. Update the guest registration endpoint in `server/routes.ts` to create actual Stripe Checkout sessions instead of returning 503
7. Update the payment verification endpoints to call the Stripe API to confirm session/payment status
8. Test with Stripe's test mode keys before switching to live keys
