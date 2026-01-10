/**
 * Market-Based Admin Scoping - Phase 2 Enforcement
 * 
 * This module provides market-based access control for admin routes.
 * Enforcement is gated behind MARKET_SCOPING_ENABLED feature flag.
 * 
 * Phase 1: Completed - Schema and scaffolding added
 * Phase 2: Active - Server-side enforcement for admin routes
 * 
 * IMPORTANT: Public routes (registration, confirmation, etc.) are NOT affected.
 */

import type { Request, Response, NextFunction } from "express";
import type { User, Event, MarketCode } from "@shared/schema";
import { marketCodeEnum } from "@shared/schema";
import { storage } from "./storage";

// Feature flag - default FALSE, all market scoping is disabled
export const MARKET_SCOPING_ENABLED = process.env.MARKET_SCOPING_ENABLED === "true";

// Log feature flag status on startup
console.log(`[MarketScoping] Feature flag MARKET_SCOPING_ENABLED=${MARKET_SCOPING_ENABLED}`);

/**
 * Extended request type with user context including market info
 */
export interface MarketScopedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    assignedMarkets?: string[] | null;
  };
  marketContext?: {
    enabled: boolean;
    userMarkets: string[] | null;
    isGlobalAccess: boolean;
  };
}

/**
 * Check if a market code is valid
 */
export function isValidMarketCode(code: string): code is MarketCode {
  return marketCodeEnum.includes(code as MarketCode);
}

/**
 * Get the list of markets a user has access to
 * Returns null if user has global access (no restrictions)
 */
export function getUserMarkets(user: Pick<User, "role" | "assignedMarkets">): string[] | null {
  // If feature is disabled, everyone has global access
  if (!MARKET_SCOPING_ENABLED) {
    return null;
  }
  
  // Admin role has global access (until role migration to global_admin)
  if (user.role === "admin") {
    return null;
  }
  
  // No assigned markets means global access (legacy behavior)
  if (!user.assignedMarkets || user.assignedMarkets.length === 0) {
    return null;
  }
  
  return user.assignedMarkets;
}

/**
 * Check if a user has access to a specific market
 */
export function userHasMarketAccess(
  user: Pick<User, "role" | "assignedMarkets">,
  marketCode: string | null | undefined
): boolean {
  // If feature is disabled, always allow
  if (!MARKET_SCOPING_ENABLED) {
    return true;
  }
  
  // No market code on event = legacy event, allow access
  if (!marketCode) {
    return true;
  }
  
  const userMarkets = getUserMarkets(user);
  
  // Null means global access
  if (userMarkets === null) {
    return true;
  }
  
  return userMarkets.includes(marketCode);
}

/**
 * Check if a user can access a specific event based on market
 */
export function canUserAccessEventMarket(
  user: Pick<User, "role" | "assignedMarkets">,
  event: Pick<Event, "marketCode">
): boolean {
  return userHasMarketAccess(user, event.marketCode);
}

/**
 * Filter a list of events to only those the user can access
 * Returns all events if feature is disabled or user has global access
 */
export function filterEventsByMarketAccess<T extends Pick<Event, "marketCode">>(
  events: T[],
  user: Pick<User, "role" | "assignedMarkets">
): T[] {
  // If feature is disabled, return all
  if (!MARKET_SCOPING_ENABLED) {
    return events;
  }
  
  const userMarkets = getUserMarkets(user);
  
  // Global access = no filtering
  if (userMarkets === null) {
    return events;
  }
  
  // Filter to events in user's markets (or legacy events with no market)
  return events.filter(event => 
    !event.marketCode || userMarkets.includes(event.marketCode)
  );
}

/**
 * Middleware: Attach market context to request
 * This runs on all requests and adds market info for later use.
 * Does NOT enforce any restrictions.
 */
export function attachMarketContext() {
  return (req: MarketScopedRequest, res: Response, next: NextFunction) => {
    if (req.user) {
      const userMarkets = getUserMarkets(req.user as Pick<User, "role" | "assignedMarkets">);
      req.marketContext = {
        enabled: MARKET_SCOPING_ENABLED,
        userMarkets,
        isGlobalAccess: userMarkets === null,
      };
    }
    next();
  };
}

/**
 * Middleware: Require market access for event-based routes
 * 
 * When MARKET_SCOPING_ENABLED=true:
 * 1. Look up the event by ID (from params)
 * 2. Check if user has access to the event's market
 * 3. Return 403 if access denied
 * 
 * When MARKET_SCOPING_ENABLED=false:
 * - Always passes through (no enforcement)
 * 
 * @param extractEventId - Optional function to extract event ID from request
 */
export function requireMarketAccess(
  extractEventId?: (req: MarketScopedRequest) => string | undefined
) {
  return async (req: MarketScopedRequest, res: Response, next: NextFunction) => {
    // Feature flag disabled = no enforcement
    if (!MARKET_SCOPING_ENABLED) {
      return next();
    }
    
    // No user = no enforcement (should be caught by authenticateToken)
    if (!req.user) {
      return next();
    }
    
    // Get user's markets - null means global access
    const userMarkets = getUserMarkets(req.user as Pick<User, "role" | "assignedMarkets">);
    if (userMarkets === null) {
      return next();
    }
    
    // Get event ID from request
    const eventId = extractEventId?.(req) || req.params.eventId || req.params.id;
    
    if (!eventId) {
      // No event ID = can't check market, allow through
      return next();
    }
    
    // PHASE 2: Look up the event and check market access
    try {
      const event = await storage.getEvent(eventId);
      if (event && event.marketCode && !userMarkets.includes(event.marketCode)) {
        console.log(`[MarketScoping] Access denied: User ${req.user.email} tried to access event ${eventId} (market: ${event.marketCode}) but only has access to: ${userMarkets.join(", ")}`);
        return res.status(403).json({ 
          error: "Access denied to this market",
          code: "MARKET_ACCESS_DENIED"
        });
      }
    } catch (err) {
      console.error(`[MarketScoping] Error checking event access:`, err);
      // On error, allow through (fail open for safety during rollout)
    }
    
    next();
  };
}

/**
 * Middleware: Validate market code in request body
 * Ensures the market code is valid if provided
 * Does NOT block requests - just validates the format
 */
export function validateMarketCode() {
  return (req: MarketScopedRequest, res: Response, next: NextFunction) => {
    const marketCode = req.body?.market_code || req.body?.marketCode;
    
    if (marketCode && !isValidMarketCode(marketCode)) {
      return res.status(400).json({ 
        error: "Invalid market code",
        validCodes: marketCodeEnum,
      });
    }
    
    next();
  };
}

/**
 * Get summary of market scoping status for debugging/admin
 */
export function getMarketScopingStatus() {
  return {
    enabled: MARKET_SCOPING_ENABLED,
    validMarketCodes: [...marketCodeEnum],
    phase: MARKET_SCOPING_ENABLED ? 2 : 1,
    description: MARKET_SCOPING_ENABLED 
      ? "Phase 2 - Server-side enforcement active for admin routes" 
      : "Phase 1 - Scaffolding only, no enforcement",
  };
}

/**
 * Filter registrations based on their event's market code
 * Used by admin routes to limit registrations to user's markets
 */
export async function filterRegistrationsByMarketAccess<T extends { eventId: string }>(
  registrations: T[],
  user: Pick<User, "role" | "assignedMarkets">
): Promise<T[]> {
  if (!MARKET_SCOPING_ENABLED) {
    return registrations;
  }
  
  const userMarkets = getUserMarkets(user);
  if (userMarkets === null) {
    return registrations;
  }
  
  // Get all unique event IDs
  const eventIds = Array.from(new Set(registrations.map(r => r.eventId)));
  
  // Look up events and their markets
  const eventMarkets = new Map<string, string | null>();
  for (const eventId of eventIds) {
    try {
      const event = await storage.getEvent(eventId);
      if (event) {
        eventMarkets.set(eventId, event.marketCode);
      }
    } catch (err) {
      // On error, assume access allowed
      eventMarkets.set(eventId, null);
    }
  }
  
  // Filter registrations to those in user's markets
  return registrations.filter(reg => {
    const marketCode = eventMarkets.get(reg.eventId);
    return !marketCode || userMarkets.includes(marketCode);
  });
}

/**
 * Middleware: Check market access for registration-based routes
 * Looks up the registration, gets its event, and checks market access
 */
export function requireMarketAccessForRegistration() {
  return async (req: MarketScopedRequest, res: Response, next: NextFunction) => {
    if (!MARKET_SCOPING_ENABLED) {
      return next();
    }
    
    if (!req.user) {
      return next();
    }
    
    const userMarkets = getUserMarkets(req.user as Pick<User, "role" | "assignedMarkets">);
    if (userMarkets === null) {
      return next();
    }
    
    const registrationId = req.params.id || req.params.registrationId;
    if (!registrationId) {
      return next();
    }
    
    try {
      const registration = await storage.getRegistration(registrationId);
      if (!registration) {
        return next(); // Let the route handler return 404
      }
      
      const event = await storage.getEvent(registration.eventId);
      if (event && event.marketCode && !userMarkets.includes(event.marketCode)) {
        console.log(`[MarketScoping] Registration access denied: User ${req.user.email} tried to access registration ${registrationId} in market ${event.marketCode}`);
        return res.status(403).json({
          error: "Access denied to this market",
          code: "MARKET_ACCESS_DENIED"
        });
      }
    } catch (err) {
      console.error(`[MarketScoping] Error checking registration access:`, err);
    }
    
    next();
  };
}
