import { getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

export class StripeService {
  async createCheckoutSessionForGuest(
    guestId: string,
    guestName: string,
    amount: number,
    eventName: string,
    successUrl: string,
    cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();
    
    return await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: {
            name: `Guest Buy-in: ${guestName}`,
            description: `Event: ${eventName}`,
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        guestId,
        type: 'guest_buyin',
      },
    });
  }

  async createCheckoutSessionForRegistration(
    registrationId: string,
    attendeeName: string,
    amount: number,
    eventName: string,
    successUrl: string,
    cancelUrl: string
  ) {
    const stripe = await getUncachableStripeClient();
    
    return await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: {
            name: `Event Registration: ${attendeeName}`,
            description: `Event: ${eventName}`,
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        registrationId,
        type: 'registration_payment',
      },
    });
  }

  async handlePaymentSuccess(sessionId: string) {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid') {
      const paymentIntentId = session.payment_intent as string;
      const paidAt = new Date();

      // Handle guest buy-in payment
      if (session.metadata?.type === 'guest_buyin' && session.metadata?.guestId) {
        const guest = await storage.getGuest(session.metadata.guestId);
        // Idempotency check - don't update if already paid
        if (guest && guest.paymentStatus !== 'paid') {
          await storage.updateGuest(session.metadata.guestId, {
            paymentStatus: 'paid',
            paymentIntentId,
            paidAt,
          });
        }
        return { success: true, type: 'guest', id: session.metadata.guestId };
      }

      // Handle registration payment
      if (session.metadata?.type === 'registration_payment' && session.metadata?.registrationId) {
        const registration = await storage.getRegistration(session.metadata.registrationId);
        // Idempotency check - don't update if already paid
        if (registration && registration.paymentStatus !== 'paid') {
          await storage.updateRegistration(session.metadata.registrationId, {
            paymentStatus: 'paid',
            paymentIntentId,
            paidAt,
          });
        }
        return { success: true, type: 'registration', id: session.metadata.registrationId };
      }
    }
    return { success: false };
  }

  async handleWebhookEvent(event: { type: string; data: { object: unknown } }) {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as {
        id: string;
        payment_status: string;
        payment_intent: string;
        metadata?: { type?: string; guestId?: string; registrationId?: string };
      };

      if (session.payment_status === 'paid') {
        const paymentIntentId = session.payment_intent;
        const paidAt = new Date();

        // Handle guest buy-in payment
        if (session.metadata?.type === 'guest_buyin' && session.metadata?.guestId) {
          const guest = await storage.getGuest(session.metadata.guestId);
          if (guest && guest.paymentStatus !== 'paid') {
            await storage.updateGuest(session.metadata.guestId, {
              paymentStatus: 'paid',
              paymentIntentId,
              paidAt,
            });
            console.log(`Webhook: Guest ${session.metadata.guestId} payment confirmed`);
          }
          return { handled: true, type: 'guest_buyin' };
        }

        // Handle registration payment
        if (session.metadata?.type === 'registration_payment' && session.metadata?.registrationId) {
          const registration = await storage.getRegistration(session.metadata.registrationId);
          if (registration && registration.paymentStatus !== 'paid') {
            await storage.updateRegistration(session.metadata.registrationId, {
              paymentStatus: 'paid',
              paymentIntentId,
              paidAt,
            });
            console.log(`Webhook: Registration ${session.metadata.registrationId} payment confirmed`);
          }
          return { handled: true, type: 'registration_payment' };
        }
      }
    }

    return { handled: false };
  }
}

export const stripeService = new StripeService();
