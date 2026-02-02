# OTP Authentication System

This document explains how One-Time Password (OTP) authentication works in the Unicity Events platform.

## Overview

The platform uses OTP-based passwordless authentication via Unicity's Hydra API. Users receive a 6-digit code via email which they enter to verify their identity. This approach eliminates password management and provides a secure, user-friendly login experience.

## Hydra API Environments

| Environment | API Base URL |
|-------------|--------------|
| Production | `https://hydra.unicity.net/v6` |
| QA/Development | `https://hydraqa.unicity.net/v6-test` |

The environment is automatically selected based on `NODE_ENV`:
- `production` → Production Hydra
- Any other value → QA Hydra

## OTP Flows

The platform has three distinct OTP flows:

### 1. Admin Login (`/api/auth/otp/*`)

Used by admin users to access the admin dashboard.

**Flow:**
1. Admin enters email on `/login`
2. System checks if email belongs to an authorized admin user
3. If authorized, calls `POST /api/auth/otp/generate`
4. Hydra sends OTP code to the email
5. Admin enters 6-digit code
6. System validates via `POST /api/auth/otp/validate`
7. On success, creates auth session and JWT token

**Access Control:**
- Only pre-approved admin emails can log in
- Fallback admin emails are configured for initial bootstrap
- New admins must be created via the Admin UI

### 2. Event Registration (`/api/register/otp/*`)

Used by attendees registering for events.

**Flow:**
1. Attendee enters email on event registration page
2. System calls `POST /api/register/otp/generate`
3. Hydra sends OTP code to the email
4. Attendee enters 6-digit code
5. System validates via `POST /api/register/otp/validate`
6. On success, returns user data and redirect token for registration

**Variants:**
- **By Email** (`/api/register/otp/generate`): Standard email-based OTP
- **By Distributor ID** (`/api/register/otp/generate-by-id`): For users who qualify via Unicity ID but email is masked

### 3. Attendee Login (`/api/attendee/otp/*`)

Used by registered attendees to access `/my-events` page.

**Flow:**
1. Attendee enters email on `/my-events/login`
2. System verifies attendee has registrations
3. Calls `POST /api/attendee/otp/generate`
4. Hydra sends OTP code
5. Attendee enters code
6. System validates via `POST /api/attendee/otp/validate`
7. Creates attendee session (separate from admin sessions)

## API Endpoints

### Generate OTP

**Request:**
```
POST /api/auth/otp/generate (admin)
POST /api/register/otp/generate (registration)
POST /api/attendee/otp/generate (attendee)

Body: { "email": "user@example.com" }
```

**Hydra Call:**
```
POST {HYDRA_BASE}/otp/generate
Body: { "email": "user@example.com" }
```

**Response from Hydra:**
```json
{
  "success": true,
  "data": {
    "validation_id": "abc123...",
    "expires_at": "2025-01-26T20:15:00Z"
  }
}
```

### Validate OTP

**Request:**
```
POST /api/auth/otp/validate (admin)
POST /api/register/otp/validate (registration)
POST /api/attendee/otp/validate (attendee)

Body: { "email": "user@example.com", "code": "123456" }
```

**Hydra Call:**
```
POST {HYDRA_BASE}/otp/magic-link
Body: {
  "email": "user@example.com",
  "code": "123456",
  "validation_id": "abc123..."
}
```

**Response from Hydra:**
```json
{
  "success": true,
  "customer": {
    "id": "customer123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe"
  },
  "token": "bearer_token_here"
}
```

## OTP Session Storage

OTP sessions are stored in the database to track verification state:

```sql
CREATE TABLE otp_sessions (
  id VARCHAR PRIMARY KEY,
  email TEXT NOT NULL,
  validation_id TEXT,        -- From Hydra response
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  customer_id TEXT,          -- Unicity customer ID
  bearer_token TEXT,         -- Hydra bearer token
  event_id TEXT,             -- For registration OTP (scoped to event)
  expires_at TIMESTAMP,
  created_at TIMESTAMP
);
```

**Key Fields:**
- `validation_id`: Required to validate OTP with Hydra
- `verified`: Marks session as successfully verified
- `event_id`: Scopes registration OTP sessions to specific events
- `customer_id`: Unicity customer ID from Hydra (if user exists)

## Development Mode

In non-production environments, a hardcoded dev code is available:

- **Code:** `123456`
- **Behavior:** Bypasses Hydra API call, immediately marks OTP as valid
- **Console Log:** `DEV MODE: OTP code for {email} is 123456`

This allows testing without sending actual emails.

## verifiedByHydra Flag

Registrations track whether the user was verified via OTP:

```typescript
verifiedByHydra: boolean
```

- `true`: User completed OTP verification
- `false`: Admin-registered (bypassed OTP) or anonymous registration

This flag is used for:
- Audit trail (distinguishing self-service vs admin registrations)
- Determining trust level for user-provided data

## Admin Registration (Bypass OTP)

When users cannot receive OTP emails (e.g., Hotmail blocking), admins can register qualifiers directly:

**Endpoint:** `POST /api/qualifiers/:id/admin-register`

**Behavior:**
- Creates registration without OTP verification
- Sets `verifiedByHydra: false`
- Optionally sends confirmation email (controlled by `sendEmail` query param)

## Email Delivery Considerations

OTP emails are sent by Hydra, not the Events platform. If users report not receiving codes:

1. **Check spam/junk folder**
2. **Email provider blocking**: Some providers (Hotmail, Yahoo) may block Unicity emails
3. **Verify email address**: Typos are common
4. **Use admin registration**: As a fallback for blocked emails

## Security Considerations

1. **OTP Expiration**: Codes expire after 10 minutes
2. **Single Use**: Each OTP can only be validated once
3. **Session Binding**: OTP is bound to the email used during generation
4. **Rate Limiting**: Hydra enforces rate limits on OTP generation
5. **Secure Transmission**: All API calls use HTTPS

## Troubleshooting

### "Invalid verification code"
- Code may have expired (10 min limit)
- Code already used
- Typo in code entry

### "No pending verification"
- OTP session expired or never created
- User needs to request a new code

### "Customer not found"
- User's email not in Unicity's Hydra system
- For events, user may still register if on qualifier list

### OTP not received
- Check spam folder
- Verify email address spelling
- Email provider may be blocking Unicity emails
- Use admin registration as fallback

## Related Files

| File | Purpose |
|------|---------|
| `server/routes.ts` | OTP API endpoints |
| `server/storage.ts` | OTP session CRUD operations |
| `shared/schema.ts` | OTP session database schema |
| `client/src/pages/LoginPage.tsx` | Admin login UI |
| `client/src/pages/PublicLoginPage.tsx` | Attendee/registration login UI |
| `client/src/pages/RegistrationPage.tsx` | Event registration with OTP |
| `client/src/components/ui/input-otp.tsx` | OTP input component |
