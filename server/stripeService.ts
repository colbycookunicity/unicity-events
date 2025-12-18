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

  async handlePaymentSuccess(sessionId: string) {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (session.payment_status === 'paid' && session.metadata?.guestId) {
      await storage.updateGuest(session.metadata.guestId, {
        paymentStatus: 'paid',
        paymentIntentId: session.payment_intent as string,
        paidAt: new Date(),
      });
      return true;
    }
    return false;
  }
}

export const stripeService = new StripeService();
