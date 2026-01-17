import type { EventIterableCampaigns } from "@shared/schema";

const ITERABLE_API_KEY = process.env.ITERABLE_API_KEY;
const ITERABLE_API_BASE = 'https://api.iterable.com/api';

// Required campaign environment variables
const REQUIRED_CAMPAIGN_ENV_VARS = [
  'ITERABLE_EVENT_CONFIRMATION_CAMPAIGN_ID',
  'ITERABLE_EVENT_CONFIRMATION_CAMPAIGN_ID_ES',
  'ITERABLE_CHECKED_IN_CAMPAIGN_ID',
  'ITERABLE_CHECKED_IN_CAMPAIGN_ID_ES',
] as const;

// Email type keys matching EventIterableCampaigns
export type IterableEmailType = keyof EventIterableCampaigns;

// Mapping from email type to environment variable name pattern
const EMAIL_TYPE_TO_ENV_VAR: Record<IterableEmailType, string> = {
  confirmation: 'ITERABLE_EVENT_CONFIRMATION_CAMPAIGN_ID',
  checkedIn: 'ITERABLE_CHECKED_IN_CAMPAIGN_ID',
  qualificationGranted: 'ITERABLE_QUALIFICATION_GRANTED_CAMPAIGN_ID',
  registrationCanceled: 'ITERABLE_REGISTRATION_CANCELED_CAMPAIGN_ID',
  registrationTransferred: 'ITERABLE_REGISTRATION_TRANSFERRED_CAMPAIGN_ID',
  registrationUpdate: 'ITERABLE_REGISTRATION_UPDATE_CAMPAIGN_ID',
};

// Validate Iterable configuration on startup
export function validateIterableConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!ITERABLE_API_KEY) {
    errors.push('ITERABLE_API_KEY is not configured - emails will not be sent');
  }
  
  for (const envVar of REQUIRED_CAMPAIGN_ENV_VARS) {
    const value = process.env[envVar];
    if (!value) {
      errors.push(`Missing campaign ID: ${envVar}`);
    } else {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed) || parsed <= 0) {
        errors.push(`Invalid campaign ID for ${envVar}: ${value}`);
      }
    }
  }
  
  if (errors.length > 0) {
    console.error('[Iterable] Configuration validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
  } else {
    console.log('[Iterable] Configuration validated successfully');
  }
  
  return { valid: errors.length === 0, errors };
}

function getBaseUrl(): string {
  return process.env.REPLIT_DEPLOYMENT_URL 
    || process.env.REPLIT_DEV_DOMAIN 
    || 'https://unicity-events.replit.app';
}

function buildEventUrl(event: any): string {
  const baseUrl = getBaseUrl();
  if (event.slug) {
    return `${baseUrl}/register/${event.slug}`;
  }
  return `${baseUrl}/register/${event.id}`;
}

function formatDate(dateStr: string | Date | null | undefined, language: string = 'en'): string {
  if (!dateStr) return '';
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(date.getTime())) return '';
  
  const options: Intl.DateTimeFormatOptions = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  const locale = language === 'es' ? 'es-ES' : 'en-US';
  return date.toLocaleDateString(locale, options);
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SendEmailParams {
  campaignId: number;
  campaignSource?: 'event' | 'env_fallback' | 'none';
  recipientEmail: string;
  dataFields: Record<string, any>;
  context: string;
}

function log(level: 'info' | 'error' | 'warn', message: string, data?: any) {
  const prefix = `[Iterable]`;
  const timestamp = new Date().toISOString();
  if (level === 'error') {
    console.error(`${prefix} ${timestamp} ERROR: ${message}`, data ?? '');
  } else if (level === 'warn') {
    console.warn(`${prefix} ${timestamp} WARN: ${message}`, data ?? '');
  } else {
    console.log(`${prefix} ${timestamp} INFO: ${message}`, data ?? '');
  }
}

function isConfigured(): boolean {
  return !!ITERABLE_API_KEY;
}

function getCampaignId(envVarName: string): number {
  const value = process.env[envVarName];
  if (!value) {
    log('warn', `Campaign ID not configured: ${envVarName}`);
    return 0;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) {
    log('warn', `Invalid campaign ID for ${envVarName}: ${value}`);
    return 0;
  }
  return parsed;
}

/**
 * Get campaign ID for an event with fallback to environment variables.
 * 
 * Resolution priority:
 * 1. event.iterableCampaigns[emailType][language] - Event-specific campaign
 * 2. Environment variable (e.g., ITERABLE_EVENT_CONFIRMATION_CAMPAIGN_ID_ES) - Fallback
 * 3. 0 (skip sending with warning log) - No campaign configured
 * 
 * @param event - Event object with optional iterableCampaigns
 * @param emailType - Type of email (confirmation, checkedIn, etc.)
 * @param language - Language code (en, es)
 * @returns Campaign ID or 0 if not configured
 */
function getCampaignIdForEvent(
  event: { id?: string; name?: string; iterableCampaigns?: EventIterableCampaigns | null },
  emailType: IterableEmailType,
  language: string
): { campaignId: number; source: 'event' | 'env_fallback' | 'none' } {
  const lang = language === 'es' ? 'es' : 'en';
  
  // 1. Check event-specific campaign
  const eventCampaign = event.iterableCampaigns?.[emailType]?.[lang];
  if (eventCampaign && typeof eventCampaign === 'number' && eventCampaign > 0) {
    log('info', `Using event campaign for ${emailType}/${lang}: ${eventCampaign}`, { 
      eventId: event.id, 
      eventName: event.name 
    });
    return { campaignId: eventCampaign, source: 'event' };
  }
  
  // 2. Fallback to environment variable
  const baseEnvVar = EMAIL_TYPE_TO_ENV_VAR[emailType];
  if (baseEnvVar) {
    const envVarName = lang === 'es' ? `${baseEnvVar}_ES` : baseEnvVar;
    const envCampaign = getCampaignId(envVarName);
    if (envCampaign > 0) {
      log('info', `Falling back to env campaign for ${emailType}/${lang}: ${envCampaign}`, { 
        eventId: event.id, 
        eventName: event.name,
        envVar: envVarName 
      });
      return { campaignId: envCampaign, source: 'env_fallback' };
    }
  }
  
  // 3. No campaign configured
  log('warn', `No campaign configured for ${emailType}/${lang}`, { 
    eventId: event.id, 
    eventName: event.name 
  });
  return { campaignId: 0, source: 'none' };
}

export class IterableService {
  private async request(method: string, endpoint: string, body?: any): Promise<any> {
    if (!ITERABLE_API_KEY) {
      throw new Error('ITERABLE_API_KEY is not configured');
    }

    const url = `${ITERABLE_API_BASE}${endpoint}`;
    log('info', `API Request: ${method} ${endpoint}`, { campaignId: body?.campaignId, email: body?.recipientEmail });

    const response = await fetch(url, {
      method,
      headers: {
        'Api-Key': ITERABLE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseText = await response.text();
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    if (!response.ok) {
      const errorDetail = responseData?.msg || responseData?.message || responseData?.raw || responseText;
      log('error', `API Error: ${method} ${endpoint} returned ${response.status}`, { 
        status: response.status,
        error: errorDetail,
        campaignId: body?.campaignId 
      });
      throw new Error(`Iterable API error (${response.status}): ${errorDetail}`);
    }

    return responseData;
  }

  private async sendEmailInternal(params: SendEmailParams): Promise<EmailResult> {
    const { campaignId, campaignSource, recipientEmail, dataFields, context } = params;

    if (!isConfigured()) {
      log('info', `Skipping ${context} - ITERABLE_API_KEY not configured`);
      return { success: false, error: 'ITERABLE_API_KEY not configured' };
    }

    if (campaignId <= 0) {
      log('warn', `Skipping ${context} - Campaign ID not configured or invalid`);
      return { success: false, error: 'Campaign ID not configured' };
    }

    log('info', `Sending ${context} to ${recipientEmail} (campaign: ${campaignId}, source: ${campaignSource || 'unknown'})`);

    try {
      const result = await this.request('POST', '/email/target', {
        campaignId,
        recipientEmail,
        dataFields,
      });

      const messageId = result?.msg || result?.messageId || undefined;
      
      // Structured log for email analytics (gold standard format)
      console.log(JSON.stringify({
        event: 'EMAIL_SENT',
        type: context.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(),
        email: recipientEmail,
        campaignId,
        campaignSource: campaignSource || 'unknown',
        eventId: dataFields.eventId || null,
        eventName: dataFields.eventName || null,
        language: dataFields.language || null,
        registrationId: dataFields.registrationId || null,
        messageId: messageId || null,
        timestamp: new Date().toISOString(),
      }));
      
      return { success: true, messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', `Failed: ${context} to ${recipientEmail}`, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async sendRegistrationConfirmation(
    email: string,
    registration: any,
    event: any,
    language: string = 'en',
    checkInQrPayload?: string | null,
    checkInToken?: string | null
  ): Promise<EmailResult> {
    const { campaignId, source } = getCampaignIdForEvent(event, 'confirmation', language);
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;
    const baseUrl = getBaseUrl();

    return this.sendEmailInternal({
      campaignId,
      campaignSource: source,
      recipientEmail: email,
      context: 'RegistrationConfirmation',
      dataFields: {
        firstName: registration.firstName,
        lastName: registration.lastName,
        eventId: event.id,
        eventName,
        eventLocation: event.location,
        eventUrl: buildEventUrl(event),
        startDate: event.startDate,
        endDate: event.endDate,
        registrationId: registration.id,
        language,
        // QR code for check-in (CHECKIN:<eventId>:<registrationId>:<token>)
        checkInQrPayload: checkInQrPayload || null,
        // URL to generate QR image (can be used in Iterable template)
        checkInQrImageUrl: checkInQrPayload 
          ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkInQrPayload)}`
          : null,
        // Apple Wallet pass URL (for iOS devices)
        appleWalletUrl: checkInToken ? `${baseUrl}/api/wallet/${checkInToken}` : null,
      },
    });
  }

  async sendRegistrationUpdate(
    email: string,
    registration: any,
    event: any,
    language: string = 'en'
  ): Promise<EmailResult> {
    const { campaignId, source } = getCampaignIdForEvent(event, 'registrationUpdate', language);
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;

    return this.sendEmailInternal({
      campaignId,
      campaignSource: source,
      recipientEmail: email,
      context: 'RegistrationUpdate',
      dataFields: {
        firstName: registration.firstName,
        eventId: event.id,
        eventName,
        eventUrl: buildEventUrl(event),
        registrationId: registration.id,
        language,
      },
    });
  }

  async sendRegistrationCanceled(
    email: string,
    registration: any,
    event: any,
    language: string = 'en'
  ): Promise<EmailResult> {
    const { campaignId, source } = getCampaignIdForEvent(event, 'registrationCanceled', language);
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;

    return this.sendEmailInternal({
      campaignId,
      campaignSource: source,
      recipientEmail: email,
      context: 'RegistrationCanceled',
      dataFields: {
        email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        eventId: event.id,
        eventName,
        eventUrl: buildEventUrl(event),
        eventStartDate: formatDate(event.startDate, language),
        registrationId: registration.id,
        language,
      },
    });
  }

  async sendRegistrationTransferred(
    email: string,
    registration: any,
    event: any,
    language: string = 'en'
  ): Promise<EmailResult> {
    const { campaignId, source } = getCampaignIdForEvent(event, 'registrationTransferred', language);
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;

    return this.sendEmailInternal({
      campaignId,
      campaignSource: source,
      recipientEmail: email,
      context: 'RegistrationTransferred',
      dataFields: {
        email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        eventId: event.id,
        eventName,
        eventUrl: buildEventUrl(event),
        eventStartDate: formatDate(event.startDate, language),
        registrationId: registration.id,
        language,
      },
    });
  }

  async sendCheckedInConfirmation(
    email: string,
    registration: any,
    event: any,
    language: string = 'en',
    checkInQrPayload?: string | null,
    checkInToken?: string | null
  ): Promise<EmailResult> {
    const { campaignId, source } = getCampaignIdForEvent(event, 'checkedIn', language);
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;
    const baseUrl = getBaseUrl();

    return this.sendEmailInternal({
      campaignId,
      campaignSource: source,
      recipientEmail: email,
      context: 'CheckedInConfirmation',
      dataFields: {
        email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        eventId: event.id,
        eventName,
        eventUrl: buildEventUrl(event),
        eventStartDate: formatDate(event.startDate, language),
        registrationId: registration.id,
        language,
        checkInQrPayload: checkInQrPayload || null,
        checkInQrImageUrl: checkInQrPayload 
          ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(checkInQrPayload)}`
          : null,
        appleWalletUrl: checkInToken ? `${baseUrl}/api/wallet/${checkInToken}` : null,
      },
    });
  }

  async sendQualificationGranted(
    email: string,
    registration: any,
    event: any,
    language: string = 'en'
  ): Promise<EmailResult> {
    const { campaignId, source } = getCampaignIdForEvent(event, 'qualificationGranted', language);
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;

    return this.sendEmailInternal({
      campaignId,
      campaignSource: source,
      recipientEmail: email,
      context: 'QualificationGranted',
      dataFields: {
        email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        eventId: event.id,
        eventName,
        eventUrl: buildEventUrl(event),
        eventStartDate: formatDate(event.startDate, language),
        registrationId: registration.id,
        language,
      },
    });
  }

  // =========================================================================
  // REGISTRATION SYNC HELPERS
  // These methods sync registration data to Iterable for marketing automation
  // =========================================================================

  /**
   * Create or update a user profile in Iterable.
   * Uses POST /users/update endpoint.
   * 
   * @param email - User's email (required by Iterable)
   * @param profile - User profile data (firstName, lastName, locale)
   * @returns Success status and any error details
   */
  async createOrUpdateUser(
    email: string,
    profile: {
      firstName?: string;
      lastName?: string;
      locale?: string; // e.g. "en-US", "es-US", "fr-FR"
    }
  ): Promise<{ success: boolean; error?: string }> {
    if (!isConfigured()) {
      log('info', 'Skipping createOrUpdateUser - ITERABLE_API_KEY not configured');
      return { success: false, error: 'ITERABLE_API_KEY not configured' };
    }

    if (!email) {
      log('warn', 'Skipping createOrUpdateUser - email is required');
      return { success: false, error: 'Email is required' };
    }

    try {
      // Build dataFields object, only including non-empty values
      const dataFields: Record<string, string> = {};
      if (profile.firstName) dataFields.firstName = profile.firstName;
      if (profile.lastName) dataFields.lastName = profile.lastName;
      if (profile.locale) dataFields.locale = profile.locale;

      await this.request('POST', '/users/update', {
        email,
        dataFields,
        // preferUserId false = email is the primary identifier
        preferUserId: false,
      });

      log('info', `User profile synced: ${email}`, { dataFields });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', `Failed to sync user profile: ${email}`, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Add a user to an Iterable list.
   * Uses POST /lists/subscribe endpoint.
   * Handles already-subscribed users gracefully (Iterable will not duplicate).
   * 
   * @param email - User's email
   * @param listId - Iterable list ID
   * @returns Success status and any error details
   */
  async addUserToList(
    email: string,
    listId: number
  ): Promise<{ success: boolean; error?: string }> {
    if (!isConfigured()) {
      log('info', 'Skipping addUserToList - ITERABLE_API_KEY not configured');
      return { success: false, error: 'ITERABLE_API_KEY not configured' };
    }

    if (!email) {
      log('warn', 'Skipping addUserToList - email is required');
      return { success: false, error: 'Email is required' };
    }

    if (!listId || listId <= 0) {
      log('info', 'Skipping addUserToList - no valid listId provided');
      return { success: false, error: 'No valid list ID provided' };
    }

    try {
      await this.request('POST', '/lists/subscribe', {
        listId,
        subscribers: [{ email }],
      });

      log('info', `User added to list: ${email} -> list ${listId}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', `Failed to add user to list: ${email} -> list ${listId}`, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Track a custom registration event in Iterable.
   * Uses POST /events/track endpoint.
   * 
   * @param email - User's email
   * @param eventData - Registration event data
   * @returns Success status and any error details
   */
  async trackRegistrationEvent(
    email: string,
    eventData: {
      eventId: string;
      eventSlug?: string;
      registrationId: string;
      marketCode?: string; // e.g. "US", "PR", "MX"
      registeredAt: string; // ISO 8601 timestamp
    }
  ): Promise<{ success: boolean; error?: string }> {
    if (!isConfigured()) {
      log('info', 'Skipping trackRegistrationEvent - ITERABLE_API_KEY not configured');
      return { success: false, error: 'ITERABLE_API_KEY not configured' };
    }

    if (!email) {
      log('warn', 'Skipping trackRegistrationEvent - email is required');
      return { success: false, error: 'Email is required' };
    }

    try {
      await this.request('POST', '/events/track', {
        email,
        eventName: 'eventRegistration',
        dataFields: {
          eventId: eventData.eventId,
          eventSlug: eventData.eventSlug || null,
          registrationId: eventData.registrationId,
          marketCode: eventData.marketCode || null,
          registeredAt: eventData.registeredAt,
        },
        // Use current time for the event timestamp
        createdAt: Math.floor(Date.now() / 1000),
      });

      log('info', `Registration event tracked: ${email}`, { 
        eventId: eventData.eventId, 
        registrationId: eventData.registrationId 
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', `Failed to track registration event: ${email}`, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Track a purchase event in Iterable for paid registrations.
   * Uses POST /commerce/trackPurchase endpoint.
   * Idempotent via transactionId - Iterable will deduplicate.
   * 
   * @param email - User's email
   * @param purchaseData - Purchase event data
   * @returns Success status and any error details
   */
  async trackPurchaseEvent(
    email: string,
    purchaseData: {
      transactionId: string; // For idempotency - use registrationId or paymentIntentId
      eventId: string;
      eventSlug?: string;
      ticketType?: string;
      quantity: number;
      unitPrice: number; // In dollars (not cents)
      totalRevenue: number; // In dollars (not cents)
      currency: string; // e.g. "USD"
      purchasedAt: string; // ISO 8601 timestamp
    }
  ): Promise<{ success: boolean; error?: string }> {
    if (!isConfigured()) {
      log('info', 'Skipping trackPurchaseEvent - ITERABLE_API_KEY not configured');
      return { success: false, error: 'ITERABLE_API_KEY not configured' };
    }

    if (!email) {
      log('warn', 'Skipping trackPurchaseEvent - email is required');
      return { success: false, error: 'Email is required' };
    }

    if (!purchaseData.transactionId) {
      log('warn', 'Skipping trackPurchaseEvent - transactionId is required for idempotency');
      return { success: false, error: 'Transaction ID is required' };
    }

    try {
      await this.request('POST', '/commerce/trackPurchase', {
        user: { email },
        items: [{
          id: purchaseData.transactionId,
          name: purchaseData.ticketType || 'Event Registration',
          price: purchaseData.unitPrice,
          quantity: purchaseData.quantity,
          dataFields: {
            eventId: purchaseData.eventId,
            eventSlug: purchaseData.eventSlug || null,
          },
        }],
        total: purchaseData.totalRevenue,
        // Use createdAt as Unix timestamp in seconds
        createdAt: Math.floor(new Date(purchaseData.purchasedAt).getTime() / 1000),
        dataFields: {
          transactionId: purchaseData.transactionId,
          eventId: purchaseData.eventId,
          eventSlug: purchaseData.eventSlug || null,
          currency: purchaseData.currency,
          purchasedAt: purchaseData.purchasedAt,
        },
      });

      log('info', `Purchase event tracked: ${email}`, { 
        transactionId: purchaseData.transactionId,
        eventId: purchaseData.eventId,
        totalRevenue: purchaseData.totalRevenue 
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', `Failed to track purchase event: ${email}`, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Orchestrator function to sync a completed registration to Iterable.
   * This is the main entry point called from the registration completion flow.
   * 
   * Sequence:
   * 1. Create or update the user profile
   * 2. If event has iterableListId, add user to the list
   * 3. Track the registration event
   * 4. If paid registration, track the purchase event
   * 
   * All calls are wrapped in try/catch to ensure registration success
   * even if Iterable operations fail.
   * 
   * @param registration - The completed registration record
   * @param event - The event record
   */
  async syncRegistrationToIterable(
    registration: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      language?: string | null;
      registeredAt?: Date | string | null;
      paymentStatus?: string | null;
      amountPaidCents?: number | null;
      paymentIntentId?: string | null;
    },
    event: {
      id: string;
      slug?: string | null;
      marketCode?: string | null;
      iterableListId?: number | null;
    }
  ): Promise<void> {
    // Context for structured logging
    const context = {
      eventId: event.id,
      registrationId: registration.id,
      email: registration.email,
    };

    log('info', 'Starting Iterable sync for registration', context);

    // Skip if Iterable is not configured
    if (!isConfigured()) {
      log('info', 'Skipping Iterable sync - API key not configured', context);
      return;
    }

    const email = registration.email;
    if (!email) {
      log('warn', 'Skipping Iterable sync - no email', context);
      return;
    }

    // Derive locale from language (e.g. "en" -> "en-US", "es" -> "es-US")
    const locale = registration.language === 'es' ? 'es-US' : 'en-US';

    // Step 1: Create or update user profile
    try {
      await this.createOrUpdateUser(email, {
        firstName: registration.firstName,
        lastName: registration.lastName,
        locale,
      });
    } catch (err) {
      log('error', 'Failed during createOrUpdateUser (non-blocking)', { 
        ...context, 
        error: err instanceof Error ? err.message : String(err) 
      });
    }

    // Step 2: Add user to event's Iterable list (if configured)
    if (event.iterableListId && event.iterableListId > 0) {
      try {
        await this.addUserToList(email, event.iterableListId);
      } catch (err) {
        log('error', 'Failed during addUserToList (non-blocking)', { 
          ...context, 
          listId: event.iterableListId,
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    // Step 3: Track registration event
    const registeredAt = registration.registeredAt
      ? (typeof registration.registeredAt === 'string' 
          ? registration.registeredAt 
          : registration.registeredAt.toISOString())
      : new Date().toISOString();

    try {
      await this.trackRegistrationEvent(email, {
        eventId: event.id,
        eventSlug: event.slug || undefined,
        registrationId: registration.id,
        marketCode: event.marketCode || undefined,
        registeredAt,
      });
    } catch (err) {
      log('error', 'Failed during trackRegistrationEvent (non-blocking)', { 
        ...context, 
        error: err instanceof Error ? err.message : String(err) 
      });
    }

    // Step 4: Track purchase event (only for paid registrations)
    const isPaid = registration.paymentStatus === 'paid' && 
                   registration.amountPaidCents && 
                   registration.amountPaidCents > 0;

    if (isPaid) {
      // Use paymentIntentId as transactionId for idempotency, fallback to registrationId
      const transactionId = registration.paymentIntentId || registration.id;
      const amountDollars = registration.amountPaidCents! / 100;

      try {
        await this.trackPurchaseEvent(email, {
          transactionId,
          eventId: event.id,
          eventSlug: event.slug || undefined,
          ticketType: 'Event Registration',
          quantity: 1,
          unitPrice: amountDollars,
          totalRevenue: amountDollars,
          currency: 'USD',
          purchasedAt: registeredAt,
        });
      } catch (err) {
        log('error', 'Failed during trackPurchaseEvent (non-blocking)', { 
          ...context,
          transactionId,
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    log('info', 'Completed Iterable sync for registration', { 
      ...context, 
      isPaid: !!isPaid 
    });
  }
}

export const iterableService = new IterableService();
