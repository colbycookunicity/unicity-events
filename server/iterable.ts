const ITERABLE_API_KEY = process.env.ITERABLE_API_KEY;
const ITERABLE_API_BASE = 'https://api.iterable.com/api';

function getBaseUrl(): string {
  return process.env.REPLIT_DEPLOYMENT_URL 
    || process.env.REPLIT_DEV_DOMAIN 
    || 'https://unicity-events.replit.app';
}

function buildEventUrl(event: any): string {
  const baseUrl = getBaseUrl();
  if (event.slug) {
    return `${baseUrl}/events/${event.slug}`;
  }
  return `${baseUrl}/events/${event.id}`;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SendEmailParams {
  campaignId: number;
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

export class IterableService {
  private async request(method: string, endpoint: string, body?: any): Promise<any> {
    if (!ITERABLE_API_KEY) {
      throw new Error('ITERABLE_API_KEY is not configured');
    }

    const response = await fetch(`${ITERABLE_API_BASE}${endpoint}`, {
      method,
      headers: {
        'Api-Key': ITERABLE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Iterable API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  private async sendEmailInternal(params: SendEmailParams): Promise<EmailResult> {
    const { campaignId, recipientEmail, dataFields, context } = params;

    if (!isConfigured()) {
      log('info', `Skipping ${context} - ITERABLE_API_KEY not configured`);
      return { success: false, error: 'ITERABLE_API_KEY not configured' };
    }

    if (campaignId <= 0) {
      log('warn', `Skipping ${context} - Campaign ID not configured or invalid`);
      return { success: false, error: 'Campaign ID not configured' };
    }

    log('info', `Sending ${context} to ${recipientEmail} (campaign: ${campaignId})`);

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
        eventId: dataFields.eventId || null,
        eventName: dataFields.eventName || null,
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

  async upsertUser(email: string, dataFields: Record<string, any> = {}, userId?: string): Promise<EmailResult> {
    if (!isConfigured()) {
      log('info', `Skipping upsertUser - ITERABLE_API_KEY not configured`);
      return { success: false, error: 'ITERABLE_API_KEY not configured' };
    }

    log('info', `Upserting user: ${email}`);

    try {
      await this.request('POST', '/users/update', {
        email,
        userId,
        dataFields,
      });
      log('info', `Success: User upserted ${email}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', `Failed: upsertUser for ${email}`, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async trackEvent(email: string, eventName: string, dataFields: Record<string, any> = {}): Promise<EmailResult> {
    if (!isConfigured()) {
      log('info', `Skipping trackEvent - ITERABLE_API_KEY not configured`);
      return { success: false, error: 'ITERABLE_API_KEY not configured' };
    }

    log('info', `Tracking event: ${eventName} for ${email}`);

    try {
      await this.request('POST', '/events/track', {
        email,
        eventName,
        dataFields,
        createdAt: Date.now(),
      });
      log('info', `Success: Event tracked ${eventName} for ${email}`);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log('error', `Failed: trackEvent ${eventName} for ${email}`, { error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async sendRegistrationConfirmation(
    email: string,
    registration: any,
    event: any,
    language: string = 'en'
  ): Promise<EmailResult> {
    const campaignId = getCampaignId('ITERABLE_EVENT_CONFIRMATION_CAMPAIGN_ID');
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;

    return this.sendEmailInternal({
      campaignId,
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
      },
    });
  }

  async sendRegistrationUpdate(
    email: string,
    registration: any,
    event: any,
    language: string = 'en'
  ): Promise<EmailResult> {
    const campaignId = getCampaignId('ITERABLE_REGISTRATION_UPDATE_CAMPAIGN_ID');
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;

    return this.sendEmailInternal({
      campaignId,
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
    const campaignId = getCampaignId('ITERABLE_REGISTRATION_CANCELED_CAMPAIGN_ID');
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;

    return this.sendEmailInternal({
      campaignId,
      recipientEmail: email,
      context: 'RegistrationCanceled',
      dataFields: {
        email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        eventId: event.id,
        eventName,
        eventUrl: buildEventUrl(event),
        eventStartDate: event.startDate,
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
    const campaignId = getCampaignId('ITERABLE_REGISTRATION_TRANSFERRED_CAMPAIGN_ID');
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;

    return this.sendEmailInternal({
      campaignId,
      recipientEmail: email,
      context: 'RegistrationTransferred',
      dataFields: {
        email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        eventId: event.id,
        eventName,
        eventUrl: buildEventUrl(event),
        eventStartDate: event.startDate,
        registrationId: registration.id,
        language,
      },
    });
  }

  async sendCheckedInConfirmation(
    email: string,
    registration: any,
    event: any,
    language: string = 'en'
  ): Promise<EmailResult> {
    const campaignId = getCampaignId('ITERABLE_CHECKED_IN_CAMPAIGN_ID');
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;

    return this.sendEmailInternal({
      campaignId,
      recipientEmail: email,
      context: 'CheckedInConfirmation',
      dataFields: {
        email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        eventId: event.id,
        eventName,
        eventUrl: buildEventUrl(event),
        eventStartDate: event.startDate,
        registrationId: registration.id,
        language,
      },
    });
  }

  async sendQualificationGranted(
    email: string,
    registration: any,
    event: any,
    language: string = 'en'
  ): Promise<EmailResult> {
    const campaignId = getCampaignId('ITERABLE_QUALIFICATION_GRANTED_CAMPAIGN_ID');
    const eventName = (language === 'es' && event.nameEs) ? event.nameEs : event.name;

    return this.sendEmailInternal({
      campaignId,
      recipientEmail: email,
      context: 'QualificationGranted',
      dataFields: {
        email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        eventId: event.id,
        eventName,
        eventUrl: buildEventUrl(event),
        eventStartDate: event.startDate,
        registrationId: registration.id,
        language,
      },
    });
  }
}

export const iterableService = new IterableService();
