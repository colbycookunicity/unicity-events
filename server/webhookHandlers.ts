import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { stripeService } from './stripeService';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    // Get Stripe client to verify and parse the event
    const stripe = await getUncachableStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      } catch (err) {
        console.error('Webhook signature verification failed:', err);
        throw err;
      }
    } else {
      // If no webhook secret, parse the event directly (less secure, but functional)
      event = JSON.parse(payload.toString());
    }

    // Handle custom payment events
    const result = await stripeService.handleWebhookEvent(event);
    if (result.handled) {
      console.log(`Custom webhook handler processed: ${result.type}`);
    }

    // Also pass to Stripe sync for other events
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature, uuid);
  }
}
