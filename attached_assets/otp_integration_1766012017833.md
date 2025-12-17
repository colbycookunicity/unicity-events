# OTP & Magic URL Authentication API

Passwordless authentication via magic URLs and traditional OTP codes.

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/otp/generate` | Generate and email 6-digit OTP |
| POST | `/otp/validate` | Validate OTP code |
| POST | `/otp/magic-url/generate` | Generate and email magic URL |
| GET | `/otp/magic-url/verify/{id}` | Verify magic URL (auto-redirect) |
| POST | `/otp/magic-link` | Validate OTP and get bearer token |

## Environments

| Environment | Base URL | Version |
|-------------|----------|---------|
| Production | `https://hydra.unicity.net` | `v6` |
| QA | `https://hydraqa.unicity.net` | `v6-test` |
| Local | `http://localhost:30000` | `v6-test` |

---

## Traditional OTP Flow

```
1. POST /otp/generate     → OTP emailed to user
2. User enters 6-digit code
3. POST /otp/validate     → Returns success/failure
```

### Generate OTP

```bash
POST /v6/otp/generate
Content-Type: application/json

{
  "email": "user@example.com",
  "devMode": true  // Optional: bypass rate limiting in non-prod
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "validation_id": "5D3F92D6-EB85-45DC-BD99-44F3CB1ADF87",
    "expires_at": "2025-12-17T20:14:29Z",
    "must_validate": true,
    "message": "New validation code generated",
    "metadata": {
      "otp_code": "930560",
      "environment": "qa",
      "dev_mode": true
    }
  }
}
```

> **Note:** `metadata.otp_code` only included in non-production environments.

### Validate OTP

```bash
POST /v6/otp/validate
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "930560"
}
```

**Success Response:**
```json
{
  "success": true,
  "data": {
    "validation_id": "5D3F92D6-EB85-45DC-BD99-44F3CB1ADF87",
    "verified_at": "2025-12-17T19:44:41Z",
    "email": "user@example.com",
    "message": "Validation successful",
    "customer_id": 12345
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "data": {
    "email": "user@example.com",
    "error_code": "INVALID_CODE",
    "message": "Invalid verification code. Please check your code and try again."
  }
}
```

---

## Magic URL Flow

```
1. POST /otp/magic-url/generate  → Magic URL emailed to user
2. User clicks link in email
3. GET /otp/magic-url/verify/... → Auto-redirects to app with token
```

### Generate Magic URL

```bash
POST /v6/otp/magic-url/generate
Content-Type: application/json

{
  "email": "user@example.com",
  "application_code": "WEB_APP"
}
```

**Supported Applications:**
- `WEB_APP` - Web Application
- `MOBILE_APP` - Mobile Application
- `fasting-app` - UFeel Great Fasting App
- `office` - Unicity Office
- `shop` - Unicity Shop

**Response:**
```json
{
  "success": true,
  "data": {
    "email": "user@example.com",
    "expires_at": "2025-12-17T20:20:08Z",
    "must_validate": true,
    "rate_limited": false,
    "application": {
      "code": "WEB_APP",
      "name": "Web Application"
    },
    "has_short_url": true,
    "url_info": {
      "type": "shortened",
      "service": "unicity.link"
    },
    "remaining_minutes": 30,
    "message": "Magic URL generated successfully",
    "metadata": {
      "magic_url": "https://hydra.unicity.net/v6-test/otp/magic-url/verify/abc123?app=WEB_APP",
      "short_url": "https://dev.unicity.link/xyz789",
      "otp_code": "123456",
      "has_short_url": true,
      "url_shortening_succeeded": true
    }
  }
}
```

> **Security:** `validation_id` and `magic_url_token_id` are **never** exposed in API responses. The magic URL is only sent via email. `metadata` only included in non-production.

### Verify Magic URL

When users click the magic URL, they are automatically redirected to the application with authentication credentials.

```
GET /v6/otp/magic-url/verify/{validationId}?app=WEB_APP
```

**Success:** HTTP 302 redirect to application-specific URL:

| App | Redirect URL Pattern |
|-----|---------------------|
| WEB_APP | `?token={bearer}&email={email}&code={otp}` |
| MOBILE_APP | `?auth_token={bearer}&email={email}&otp={otp}` |
| fasting-app | `?action=validate-otp&code={otp}&token={bearer}&email={email}` |
| office | `?token={bearer}&email={email}&redirect=dashboard` |
| shop | `?auth_token={bearer}&customer_email={email}&auto_login=true` |

**Error Response (JSON):**
```json
{
  "success": false,
  "data": {
    "error_code": "INVALID_TOKEN",
    "message": "Magic URL token is invalid or expired"
  }
}
```

---

## Magic Link (OTP + Bearer Token)

Validate OTP and receive a bearer token in one step.

```bash
POST /v6/otp/magic-link
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "930560"
}
```

**Success Response:**
```json
{
  "success": true,
  "token": "bearer-token-here",
  "customer": {
    "id": 12345,
    "email": "user@example.com"
  },
  "validation": {
    "id": "5D3F92D6-EB85-45DC-BD99-44F3CB1ADF87",
    "validated_at": "2025-12-17T19:44:41Z"
  }
}
```

---

## Error Codes

### Generation Errors

| Code | Description |
|------|-------------|
| `RATE_LIMITED` | Too many requests (wait ~5 min) |
| `INVALID_APPLICATION` | Application code not supported |
| `CUSTOMER_LOOKUP_FAILED` | Could not look up customer |
| `SYSTEM_ERROR` | Internal error |

### Validation Errors

| Code | Description |
|------|-------------|
| `NOT_FOUND` | No OTP record for email |
| `INVALID_CODE` | Wrong code entered |
| `EXPIRED` | Code expired (30 min limit) |
| `ALREADY_USED` | Code already validated |
| `INVALID_TOKEN` | Magic URL token invalid/expired |
| `MISSING_PARAMETER` | Missing required parameter |
| `CUSTOMER_NOT_FOUND` | No customer account for email |

---

## TypeScript Types

```typescript
// Requests
interface OTPGenerateRequest {
  email: string;
  devMode?: boolean;
}

interface OTPValidateRequest {
  email: string;
  code: string;
}

interface MagicURLGenerateRequest {
  email: string;
  application_code: 'WEB_APP' | 'MOBILE_APP' | 'fasting-app' | 'office' | 'shop';
  context?: string;
}

interface MagicLinkRequest {
  email: string;
  code: string;
  expand?: string;
}

// Responses
interface OTPGenerateResponse {
  success: true;
  data: {
    validation_id: string;
    expires_at: string;
    must_validate: boolean;
    message: string;
    metadata?: {
      otp_code: string;
      environment: string;
      dev_mode: boolean;
    };
  };
}

interface OTPValidateResponse {
  success: true;
  data: {
    validation_id: string;
    verified_at: string;
    email: string;
    message: string;
    customer_id?: number;
  };
}

interface MagicURLGenerateResponse {
  success: true;
  data: {
    email: string;
    expires_at: string;
    must_validate: boolean;
    rate_limited: boolean;
    application: { code: string; name: string };
    has_short_url: boolean;
    url_info: { type: 'shortened' | 'direct'; service: string };
    remaining_minutes: number;
    message: string;
    metadata?: {
      magic_url: string;
      short_url: string;
      otp_code: string;
      has_short_url: boolean;
      url_shortening_succeeded: boolean;
    };
  };
}

interface MagicLinkResponse {
  success: true;
  token: string;
  customer: { id: number; email: string };
  validation: { id: string; validated_at: string };
}

interface ErrorResponse {
  success: false;
  data?: {
    email?: string;
    error_code: string;
    message: string;
    retry_after?: number;
  };
  message?: string;
}
```

---

## TypeScript Client Example

```typescript
const API_BASE = 'https://hydraqa.unicity.net/v6-test';

async function generateOTP(email: string, devMode = false) {
  const res = await fetch(`${API_BASE}/otp/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, devMode }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.data?.message || json.message);
  return json.data;
}

async function validateOTP(email: string, code: string) {
  const res = await fetch(`${API_BASE}/otp/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.data?.message || json.message);
  return json.data;
}

async function generateMagicURL(email: string, appCode: string) {
  const res = await fetch(`${API_BASE}/otp/magic-url/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, application_code: appCode }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.data?.message || json.message);
  return json.data;
}

async function magicLink(email: string, code: string) {
  const res = await fetch(`${API_BASE}/otp/magic-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message);
  return json; // { token, customer, validation }
}
```

---

## curl Examples

```bash
# Generate OTP
curl -X POST https://hydraqa.unicity.net/v6-test/otp/generate \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","devMode":true}'

# Validate OTP
curl -X POST https://hydraqa.unicity.net/v6-test/otp/validate \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456"}'

# Generate Magic URL
curl -X POST https://hydraqa.unicity.net/v6-test/otp/magic-url/generate \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","application_code":"WEB_APP"}'

# Magic Link (OTP → Bearer Token)
curl -X POST https://hydraqa.unicity.net/v6-test/otp/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456"}'
```

---

## Security

- **30-minute expiration** for all tokens/codes
- **One-time use** - tokens invalidated after verification
- **Rate limiting** - ~5 minute window between requests per email
- **No token exposure** - `validation_id` never in API response, only in email
- **Security headers** on all endpoints:
  - `Cache-Control: no-cache, no-store, must-revalidate, private`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`

---

## Notes

- OTP codes are **6 digits**
- Use `devMode: true` in non-prod to bypass rate limiting
- `metadata` fields only appear in non-production environments
- Magic URL verify redirects (302), doesn't return JSON on success
