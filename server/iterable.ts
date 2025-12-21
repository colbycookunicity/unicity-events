
import { apiRequest } from './iterableClient';

// Iterable API configuration
const ITERABLE_API_KEY = process.env.ITERABLE_API_KEY;
const ITERABLE_API_BASE = 'https://api.iterable.com/api';

interface IterableUser {
  email: string;
  dataFields?: Record<string, any>;
  userId?: string;
}

interface IterableEmailRequest {
  campaignId: number;
  recipientEmail: string;
  dataFields?: Record<string, any>;
}

export class IterableService {
  private async request(method: string, endpoint: string, body?: any) {
    const response = await fetch(`${ITERABLE_API_BASE}${endpoint}`, {
      method,
      headers: {
        'Api-Key': ITERABLE_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Iterable API error: ${error}`);
    }

    return response.json();
  }

  // Update or create user in Iterable
  async upsertUser(user: IterableUser) {
    return this.request('POST', '/users/update', {
      email: user.email,
      userId: user.userId,
      dataFields: user.dataFields,
    });
  }

  // Send transactional email
  async sendEmail(campaignId: number, email: string, dataFields: Record<string, any> = {}) {
    return this.request('POST', '/email/target', {
      campaignId,
      recipientEmail: email,
      dataFields,
    });
  }

  // Track custom event
  async trackEvent(email: string, eventName: string, dataFields: Record<string, any> = {}) {
    return this.request('POST', '/events/track', {
      email,
      eventName,
      dataFields,
      createdAt: Date.now(),
    });
  }

  // Email Templates (Campaign IDs to be configured in Iterable UI)
  async sendOTPEmail(email: string, code: string, language: string = 'en') {
    const campaignId = language === 'es' 
      ? parseInt(process.env.ITERABLE_OTP_CAMPAIGN_ID_ES || '0')
      : parseInt(process.env.ITERABLE_OTP_CAMPAIGN_ID_EN || '0');
    
    return this.sendEmail(campaignId, email, {
      otpCode: code,
      language,
    });
  }

  async sendQualificationEmail(email: string, eventName: string, eventDetails: any, language: string = 'en') {
    const campaignId = language === 'es'
      ? parseInt(process.env.ITERABLE_QUALIFIED_CAMPAIGN_ID_ES || '0')
      : parseInt(process.env.ITERABLE_QUALIFIED_CAMPAIGN_ID_EN || '0');
    
    return this.sendEmail(campaignId, email, {
      eventName,
      ...eventDetails,
      language,
    });
  }

  async sendRegistrationConfirmation(email: string, registration: any, event: any, language: string = 'en') {
    const campaignId = language === 'es'
      ? parseInt(process.env.ITERABLE_REG_CONFIRM_CAMPAIGN_ID_ES || '0')
      : parseInt(process.env.ITERABLE_REG_CONFIRM_CAMPAIGN_ID_EN || '0');
    
    return this.sendEmail(campaignId, email, {
      firstName: registration.firstName,
      lastName: registration.lastName,
      eventName: language === 'es' && event.nameEs ? event.nameEs : event.name,
      eventLocation: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      registrationId: registration.id,
      language,
    });
  }

  async sendRegistrationUpdate(email: string, registration: any, event: any, language: string = 'en') {
    const campaignId = language === 'es'
      ? parseInt(process.env.ITERABLE_REG_UPDATE_CAMPAIGN_ID_ES || '0')
      : parseInt(process.env.ITERABLE_REG_UPDATE_CAMPAIGN_ID_EN || '0');
    
    return this.sendEmail(campaignId, email, {
      firstName: registration.firstName,
      eventName: language === 'es' && event.nameEs ? event.nameEs : event.name,
      language,
    });
  }

  async sendPreEventReminder(email: string, registration: any, event: any, daysUntil: number, language: string = 'en') {
    const campaignId = language === 'es'
      ? parseInt(process.env.ITERABLE_REMINDER_CAMPAIGN_ID_ES || '0')
      : parseInt(process.env.ITERABLE_REMINDER_CAMPAIGN_ID_EN || '0');
    
    return this.sendEmail(campaignId, email, {
      firstName: registration.firstName,
      eventName: language === 'es' && event.nameEs ? event.nameEs : event.name,
      eventLocation: event.location,
      startDate: event.startDate,
      daysUntil,
      language,
    });
  }
}

export const iterableService = new IterableService();
