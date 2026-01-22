import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, insertRegistrationSchema, insertGuestSchema, insertFlightSchema, insertReimbursementSchema, insertSwagItemSchema, insertSwagAssignmentSchema, insertQualifiedRegistrantSchema, insertUserSchema, insertPrinterSchema, insertPrintLogSchema, insertBadgeTemplateSchema, userRoleEnum, deriveRegistrationFlags, deriveRegistrationMode, type RegistrationMode, generateCheckInToken, parseCheckInQRPayload, buildCheckInQRPayload } from "@shared/schema";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { iterableService, validateIterableConfig } from "./iterable";
import { filterEventsByMarketAccess, filterRegistrationsByMarketAccess, requireMarketAccess, requireMarketAccessForRegistration, MARKET_SCOPING_ENABLED, getMarketScopingStatus } from "./marketScoping";

const HYDRA_API_BASE = process.env.NODE_ENV === "production" 
  ? "https://hydra.unicity.net/v6"
  : "https://hydraqa.unicity.net/v6-test";

// Fallback admin emails for initial setup (used only if no users exist in database)
const FALLBACK_ADMIN_EMAILS = [
  "colby.cook@unicity.com",
  "biani.gonzalez@unicity.com",
  "ashley.milliken@unicity.com",
  "william.hall@unicity.com",
  "carolina.martinez@unicity.com",
];

// Check if email is an authorized admin user (database-driven with fallback)
// Allows all user roles: admin, event_manager, marketing, readonly
async function isAdminEmail(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  
  // First check: Does user exist in database with ANY admin role?
  const user = await storage.getUserByEmail(normalized);
  if (user) {
    // Any role is valid for admin panel access (admin, event_manager, marketing, readonly)
    return true;
  }
  
  // Fallback for bootstrapping: Check hardcoded list (only for primary admins, no aliases)
  // Plus-sign aliases cannot bootstrap - they must be added via Admin UI
  if (normalized.includes('+')) {
    return false;
  }
  return FALLBACK_ADMIN_EMAILS.includes(normalized);
}

interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; role: string };
}

function generateToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const session = await storage.getAuthSession(token);
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await storage.getUser(session.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  req.user = { id: user.id, email: user.email, role: user.role };
  next();
}

function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// Helper function to extract phone from custom formData fields
// When events use custom phone-type fields (id-based), the value goes to formData instead of phone column
// This extracts phone values from formData and returns them for saving to the canonical phone column
function extractPhoneFromFormData(
  formData: Record<string, any> | undefined,
  formFields: any[] | undefined | null
): string | undefined {
  if (!formData || !formFields || !Array.isArray(formFields)) return undefined;
  
  // Find phone-type fields in the form template (both named and id-based)
  for (const field of formFields) {
    const fieldType = field.type?.toLowerCase();
    const fieldName = field.name || field.id;
    
    // Match phone/tel type fields that are NOT the standard "phone" field (those go directly to phone column)
    if ((fieldType === 'phone' || fieldType === 'tel') && fieldName && fieldName !== 'phone') {
      const value = formData[fieldName];
      if (value && typeof value === 'string' && value.trim()) {
        console.log(`[DataFlow] Extracted phone from custom field "${fieldName}":`, value);
        return value.trim();
      }
    }
  }
  return undefined;
}

// Helper function to build acknowledgmentDetails for checkbox fields
// Stores IP address and timestamp for each checkbox acknowledgment
function buildAcknowledgmentDetails(
  formData: Record<string, any> | undefined,
  formFields: any[] | undefined | null,
  clientIp: string
): Record<string, { ip: string; timestamp: string }> | null {
  if (!formData || !formFields || !Array.isArray(formFields)) return null;
  
  const acknowledgmentDetails: Record<string, { ip: string; timestamp: string }> = {};
  const timestamp = new Date().toISOString();
  
  // Find all checkbox fields that are checked (value is true)
  for (const field of formFields) {
    const fieldType = field.type?.toLowerCase();
    const fieldName = field.name || field.id;
    
    if (fieldType === 'checkbox' && fieldName) {
      const value = formData[fieldName];
      // Only track if the checkbox is actually checked
      if (value === true) {
        acknowledgmentDetails[fieldName] = {
          ip: clientIp,
          timestamp: timestamp,
        };
      }
    }
  }
  
  // Return null if no checkboxes were found
  return Object.keys(acknowledgmentDetails).length > 0 ? acknowledgmentDetails : null;
}

// Helper function to get default sections for each page type
function getDefaultSectionsForPageType(pageType: string, event: { name: string; nameEs?: string | null; heroImageUrl?: string | null }) {
  const defaultSections: Array<{ type: string; content: Record<string, unknown> }> = [];
  
  switch (pageType) {
    case 'login':
      defaultSections.push({
        type: 'hero',
        content: {
          headline: 'Verify Your Identity',
          headlineEs: 'Verifica Tu Identidad',
          subheadline: 'Enter your email to receive a verification code',
          subheadlineEs: 'Ingresa tu correo electrónico para recibir un código de verificación',
          backgroundImage: event.heroImageUrl || '',
        }
      });
      break;
      
    case 'registration':
      defaultSections.push({
        type: 'hero',
        content: {
          headline: event.name,
          headlineEs: event.nameEs || event.name,
          subheadline: 'Complete your registration',
          subheadlineEs: 'Completa tu registro',
          backgroundImage: event.heroImageUrl || '',
        }
      });
      defaultSections.push({
        type: 'form',
        content: {
          submitButtonLabel: 'Register',
          submitButtonLabelEs: 'Registrar',
        }
      });
      break;
      
    case 'thank_you':
      defaultSections.push({
        type: 'thank_you',
        content: {
          headline: 'Registration Complete!',
          headlineEs: 'Registro Completado!',
          message: 'Thank you for registering. You will receive a confirmation email shortly.',
          messageEs: 'Gracias por registrarte. Recibirás un correo de confirmación en breve.',
          showConfetti: true,
        }
      });
      break;
  }
  
  return defaultSections;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Validate Iterable configuration on startup
  const iterableValidation = validateIterableConfig();
  if (!iterableValidation.valid) {
    console.warn('[Startup] Iterable configuration issues detected - some emails may fail');
  }
  
  // Auth Routes
  app.post("/api/auth/otp/generate", async (req, res) => {
    try {
      const { email: rawEmail } = req.body;
      if (!rawEmail) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // Normalize email to prevent case/whitespace mismatches
      const email = rawEmail.toLowerCase().trim();

      // Only allow whitelisted admin emails to log in (exact match, no plus aliases)
      if (!(await isAdminEmail(email))) {
        return res.status(403).json({ error: "Access denied. This login is for authorized administrators only." });
      }

      // For development, simulate OTP
      if (process.env.NODE_ENV !== "production") {
        const devCode = "123456";
        await storage.createOtpSession({
          email,
          validationId: `dev-${Date.now()}`,
          verified: false,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        });
        console.log(`DEV MODE: OTP code for ${email} is ${devCode}`);
        return res.json({ success: true, message: "OTP sent successfully", devCode });
      }

      console.log("Calling Hydra API for admin OTP:", `${HYDRA_API_BASE}/otp/generate`, "email:", email);
      const response = await fetch(`${HYDRA_API_BASE}/otp/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const responseText = await response.text();
      console.log("Hydra admin OTP generate response status:", response.status, "body:", responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Failed to parse Hydra response as JSON:", responseText);
        return res.status(500).json({ error: "Invalid response from verification service" });
      }
      
      if (!response.ok || !data.success) {
        console.log("Hydra admin OTP generate failed:", data);
        return res.status(400).json({ error: data.data?.message || "Failed to send OTP" });
      }

      await storage.createOtpSession({
        email,
        validationId: data.data.validation_id,
        verified: false,
        expiresAt: new Date(data.data.expires_at),
      });

      res.json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
      console.error("OTP generate error:", error);
      res.status(500).json({ error: "Failed to generate OTP" });
    }
  });

  app.post("/api/auth/otp/validate", async (req, res) => {
    try {
      const { email: rawEmail, code } = req.body;
      if (!rawEmail || !code) {
        return res.status(400).json({ error: "Email and code are required" });
      }
      
      // Normalize email to match how it was stored
      const email = rawEmail.toLowerCase().trim();

      // Verify there's a pending session
      const session = await storage.getOtpSession(email);
      if (!session) {
        return res.status(400).json({ error: "No pending verification. Please request a new code." });
      }

      if (session.verified) {
        return res.status(400).json({ error: "Code already used. Please request a new code." });
      }

      // For development, accept test code
      let isValid = false;
      let customerId: number | undefined;
      let bearerToken: string | undefined;

      if (process.env.NODE_ENV !== "production" && code === "123456") {
        isValid = true;
      } else {
        // Validate with Hydra (works in all environments)
        // IMPORTANT: Use the email from the stored session to ensure exact match with what Hydra received
        const sessionEmail = session.email;
        console.log("Admin Hydra OTP validation - sessionEmail:", sessionEmail, "inputEmail:", email, "validation_id:", session.validationId);
        const response = await fetch(`${HYDRA_API_BASE}/otp/magic-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email: sessionEmail, 
            code,
            validation_id: session.validationId 
          }),
        });

        const data = await response.json();
        console.log("Admin Hydra OTP validation response:", response.status, JSON.stringify(data, null, 2));
        
        if (response.ok && data.success) {
          isValid = true;
          customerId = data.customer?.id;
          bearerToken = data.token;
        } else {
          // Return the actual error message from Hydra
          const errorMessage = data.message || data.data?.message || "Invalid verification code";
          return res.status(400).json({ error: errorMessage });
        }
      }

      if (!isValid) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Mark session as verified
      await storage.updateOtpSession(session.id, {
        verified: true,
        verifiedAt: new Date(),
        customerId,
        bearerToken,
      });

      let user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Only fallback admin emails can bootstrap - all others must be created via Admin UI
        const isFallbackAdmin = await isAdminEmail(email);
        if (!isFallbackAdmin) {
          return res.status(403).json({ 
            error: "Account not found. Please contact an administrator to create your account." 
          });
        }
        // Bootstrap fallback admin user
        user = await storage.createUser({
          email: email.toLowerCase().trim(),
          name: email.split("@")[0],
          role: "admin",
          customerId,
          signupSource: "ADMIN_UI",
        });
        console.log(`Bootstrap: Created fallback admin user for ${email}`);
      }

      const token = generateToken();
      await storage.createAuthSession({
        token,
        userId: user.id,
        email: user.email,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      res.json({ success: true, token, user });
    } catch (error) {
      console.error("OTP validate error:", error);
      res.status(500).json({ error: "Failed to validate OTP" });
    }
  });

  app.get("/api/auth/me", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const user = await storage.getUser(req.user!.id);
    res.json({ user });
  });

  app.post("/api/auth/logout", async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    if (token) {
      await storage.deleteAuthSession(token);
    }
    res.json({ success: true });
  });

  // Check registration session status (for page refresh persistence)
  app.get("/api/register/session-status", async (req, res) => {
    try {
      const { email, eventId } = req.query;
      if (!email || !eventId || typeof email !== "string" || typeof eventId !== "string") {
        return res.json({ verified: false });
      }

      // Resolve eventId to UUID (could be slug from URL)
      const event = await storage.getEventByIdOrSlug(eventId);
      if (!event) {
        return res.json({ verified: false });
      }
      const resolvedEventId = event.id;

      const session = await storage.getOtpSession(email);
      if (!session || !session.verified) {
        return res.json({ verified: false });
      }

      // Check session hasn't expired (30-minute window)
      const verifiedAt = session.verifiedAt ? new Date(session.verifiedAt) : null;
      if (!verifiedAt || (Date.now() - verifiedAt.getTime()) > 30 * 60 * 1000) {
        return res.json({ verified: false });
      }

      // Validate event scope - compare resolved UUIDs
      const sessionEventId = (session.customerData as any)?.registrationEventId;
      if (!sessionEventId || sessionEventId !== resolvedEventId) {
        return res.json({ verified: false });
      }

      // Return verified status with email
      res.json({ verified: true, email: session.email });
    } catch (error) {
      console.error("Session status error:", error);
      res.json({ verified: false });
    }
  });

  // Public Registration OTP (for distributor verification - no admin whitelist)
  app.post("/api/register/otp/generate", async (req, res) => {
    try {
      const { email, eventId } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      if (!eventId) {
        return res.status(400).json({ error: "Event ID is required for registration verification" });
      }

      // Verify event exists and is published
      const event = await storage.getEventByIdOrSlug(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (event.status !== "published") {
        return res.status(400).json({ error: "Registration is not open for this event" });
      }
      
      // Check if user is qualified for this event (or already registered)
      // registrationMode is the sole source of truth - default to open_verified for safety
      const mode: RegistrationMode = (event.registrationMode as RegistrationMode) || "open_verified";
      const requiresQualification = mode === "qualified_verified";
      if (requiresQualification) {
        const normalizedEmail = email.toLowerCase().trim();
        const qualifier = await storage.getQualifiedRegistrantByEmail(event.id, normalizedEmail);
        const existingRegistration = await storage.getRegistrationByEmail(event.id, normalizedEmail);
        
        if (!qualifier && !existingRegistration) {
          return res.status(403).json({ 
            error: `We couldn't find your email "${normalizedEmail}" in the list of qualified attendees for this event. If you believe this is an error, please contact americasevent@unicity.com for assistance.` 
          });
        }
      }

      // For development, simulate OTP
      if (process.env.NODE_ENV !== "production") {
        const devCode = "123456";
        await storage.createOtpSession({
          email,
          validationId: `dev-reg-${Date.now()}`,
          verified: false,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          // Store the resolved event.id (UUID) to scope session to this specific event
          customerData: { registrationEventId: event.id },
        });
        console.log(`DEV MODE: Registration OTP for ${email} is ${devCode}`);
        return res.json({ success: true, message: "Verification code sent", devCode });
      }

      // Production: Call Hydra API
      console.log("Calling Hydra API for registration OTP:", `${HYDRA_API_BASE}/otp/generate`, "email:", email);
      const response = await fetch(`${HYDRA_API_BASE}/otp/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const responseText = await response.text();
      console.log("Hydra OTP generate response status:", response.status, "body:", responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Failed to parse Hydra response as JSON:", responseText);
        return res.status(500).json({ error: "Invalid response from verification service" });
      }
      
      if (!response.ok || !data.success) {
        console.log("Hydra OTP generate failed:", data);
        return res.status(400).json({ error: data.data?.message || "Failed to send verification code" });
      }

      await storage.createOtpSession({
        email,
        validationId: data.data.validation_id,
        verified: false,
        expiresAt: new Date(data.data.expires_at),
        // Store the resolved event.id (UUID) to scope session to this specific event
        customerData: { registrationEventId: event.id },
      });

      res.json({ success: true, message: "Verification code sent" });
    } catch (error) {
      console.error("Registration OTP generate error:", error);
      res.status(500).json({ error: "Failed to send verification code. Please try again." });
    }
  });

  // Generate OTP using Distributor ID (SECURITY: email is never exposed to client)
  // This endpoint looks up the email internally and sends OTP without returning it
  app.post("/api/register/otp/generate-by-id", async (req, res) => {
    try {
      const { distributorId, eventId } = req.body;
      if (!distributorId) {
        return res.status(400).json({ error: "Distributor ID is required" });
      }
      if (!eventId) {
        return res.status(400).json({ error: "Event ID is required for registration verification" });
      }

      // Verify event exists and is published
      const event = await storage.getEventByIdOrSlug(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (event.status !== "published") {
        return res.status(400).json({ error: "Registration is not open for this event" });
      }

      // Look up qualifier by distributorId to get their email
      const qualifier = await storage.getQualifiedRegistrantByUnicityId(event.id, distributorId.trim());
      if (!qualifier) {
        // Also check if there's an existing registration with this distributorId
        const existingReg = await storage.getRegistrationByUnicityId(event.id, distributorId.trim());
        if (!existingReg) {
          return res.status(403).json({ 
            error: "We couldn't find your Distributor ID in the list of qualified attendees for this event. If you believe this is an error, please contact americasevent@unicity.com for assistance." 
          });
        }
        // Use existing registration's email
        var email = existingReg.email;
      } else {
        var email = qualifier.email;
      }

      if (!email) {
        return res.status(400).json({ error: "No email address on file for this Distributor ID." });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // For development, simulate OTP
      if (process.env.NODE_ENV !== "production") {
        const devCode = "123456";
        const sessionToken = crypto.randomUUID();
        await storage.createOtpSession({
          email: normalizedEmail,
          validationId: `dev-reg-${Date.now()}`,
          verified: false,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          // Store distributorId + session token in session
          customerData: { 
            registrationEventId: event.id, 
            verifiedDistributorId: distributorId.trim(),
            sessionToken, // Used for validation without exposing email
          },
        });
        console.log(`DEV MODE: Registration OTP for ${normalizedEmail} (distributorId: ${distributorId}) is ${devCode}`);
        return res.json({ success: true, message: "Verification code sent", devCode, sessionToken });
      }

      // Production: Call Hydra API
      console.log("Calling Hydra API for registration OTP (by distributorId):", `${HYDRA_API_BASE}/otp/generate`, "email:", normalizedEmail);
      const response = await fetch(`${HYDRA_API_BASE}/otp/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const responseText = await response.text();
      console.log("Hydra OTP generate response status:", response.status, "body:", responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Failed to parse Hydra response as JSON:", responseText);
        return res.status(500).json({ error: "Invalid response from verification service" });
      }
      
      if (!response.ok || !data.success) {
        console.log("Hydra OTP generate failed:", data);
        return res.status(400).json({ error: data.data?.message || "Failed to send verification code" });
      }

      // Generate a secure session token that frontend can use for validation
      // This allows validation without needing to expose email to client
      const sessionToken = crypto.randomUUID();
      
      await storage.createOtpSession({
        email: normalizedEmail,
        validationId: data.data.validation_id,
        verified: false,
        expiresAt: new Date(data.data.expires_at),
        // Store distributorId + session token in session
        customerData: { 
          registrationEventId: event.id, 
          verifiedDistributorId: distributorId.trim(),
          sessionToken, // Used for validation without exposing email
        },
      });

      // Return session token so frontend can validate without knowing the email
      res.json({ success: true, message: "Verification code sent", sessionToken });
    } catch (error) {
      console.error("Registration OTP generate-by-id error:", error);
      res.status(500).json({ error: "Failed to send verification code. Please try again." });
    }
  });

  app.post("/api/register/otp/validate", async (req, res) => {
    try {
      const { email, code, eventId, sessionToken } = req.body;
      
      // Accept either email OR sessionToken for lookup
      if (!code) {
        return res.status(400).json({ error: "Verification code is required" });
      }
      if (!email && !sessionToken) {
        return res.status(400).json({ error: "Email or session token is required" });
      }

      // Resolve eventId to actual event.id (could be slug)
      let resolvedEventId = eventId;
      if (eventId) {
        const event = await storage.getEventByIdOrSlug(eventId);
        if (event) {
          resolvedEventId = event.id;
        }
      }

      // Find session by email OR sessionToken
      let session;
      let lookupEmail = email;
      
      if (sessionToken && !email) {
        // SECURITY: Lookup by sessionToken when email is not provided (distributorId flow)
        // Find session where customerData.sessionToken matches
        session = await storage.getOtpSessionBySessionToken(sessionToken, resolvedEventId);
        if (session) {
          lookupEmail = session.email; // Get email from session for Hydra validation
        }
      } else {
        // Standard flow: lookup by email
        session = resolvedEventId 
          ? await storage.getOtpSessionForRegistration(email, resolvedEventId)
          : await storage.getOtpSession(email);
      }
      
      if (!session) {
        return res.status(400).json({ error: "No pending verification. Please request a new code." });
      }

      if (session.verified) {
        return res.status(400).json({ error: "Code already used. Please request a new code." });
      }

      let isValid = false;
      let customerId: number | undefined;
      let bearerToken: string | undefined;
      let customerData: any = null;
      let verifiedByHydra = false;

      // For development only, accept test code "123456"
      if (process.env.NODE_ENV !== "production" && code === "123456") {
        isValid = true;
        verifiedByHydra = true; // Dev mode counts as Hydra verified
        // Mock customer data for development
        customerData = {
          id: { unicity: "12345678" },
          humanName: { firstName: "Test", lastName: "User" },
          email: lookupEmail,
        };
      } else {
        // Validate with Hydra (works in all environments)
        // Include the validation_id from the OTP session
        // Use lookupEmail which could come from session (distributorId flow) or request (email flow)
        console.log("Validating OTP with Hydra for email:", lookupEmail, "code length:", code?.length, "validation_id:", session.validationId);
        const response = await fetch(`${HYDRA_API_BASE}/otp/magic-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email: lookupEmail, 
            code,
            validation_id: session.validationId 
          }),
        });

        const data = await response.json();
        console.log("Hydra OTP validation response status:", response.status);
        console.log("Hydra OTP validation response:", JSON.stringify(data, null, 2));
        
        if (response.ok && data.success) {
          isValid = true;
          verifiedByHydra = true;
          customerId = data.customer?.id;
          bearerToken = data.token;
          customerData = data.customer;
        } else {
          console.log("Hydra validation failed - response.ok:", response.ok, "data.success:", data.success);
          const errorMessage = data.message || data.data?.message || "Invalid verification code";
          
          // Special case: "Customer not found" means OTP was valid but no customer account exists
          // For qualified registrants or open registration events, we should still allow them to proceed
          if (errorMessage.toLowerCase().includes("customer not found") && eventId) {
            console.log("Customer not found in Hydra, checking event mode for eventId:", eventId);
            const event = await storage.getEventByIdOrSlug(eventId);
            if (event) {
              // Check if event is open registration (doesn't require qualification)
              // Default to open if registrationMode is null (legacy events) or explicitly open
              const registrationMode = event.registrationMode || "open_verified";
              const isOpenRegistration = registrationMode === "open_verified" || registrationMode === "open_anonymous";
              
              if (isOpenRegistration) {
                // Open registration - allow anyone with valid OTP
                console.log("Open registration event, allowing verification for:", lookupEmail);
                isValid = true;
                customerData = {
                  id: { unicity: null },
                  humanName: { firstName: "", lastName: "" },
                  email: lookupEmail,
                };
              } else {
                // Qualified registration - check if on the qualified list
                const qualifiedRegistrant = await storage.getQualifiedRegistrantByEmail(event.id, lookupEmail);
                if (qualifiedRegistrant) {
                  console.log("User is in qualified list, allowing verification:", qualifiedRegistrant);
                  isValid = true;
                  customerData = {
                    id: { unicity: qualifiedRegistrant.unicityId },
                    humanName: { 
                      firstName: qualifiedRegistrant.firstName || "", 
                      lastName: qualifiedRegistrant.lastName || "" 
                    },
                    email: lookupEmail,
                  };
                } else {
                  return res.status(400).json({ error: errorMessage });
                }
              }
            } else {
              return res.status(400).json({ error: errorMessage });
            }
          } else {
            return res.status(400).json({ error: errorMessage });
          }
        }
      }

      if (!isValid) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Generate a secure redirect token for single-use verification transfer
      const redirectToken = crypto.randomUUID();
      const redirectTokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Mark session as verified and store redirect token + customer data
      // IMPORTANT: Merge with existing customerData to preserve registrationEventId
      const existingCustomerData = (session.customerData as Record<string, any>) || {};
      const mergedCustomerData = {
        ...existingCustomerData,
        ...customerData,
        // Ensure registrationEventId is always preserved
        registrationEventId: existingCustomerData.registrationEventId || resolvedEventId,
      };
      
      await storage.updateOtpSession(session.id, {
        verified: true,
        verifiedAt: new Date(),
        customerId,
        bearerToken,
        redirectToken,
        redirectTokenExpiresAt,
        redirectTokenConsumed: false,
        customerData: mergedCustomerData,
      });

      // Check qualification if event requires it
      let isQualified = true;
      let qualificationMessage = "";
      
      if (eventId) {
        const event = await storage.getEventByIdOrSlug(eventId);
        // registrationMode is the sole source of truth
        const eventRequiresQualification = event?.registrationMode === "qualified_verified";
        if (event && eventRequiresQualification) {
          // Check if user already has a registration (pre-qualified list)
          const existingReg = await storage.getRegistrationByEmail(event.id, email);
          if (existingReg) {
            isQualified = true;
            qualificationMessage = "You are pre-qualified for this event.";
          } else {
            // Check if user is in the qualified registrants list
            const qualifiedRegistrant = await storage.getQualifiedRegistrantByEmail(event.id, email);
            if (qualifiedRegistrant) {
              // User is on the list - check if qualification period applies
              if (event.qualificationStartDate && event.qualificationEndDate) {
                const now = new Date();
                const start = new Date(event.qualificationStartDate);
                const end = new Date(event.qualificationEndDate);
                if (now < start) {
                  isQualified = false;
                  qualificationMessage = "Registration period has not started yet.";
                } else if (now > end) {
                  isQualified = false;
                  qualificationMessage = "Registration period has ended.";
                } else {
                  isQualified = true;
                  qualificationMessage = "You are on the qualified registrants list.";
                }
              } else {
                isQualified = true;
                qualificationMessage = "You are on the qualified registrants list.";
              }
            } else {
              // Not in qualified list
              isQualified = false;
              qualificationMessage = "Your email is not on the qualified attendees list for this event. Please contact support if you believe this is an error.";
            }
          }
        }
      }

      // Try to get qualifier data to supplement Hydra data
      let qualifierData: any = null;
      if (eventId) {
        const event = await storage.getEventByIdOrSlug(eventId);
        if (event) {
          qualifierData = await storage.getQualifiedRegistrantByEmail(event.id, email);
        }
      }

      // Extract profile data from customer response, with qualifier fallback
      // Also include verifiedDistributorId from session if it was set during OTP generation
      const verifiedDistributorId = (session.customerData as any)?.verifiedDistributorId || "";
      const profile = {
        unicityId: verifiedDistributorId || customerData?.id?.unicity || customerData?.unicity_id || qualifierData?.unicityId || "",
        email: email,
        firstName: customerData?.humanName?.firstName || customerData?.first_name || qualifierData?.firstName || "",
        lastName: customerData?.humanName?.lastName || customerData?.last_name || qualifierData?.lastName || "",
        phone: customerData?.phone || customerData?.mobilePhone || "",
        customerId: customerId,
      };

      console.log("Profile extracted:", profile);

      res.json({ 
        success: true, 
        verified: true,
        verifiedByHydra,
        profile,
        isQualified,
        qualificationMessage,
        redirectToken,
      });
    } catch (error: any) {
      console.error("Registration OTP validate error:", error);
      console.error("Error stack:", error?.stack);
      res.status(500).json({ error: "Failed to validate code", details: error?.message });
    }
  });

  // Get qualifying events for email (called after OTP verification)
  app.post("/api/register/qualifying-events", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const qualifyingEvents = await storage.getQualifyingEventsForEmail(email);
      
      // Format the response
      const events = qualifyingEvents.map(({ event, registration, qualifiedRegistrant }) => ({
        id: event.id,
        slug: event.slug,
        name: event.name,
        nameEs: event.nameEs,
        startDate: event.startDate,
        endDate: event.endDate,
        location: event.location,
        hasRegistration: !!registration,
        registrationStatus: registration?.status || null,
        registrationId: registration?.id || null,
        isQualified: true,
        qualifiedRegistrantId: qualifiedRegistrant?.id || null,
      }));

      res.json({ success: true, events });
    } catch (error) {
      console.error("Get qualifying events error:", error);
      res.status(500).json({ error: "Failed to get qualifying events" });
    }
  });

  // Consume redirect token to get verified profile (single-use)
  app.post("/api/register/otp/session/consume", async (req, res) => {
    try {
      const { token, email, eventId } = req.body;
      if (!token || !email) {
        return res.status(400).json({ error: "Token and email are required" });
      }

      // Find session by redirect token
      const session = await storage.getOtpSessionByRedirectToken(token);
      if (!session) {
        return res.status(400).json({ error: "Invalid or expired token" });
      }

      // Validate email matches
      if (session.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(400).json({ error: "Token does not match email" });
      }

      // Check if already consumed
      if (session.redirectTokenConsumed) {
        return res.status(400).json({ error: "Token already used" });
      }

      // Check if expired
      if (session.redirectTokenExpiresAt && new Date() > new Date(session.redirectTokenExpiresAt)) {
        return res.status(400).json({ error: "Token expired" });
      }

      // Mark token as consumed
      await storage.updateOtpSession(session.id, {
        redirectTokenConsumed: true,
      });

      // Get customer data
      const customerData = session.customerData as any || {};

      // Try to get qualifier data to supplement Hydra data
      let qualifierData: any = null;
      if (eventId) {
        const event = await storage.getEventByIdOrSlug(eventId);
        if (event) {
          qualifierData = await storage.getQualifiedRegistrantByEmail(event.id, email);
        }
      }

      // Extract profile data
      const profile = {
        unicityId: customerData?.id?.unicity || customerData?.unicity_id || qualifierData?.unicityId || "",
        email: email,
        firstName: customerData?.humanName?.firstName || customerData?.first_name || qualifierData?.firstName || "",
        lastName: customerData?.humanName?.lastName || customerData?.last_name || qualifierData?.lastName || "",
        phone: customerData?.phone || customerData?.mobilePhone || "",
        customerId: session.customerId,
      };

      res.json({
        success: true,
        verified: true,
        profile,
      });
    } catch (error) {
      console.error("Consume token error:", error);
      res.status(500).json({ error: "Failed to consume token" });
    }
  });

  // Get existing registration for verified user (called after OTP verification)
  // Security: ALWAYS requires a valid, verified OTP session for the email
  // For open_anonymous mode, this endpoint returns exists: false (no existing registration lookup)
  // since open_anonymous mode allows multiple registrations per email
  // Note: This endpoint can be called multiple times within the session window for the same email+event
  app.post("/api/register/existing", async (req, res) => {
    try {
      const { email, eventId } = req.body;
      if (!email || !eventId) {
        return res.status(400).json({ error: "Email and eventId are required" });
      }

      // Get the event by ID or slug to resolve the actual event ID
      const event = await storage.getEventByIdOrSlug(eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Check registration mode - open_anonymous events don't need existing registration lookup
      // (they allow multiple registrations per email)
      const registrationMode: RegistrationMode = (event.registrationMode as RegistrationMode) || "open_verified";
      const isAnonymousMode = registrationMode === "open_anonymous";
      
      // For open_anonymous mode, just return that no existing registration applies
      // This is not an error - it's expected behavior for anonymous events
      if (isAnonymousMode) {
        return res.json({ 
          success: true, 
          exists: false,
          reason: "open_anonymous mode allows multiple registrations per email"
        });
      }
      
      // For verified modes (qualified_verified, open_verified), require OTP session
      // Security check: Verify there's an active verified OTP session scoped to this event
      const session = await storage.getOtpSessionForRegistration(email, event.id);
      if (!session || !session.verified) {
        return res.status(403).json({ 
          error: "Email not verified. Please complete OTP verification first.",
          code: "VERIFICATION_REQUIRED"
        });
      }

      // Check session hasn't expired (verified sessions are valid for 30 minutes for security)
      const verifiedAt = session.verifiedAt ? new Date(session.verifiedAt) : null;
      if (!verifiedAt || (Date.now() - verifiedAt.getTime()) > 30 * 60 * 1000) {
        return res.status(403).json({ 
          error: "Session expired. Please verify again.",
          code: "SESSION_EXPIRED"
        });
      }

      // Get existing registration with full details
      const registration = await storage.getRegistrationWithDetailsByEmail(event.id, email);
      
      if (!registration) {
        return res.json({ success: true, exists: false });
      }

      // Log data hydration for debugging
      console.log(`[DataFlow] /api/register/existing - Loading registration ${registration.id}:`, {
        email: registration.email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        unicityId: registration.unicityId,
        phone: registration.phone,
        source: "database"
      });

      // NOTE: Removed Hydra auto-sync for phone. The database is the single source of truth.
      // Admin updates in the DB should ALWAYS take precedence over Hydra data.
      // If a phone is empty, it stays empty until the user or admin explicitly sets it.
      const registrationPhone = registration.phone;

      // Return registration data (exclude sensitive nested details like reimbursements)
      res.json({
        success: true,
        exists: true,
        registration: {
          id: registration.id,
          eventId: registration.eventId,
          email: registration.email,
          firstName: registration.firstName,
          lastName: registration.lastName,
          unicityId: registration.unicityId,
          phone: registrationPhone,
          gender: registration.gender,
          dateOfBirth: registration.dateOfBirth,
          passportNumber: registration.passportNumber,
          passportCountry: registration.passportCountry,
          passportExpiration: registration.passportExpiration,
          emergencyContact: registration.emergencyContact,
          emergencyContactPhone: registration.emergencyContactPhone,
          shirtSize: registration.shirtSize,
          pantSize: registration.pantSize,
          dietaryRestrictions: registration.dietaryRestrictions,
          adaAccommodations: registration.adaAccommodations,
          roomType: registration.roomType,
          termsAccepted: registration.termsAccepted,
          formData: registration.formData,
          language: registration.language,
          lastModified: registration.lastModified,
        },
      });
    } catch (error) {
      console.error("Get existing registration error:", error);
      res.status(500).json({ error: "Failed to get existing registration" });
    }
  });

  // Market scoping status (for debugging/admin)
  app.get("/api/admin/market-scoping-status", authenticateToken, requireRole("admin"), async (req, res) => {
    res.json(getMarketScopingStatus());
  });

  // Dashboard Stats
  app.get("/api/admin/stats", authenticateToken, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  // Reports API
  app.get("/api/admin/reports/registration-trends", authenticateToken, async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const trends = await storage.getRegistrationTrends(days);
      res.json(trends);
    } catch (error) {
      console.error("Registration trends error:", error);
      res.status(500).json({ error: "Failed to get registration trends" });
    }
  });

  app.get("/api/admin/reports/revenue", authenticateToken, async (req, res) => {
    try {
      const stats = await storage.getRevenueStats();
      res.json(stats);
    } catch (error) {
      console.error("Revenue stats error:", error);
      res.status(500).json({ error: "Failed to get revenue stats" });
    }
  });

  app.get("/api/admin/reports/check-in-rates", authenticateToken, async (req, res) => {
    try {
      const rates = await storage.getCheckInRates();
      res.json(rates);
    } catch (error) {
      console.error("Check-in rates error:", error);
      res.status(500).json({ error: "Failed to get check-in rates" });
    }
  });

  app.get("/api/admin/reports/export/:type", authenticateToken, async (req, res) => {
    try {
      const { type } = req.params;
      const { eventId } = req.query;
      
      if (!['registrations', 'guests', 'events'].includes(type)) {
        return res.status(400).json({ error: "Invalid export type" });
      }
      
      const data = await storage.getExportData(type as any, eventId as string);
      
      if (data.length === 0) {
        return res.status(404).json({ error: "No data to export" });
      }

      // Convert to CSV
      const headers = Object.keys(data[0]);
      const csvRows = [
        headers.join(','),
        ...data.map((row: any) => 
          headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            if (val instanceof Date) {
              return val.toISOString();
            }
            return String(val);
          }).join(',')
        )
      ];
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-export-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvRows.join('\n'));
    } catch (error) {
      console.error("Export error:", error);
      res.status(500).json({ error: "Failed to export data" });
    }
  });

  // User Management Routes (Admin only)
  app.get("/api/admin/users", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Get users error:", error);
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  app.post("/api/admin/users", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid user data", details: parsed.error.errors });
      }

      // Check if user already exists
      const existing = await storage.getUserByEmail(parsed.data.email);
      if (existing) {
        return res.status(400).json({ error: "A user with this email already exists" });
      }

      // Validate role
      if (parsed.data.role && !userRoleEnum.includes(parsed.data.role as any)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      // Set signupSource to ADMIN_UI for users created via the admin interface
      const userData = {
        ...parsed.data,
        signupSource: "ADMIN_UI" as const,
      };

      const user = await storage.createUser(userData);
      res.status(201).json(user);
    } catch (error) {
      console.error("Create user error:", error);
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      
      // Prevent self-demotion from admin
      if (id === req.user.id && req.body.role && req.body.role !== "admin") {
        return res.status(400).json({ error: "You cannot change your own role" });
      }

      // Validate role if provided
      if (req.body.role && !userRoleEnum.includes(req.body.role)) {
        return res.status(400).json({ error: "Invalid role" });
      }

      const user = await storage.updateUser(id, req.body);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      
      // Prevent self-deletion
      if (id === req.user.id) {
        return res.status(400).json({ error: "You cannot delete your own account" });
      }

      const success = await storage.deleteUser(id);
      if (!success) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Form Templates Routes
  app.get("/api/form-templates", async (req, res) => {
    try {
      const templates = await storage.getFormTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Get form templates error:", error);
      res.status(500).json({ error: "Failed to get form templates" });
    }
  });

  app.get("/api/form-templates/:id", async (req, res) => {
    try {
      const template = await storage.getFormTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Form template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Get form template error:", error);
      res.status(500).json({ error: "Failed to get form template" });
    }
  });

  // Events Routes
  app.get("/api/events", authenticateToken as any, async (req: AuthenticatedRequest, res) => {
    try {
      const user = req.user!;
      const fullUser = await storage.getUser(user.id);
      
      // Event managers only see their own events
      if (user.role === "event_manager") {
        const events = await storage.getEventsForManager(user.id);
        // Apply market filtering for event managers with market restrictions
        const filteredEvents = fullUser 
          ? filterEventsByMarketAccess(events, fullUser)
          : events;
        res.json(filteredEvents);
      } else {
        // Admins, marketing, readonly see all events (subject to market restrictions)
        const events = await storage.getEvents();
        // Apply market filtering based on user's assigned markets
        const filteredEvents = fullUser 
          ? filterEventsByMarketAccess(events, fullUser)
          : events;
        res.json(filteredEvents);
      }
    } catch (error) {
      console.error("Get events error:", error);
      res.status(500).json({ error: "Failed to get events" });
    }
  });

  app.get("/api/events/recent", async (req, res) => {
    try {
      const events = await storage.getRecentEvents(5);
      res.json(events);
    } catch (error) {
      console.error("Get recent events error:", error);
      res.status(500).json({ error: "Failed to get recent events" });
    }
  });

  // Public events list for registration discovery (no auth required)
  app.get("/api/events/public", async (req, res) => {
    try {
      const publicEvents = await storage.getPublicEvents();
      // Return limited public-safe event data
      res.json(publicEvents.map(event => ({
        id: event.id,
        slug: event.slug,
        name: event.name,
        nameEs: event.nameEs,
        description: event.description,
        descriptionEs: event.descriptionEs,
        location: event.location,
        startDate: event.startDate,
        endDate: event.endDate,
      })));
    } catch (error) {
      console.error("Get public events error:", error);
      res.status(500).json({ error: "Failed to get events" });
    }
  });

  // =====================================================
  // ATTENDEE PORTAL ENDPOINTS (separate from admin auth)
  // =====================================================

  // Attendee OTP generate (for /my-events login)
  app.post("/api/attendee/otp/generate", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if user has any qualifying events or existing registrations
      const qualifyingEvents = await storage.getQualifyingEventsForEmail(normalizedEmail);
      if (qualifyingEvents.length === 0) {
        return res.status(403).json({ 
          error: "No events found for this email. You must be qualified for at least one event to access the attendee portal." 
        });
      }

      // For development, simulate OTP
      if (process.env.NODE_ENV !== "production") {
        const devCode = "123456";
        await storage.createOtpSession({
          email: normalizedEmail,
          validationId: `dev-attendee-${Date.now()}`,
          verified: false,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
          customerData: { attendeePortal: true },
        });
        console.log(`[DEV] Attendee OTP for ${normalizedEmail}: ${devCode}`);
        return res.json({ success: true, message: "Verification code sent (dev mode: 123456)" });
      }

      // Production: Send OTP via Hydra
      const response = await fetch(`${HYDRA_API_BASE}/otp/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error("Hydra OTP generate error:", data);
        return res.status(500).json({ error: data.message || "Failed to send verification code" });
      }

      await storage.createOtpSession({
        email: normalizedEmail,
        validationId: data.validation_id,
        verified: false,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        customerData: { attendeePortal: true },
      });

      res.json({ success: true, message: "Verification code sent to your email" });
    } catch (error) {
      console.error("Attendee OTP generate error:", error);
      res.status(500).json({ error: "Failed to send verification code" });
    }
  });

  // Attendee OTP validate (creates attendee session, not admin session)
  app.post("/api/attendee/otp/validate", async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: "Email and code are required" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      // Security: Fetch only attendee portal sessions (isolated from admin/registration flows)
      const session = await storage.getOtpSessionForAttendeePortal(normalizedEmail);
      
      if (!session) {
        return res.status(400).json({ error: "No pending verification. Please request a new code from the attendee portal." });
      }
      if (session.verified) {
        return res.status(400).json({ error: "Code already used. Please request a new code." });
      }

      let isValid = false;

      // Dev mode: accept 123456
      if (process.env.NODE_ENV !== "production" && code === "123456") {
        isValid = true;
      } else {
        // Validate with Hydra
        const response = await fetch(`${HYDRA_API_BASE}/otp/magic-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email: normalizedEmail, 
            code,
            validation_id: session.validationId 
          }),
        });
        const data = await response.json();
        if (response.ok && data.success) {
          isValid = true;
        } else if (data.message?.toLowerCase().includes("customer not found")) {
          // OTP was valid but no Hydra account - still allow for qualified users
          isValid = true;
        }
      }

      if (!isValid) {
        return res.status(400).json({ error: "Invalid verification code" });
      }

      // Delete the OTP session to prevent reuse (security: one-time use)
      await storage.deleteOtpSession(session.id);

      // Create attendee session (NOT admin session)
      const attendeeSession = await storage.createAttendeeSession(normalizedEmail);

      res.json({ 
        success: true, 
        token: attendeeSession.token,
        email: normalizedEmail,
        expiresAt: attendeeSession.expiresAt,
      });
    } catch (error) {
      console.error("Attendee OTP validate error:", error);
      res.status(500).json({ error: "Failed to verify code" });
    }
  });

  // Get attendee's qualifying events (requires attendee token)
  app.get("/api/attendee/events", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ error: "Attendee token required" });
      }

      const session = await storage.getAttendeeSessionByToken(token);
      if (!session) {
        return res.status(401).json({ error: "Invalid or expired attendee session" });
      }

      const qualifyingEvents = await storage.getQualifyingEventsForEmail(session.email);

      // Transform to client-friendly format
      const events = qualifyingEvents.map(({ event, registration, qualifiedRegistrant }) => ({
        id: event.id,
        slug: event.slug,
        name: event.name,
        nameEs: event.nameEs,
        location: event.location,
        startDate: event.startDate,
        endDate: event.endDate,
        heroImageUrl: event.heroImageUrl,
        registrationStatus: registration ? "registered" : "not_registered",
        registrationId: registration?.id || null,
        lastUpdated: registration?.lastModified || null,
        qualifiedSince: qualifiedRegistrant?.createdAt || null,
      }));

      res.json({ email: session.email, events });
    } catch (error) {
      console.error("Get attendee events error:", error);
      res.status(500).json({ error: "Failed to get events" });
    }
  });

  // Get attendee's registration for a specific event (requires attendee token)
  // This is used by returning users to load their existing registration data
  app.get("/api/attendee/registration/:eventIdOrSlug", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ error: "Attendee token required" });
      }

      const session = await storage.getAttendeeSessionByToken(token);
      if (!session) {
        return res.status(401).json({ error: "Invalid or expired attendee session" });
      }

      // Get the event by ID or slug
      const event = await storage.getEventByIdOrSlug(req.params.eventIdOrSlug);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Get existing registration with full details
      const registration = await storage.getRegistrationWithDetailsByEmail(event.id, session.email);
      
      if (!registration) {
        return res.json({ success: true, exists: false });
      }

      // Log data hydration for debugging
      console.log(`[DataFlow] /api/attendee/registration - Loading registration ${registration.id}:`, {
        email: registration.email,
        firstName: registration.firstName,
        lastName: registration.lastName,
        unicityId: registration.unicityId,
        phone: registration.phone,
        source: "database"
      });

      // Return registration data
      res.json({
        success: true,
        exists: true,
        registration: {
          id: registration.id,
          eventId: registration.eventId,
          email: registration.email,
          firstName: registration.firstName,
          lastName: registration.lastName,
          unicityId: registration.unicityId,
          phone: registration.phone,
          gender: registration.gender,
          dateOfBirth: registration.dateOfBirth,
          passportNumber: registration.passportNumber,
          passportCountry: registration.passportCountry,
          passportExpiration: registration.passportExpiration,
          emergencyContact: registration.emergencyContact,
          emergencyContactPhone: registration.emergencyContactPhone,
          shirtSize: registration.shirtSize,
          pantSize: registration.pantSize,
          dietaryRestrictions: registration.dietaryRestrictions,
          adaAccommodations: registration.adaAccommodations,
          roomType: registration.roomType,
          termsAccepted: registration.termsAccepted,
          formData: registration.formData,
          status: registration.status,
        },
      });
    } catch (error) {
      console.error("Get attendee registration error:", error);
      res.status(500).json({ error: "Failed to get registration" });
    }
  });

  // Attendee logout
  app.post("/api/attendee/logout", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(" ")[1];
      if (token) {
        await storage.deleteAttendeeSession(token);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Attendee logout error:", error);
      res.status(500).json({ error: "Failed to logout" });
    }
  });

  // =====================================================
  // END ATTENDEE PORTAL ENDPOINTS
  // =====================================================

  app.get("/api/events/:id", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      console.error("Get event error:", error);
      res.status(500).json({ error: "Failed to get event" });
    }
  });

  // Public event endpoint for registration page (supports both ID and slug)
  app.get("/api/events/:idOrSlug/public", async (req, res) => {
    try {
      const event = await storage.getEventByIdOrSlug(req.params.idOrSlug);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (event.status !== "published") {
        return res.status(404).json({ error: "Event not available" });
      }
      
      // Get form fields: use template if set, otherwise use event's custom formFields
      let effectiveFormFields = event.formFields;
      if ((event as any).formTemplateId) {
        const template = await storage.getFormTemplate((event as any).formTemplateId);
        if (template) {
          effectiveFormFields = template.fields;
        }
      }
      
      // registrationMode is the sole source of truth - default to open_verified for safety
      const registrationMode: RegistrationMode = (event.registrationMode as RegistrationMode) || "open_verified";
      const requiresQualification = registrationMode === "qualified_verified";
      const requiresVerification = registrationMode === "qualified_verified" || registrationMode === "open_verified";
      
      // Return public-safe event data including registration and qualification settings
      res.json({
        id: event.id,
        slug: event.slug,
        name: event.name,
        nameEs: event.nameEs,
        description: event.description,
        descriptionEs: event.descriptionEs,
        location: event.location,
        startDate: event.startDate,
        endDate: event.endDate,
        capacity: event.capacity,
        buyInPrice: event.buyInPrice,
        formFields: effectiveFormFields,
        registrationLayout: event.registrationLayout,
        registrationMode,
        requiresVerification,
        requiresQualification,
        qualificationStartDate: event.qualificationStartDate,
        qualificationEndDate: event.qualificationEndDate,
        defaultLanguage: event.defaultLanguage,
      });
    } catch (error) {
      console.error("Get public event error:", error);
      res.status(500).json({ error: "Failed to get event" });
    }
  });

  app.post("/api/events", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      // Validate date range: end date must be >= start date
      if (req.body.startDate && req.body.endDate) {
        const startDate = new Date(req.body.startDate);
        const endDate = new Date(req.body.endDate);
        if (endDate < startDate) {
          return res.status(400).json({ error: "End date must be equal to or later than start date" });
        }
      }
      
      // Normalize slug: empty/whitespace -> null
      const normalizedSlug = req.body.slug?.trim() || null;
      
      // Normalize formTemplateId: empty/whitespace -> null
      const normalizedFormTemplateId = req.body.formTemplateId?.trim() || null;
      
      // Handle guest policy and buy-in price validation
      const guestPolicy = req.body.guestPolicy || "not_allowed";
      let buyInPrice = req.body.buyInPrice;
      
      // Normalize buyInPrice based on guest policy
      if (guestPolicy === "not_allowed" || guestPolicy === "allowed_free") {
        buyInPrice = null; // Clear price if guests not allowed or free
      } else if (guestPolicy === "allowed_paid" && (!buyInPrice || buyInPrice <= 0)) {
        return res.status(400).json({ error: "Buy-in price is required and must be greater than 0 when guests are paid" });
      }
      
      // registrationMode is the source of truth, but derive from requiresQualification if not provided
      // This maintains backward compatibility with the admin form which sends requiresQualification
      let registrationMode: RegistrationMode;
      if (req.body.registrationMode) {
        registrationMode = req.body.registrationMode;
      } else if (req.body.requiresQualification) {
        // Legacy form field: requiresQualification=true -> qualified_verified
        registrationMode = "qualified_verified";
      } else {
        registrationMode = "open_verified";
      }
      // Derive legacy flags from mode for database consistency (schema still has these columns)
      const requiresQualification = registrationMode === "qualified_verified";
      const requiresVerification = registrationMode === "qualified_verified" || registrationMode === "open_verified";
      
      const eventData: Record<string, unknown> = {
        ...req.body,
        slug: normalizedSlug,
        formTemplateId: normalizedFormTemplateId,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        qualificationStartDate: req.body.qualificationStartDate ? new Date(req.body.qualificationStartDate) : undefined,
        qualificationEndDate: req.body.qualificationEndDate ? new Date(req.body.qualificationEndDate) : undefined,
        // Provide defaults for CMS fields that have database defaults but are required by Zod
        registrationLayout: req.body.registrationLayout || "standard",
        registrationMode,
        requiresQualification,
        requiresVerification,
        guestPolicy,
        createdBy: req.user!.id,
      };
      
      // Only include buyInPrice if it has a value (otherwise omit to allow DB null)
      if (buyInPrice !== null && buyInPrice !== undefined) {
        eventData.buyInPrice = buyInPrice;
      } else {
        delete eventData.buyInPrice;
      }
      
      // Verify formTemplateId exists if provided
      if (normalizedFormTemplateId) {
        const template = await storage.getFormTemplate(normalizedFormTemplateId);
        if (!template) {
          return res.status(400).json({ error: "Selected form template does not exist" });
        }
      }
      
      const data = insertEventSchema.parse(eventData);
      const event = await storage.createEvent(data);
      
      // Auto-create required event pages (login, registration, thank_you) - idempotent
      const pageTypes = ['login', 'registration', 'thank_you'];
      for (const pType of pageTypes) {
        try {
          // Check if page already exists (idempotent)
          const existingPage = await storage.getEventPageByEventId(event.id, pType);
          if (existingPage) {
            continue; // Page already exists, skip creation
          }
          
          const page = await storage.createEventPage({
            eventId: event.id,
            pageType: pType,
            status: 'draft'
          });
          
          // Create default sections for each page
          const defaultSections = getDefaultSectionsForPageType(pType, event);
          for (let i = 0; i < defaultSections.length; i++) {
            await storage.createEventPageSection({
              pageId: page.id,
              type: defaultSections[i].type,
              position: i,
              isEnabled: true,
              content: defaultSections[i].content
            });
          }
        } catch (pageError) {
          // Log but don't fail event creation if page creation fails (handles race conditions)
          console.error(`Failed to create ${pType} page for event ${event.id}:`, pageError);
        }
      }
      
      res.status(201).json(event);
    } catch (error) {
      console.error("Create event error:", error);
      if (error instanceof z.ZodError) {
        console.error("Zod validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ error: "Invalid event data", details: error.errors });
      }
      // Log detailed error for debugging
      if (error instanceof Error) {
        console.error("Event creation failed:", error.message, error.stack);
      }
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.patch("/api/events/:id", authenticateToken, requireRole("admin", "event_manager"), requireMarketAccess() as any, async (req, res) => {
    try {
      console.log("[DEBUG] PATCH /api/events - received formTemplateId:", req.body.formTemplateId, "typeof:", typeof req.body.formTemplateId);
      
      // Normalize slug: empty/whitespace -> null
      const normalizedSlug = req.body.slug !== undefined 
        ? (req.body.slug?.trim() || null) 
        : undefined;
      
      // Normalize formTemplateId: empty/whitespace -> null
      const normalizedFormTemplateId = req.body.formTemplateId !== undefined
        ? (req.body.formTemplateId?.trim() || null)
        : undefined;
      
      console.log("[DEBUG] PATCH /api/events - normalizedFormTemplateId:", normalizedFormTemplateId);
      
      // Build updates object carefully, excluding undefined values
      const updates: Record<string, unknown> = {};
      
      if (req.body.name !== undefined) updates.name = req.body.name;
      if (req.body.nameEs !== undefined) updates.nameEs = req.body.nameEs;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.descriptionEs !== undefined) updates.descriptionEs = req.body.descriptionEs;
      if (req.body.location !== undefined) updates.location = req.body.location;
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.capacity !== undefined) updates.capacity = req.body.capacity ? parseInt(String(req.body.capacity), 10) : null;
      if (req.body.guestPolicy !== undefined) updates.guestPolicy = req.body.guestPolicy;
      // Handle buyInPrice based on guestPolicy
      if (req.body.guestPolicy !== undefined || req.body.buyInPrice !== undefined) {
        const guestPolicy = req.body.guestPolicy;
        if (guestPolicy === "not_allowed" || guestPolicy === "allowed_free") {
          updates.buyInPrice = null;
        } else if (req.body.buyInPrice !== undefined) {
          updates.buyInPrice = req.body.buyInPrice ? Math.round(parseFloat(String(req.body.buyInPrice))) : null;
        }
      }
      // Handle registrationMode - it's the sole source of truth
      // But also support requiresQualification from the admin form for backward compatibility
      if (req.body.registrationMode !== undefined) {
        updates.registrationMode = req.body.registrationMode;
        // Sync legacy fields from the new mode (for database consistency)
        const requiresQualification = req.body.registrationMode === "qualified_verified";
        const requiresVerification = req.body.registrationMode === "qualified_verified" || req.body.registrationMode === "open_verified";
        updates.requiresQualification = requiresQualification;
        updates.requiresVerification = requiresVerification;
      } else if (req.body.requiresQualification !== undefined) {
        // Legacy form field: derive registrationMode from requiresQualification boolean
        const registrationMode: RegistrationMode = req.body.requiresQualification ? "qualified_verified" : "open_verified";
        updates.registrationMode = registrationMode;
        updates.requiresQualification = req.body.requiresQualification;
        updates.requiresVerification = true; // Both modes require verification
      }
      if (req.body.registrationLayout !== undefined) updates.registrationLayout = req.body.registrationLayout;
      if (req.body.formFields !== undefined) updates.formFields = req.body.formFields;
      if (normalizedFormTemplateId !== undefined) {
        updates.formTemplateId = normalizedFormTemplateId;
        console.log("[DEBUG] PATCH /api/events - adding formTemplateId to updates:", normalizedFormTemplateId);
      }
      if (normalizedSlug !== undefined) updates.slug = normalizedSlug;
      if (req.body.defaultLanguage !== undefined) updates.defaultLanguage = req.body.defaultLanguage;
      
      // Thank you page customization
      if (req.body.thankYouHeadline !== undefined) updates.thankYouHeadline = req.body.thankYouHeadline || null;
      if (req.body.thankYouHeadlineEs !== undefined) updates.thankYouHeadlineEs = req.body.thankYouHeadlineEs || null;
      if (req.body.thankYouMessage !== undefined) updates.thankYouMessage = req.body.thankYouMessage || null;
      if (req.body.thankYouMessageEs !== undefined) updates.thankYouMessageEs = req.body.thankYouMessageEs || null;
      if (req.body.thankYouQrInstructions !== undefined) updates.thankYouQrInstructions = req.body.thankYouQrInstructions || null;
      if (req.body.thankYouQrInstructionsEs !== undefined) updates.thankYouQrInstructionsEs = req.body.thankYouQrInstructionsEs || null;
      
      // Iterable campaigns (per-event email campaign configuration)
      if (req.body.iterableCampaigns !== undefined) {
        updates.iterableCampaigns = req.body.iterableCampaigns;
      }
      
      // Handle dates
      if (req.body.startDate) updates.startDate = new Date(req.body.startDate);
      if (req.body.endDate) updates.endDate = new Date(req.body.endDate);
      if (req.body.qualificationStartDate) updates.qualificationStartDate = new Date(req.body.qualificationStartDate);
      if (req.body.qualificationEndDate) updates.qualificationEndDate = new Date(req.body.qualificationEndDate);
      
      // Validate date range: end date must be >= start date
      // Need to consider both provided dates and existing event dates
      if (updates.startDate || updates.endDate) {
        const existingEvent = await storage.getEvent(req.params.id);
        if (existingEvent) {
          const effectiveStartDate = updates.startDate as Date || existingEvent.startDate;
          const effectiveEndDate = updates.endDate as Date || existingEvent.endDate;
          if (effectiveStartDate && effectiveEndDate && effectiveEndDate < effectiveStartDate) {
            return res.status(400).json({ error: "End date must be equal to or later than start date" });
          }
        }
      }
      
      console.log("[DEBUG] PATCH /api/events - final updates object:", JSON.stringify(updates, null, 2));
      const event = await storage.updateEvent(req.params.id, updates);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      console.log("[DEBUG] PATCH /api/events - returned event formTemplateId:", (event as any).formTemplateId);
      res.json(event);
    } catch (error: any) {
      console.error("Update event error:", error);
      const message = error?.message || "Failed to update event";
      res.status(500).json({ error: "Failed to update event", details: message });
    }
  });

  app.delete("/api/events/:id", authenticateToken, requireRole("admin"), requireMarketAccess() as any, async (req, res) => {
    try {
      await storage.deleteEvent(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete event error:", error);
      res.status(500).json({ error: "Failed to delete event" });
    }
  });

  // Iterable Campaigns API (for admin UI campaign selection)
  app.get("/api/iterable/campaigns", authenticateToken, requireRole("admin", "event_manager"), async (req, res) => {
    try {
      const campaigns = await iterableService.getCampaigns();
      res.json(campaigns);
    } catch (error) {
      console.error("Failed to fetch Iterable campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns from Iterable" });
    }
  });

  /**
   * ONE-TIME BACKFILL: Sync qualified registrants to Iterable
   * 
   * This endpoint creates/updates Iterable user profiles for CSV-uploaded qualifiers.
   * 
   * IMPORTANT SAFETY GUARANTEES:
   * - ZERO emails will be sent (uses /users/update only, not /email/target)
   * - ZERO campaigns are triggered (no campaign IDs referenced)
   * - ZERO events tracked (no /events/track calls)
   * - Idempotent - safe to run multiple times
   * 
   * Query params:
   * - eventId (optional): Limit backfill to specific event
   * - dryRun=true (optional): Preview what would be synced without executing
   * 
   * Admin-only. Requires explicit confirmation header.
   */
  app.post("/api/admin/iterable/backfill-qualifiers", authenticateToken, requireRole("admin"), async (req: AuthenticatedRequest, res) => {
    try {
      const eventId = req.query.eventId as string | undefined;
      const dryRun = req.query.dryRun === 'true';
      
      // Safety: Require explicit confirmation header
      const confirmHeader = req.headers['x-confirm-backfill'];
      if (confirmHeader !== 'CONFIRMED' && !dryRun) {
        return res.status(400).json({
          error: "Safety check failed",
          message: "This is a one-time backfill operation. To proceed, include header: X-Confirm-Backfill: CONFIRMED",
          hint: "Use dryRun=true to preview without executing"
        });
      }

      console.log(`[BACKFILL] Initiated by user ${req.user!.email}`, {
        eventId: eventId || 'ALL',
        dryRun,
        timestamp: new Date().toISOString(),
      });

      // Get qualified registrants
      let qualifiers: any[];
      if (eventId) {
        qualifiers = await storage.getQualifiedRegistrantsByEvent(eventId);
      } else {
        qualifiers = await storage.getAllQualifiedRegistrants();
      }

      console.log(`[BACKFILL] Found ${qualifiers.length} qualifiers to process`);

      if (dryRun) {
        return res.json({
          dryRun: true,
          message: "Dry run - no changes made",
          totalQualifiers: qualifiers.length,
          sampleEmails: qualifiers.slice(0, 10).map((q: any) => q.email),
          eventId: eventId || 'ALL',
        });
      }

      // Execute backfill
      const results = await iterableService.backfillQualifiersToIterable(qualifiers);

      console.log(`[BACKFILL] Completed`, results);

      res.json({
        success: true,
        message: "Backfill completed",
        ...results,
      });
    } catch (error) {
      console.error("[BACKFILL] Failed:", error);
      res.status(500).json({ 
        error: "Backfill failed", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Event Manager Assignments Routes
  app.get("/api/events/:id/managers", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const assignments = await storage.getEventManagerAssignments(req.params.id);
      res.json(assignments);
    } catch (error) {
      console.error("Get event managers error:", error);
      res.status(500).json({ error: "Failed to get event managers" });
    }
  });

  app.post("/api/events/:id/managers", authenticateToken, requireRole("admin"), async (req: AuthenticatedRequest, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      
      // Verify the user exists and is an event manager
      const userToAssign = await storage.getUser(userId);
      if (!userToAssign) {
        return res.status(404).json({ error: "User not found" });
      }
      if (userToAssign.role !== "event_manager") {
        return res.status(400).json({ error: "User must have event_manager role" });
      }
      
      const assignment = await storage.assignEventManager(req.params.id, userId, req.user!.id);
      res.status(201).json(assignment);
    } catch (error: any) {
      console.error("Assign event manager error:", error);
      // Handle unique constraint violation
      if (error?.code === "23505") {
        return res.status(409).json({ error: "User is already assigned to this event" });
      }
      res.status(500).json({ error: "Failed to assign event manager" });
    }
  });

  app.delete("/api/events/:id/managers/:userId", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      const success = await storage.removeEventManager(req.params.id, req.params.userId);
      if (!success) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Remove event manager error:", error);
      res.status(500).json({ error: "Failed to remove event manager" });
    }
  });

  // Public Event Registration (supports both ID and slug)
  app.post("/api/events/:eventIdOrSlug/register", async (req, res) => {
    // Debug: Log incoming phone value
    console.log('[DataFlow] POST /register - req.body.phone:', JSON.stringify({
      phone: req.body.phone,
      phoneType: typeof req.body.phone,
      hasPhone: 'phone' in req.body,
    }));
    
    try {
      const event = await storage.getEventByIdOrSlug(req.params.eventIdOrSlug);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (event.status !== "published") {
        return res.status(400).json({ error: "Registration is not open for this event" });
      }

      const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
      
      // UPSERT pattern: Check for existing registration and update if found
      // Normalize email to lowercase for consistent lookups
      const normalizedEmail = req.body.email?.toLowerCase().trim();
      if (!normalizedEmail) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // For events requiring verification (qualified_verified or open_verified), 
      // verify that the user has a valid OTP session before allowing registration
      // registrationMode is the sole source of truth - default to open_verified for safety
      const registrationMode: RegistrationMode = (event.registrationMode as RegistrationMode) || "open_verified";
      const requiresVerification = registrationMode === "qualified_verified" || registrationMode === "open_verified";
      const isAnonymousMode = registrationMode === "open_anonymous";
      
      if (requiresVerification && !isAnonymousMode) {
        // Check for valid OTP session for this email+event combination
        const otpSession = await storage.getOtpSessionForRegistration(normalizedEmail, event.id);
        const isOtpVerified = otpSession && otpSession.verified && otpSession.verifiedAt && 
          (Date.now() - new Date(otpSession.verifiedAt).getTime()) <= 30 * 60 * 1000;
        
        // Also check for attendee token (for returning users from /my-events)
        let hasAttendeeToken = false;
        const authHeader = req.headers.authorization;
        const attendeeToken = authHeader?.split(" ")[1];
        if (attendeeToken) {
          const attendeeSession = await storage.getAttendeeSessionByToken(attendeeToken);
          if (attendeeSession && attendeeSession.email.toLowerCase() === normalizedEmail) {
            hasAttendeeToken = true;
          }
        }
        
        if (!isOtpVerified && !hasAttendeeToken) {
          return res.status(403).json({ 
            error: "Email verification required",
            code: "VERIFICATION_REQUIRED",
            message: "Please verify your email before registering"
          });
        }
      }
      
      // QUALIFICATION CHECK: For qualified_verified mode, verify user is in qualified_registrants table
      if (registrationMode === "qualified_verified") {
        // Try to find qualified registrant by Unicity ID first (more reliable), then by email
        const unicityId = req.body.unicityId?.trim();
        let isQualified = false;
        
        if (unicityId) {
          const qualifiedByUnicityId = await storage.getQualifiedRegistrantByUnicityId(event.id, unicityId);
          if (qualifiedByUnicityId) {
            isQualified = true;
          }
        }
        
        if (!isQualified) {
          // Fallback to email lookup
          const qualifiedByEmail = await storage.getQualifiedRegistrantByEmail(event.id, normalizedEmail);
          if (qualifiedByEmail) {
            isQualified = true;
          }
        }
        
        if (!isQualified) {
          return res.status(403).json({ 
            error: "Not qualified for this event",
            code: "NOT_QUALIFIED",
            message: "You are not on the qualified list for this event. Please contact the event organizer if you believe this is an error."
          });
        }
      }
      
      // For open_anonymous mode: ALWAYS create new registration (no email uniqueness check)
      // Multiple registrations per email are allowed
      // Supports multi-attendee submissions via attendees array
      if (isAnonymousMode) {
        // Generate a unique order ID for this submission
        const orderId = crypto.randomUUID();
        
        // Check if this is a multi-attendee submission
        const attendeesData = req.body.attendees;
        const isMultiAttendee = Array.isArray(attendeesData) && attendeesData.length > 0;
        
        // Build list of attendees to create
        const attendeesToCreate = isMultiAttendee ? attendeesData : [req.body];
        
        // Validate we have at least one attendee
        if (attendeesToCreate.length === 0) {
          return res.status(400).json({ error: "At least one attendee is required" });
        }
        
        // Create all registrations with the same orderId
        const createdRegistrations = [];
        try {
          for (let i = 0; i < attendeesToCreate.length; i++) {
            const attendee = attendeesToCreate[i];
            const attendeeEmail = (attendee.email || normalizedEmail).trim().toLowerCase();
            
            // Validate required fields for each attendee
            if (!attendee.firstName?.trim() || !attendee.lastName?.trim() || !attendeeEmail) {
              throw new Error(`Attendee ${i + 1} is missing required fields (firstName, lastName, or email)`);
            }
            
            const newRegistration = await storage.createRegistration({
              eventId: event.id,
              email: attendeeEmail,
              firstName: attendee.firstName || "",
              lastName: attendee.lastName || "",
              phone: attendee.phone || null,
              unicityId: attendee.unicityId || null,
              gender: attendee.gender || null,
              dateOfBirth: attendee.dateOfBirth ? new Date(attendee.dateOfBirth) : null,
              passportNumber: attendee.passportNumber || null,
              passportCountry: attendee.passportCountry || null,
              passportExpiration: attendee.passportExpiration ? new Date(attendee.passportExpiration) : null,
              emergencyContact: attendee.emergencyContact || null,
              emergencyContactPhone: attendee.emergencyContactPhone || null,
              shirtSize: attendee.shirtSize || null,
              pantSize: attendee.pantSize || null,
              dietaryRestrictions: Array.isArray(attendee.dietaryRestrictions) ? attendee.dietaryRestrictions : [],
              adaAccommodations: attendee.adaAccommodations || false,
              adaAccommodationsAt: attendee.adaAccommodations ? new Date() : null,
              adaAccommodationsIp: attendee.adaAccommodations ? String(clientIp) : null,
              roomType: attendee.roomType || null,
              termsAccepted: attendee.termsAccepted || false,
              termsAcceptedAt: attendee.termsAccepted ? new Date() : null,
              termsAcceptedIp: attendee.termsAccepted ? String(clientIp) : null,
              verifiedByHydra: false, // Anonymous registrations are never Hydra-verified
              language: attendee.language || req.body.language || "en",
              formData: attendee.formData || null,
              orderId: orderId,
              attendeeIndex: i,
            });
            createdRegistrations.push(newRegistration);
            
            // Generate check-in token for this attendee (non-blocking)
            try {
              await storage.createCheckInToken({
                registrationId: newRegistration.id,
                eventId: event.id,
                token: generateCheckInToken(),
              });
            } catch (tokenErr) {
              console.error('[CheckInToken] Failed to create token for attendee:', tokenErr);
            }
          }
        } catch (error: any) {
          // If any attendee fails, attempt to clean up already-created registrations
          if (createdRegistrations.length > 0) {
            console.error(`Multi-attendee registration failed after creating ${createdRegistrations.length} attendees. Cleaning up...`);
            for (const reg of createdRegistrations) {
              try {
                await storage.deleteRegistration(reg.id);
              } catch (deleteError) {
                console.error(`Failed to delete registration ${reg.id} during cleanup:`, deleteError);
              }
            }
          }
          return res.status(400).json({ 
            error: error.message || "Failed to create registrations",
            partiallyCreated: createdRegistrations.length,
          });
        }
        
        return res.status(201).json({
          success: true,
          orderId: orderId,
          ticketCount: createdRegistrations.length,
          registrations: createdRegistrations,
          isAnonymous: true,
          message: `${createdRegistrations.length} registration(s) created successfully. Note: These registrations cannot be edited after submission.`
        });
      }
      
      const existingReg = await storage.getRegistrationByEmail(event.id, normalizedEmail);
      
      if (existingReg) {
        // Security: Verify the existing registration belongs to this event (double-check)
        if (existingReg.eventId !== event.id) {
          return res.status(400).json({ error: "Registration does not belong to this event" });
        }
        
        // Build update object with only provided fields, preserving existing values for undefined
        const updateData: Record<string, any> = {};
        
        // Only update fields that are explicitly provided (not undefined)
        if (req.body.firstName !== undefined) updateData.firstName = req.body.firstName;
        if (req.body.lastName !== undefined) updateData.lastName = req.body.lastName;
        if (req.body.phone !== undefined) updateData.phone = req.body.phone;
        if (req.body.unicityId !== undefined) updateData.unicityId = req.body.unicityId;
        if (req.body.gender !== undefined) updateData.gender = req.body.gender;
        if (req.body.dateOfBirth !== undefined) updateData.dateOfBirth = req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
        if (req.body.passportNumber !== undefined) updateData.passportNumber = req.body.passportNumber;
        if (req.body.passportCountry !== undefined) updateData.passportCountry = req.body.passportCountry;
        if (req.body.passportExpiration !== undefined) updateData.passportExpiration = req.body.passportExpiration ? new Date(req.body.passportExpiration) : null;
        if (req.body.emergencyContact !== undefined) updateData.emergencyContact = req.body.emergencyContact;
        if (req.body.emergencyContactPhone !== undefined) updateData.emergencyContactPhone = req.body.emergencyContactPhone;
        if (req.body.shirtSize !== undefined) updateData.shirtSize = req.body.shirtSize;
        if (req.body.pantSize !== undefined) updateData.pantSize = req.body.pantSize;
        if (req.body.dietaryRestrictions !== undefined) updateData.dietaryRestrictions = Array.isArray(req.body.dietaryRestrictions) ? req.body.dietaryRestrictions : [];
        if (req.body.adaAccommodations !== undefined) {
          updateData.adaAccommodations = req.body.adaAccommodations;
          // Track timestamp and IP when ADA accommodations is newly set to true
          if (req.body.adaAccommodations && !existingReg.adaAccommodations) {
            updateData.adaAccommodationsAt = new Date();
            updateData.adaAccommodationsIp = String(clientIp);
          }
        }
        if (req.body.roomType !== undefined) updateData.roomType = req.body.roomType;
        if (req.body.language !== undefined) updateData.language = req.body.language;
        if (req.body.formData !== undefined) updateData.formData = req.body.formData;
        
        // Extract phone from custom formData fields if phone wasn't provided directly or is empty
        // Empty string phone ("") should also trigger custom field extraction
        const hasValidPhone = updateData.phone !== undefined && String(updateData.phone).trim() !== '';
        if (!hasValidPhone && req.body.formData) {
          const customPhone = extractPhoneFromFormData(req.body.formData, event.formFields as any[]);
          if (customPhone) {
            updateData.phone = customPhone;
            console.log('[DataFlow] POST UPSERT: Using phone from custom formData field:', customPhone);
          }
        }
        
        // Update terms if re-accepted
        if (req.body.termsAccepted) {
          updateData.termsAccepted = true;
          updateData.termsAcceptedAt = new Date();
          updateData.termsAcceptedIp = String(clientIp);
        }
        
        // Update verifiedByHydra if newly verified
        if (req.body.verifiedByHydra && !existingReg.verifiedByHydra) {
          updateData.verifiedByHydra = true;
        }
        
        const updatedRegistration = await storage.updateRegistration(existingReg.id, updateData);
        
        console.log('[DataFlow] Registration updated - phone in DB:', JSON.stringify({
          id: updatedRegistration?.id,
          phone: updatedRegistration?.phone,
          email: updatedRegistration?.email,
        }));
        // Return 200 for updates (not 201) to indicate existing record was updated
        return res.status(200).json({ ...updatedRegistration, wasUpdated: true });
      }

      // Create new registration (use normalizedEmail to prevent duplicates)
      // Get form fields from event or template for phone extraction and acknowledgment tracking
      let formFields: any[] | null = event.formFields as any[] || null;
      if (!formFields && (event as any).formTemplateId) {
        const template = await storage.getFormTemplate((event as any).formTemplateId);
        formFields = template?.fields as any[] || null;
      }
      
      // Extract phone from custom formData fields if phone wasn't provided directly
      let phoneValue = req.body.phone;
      if ((!phoneValue || !phoneValue.trim()) && req.body.formData) {
        const customPhone = extractPhoneFromFormData(req.body.formData, formFields);
        if (customPhone) {
          phoneValue = customPhone;
          console.log('[DataFlow] Using phone from custom formData field for new registration:', customPhone);
        }
      }
      
      // Build acknowledgment details for checkbox fields (IP and timestamp tracking)
      const acknowledgmentDetails = buildAcknowledgmentDetails(
        req.body.formData,
        formFields,
        String(clientIp)
      );
      
      console.log('[DataFlow] Creating registration - phone from request:', JSON.stringify({
        phone: phoneValue,
        phoneType: typeof phoneValue,
        email: normalizedEmail,
        firstName: req.body.firstName,
      }));
      const registration = await storage.createRegistration({
        eventId: event.id,
        email: normalizedEmail,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: phoneValue,
        unicityId: req.body.unicityId,
        gender: req.body.gender,
        dateOfBirth: req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null,
        passportNumber: req.body.passportNumber,
        passportCountry: req.body.passportCountry,
        passportExpiration: req.body.passportExpiration ? new Date(req.body.passportExpiration) : null,
        emergencyContact: req.body.emergencyContact,
        emergencyContactPhone: req.body.emergencyContactPhone,
        shirtSize: req.body.shirtSize,
        pantSize: req.body.pantSize,
        dietaryRestrictions: req.body.dietaryRestrictions || [],
        adaAccommodations: req.body.adaAccommodations || false,
        adaAccommodationsAt: req.body.adaAccommodations ? new Date() : null,
        adaAccommodationsIp: req.body.adaAccommodations ? String(clientIp) : null,
        roomType: req.body.roomType,
        language: req.body.language || "en",
        status: "registered",
        formData: req.body.formData,
        acknowledgmentDetails: acknowledgmentDetails,
        termsAccepted: req.body.termsAccepted,
        termsAcceptedAt: req.body.termsAccepted ? new Date() : null,
        termsAcceptedIp: req.body.termsAccepted ? String(clientIp) : null,
        verifiedByHydra: req.body.verifiedByHydra || false,
        registeredAt: new Date(),
      });

      // Generate check-in token for email QR code (non-blocking)
      let checkInToken;
      try {
        checkInToken = await storage.createCheckInToken({
          registrationId: registration.id,
          eventId: event.id,
          token: generateCheckInToken(),
        });
        console.log('[CheckInToken] Created for registration:', registration.id);
      } catch (tokenErr) {
        console.error('[CheckInToken] Failed to create token:', tokenErr);
      }

      // Build QR code payload for email (if token was created)
      const checkInQrPayload = checkInToken 
        ? buildCheckInQRPayload(event.id, registration.id, checkInToken.token)
        : null;

      // Send confirmation email via Iterable
      if (process.env.ITERABLE_API_KEY) {
        try {
          await iterableService.sendRegistrationConfirmation(
            registration.email,
            registration,
            event,
            registration.language,
            checkInQrPayload,
            checkInToken?.token || null
          );
        } catch (err) {
          console.error('Failed to send confirmation email:', err);
        }
      }

      // Sync registration to Iterable (non-blocking, fire-and-forget)
      // This runs ONLY on initial registration creation, NOT on edits or updates
      // Sequence: 1) Update user profile, 2) Add to event list, 3) Track registration event, 4) Track purchase (if paid)
      iterableService.syncRegistrationToIterable(registration, event).catch((err) => {
        console.error('[Iterable] syncRegistrationToIterable failed (non-blocking):', {
          eventId: event.id,
          registrationId: registration.id,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      // Include check-in token in response for client-side wallet URL
      res.status(201).json({
        ...registration,
        checkInToken: checkInToken?.token || null,
      });
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid registration data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to register" });
    }
  });

  // Public Registration Update (for returning users updating their own registration)
  app.put("/api/events/:eventIdOrSlug/register/:registrationId", async (req, res) => {
    try {
      const event = await storage.getEventByIdOrSlug(req.params.eventIdOrSlug);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const email = req.body.email;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Security: Check for either attendee token OR OTP session
      let isAuthenticated = false;
      let authenticatedEmail: string | null = null;

      // Strategy 1: Check attendee token (from Authorization header)
      const authHeader = req.headers.authorization;
      const attendeeToken = authHeader?.split(" ")[1];
      if (attendeeToken) {
        const attendeeSession = await storage.getAttendeeSessionByToken(attendeeToken);
        if (attendeeSession && attendeeSession.email.toLowerCase() === email.toLowerCase()) {
          isAuthenticated = true;
          authenticatedEmail = attendeeSession.email;
        }
      }

      // Strategy 2: Check OTP session for this specific event (for users who just verified)
      if (!isAuthenticated) {
        const session = await storage.getOtpSessionForRegistration(email, event.id);
        if (session && session.verified) {
          const verifiedAt = session.verifiedAt ? new Date(session.verifiedAt) : null;
          if (verifiedAt && (Date.now() - verifiedAt.getTime()) <= 30 * 60 * 1000) {
            isAuthenticated = true;
            authenticatedEmail = email;
          }
        }
      }

      if (!isAuthenticated) {
        return res.status(403).json({ error: "Email not verified. Please complete OTP verification first." });
      }

      // Verify the registration exists and belongs to this event
      const existingReg = await storage.getRegistration(req.params.registrationId);
      if (!existingReg) {
        return res.status(404).json({ error: "Registration not found" });
      }
      if (existingReg.eventId !== event.id) {
        return res.status(400).json({ error: "Registration does not belong to this event" });
      }

      // Verify email matches (security check)
      if (existingReg.email.toLowerCase() !== email.toLowerCase()) {
        return res.status(403).json({ error: "Email does not match the registration" });
      }

      const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

      // Update the registration - only update fields that are explicitly provided
      // This preserves existing values when form doesn't include certain fields (template-driven forms)
      const updateData: Record<string, any> = {};
      
      if (req.body.firstName !== undefined) updateData.firstName = req.body.firstName;
      if (req.body.lastName !== undefined) updateData.lastName = req.body.lastName;
      if (req.body.phone !== undefined) updateData.phone = req.body.phone;
      if (req.body.unicityId !== undefined) updateData.unicityId = req.body.unicityId;
      if (req.body.gender !== undefined) updateData.gender = req.body.gender;
      if (req.body.dateOfBirth !== undefined) updateData.dateOfBirth = req.body.dateOfBirth ? new Date(req.body.dateOfBirth) : null;
      if (req.body.passportNumber !== undefined) updateData.passportNumber = req.body.passportNumber;
      if (req.body.passportCountry !== undefined) updateData.passportCountry = req.body.passportCountry;
      if (req.body.passportExpiration !== undefined) updateData.passportExpiration = req.body.passportExpiration ? new Date(req.body.passportExpiration) : null;
      if (req.body.emergencyContact !== undefined) updateData.emergencyContact = req.body.emergencyContact;
      if (req.body.emergencyContactPhone !== undefined) updateData.emergencyContactPhone = req.body.emergencyContactPhone;
      if (req.body.shirtSize !== undefined) updateData.shirtSize = req.body.shirtSize;
      if (req.body.pantSize !== undefined) updateData.pantSize = req.body.pantSize;
      if (req.body.dietaryRestrictions !== undefined) updateData.dietaryRestrictions = Array.isArray(req.body.dietaryRestrictions) ? req.body.dietaryRestrictions : [];
      if (req.body.adaAccommodations !== undefined) {
        updateData.adaAccommodations = req.body.adaAccommodations;
        if (req.body.adaAccommodations && !existingReg.adaAccommodations) {
          updateData.adaAccommodationsAt = new Date();
          updateData.adaAccommodationsIp = String(clientIp);
        }
      }
      if (req.body.roomType !== undefined) updateData.roomType = req.body.roomType;
      if (req.body.language !== undefined) updateData.language = req.body.language;
      if (req.body.formData !== undefined) updateData.formData = req.body.formData;
      
      // Extract phone from custom formData fields if phone wasn't provided directly or is empty
      // Empty string phone ("") should also trigger custom field extraction
      const hasValidPhonePut = updateData.phone !== undefined && String(updateData.phone).trim() !== '';
      if (!hasValidPhonePut && req.body.formData) {
        const customPhone = extractPhoneFromFormData(req.body.formData, event.formFields as any[]);
        if (customPhone) {
          updateData.phone = customPhone;
          console.log('[DataFlow] PUT: Using phone from custom formData field:', customPhone);
        }
      }
      
      if (req.body.termsAccepted) {
        updateData.termsAccepted = true;
        updateData.termsAcceptedAt = new Date();
        updateData.termsAcceptedIp = String(clientIp);
      }
      
      // Update verifiedByHydra if newly verified
      if (req.body.verifiedByHydra && !existingReg.verifiedByHydra) {
        updateData.verifiedByHydra = true;
      }
      
      const updatedRegistration = await storage.updateRegistration(req.params.registrationId, updateData);

      if (!updatedRegistration) {
        return res.status(500).json({ error: "Failed to update registration" });
      }

      res.json(updatedRegistration);
    } catch (error) {
      console.error("Registration update error:", error);
      res.status(500).json({ error: "Failed to update registration" });
    }
  });

  // Registrations Routes
  app.get("/api/registrations", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const eventId = req.query.eventId as string | undefined;
      const registrations = await storage.getRegistrations(eventId);
      
      // Apply market filtering for admin users
      const user = req.user!;
      const fullUser = await storage.getUser(user.id);
      const filteredRegistrations = fullUser 
        ? await filterRegistrationsByMarketAccess(registrations, fullUser)
        : registrations;
      
      // Compute swag status dynamically from actual assignments
      const registrationIdsWithSwag = await storage.getRegistrationIdsWithSwagAssigned(eventId);
      const registrationsWithComputedSwagStatus = filteredRegistrations.map(reg => ({
        ...reg,
        swagStatus: registrationIdsWithSwag.has(reg.id) ? "assigned" : "pending"
      }));
      
      res.json(registrationsWithComputedSwagStatus);
    } catch (error) {
      console.error("Get registrations error:", error);
      res.status(500).json({ error: "Failed to get registrations" });
    }
  });

  app.get("/api/registrations/recent", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const registrations = await storage.getRecentRegistrations(10);
      
      // Apply market filtering for admin users
      const user = req.user!;
      const fullUser = await storage.getUser(user.id);
      const filteredRegistrations = fullUser 
        ? await filterRegistrationsByMarketAccess(registrations, fullUser)
        : registrations;
      
      // Compute swag status dynamically from actual assignments
      const registrationIdsWithSwag = await storage.getRegistrationIdsWithSwagAssigned();
      const registrationsWithComputedSwagStatus = filteredRegistrations.map(reg => ({
        ...reg,
        swagStatus: registrationIdsWithSwag.has(reg.id) ? "assigned" : "pending"
      }));
      
      res.json(registrationsWithComputedSwagStatus);
    } catch (error) {
      console.error("Get recent registrations error:", error);
      res.status(500).json({ error: "Failed to get recent registrations" });
    }
  });

  app.get("/api/registrations/:id", authenticateToken, requireMarketAccessForRegistration() as any, async (req, res) => {
    try {
      const registration = await storage.getRegistration(req.params.id);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }
      
      // Compute swag status dynamically from actual assignments
      const swagAssignments = await storage.getSwagAssignmentsByRegistration(registration.id);
      const computedSwagStatus = swagAssignments.length > 0 ? "assigned" : "pending";
      
      res.json({ ...registration, swagStatus: computedSwagStatus });
    } catch (error) {
      console.error("Get registration error:", error);
      res.status(500).json({ error: "Failed to get registration" });
    }
  });

  app.patch("/api/registrations/:id", authenticateToken, requireRole("admin", "event_manager"), requireMarketAccessForRegistration() as any, async (req, res) => {
    try {
      // Get existing registration to check for status change
      const existingRegistration = await storage.getRegistration(req.params.id);
      if (!existingRegistration) {
        return res.status(404).json({ error: "Registration not found" });
      }
      const previousStatus = existingRegistration.status;
      
      // Convert date strings to Date objects for timestamp fields
      const updateData = { ...req.body };
      if (updateData.dateOfBirth && typeof updateData.dateOfBirth === 'string') {
        updateData.dateOfBirth = new Date(updateData.dateOfBirth);
      }
      if (updateData.passportExpiration && typeof updateData.passportExpiration === 'string') {
        updateData.passportExpiration = new Date(updateData.passportExpiration);
      }
      
      const registration = await storage.updateRegistration(req.params.id, updateData);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }
      
      // Check if status changed to cancelled or not_coming
      const cancelledStatuses = ['cancelled', 'not_coming'];
      const isNowCancelled = cancelledStatuses.includes(registration.status);
      const wasPreviouslyCancelled = cancelledStatuses.includes(previousStatus);
      
      if (process.env.ITERABLE_API_KEY) {
        try {
          const event = await storage.getEvent(registration.eventId);
          if (event) {
            // Send cancellation email if status just changed to cancelled/not_coming
            if (isNowCancelled && !wasPreviouslyCancelled) {
              iterableService.sendRegistrationCanceled(
                registration.email,
                registration,
                event,
                registration.language
              ).catch(err => {
                console.error('[Iterable] Failed to send cancellation email:', err);
              });
            }
            // Send update notification for other important field changes
            else if (req.body.status || req.body.roomType || req.body.shirtSize) {
              iterableService.sendRegistrationUpdate(
                registration.email,
                registration,
                event,
                registration.language
              ).catch(err => {
                console.error('[Iterable] Failed to send update email:', err);
              });
            }
          }
        } catch (err) {
          console.error('Failed to send email notification:', err);
        }
      }
      
      res.json(registration);
    } catch (error) {
      console.error("Update registration error:", error);
      res.status(500).json({ error: "Failed to update registration" });
    }
  });

  app.post("/api/registrations/:id/check-in", authenticateToken, requireRole("admin", "event_manager"), requireMarketAccessForRegistration() as any, async (req: AuthenticatedRequest, res) => {
    try {
      // Check if already checked in BEFORE performing check-in (to prevent duplicate emails)
      const existingReg = await storage.getRegistration(req.params.id);
      const wasAlreadyCheckedIn = existingReg?.checkedInAt !== null;

      const registration = await storage.checkInRegistration(req.params.id, req.user!.id);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }

      // Send check-in confirmation email ONLY if this is the first check-in
      if (!wasAlreadyCheckedIn) {
        const event = await storage.getEvent(registration.eventId);
        if (event) {
          // Get the check-in token for QR code
          const checkInToken = await storage.getCheckInTokenByRegistration(registration.id);
          const checkInQrPayload = checkInToken 
            ? buildCheckInQRPayload(event.id, registration.id, checkInToken.token)
            : null;
          
          iterableService.sendCheckedInConfirmation(
            registration.email,
            registration,
            event,
            registration.language,
            checkInQrPayload,
            checkInToken?.token || null
          ).catch(err => {
            console.error('[Iterable] Failed to send check-in confirmation email:', err);
          });
        }
      }

      res.json(registration);
    } catch (error) {
      console.error("Check-in error:", error);
      res.status(500).json({ error: "Unable to complete check-in. Please try again." });
    }
  });

  // Resend Confirmation Email (single registration)
  app.post("/api/registrations/:id/resend-confirmation", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const { language } = req.body;
      const registration = await storage.getRegistration(req.params.id);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }

      const event = await storage.getEvent(registration.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Get the check-in token for QR code
      const checkInToken = await storage.getCheckInTokenByRegistration(registration.id);
      const checkInQrPayload = checkInToken 
        ? buildCheckInQRPayload(event.id, registration.id, checkInToken.token)
        : null;

      // Use provided language or fallback to registration's language
      const emailLanguage = language || registration.language || 'en';

      const result = await iterableService.sendRegistrationConfirmation(
        registration.email,
        registration,
        event,
        emailLanguage,
        checkInQrPayload,
        checkInToken?.token || null
      );

      if (result.success) {
        res.json({ success: true, message: "Confirmation email sent" });
      } else {
        console.error(`[Resend] Failed for ${registration.email} (${emailLanguage}):`, result.error);
        res.status(500).json({ 
          error: result.error || "Failed to send email",
          language: emailLanguage,
          campaignType: 'registration_confirmation'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Resend confirmation error:", errorMessage);
      res.status(500).json({ error: errorMessage || "Failed to resend confirmation email" });
    }
  });

  // Bulk Resend Confirmation Emails
  app.post("/api/registrations/bulk-resend-confirmation", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const { registrationIds, language } = req.body;
      
      if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
        return res.status(400).json({ error: "No registration IDs provided" });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[]
      };

      for (const registrationId of registrationIds) {
        try {
          const registration = await storage.getRegistration(registrationId);
          if (!registration) {
            results.failed++;
            results.errors.push(`Registration ${registrationId} not found`);
            continue;
          }

          const event = await storage.getEvent(registration.eventId);
          if (!event) {
            results.failed++;
            results.errors.push(`Event not found for registration ${registrationId}`);
            continue;
          }

          // Get the check-in token for QR code
          const checkInToken = await storage.getCheckInTokenByRegistration(registration.id);
          const checkInQrPayload = checkInToken 
            ? buildCheckInQRPayload(event.id, registration.id, checkInToken.token)
            : null;

          // Use provided language or fallback to registration's language
          const emailLanguage = language || registration.language || 'en';

          const result = await iterableService.sendRegistrationConfirmation(
            registration.email,
            registration,
            event,
            emailLanguage,
            checkInQrPayload,
            checkInToken?.token || null
          );

          if (result.success) {
            results.success++;
          } else {
            results.failed++;
            results.errors.push(`Failed for ${registration.email}: ${result.error}`);
          }
        } catch (err) {
          results.failed++;
          results.errors.push(`Error processing ${registrationId}: ${err}`);
        }
      }

      res.json({
        success: true,
        sent: results.success,
        failed: results.failed,
        errors: results.errors.slice(0, 10) // Limit error messages
      });
    } catch (error) {
      console.error("Bulk resend confirmation error:", error);
      res.status(500).json({ error: "Failed to process bulk resend" });
    }
  });

  // QR Code Check-In via Email Token
  // This endpoint is used by the check-in scanner to validate CHECKIN: format QR codes
  // QR payload format: CHECKIN:<eventId>:<registrationId>:<token>
  app.post("/api/checkin/scan", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const { qrPayload, eventId: expectedEventId } = req.body;
      
      if (!qrPayload || typeof qrPayload !== 'string') {
        console.log('[QR Scan] Invalid request: missing qrPayload');
        return res.status(400).json({ error: "QR payload is required", code: "INVALID_PAYLOAD" });
      }
      
      // Parse the QR payload
      const parsed = parseCheckInQRPayload(qrPayload);
      if (!parsed) {
        console.log('[QR Scan] Invalid QR format:', qrPayload.substring(0, 50));
        return res.status(400).json({ error: "Invalid QR code format", code: "INVALID_FORMAT" });
      }
      
      const { eventId, registrationId, token } = parsed;
      
      // Validate event matches if specified
      if (expectedEventId && eventId !== expectedEventId) {
        console.log('[QR Scan] Event mismatch:', { expected: expectedEventId, got: eventId });
        return res.status(400).json({ 
          error: "This QR code is for a different event", 
          code: "EVENT_MISMATCH" 
        });
      }
      
      // Look up the token
      const checkInToken = await storage.getCheckInTokenByToken(token);
      if (!checkInToken) {
        console.log('[QR Scan] Token not found:', token.substring(0, 16) + '...');
        return res.status(404).json({ error: "Invalid or expired QR code", code: "TOKEN_NOT_FOUND" });
      }
      
      // Validate token matches registration and event
      if (checkInToken.registrationId !== registrationId || checkInToken.eventId !== eventId) {
        console.log('[QR Scan] Token mismatch:', { 
          tokenRegId: checkInToken.registrationId, 
          payloadRegId: registrationId,
          tokenEventId: checkInToken.eventId,
          payloadEventId: eventId
        });
        return res.status(400).json({ error: "Invalid QR code", code: "TOKEN_MISMATCH" });
      }
      
      // Check expiration if set
      if (checkInToken.expiresAt && new Date(checkInToken.expiresAt) < new Date()) {
        console.log('[QR Scan] Token expired:', { tokenId: checkInToken.id, expiresAt: checkInToken.expiresAt });
        return res.status(400).json({ error: "QR code has expired", code: "TOKEN_EXPIRED" });
      }
      
      // Get the registration
      const registration = await storage.getRegistration(registrationId);
      if (!registration) {
        console.log('[QR Scan] Registration not found:', registrationId);
        return res.status(404).json({ error: "Registration not found", code: "REGISTRATION_NOT_FOUND" });
      }
      
      // Check if already checked in (idempotent - still success but flag it)
      const wasAlreadyCheckedIn = registration.checkedInAt !== null;
      
      if (!wasAlreadyCheckedIn) {
        // Perform check-in
        await storage.checkInRegistration(registrationId, req.user!.id);
        
        // Mark token as used (for tracking, not for blocking)
        if (!checkInToken.usedAt) {
          await storage.markCheckInTokenUsed(checkInToken.id);
        }
        
        // Send check-in confirmation email
        const event = await storage.getEvent(eventId);
        if (event) {
          const checkInQrPayload = buildCheckInQRPayload(event.id, registration.id, checkInToken.token);
          
          iterableService.sendCheckedInConfirmation(
            registration.email,
            registration,
            event,
            registration.language,
            checkInQrPayload,
            checkInToken.token
          ).catch(err => {
            console.error('[Iterable] Failed to send check-in confirmation email:', err);
          });
        }
        
        console.log('[QR Scan] Check-in successful:', { 
          registrationId, 
          name: `${registration.firstName} ${registration.lastName}`,
          eventId 
        });
      } else {
        console.log('[QR Scan] Already checked in:', { 
          registrationId, 
          checkedInAt: registration.checkedInAt 
        });
      }
      
      // Get fresh registration data
      const updatedRegistration = await storage.getRegistration(registrationId);
      
      res.json({
        success: true,
        alreadyCheckedIn: wasAlreadyCheckedIn,
        registration: updatedRegistration,
        message: wasAlreadyCheckedIn 
          ? `${registration.firstName} ${registration.lastName} was already checked in`
          : `${registration.firstName} ${registration.lastName} checked in successfully`
      });
    } catch (error) {
      console.error("[QR Scan] Error:", error);
      res.status(500).json({ error: "Unable to process QR code. Please try again.", code: "INTERNAL_ERROR" });
    }
  });

  // Apple Wallet Pass Generation
  // GET /api/wallet/:token - Generates and returns a .pkpass file for Apple Wallet
  app.get("/api/wallet/:token", async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token || token.length < 32) {
        return res.status(400).json({ error: "Invalid token" });
      }
      
      // Check if Apple Wallet is configured
      const { appleWalletService } = await import("./appleWallet");
      if (!appleWalletService.isConfigured()) {
        return res.status(503).json({ 
          error: "Apple Wallet is not configured",
          message: "Apple Wallet passes are not available at this time"
        });
      }
      
      // Look up the check-in token
      const checkInToken = await storage.getCheckInTokenByToken(token);
      if (!checkInToken) {
        return res.status(404).json({ error: "Token not found or expired" });
      }
      
      // Check expiration if set
      if (checkInToken.expiresAt && new Date(checkInToken.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Token has expired" });
      }
      
      // Get the registration
      const registration = await storage.getRegistration(checkInToken.registrationId);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }
      
      // Get the event
      const event = await storage.getEvent(checkInToken.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Generate the pass
      const passBuffer = await appleWalletService.generatePass({
        registration,
        event,
        checkInToken,
      });
      
      // Set appropriate headers for .pkpass file
      res.set({
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${event.slug || event.id}-pass.pkpass"`,
        "Content-Length": passBuffer.length.toString(),
      });
      
      res.send(passBuffer);
    } catch (error) {
      console.error("[Apple Wallet] Error generating pass:", error);
      res.status(500).json({ error: "Failed to generate Apple Wallet pass" });
    }
  });

  // Transfer registration to another event
  app.post("/api/registrations/:id/transfer", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const { targetEventId } = req.body;
      if (!targetEventId) {
        return res.status(400).json({ error: "Target event ID is required" });
      }

      // Get the current registration
      const currentReg = await storage.getRegistration(req.params.id);
      if (!currentReg) {
        return res.status(404).json({ error: "Registration not found" });
      }

      // Check if already in the target event
      if (currentReg.eventId === targetEventId) {
        return res.status(400).json({ error: "Registration is already in this event" });
      }

      // Verify target event exists
      const targetEvent = await storage.getEvent(targetEventId);
      if (!targetEvent) {
        return res.status(404).json({ error: "Target event not found" });
      }

      // Check for duplicate registration in target event
      const existingInTarget = await storage.getRegistrationByEmail(targetEventId, currentReg.email);
      if (existingInTarget) {
        return res.status(400).json({ error: "This attendee is already registered for the target event" });
      }

      // Perform the transfer
      const registration = await storage.transferRegistration(req.params.id, targetEventId, req.user!.email);
      if (!registration) {
        return res.status(500).json({ error: "Failed to transfer registration" });
      }

      // Send transfer notification email (non-blocking)
      iterableService.sendRegistrationTransferred(
        registration.email,
        registration,
        targetEvent,
        registration.language
      ).catch(err => {
        console.error('[Iterable] Failed to send registration transferred email:', err);
      });

      res.json(registration);
    } catch (error) {
      console.error("Transfer error:", error);
      res.status(500).json({ error: "Failed to transfer registration" });
    }
  });

  app.delete("/api/registrations/:id", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      // Check if we should send cancellation email (default: true)
      const sendEmail = req.query.sendEmail !== "false";
      
      // Fetch registration and event BEFORE deletion to send cancellation email
      const registration = await storage.getRegistration(req.params.id);
      const event = registration ? await storage.getEvent(registration.eventId) : null;

      await storage.deleteRegistration(req.params.id);

      // Send cancellation email after successful deletion (non-blocking) - only if sendEmail is true
      if (sendEmail && registration && event) {
        iterableService.sendRegistrationCanceled(
          registration.email,
          registration,
          event,
          registration.language
        ).catch(err => {
          console.error('[Iterable] Failed to send registration canceled email:', err);
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Delete registration error:", error);
      res.status(500).json({ error: "Failed to delete registration" });
    }
  });

  // Initiate payment for a registration
  app.post("/api/registrations/:id/initiate-payment", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const registration = await storage.getRegistration(req.params.id);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }

      // Check if already paid
      if (registration.paymentStatus === 'paid') {
        return res.status(400).json({ error: "Registration is already paid" });
      }

      const event = await storage.getEvent(registration.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Check if event requires payment
      if (!event.buyInPrice || event.buyInPrice <= 0) {
        return res.status(400).json({ error: "This event does not require payment" });
      }

      // Payment processing is not currently configured
      return res.status(503).json({ error: "Payment processing is not currently available" });
    } catch (error) {
      console.error("Initiate payment error:", error);
      res.status(500).json({ error: "Failed to initiate payment" });
    }
  });

  // Verify registration payment - payment processing not currently configured
  app.post("/api/registrations/:id/verify-payment", authenticateToken, async (req: AuthenticatedRequest, res) => {
    return res.status(503).json({ error: "Payment processing is not currently available" });
  });

  // My Registrations (for authenticated users)
  app.get("/api/my-registrations", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const registrations = await storage.getRegistrationsByUser(req.user!.email);
      res.json(registrations);
    } catch (error) {
      console.error("Get my registrations error:", error);
      res.status(500).json({ error: "Failed to get registrations" });
    }
  });

  // Person Profile - Get all registrations for a person by email or Unicity ID
  app.get("/api/person-profile", authenticateToken, requireRole("admin", "event_manager", "marketing", "readonly"), async (req: AuthenticatedRequest, res) => {
    try {
      const email = req.query.email as string | undefined;
      const unicityId = req.query.unicityId as string | undefined;

      if (!email && !unicityId) {
        return res.status(400).json({ error: "Either email or unicityId is required" });
      }

      let registrationsData: any[] = [];
      
      // Get registrations by email
      if (email) {
        registrationsData = await storage.getRegistrationsByUser(email);
      }
      
      // Get registrations by Unicity ID (merge with email results if both provided)
      if (unicityId) {
        const byUnicityId = await storage.getRegistrationsByUnicityIdAll(unicityId);
        // Merge and deduplicate by registration ID
        const existingIds = new Set(registrationsData.map(r => r.id));
        byUnicityId.forEach(r => {
          if (!existingIds.has(r.id)) {
            registrationsData.push(r);
          }
        });
      }

      // Apply market filtering for admin users
      const user = req.user!;
      const fullUser = await storage.getUser(user.id);
      const filteredRegistrations = fullUser 
        ? await filterRegistrationsByMarketAccess(registrationsData, fullUser)
        : registrationsData;

      // Get event details for each registration
      const events = await storage.getEvents();
      const eventsById = new Map(events.map(e => [e.id, e]));

      // Compute swag status and add event details
      const registrationIdsWithSwag = await storage.getRegistrationIdsWithSwagAssigned();
      const enrichedRegistrations = filteredRegistrations.map(reg => ({
        ...reg,
        swagStatus: registrationIdsWithSwag.has(reg.id) ? "assigned" : "pending",
        event: eventsById.get(reg.eventId) || null,
      }));

      // Extract profile info from first registration (most recent if we sort)
      enrichedRegistrations.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      const profile = enrichedRegistrations.length > 0 ? {
        firstName: enrichedRegistrations[0].firstName,
        lastName: enrichedRegistrations[0].lastName,
        email: enrichedRegistrations[0].email,
        unicityId: enrichedRegistrations[0].unicityId,
        phone: enrichedRegistrations[0].phone,
      } : null;

      res.json({
        profile,
        registrations: enrichedRegistrations,
      });
    } catch (error) {
      console.error("Get person profile error:", error);
      res.status(500).json({ error: "Failed to get person profile" });
    }
  });

  // Guests Routes
  app.post("/api/registrations/:registrationId/guests", authenticateToken, async (req, res) => {
    try {
      const data = insertGuestSchema.parse({
        ...req.body,
        registrationId: req.params.registrationId,
      });
      const guest = await storage.createGuest(data);
      res.status(201).json(guest);
    } catch (error) {
      console.error("Create guest error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid guest data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create guest" });
    }
  });

  app.patch("/api/guests/:id", authenticateToken, async (req, res) => {
    try {
      const guest = await storage.updateGuest(req.params.id, req.body);
      if (!guest) {
        return res.status(404).json({ error: "Guest not found" });
      }
      res.json(guest);
    } catch (error) {
      console.error("Update guest error:", error);
      res.status(500).json({ error: "Failed to update guest" });
    }
  });

  app.delete("/api/guests/:id", authenticateToken, async (req, res) => {
    try {
      await storage.deleteGuest(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete guest error:", error);
      res.status(500).json({ error: "Failed to delete guest" });
    }
  });

  // Flights Routes
  app.post("/api/registrations/:registrationId/flights", authenticateToken, async (req, res) => {
    try {
      const data = insertFlightSchema.parse({
        ...req.body,
        registrationId: req.params.registrationId,
        departureTime: req.body.departureTime ? new Date(req.body.departureTime) : undefined,
        arrivalTime: req.body.arrivalTime ? new Date(req.body.arrivalTime) : undefined,
      });
      const flight = await storage.createFlight(data);
      res.status(201).json(flight);
    } catch (error) {
      console.error("Create flight error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid flight data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create flight" });
    }
  });

  app.patch("/api/flights/:id", authenticateToken, async (req, res) => {
    try {
      const updates = {
        ...req.body,
        departureTime: req.body.departureTime ? new Date(req.body.departureTime) : undefined,
        arrivalTime: req.body.arrivalTime ? new Date(req.body.arrivalTime) : undefined,
      };
      const flight = await storage.updateFlight(req.params.id, updates);
      if (!flight) {
        return res.status(404).json({ error: "Flight not found" });
      }
      res.json(flight);
    } catch (error) {
      console.error("Update flight error:", error);
      res.status(500).json({ error: "Failed to update flight" });
    }
  });

  app.delete("/api/flights/:id", authenticateToken, async (req, res) => {
    try {
      await storage.deleteFlight(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete flight error:", error);
      res.status(500).json({ error: "Failed to delete flight" });
    }
  });

  // Reimbursements Routes
  app.post("/api/registrations/:registrationId/reimbursements", authenticateToken, async (req, res) => {
    try {
      const data = insertReimbursementSchema.parse({
        ...req.body,
        registrationId: req.params.registrationId,
      });
      const reimbursement = await storage.createReimbursement(data);
      res.status(201).json(reimbursement);
    } catch (error) {
      console.error("Create reimbursement error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid reimbursement data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create reimbursement" });
    }
  });

  app.patch("/api/reimbursements/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const updates = {
        ...req.body,
        processedBy: req.body.status === "completed" ? req.user!.id : undefined,
        processedAt: req.body.status === "completed" ? new Date() : undefined,
      };
      const reimbursement = await storage.updateReimbursement(req.params.id, updates);
      if (!reimbursement) {
        return res.status(404).json({ error: "Reimbursement not found" });
      }
      res.json(reimbursement);
    } catch (error) {
      console.error("Update reimbursement error:", error);
      res.status(500).json({ error: "Failed to update reimbursement" });
    }
  });

  app.delete("/api/reimbursements/:id", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteReimbursement(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete reimbursement error:", error);
      res.status(500).json({ error: "Failed to delete reimbursement" });
    }
  });

  // Object Storage Routes for Receipt Uploads
  app.get("/objects/:objectPath(*)", authenticateToken, async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", authenticateToken, async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Get upload URL error:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  // Presign endpoint for hero images with public-read access
  app.post("/api/objects/presign", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { objectPath, permission } = req.body;
      if (!objectPath) {
        return res.status(400).json({ error: "objectPath is required" });
      }

      const objectStorageService = new ObjectStorageService();
      
      // For public files, store in the public directory
      const isPublic = permission === 'public-read';
      const basePath = isPublic 
        ? objectStorageService.getPublicObjectSearchPaths()[0]
        : objectStorageService.getPrivateObjectDir();
      
      const fullPath = `${basePath}/${objectPath}`;
      const uploadUrl = await objectStorageService.getPresignedUploadUrl(fullPath);
      
      res.json({ uploadUrl, objectPath });
    } catch (error) {
      console.error("Presign error:", error);
      res.status(500).json({ error: "Failed to generate presigned URL" });
    }
  });

  app.put("/api/reimbursements/:id/receipt", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { receiptURL } = req.body;
      if (!receiptURL) {
        return res.status(400).json({ error: "receiptURL is required" });
      }

      const userId = req.user!.id;
      const objectStorageService = new ObjectStorageService();
      
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        receiptURL,
        {
          owner: userId,
          visibility: "private",
        }
      );

      const reimbursement = await storage.updateReimbursement(req.params.id, {
        receiptPath: objectPath,
      });

      if (!reimbursement) {
        return res.status(404).json({ error: "Reimbursement not found" });
      }

      res.json({ objectPath, reimbursement });
    } catch (error) {
      console.error("Error setting receipt:", error);
      res.status(500).json({ error: "Failed to update receipt" });
    }
  });

  // Get signed URL for public objects (used by registration pages for hero images)
  app.get("/api/objects/public/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const redirect = req.query.redirect !== 'false';
    const objectStorageService = new ObjectStorageService();
    
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      
      const signedUrl = await objectStorageService.getSignedDownloadUrl(file);
      
      if (redirect) {
        return res.redirect(signedUrl);
      }
      
      res.json({ url: signedUrl });
    } catch (error) {
      console.error("Error getting public object URL:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Public assets serving (direct download)
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============ Swag Item Routes ============
  
  // Get all swag items for an event
  app.get("/api/events/:eventId/swag-items", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const items = await storage.getSwagItemsByEvent(req.params.eventId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching swag items:", error);
      res.status(500).json({ error: "Failed to fetch swag items" });
    }
  });

  // Get a single swag item
  app.get("/api/swag-items/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const item = await storage.getSwagItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Swag item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error fetching swag item:", error);
      res.status(500).json({ error: "Failed to fetch swag item" });
    }
  });

  // Create a new swag item
  app.post("/api/events/:eventId/swag-items", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const data = { ...req.body, eventId: req.params.eventId };
      const validatedData = insertSwagItemSchema.parse(data);
      const item = await storage.createSwagItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      console.error("Error creating swag item:", error);
      res.status(500).json({ error: "Failed to create swag item" });
    }
  });

  // Update a swag item
  app.patch("/api/swag-items/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const item = await storage.updateSwagItem(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ error: "Swag item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error updating swag item:", error);
      res.status(500).json({ error: "Failed to update swag item" });
    }
  });

  // Delete a swag item
  app.delete("/api/swag-items/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      await storage.deleteSwagItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting swag item:", error);
      res.status(500).json({ error: "Failed to delete swag item" });
    }
  });

  // ============ Swag Assignment Routes ============
  
  // Get assignments by event
  app.get("/api/events/:eventId/swag-assignments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      console.log(`[Swag] Fetching all assignments for event: ${req.params.eventId}`);
      const assignments = await storage.getSwagAssignmentsByEvent(req.params.eventId);
      console.log(`[Swag] Found ${assignments.length} total assignments for event ${req.params.eventId}`);
      if (assignments.length > 0) {
        console.log(`[Swag] Assignment details:`, assignments.map(a => ({
          id: a.id,
          registrationId: a.registrationId,
          registrationEmail: a.registration?.email,
          swagItemId: a.swagItemId,
          swagItemName: a.swagItem?.name,
        })));
      }
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching swag assignments:", error);
      res.status(500).json({ error: "Failed to fetch swag assignments" });
    }
  });

  // Get assignments by registration
  app.get("/api/registrations/:registrationId/swag-assignments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      console.log(`[Swag] Fetching assignments for registration: ${req.params.registrationId}`);
      const assignments = await storage.getSwagAssignmentsByRegistration(req.params.registrationId);
      console.log(`[Swag] Found ${assignments.length} assignments for registration ${req.params.registrationId}`);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching swag assignments:", error);
      res.status(500).json({ error: "Failed to fetch swag assignments" });
    }
  });

  // Get assignments by guest
  app.get("/api/guests/:guestId/swag-assignments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const assignments = await storage.getSwagAssignmentsByGuest(req.params.guestId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching swag assignments:", error);
      res.status(500).json({ error: "Failed to fetch swag assignments" });
    }
  });

  // Get assignments by swag item
  app.get("/api/swag-items/:swagItemId/assignments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const assignments = await storage.getSwagAssignmentsByItem(req.params.swagItemId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching swag item assignments:", error);
      res.status(500).json({ error: "Failed to fetch swag item assignments" });
    }
  });

  // Create a swag assignment
  app.post("/api/swag-assignments", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const validatedData = insertSwagAssignmentSchema.parse(req.body);
      const assignment = await storage.createSwagAssignment(validatedData);
      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      console.error("Error creating swag assignment:", error);
      res.status(500).json({ error: "Failed to create swag assignment" });
    }
  });

  // Bulk create swag assignments (for assigning to all attendees)
  const bulkSwagAssignmentSchema = z.object({
    swagItemId: z.string(),
    registrationIds: z.array(z.string()).optional(),
    guestIds: z.array(z.string()).optional(),
    size: z.string().optional(),
  });
  
  app.post("/api/swag-assignments/bulk", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      console.log("[Swag] Bulk assign request:", JSON.stringify(req.body));
      const validated = bulkSwagAssignmentSchema.parse(req.body);
      const { swagItemId, registrationIds, guestIds, size } = validated;
      const assignments = [];
      
      if (registrationIds?.length) {
        console.log(`[Swag] Assigning swag ${swagItemId} to ${registrationIds.length} registrations`);
        for (const registrationId of registrationIds) {
          try {
            const assignment = await storage.createSwagAssignment({
              swagItemId,
              registrationId,
              size,
              status: 'assigned',
            });
            console.log(`[Swag] Created assignment ${assignment.id} for registration ${registrationId}`);
            assignments.push(assignment);
          } catch (assignError) {
            console.error(`[Swag] Failed to create assignment for registration ${registrationId}:`, assignError);
          }
        }
      }
      
      if (guestIds?.length) {
        console.log(`[Swag] Assigning swag ${swagItemId} to ${guestIds.length} guests`);
        for (const guestId of guestIds) {
          try {
            const assignment = await storage.createSwagAssignment({
              swagItemId,
              guestId,
              size,
              status: 'assigned',
            });
            console.log(`[Swag] Created assignment ${assignment.id} for guest ${guestId}`);
            assignments.push(assignment);
          } catch (assignError) {
            console.error(`[Swag] Failed to create assignment for guest ${guestId}:`, assignError);
          }
        }
      }
      
      console.log(`[Swag] Bulk assign complete: ${assignments.length} assignments created`);
      res.status(201).json(assignments);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("[Swag] Validation error:", error.errors);
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      console.error("Error creating bulk swag assignments:", error);
      res.status(500).json({ error: "Failed to create swag assignments" });
    }
  });

  // Update a swag assignment
  app.patch("/api/swag-assignments/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const assignment = await storage.updateSwagAssignment(req.params.id, req.body);
      if (!assignment) {
        return res.status(404).json({ error: "Swag assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      console.error("Error updating swag assignment:", error);
      res.status(500).json({ error: "Failed to update swag assignment" });
    }
  });

  // Mark swag as received
  app.post("/api/swag-assignments/:id/receive", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const assignment = await storage.markSwagReceived(req.params.id, req.user!.id);
      if (!assignment) {
        return res.status(404).json({ error: "Swag assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      console.error("Error marking swag as received:", error);
      res.status(500).json({ error: "Failed to mark swag as received" });
    }
  });

  // Delete a swag assignment
  app.delete("/api/swag-assignments/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      await storage.deleteSwagAssignment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting swag assignment:", error);
      res.status(500).json({ error: "Failed to delete swag assignment" });
    }
  });

  // ==================== QUALIFIED REGISTRANTS ====================

  // Get all qualified registrants across all events (admin only)
  app.get("/api/qualifiers", authenticateToken, requireRole("admin"), async (req: AuthenticatedRequest, res) => {
    try {
      const qualifiers = await storage.getAllQualifiedRegistrants();
      res.json(qualifiers);
    } catch (error) {
      console.error("Error fetching all qualified registrants:", error);
      res.status(500).json({ error: "Failed to fetch qualified registrants" });
    }
  });

  // Get all qualified registrants for an event
  app.get("/api/events/:eventId/qualifiers", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const qualifiers = await storage.getQualifiedRegistrantsByEvent(req.params.eventId);
      res.json(qualifiers);
    } catch (error) {
      console.error("Error fetching qualified registrants:", error);
      res.status(500).json({ error: "Failed to fetch qualified registrants" });
    }
  });

  // Check if an email is qualified for an event (public endpoint for registration check)
  app.get("/api/events/:eventId/qualifiers/check", async (req, res) => {
    try {
      const email = req.query.email as string;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      const qualifier = await storage.getQualifiedRegistrantByEmail(req.params.eventId, email);
      res.json({ qualified: !!qualifier, qualifier: qualifier || null });
    } catch (error) {
      console.error("Error checking qualification:", error);
      res.status(500).json({ error: "Failed to check qualification" });
    }
  });

  // Create a single qualified registrant
  app.post("/api/events/:eventId/qualifiers", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const data = { ...req.body, eventId: req.params.eventId, importedBy: req.user!.id };
      const validatedData = insertQualifiedRegistrantSchema.parse(data);
      const qualifier = await storage.createQualifiedRegistrant(validatedData);

      // NOTE: No automatic email is sent when admins add qualifiers.
      // Admins retain full control over if/when emails are sent manually.
      // This prevents confusion from automatic emails for admin-initiated actions.

      res.status(201).json(qualifier);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input", details: error.errors });
      }
      console.error("Error creating qualified registrant:", error);
      res.status(500).json({ error: "Failed to create qualified registrant" });
    }
  });

  // Bulk import qualified registrants from CSV data
  const csvImportSchema = z.object({
    registrants: z.array(z.object({
      firstName: z.string().min(1),
      lastName: z.string().default(""), // Allow empty last names for company names
      email: z.string().email(),
      unicityId: z.string().optional(),
      phone: z.string().optional(),
      locale: z.enum(["en", "es"]).optional().default("en"),
    })),
    clearExisting: z.boolean().optional().default(false),
    skipDuplicates: z.boolean().optional().default(false),
  });

  app.post("/api/events/:eventId/qualifiers/import", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const validated = csvImportSchema.parse(req.body);
      const eventId = req.params.eventId;
      const importedBy = req.user!.id;

      // Check for duplicate distributor IDs within the import data itself
      const importDuplicates: { unicityId: string; emails: string[] }[] = [];
      const unicityIdToEmails = new Map<string, string[]>();
      
      for (const r of validated.registrants) {
        if (r.unicityId && r.unicityId.trim()) {
          const normalizedId = r.unicityId.trim().toLowerCase();
          const existing = unicityIdToEmails.get(normalizedId) || [];
          existing.push(r.email.trim().toLowerCase());
          unicityIdToEmails.set(normalizedId, existing);
        }
      }
      
      // Find IDs that appear with multiple different emails
      for (const [unicityId, emails] of Array.from(unicityIdToEmails.entries())) {
        const uniqueEmails = Array.from(new Set(emails));
        if (uniqueEmails.length > 1) {
          importDuplicates.push({ unicityId, emails: uniqueEmails });
        }
      }
      
      // If duplicates found and not skipping, return error with details
      if (importDuplicates.length > 0 && !validated.skipDuplicates) {
        return res.status(400).json({
          error: "Duplicate distributor IDs found",
          message: `The following distributor IDs appear multiple times with different emails. This can cause verification codes to be sent to the wrong person.`,
          duplicates: importDuplicates,
          hint: "Please fix the data to ensure each distributor ID has only one email per event, or set skipDuplicates=true to import anyway (keeping only the first occurrence of each ID)."
        });
      }

      // Optionally clear existing qualifiers
      if (validated.clearExisting) {
        await storage.deleteQualifiedRegistrantsByEvent(eventId);
      }

      // If skipping duplicates, filter to keep only first occurrence of each distributor ID
      let registrantsToProcess = validated.registrants;
      const skippedDuplicates: string[] = [];
      
      if (validated.skipDuplicates && importDuplicates.length > 0) {
        const seenUnicityIds = new Set<string>();
        registrantsToProcess = validated.registrants.filter(r => {
          if (!r.unicityId || !r.unicityId.trim()) return true;
          const normalizedId = r.unicityId.trim().toLowerCase();
          if (seenUnicityIds.has(normalizedId)) {
            skippedDuplicates.push(`${r.email} (ID: ${r.unicityId})`);
            return false;
          }
          seenUnicityIds.add(normalizedId);
          return true;
        });
      }

      // Check for existing emails in the event's qualifier list (if not clearing)
      const alreadyExisted: string[] = [];
      if (!validated.clearExisting) {
        const existingQualifiers = await storage.getQualifiedRegistrantsByEvent(eventId);
        const existingEmails = new Set(existingQualifiers.map((q: { email: string }) => q.email.toLowerCase()));
        
        registrantsToProcess = registrantsToProcess.filter(r => {
          const normalizedEmail = r.email.trim().toLowerCase();
          if (existingEmails.has(normalizedEmail)) {
            alreadyExisted.push(r.email);
            return false;
          }
          return true;
        });
      }

      // Prepare registrants for bulk insert
      const registrantsToInsert = registrantsToProcess.map(r => ({
        eventId,
        firstName: r.firstName.trim(),
        lastName: r.lastName.trim(),
        email: r.email.trim().toLowerCase(),
        unicityId: r.unicityId?.trim() || null,
        phone: r.phone?.trim() || null,
        locale: r.locale || "en",
        importedBy,
      }));

      const created = await storage.createQualifiedRegistrantsBulk(registrantsToInsert);

      // NOTE: No automatic emails are sent when admins import qualifiers via CSV.
      // Admins retain full control over if/when emails are sent manually.
      // This prevents confusion from automatic emails for admin-initiated bulk imports.

      res.status(201).json({ 
        imported: created.length, 
        registrants: created,
        skippedDuplicates: skippedDuplicates.length > 0 ? skippedDuplicates : undefined,
        alreadyExisted: alreadyExisted.length > 0 ? alreadyExisted : undefined,
        warnings: [
          ...(skippedDuplicates.length > 0 ? [`Skipped ${skippedDuplicates.length} duplicate ID entries from CSV`] : []),
          ...(alreadyExisted.length > 0 ? [`Skipped ${alreadyExisted.length} emails that already exist in the list`] : []),
        ].length > 0 ? [
          ...(skippedDuplicates.length > 0 ? [`Skipped ${skippedDuplicates.length} duplicate ID entries from CSV`] : []),
          ...(alreadyExisted.length > 0 ? [`Skipped ${alreadyExisted.length} emails that already exist in the list`] : []),
        ] : undefined,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid CSV data", details: error.errors });
      }
      console.error("Error importing qualified registrants:", error);
      res.status(500).json({ error: "Failed to import qualified registrants" });
    }
  });

  // Update a qualified registrant
  app.patch("/api/qualifiers/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const qualifier = await storage.updateQualifiedRegistrant(req.params.id, req.body);
      if (!qualifier) {
        return res.status(404).json({ error: "Qualified registrant not found" });
      }
      res.json(qualifier);
    } catch (error) {
      console.error("Error updating qualified registrant:", error);
      res.status(500).json({ error: "Failed to update qualified registrant" });
    }
  });

  // Delete a qualified registrant
  app.delete("/api/qualifiers/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      await storage.deleteQualifiedRegistrant(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting qualified registrant:", error);
      res.status(500).json({ error: "Failed to delete qualified registrant" });
    }
  });

  // Delete all qualifiers for an event
  app.delete("/api/events/:eventId/qualifiers", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const deleted = await storage.deleteQualifiedRegistrantsByEvent(req.params.eventId);
      res.json({ deleted });
    } catch (error) {
      console.error("Error deleting qualified registrants:", error);
      res.status(500).json({ error: "Failed to delete qualified registrants" });
    }
  });

  // ========================================
  // Guest Allowance Rules Routes
  // ========================================

  // Get all guest allowance rules for an event
  app.get("/api/events/:eventId/guest-rules", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const rules = await storage.getGuestAllowanceRulesByEvent(req.params.eventId);
      res.json(rules);
    } catch (error) {
      console.error("Error fetching guest allowance rules:", error);
      res.status(500).json({ error: "Failed to fetch guest allowance rules" });
    }
  });

  // Get a single guest allowance rule
  app.get("/api/guest-rules/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const rule = await storage.getGuestAllowanceRule(req.params.id);
      if (!rule) {
        return res.status(404).json({ error: "Guest allowance rule not found" });
      }
      res.json(rule);
    } catch (error) {
      console.error("Error fetching guest allowance rule:", error);
      res.status(500).json({ error: "Failed to fetch guest allowance rule" });
    }
  });

  // Create a guest allowance rule
  app.post("/api/events/:eventId/guest-rules", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const { name, nameEs, description, descriptionEs, freeGuestCount, maxPaidGuests, paidGuestPriceCents, isDefault } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: "Rule name is required" });
      }
      
      // If this is set as default, first unset any existing default for this event
      if (isDefault) {
        const existingDefault = await storage.getDefaultGuestAllowanceRule(req.params.eventId);
        if (existingDefault) {
          await storage.updateGuestAllowanceRule(existingDefault.id, { isDefault: false });
        }
      }
      
      const rule = await storage.createGuestAllowanceRule({
        eventId: req.params.eventId,
        name,
        nameEs,
        description,
        descriptionEs,
        freeGuestCount: freeGuestCount || 0,
        maxPaidGuests: maxPaidGuests || 0,
        paidGuestPriceCents: paidGuestPriceCents || null,
        isDefault: isDefault || false,
      });
      
      res.status(201).json(rule);
    } catch (error) {
      console.error("Error creating guest allowance rule:", error);
      res.status(500).json({ error: "Failed to create guest allowance rule" });
    }
  });

  // Update a guest allowance rule
  app.patch("/api/guest-rules/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const existingRule = await storage.getGuestAllowanceRule(req.params.id);
      if (!existingRule) {
        return res.status(404).json({ error: "Guest allowance rule not found" });
      }
      
      // If setting this as default, unset other defaults first
      if (req.body.isDefault && !existingRule.isDefault) {
        await storage.setDefaultGuestAllowanceRule(existingRule.eventId, req.params.id);
      }
      
      const rule = await storage.updateGuestAllowanceRule(req.params.id, req.body);
      res.json(rule);
    } catch (error) {
      console.error("Error updating guest allowance rule:", error);
      res.status(500).json({ error: "Failed to update guest allowance rule" });
    }
  });

  // Delete a guest allowance rule
  app.delete("/api/guest-rules/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      await storage.deleteGuestAllowanceRule(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting guest allowance rule:", error);
      res.status(500).json({ error: "Failed to delete guest allowance rule" });
    }
  });

  // Assign a guest allowance rule to a qualifier
  app.patch("/api/qualifiers/:id/guest-rule", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const { guestAllowanceRuleId, freeGuestOverride, maxPaidGuestOverride, guestPriceOverride } = req.body;
      
      const qualifier = await storage.updateQualifiedRegistrant(req.params.id, {
        guestAllowanceRuleId,
        freeGuestOverride,
        maxPaidGuestOverride,
        guestPriceOverride,
      });
      
      if (!qualifier) {
        return res.status(404).json({ error: "Qualified registrant not found" });
      }
      
      res.json(qualifier);
    } catch (error) {
      console.error("Error assigning guest allowance rule:", error);
      res.status(500).json({ error: "Failed to assign guest allowance rule" });
    }
  });

  // Bulk assign guest allowance rule to multiple qualifiers
  app.post("/api/events/:eventId/qualifiers/bulk-assign-rule", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const { qualifierIds, guestAllowanceRuleId } = req.body;
      
      if (!Array.isArray(qualifierIds) || qualifierIds.length === 0) {
        return res.status(400).json({ error: "qualifierIds must be a non-empty array" });
      }
      
      const results = await Promise.all(
        qualifierIds.map(id => 
          storage.updateQualifiedRegistrant(id, { guestAllowanceRuleId })
        )
      );
      
      res.json({ updated: results.filter(r => r !== undefined).length });
    } catch (error) {
      console.error("Error bulk assigning guest allowance rules:", error);
      res.status(500).json({ error: "Failed to bulk assign guest allowance rules" });
    }
  });

  // ========================================
  // Event Page Routes (Visual CMS)
  // ========================================

  // Helper function to mask email for display (security: prevents email enumeration)
  function maskEmail(email: string): string {
    if (!email || !email.includes("@")) return "***@***.***";
    const [local, domain] = email.split("@");
    const domainParts = domain.split(".");
    const maskedLocal = local.length <= 2 
      ? local[0] + "***" 
      : local[0] + "***" + local.slice(-1);
    const maskedDomain = domainParts[0].length <= 2 
      ? domainParts[0][0] + "***" 
      : domainParts[0][0] + "***" + domainParts[0].slice(-1);
    const tld = domainParts.slice(1).join(".");
    return `${maskedLocal}@${maskedDomain}.${tld}`;
  }

  // Get qualifier info (public - for pre-populating registration form)
  // Accepts EITHER email OR distributorId (at least one required)
  // SECURITY: When only distributorId is provided, email is MASKED to prevent enumeration
  app.get("/api/public/qualifier-info/:eventId", async (req, res) => {
    try {
      const email = req.query.email as string;
      const distributorId = req.query.distributorId as string;
      
      // Require at least one of email or distributorId
      if (!email && !distributorId) {
        return res.status(400).json({ error: "Email or Distributor ID is required" });
      }
      
      const event = await storage.getEventByIdOrSlug(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      let qualifier = null;
      let existingRegistration = null;
      
      // Try to find qualifier by email first if provided
      if (email) {
        qualifier = await storage.getQualifiedRegistrantByEmail(event.id, email);
      }
      
      // If not found by email (or email not provided), try by distributorId
      if (!qualifier && distributorId) {
        qualifier = await storage.getQualifiedRegistrantByUnicityId(event.id, distributorId);
      }
      
      // If not in qualified list, check for existing registration (returning users)
      if (!qualifier) {
        if (email) {
          existingRegistration = await storage.getRegistrationByEmail(event.id, email);
        }
        if (!existingRegistration && distributorId) {
          existingRegistration = await storage.getRegistrationByUnicityId(event.id, distributorId);
        }
      }
      
      // If neither qualifier nor existing registration found, user is not eligible
      if (!qualifier && !existingRegistration) {
        return res.status(404).json({ 
          error: "You are not on the qualified list for this event. Please contact support if you believe this is an error." 
        });
      }
      
      // Use qualifier data if available, otherwise use registration data
      const userData = qualifier || existingRegistration;
      const userEmail = userData?.email || "";
      const userUnicityId = (qualifier?.unicityId || existingRegistration?.unicityId) || "";
      
      // If both email and distributorId provided, verify they match the record
      if (email && distributorId && userUnicityId && userUnicityId !== distributorId) {
        return res.status(403).json({ 
          error: "The distributor ID does not match our records. Please check your information." 
        });
      }
      
      if (email && distributorId && userEmail && userEmail.toLowerCase() !== email.toLowerCase()) {
        return res.status(403).json({ 
          error: "The email does not match our records for this distributor ID. Please check your information." 
        });
      }
      
      // SECURITY: If user provided email, they already know it - return full email
      // If user only provided distributorId, mask the email to prevent enumeration
      const lookupByDistributorIdOnly = distributorId && !email;
      
      res.json({
        firstName: userData?.firstName || "",
        lastName: userData?.lastName || "",
        unicityId: userUnicityId,
        email: lookupByDistributorIdOnly ? maskEmail(userEmail) : userEmail,
        emailMasked: lookupByDistributorIdOnly, // Tells frontend to use distributorId-based OTP flow
        isExistingRegistration: !!existingRegistration && !qualifier, // Let frontend know this is a returning user
      });
    } catch (error) {
      console.error("Error fetching qualifier info:", error);
      res.status(500).json({ error: "Failed to fetch qualifier info" });
    }
  });

  // Get event page with sections (public - for rendering landing pages)
  // Accepts optional ?pageType=login|registration|thank_you query param (defaults to registration)
  // Returns empty sections if CMS page doesn't exist (CMS content is OPTIONAL)
  app.get("/api/public/event-pages/:eventId", async (req, res) => {
    try {
      const event = await storage.getEventByIdOrSlug(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const pageType = (req.query.pageType as string) || "registration";
      const pageData = await storage.getEventPageWithSections(event.id, pageType);
      
      // Strip deprecated registrationSettings from event response
      const { registrationSettings, ...eventWithoutLegacy } = event;
      
      // CMS content is OPTIONAL - if no page exists or page is not published,
      // return a controlled response with empty sections instead of 404
      if (!pageData || pageData.page.status !== 'published') {
        return res.json({ 
          page: null, 
          sections: [], 
          event: eventWithoutLegacy,
          cmsAvailable: false 
        });
      }
      
      res.json({ ...pageData, event: eventWithoutLegacy, cmsAvailable: true });
    } catch (error) {
      console.error("Error fetching event page:", error);
      res.status(500).json({ error: "Failed to fetch event page" });
    }
  });

  // ========================================
  // Public Guest Registration Routes
  // ========================================

  // Get event info for guest registration (public)
  app.get("/api/public/events/:eventIdOrSlug/guest-registration-info", async (req, res) => {
    try {
      const event = await storage.getEventByIdOrSlug(req.params.eventIdOrSlug);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Check if event allows guests
      if (event.guestPolicy === "not_allowed") {
        return res.status(400).json({ error: "This event does not allow guests" });
      }

      // Check if event is published
      if (event.status !== "published" && event.status !== "private") {
        return res.status(400).json({ error: "Event is not available for registration" });
      }

      res.json({
        id: event.id,
        name: event.name,
        nameEs: event.nameEs,
        startDate: event.startDate,
        endDate: event.endDate,
        location: event.location,
        guestPolicy: event.guestPolicy,
        buyInPrice: event.buyInPrice,
        defaultLanguage: event.defaultLanguage,
      });
    } catch (error) {
      console.error("Error fetching guest registration info:", error);
      res.status(500).json({ error: "Failed to fetch event info" });
    }
  });

  // Lookup a qualifier/attendee by Unicity ID for guest registration (public)
  app.post("/api/public/events/:eventIdOrSlug/lookup-qualifier", async (req, res) => {
    try {
      const { unicityId } = req.body;
      if (!unicityId) {
        return res.status(400).json({ error: "Unicity ID is required" });
      }

      const event = await storage.getEventByIdOrSlug(req.params.eventIdOrSlug);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Check if event allows guests
      if (event.guestPolicy === "not_allowed") {
        return res.status(400).json({ error: "This event does not allow guests" });
      }

      // Look up the registration by Unicity ID
      const registration = await storage.getRegistrationByUnicityId(event.id, unicityId);
      if (!registration) {
        return res.status(404).json({ error: "No registered attendee found with this Unicity ID" });
      }

      // Return limited info for privacy
      res.json({
        registrationId: registration.id,
        firstName: registration.firstName,
        lastName: registration.lastName,
        unicityId: registration.unicityId,
      });
    } catch (error) {
      console.error("Error looking up qualifier:", error);
      res.status(500).json({ error: "Failed to look up attendee" });
    }
  });

  // Register a guest and create Stripe checkout session (public)
  app.post("/api/public/events/:eventIdOrSlug/register-guest", async (req, res) => {
    try {
      const { registrationId, firstName, lastName, email, phone, shirtSize, dietaryRestrictions } = req.body;

      if (!registrationId || !firstName || !lastName || !email) {
        return res.status(400).json({ error: "Registration ID, first name, last name, and email are required" });
      }

      const event = await storage.getEventByIdOrSlug(req.params.eventIdOrSlug);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      // Check if event allows guests
      if (event.guestPolicy === "not_allowed") {
        return res.status(400).json({ error: "This event does not allow guests" });
      }

      // Verify the registration exists and belongs to this event
      const registration = await storage.getRegistration(registrationId);
      if (!registration || registration.eventId !== event.id) {
        return res.status(404).json({ error: "Registration not found" });
      }

      // Determine if guest is paid or complimentary based on event policy
      const isPaidGuest = event.guestPolicy === "allowed_paid" || event.guestPolicy === "allowed_mixed";
      const requiresPayment = isPaidGuest && event.buyInPrice && event.buyInPrice > 0;

      // Create the guest record
      const guest = await storage.createGuest({
        registrationId,
        firstName,
        lastName,
        email,
        phone: phone || null,
        shirtSize: shirtSize || null,
        dietaryRestrictions: dietaryRestrictions || null,
        isComplimentary: !requiresPayment,
        amountPaidCents: requiresPayment ? event.buyInPrice! * 100 : 0,
        paymentStatus: requiresPayment ? "pending" : "not_required",
      });

      // If payment is required, return error (payment processing not currently configured)
      if (requiresPayment) {
        // Delete the guest record since payment can't be processed
        await storage.deleteGuest(guest.id);
        return res.status(503).json({ error: "Payment processing is not currently available" });
      }

      // No payment required
      res.status(201).json({
        guest,
        checkoutUrl: null,
        requiresPayment: false,
      });
    } catch (error) {
      console.error("Error registering guest:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid guest data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to register guest" });
    }
  });

  // Verify guest payment - payment processing not currently configured
  app.post("/api/public/verify-guest-payment", async (req, res) => {
    return res.status(503).json({ error: "Payment processing is not currently available" });
  });

  /**
   * @deprecated Use /api/events/:eventId/pages/:pageType instead
   * Legacy single-page route - defaults to registration page type
   */
  app.get("/api/events/:eventId/page", authenticateToken, requireRole("admin", "event_manager", "marketing"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEventByIdOrSlug(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const pageData = await storage.getEventPageWithSections(event.id, "registration");
      res.json(pageData || null);
    } catch (error) {
      console.error("Error fetching event page:", error);
      res.status(500).json({ error: "Failed to fetch event page" });
    }
  });

  // Get event page by type for admin (includes draft) - auto-creates if missing
  app.get("/api/events/:eventId/pages/:pageType", authenticateToken, requireRole("admin", "event_manager", "marketing"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEventByIdOrSlug(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const pageType = req.params.pageType || "registration";
      let pageData = await storage.getEventPageWithSections(event.id, pageType);
      
      // Auto-create page if it doesn't exist (idempotent)
      if (!pageData) {
        try {
          const page = await storage.createEventPage({
            eventId: event.id,
            pageType,
            status: 'draft'
          });
          
          // Create default sections
          const defaultSections = getDefaultSectionsForPageType(pageType, event);
          for (let i = 0; i < defaultSections.length; i++) {
            await storage.createEventPageSection({
              pageId: page.id,
              type: defaultSections[i].type,
              position: i,
              isEnabled: true,
              content: defaultSections[i].content
            });
          }
          
          // Fetch the complete page data
          pageData = await storage.getEventPageWithSections(event.id, pageType);
        } catch (createError) {
          console.error("Error auto-creating page:", createError);
          // If creation failed, still return null - let POST route handle it
        }
      }
      
      res.json(pageData || null);
    } catch (error) {
      console.error("Error fetching event page:", error);
      res.status(500).json({ error: "Failed to fetch event page" });
    }
  });

  // Create or update event page - legacy route (defaults to registration)
  app.post("/api/events/:eventId/page", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      let page = await storage.getEventPageByEventId(event.id, "registration");
      
      if (page) {
        page = await storage.updateEventPage(page.id, req.body);
      } else {
        page = await storage.createEventPage({
          eventId: event.id,
          pageType: "registration",
          ...req.body
        });
      }
      
      res.json(page);
    } catch (error) {
      console.error("Error saving event page:", error);
      res.status(500).json({ error: "Failed to save event page" });
    }
  });

  // Create or update event page by type
  app.post("/api/events/:eventId/pages/:pageType", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const pageType = req.params.pageType || "registration";
      let page = await storage.getEventPageByEventId(event.id, pageType);
      
      if (page) {
        page = await storage.updateEventPage(page.id, req.body);
      } else {
        page = await storage.createEventPage({
          eventId: event.id,
          pageType,
          ...req.body
        });
        
        // Auto-create default sections based on page type
        try {
          const defaultSections = getDefaultSectionsForPageType(pageType, event);
          for (let i = 0; i < defaultSections.length; i++) {
            await storage.createEventPageSection({
              pageId: page.id,
              type: defaultSections[i].type,
              position: i,
              isEnabled: true,
              content: defaultSections[i].content
            });
          }
        } catch (sectionError) {
          console.error("Error creating default sections (non-fatal):", sectionError);
          // Continue - page was created, sections can be added manually
        }
      }
      
      res.json(page);
    } catch (error) {
      console.error("Error saving event page:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: "Failed to save event page", details: errorMessage });
    }
  });

  // Publish event page - legacy route
  app.post("/api/events/:eventId/page/publish", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const page = await storage.getEventPageByEventId(event.id, "registration");
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      
      const updated = await storage.updateEventPage(page.id, {
        status: 'published',
        publishedAt: new Date()
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error publishing event page:", error);
      res.status(500).json({ error: "Failed to publish event page" });
    }
  });

  // Publish event page by type
  app.post("/api/events/:eventId/pages/:pageType/publish", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const pageType = req.params.pageType || "registration";
      const page = await storage.getEventPageByEventId(event.id, pageType);
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      
      const updated = await storage.updateEventPage(page.id, {
        status: 'published',
        publishedAt: new Date()
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error publishing event page:", error);
      res.status(500).json({ error: "Failed to publish event page" });
    }
  });

  // Unpublish event page (set to draft) - legacy route
  app.post("/api/events/:eventId/page/unpublish", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const page = await storage.getEventPageByEventId(event.id, "registration");
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      
      const updated = await storage.updateEventPage(page.id, { status: 'draft' });
      res.json(updated);
    } catch (error) {
      console.error("Error unpublishing event page:", error);
      res.status(500).json({ error: "Failed to unpublish event page" });
    }
  });

  // Unpublish event page by type
  app.post("/api/events/:eventId/pages/:pageType/unpublish", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const pageType = req.params.pageType || "registration";
      const page = await storage.getEventPageByEventId(event.id, pageType);
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      
      const updated = await storage.updateEventPage(page.id, { status: 'draft' });
      res.json(updated);
    } catch (error) {
      console.error("Error unpublishing event page:", error);
      res.status(500).json({ error: "Failed to unpublish event page" });
    }
  });

  // Delete event page - legacy route
  app.delete("/api/events/:eventId/page", authenticateToken, requireRole("admin"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const page = await storage.getEventPageByEventId(event.id, "registration");
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      
      await storage.deleteEventPage(page.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting event page:", error);
      res.status(500).json({ error: "Failed to delete event page" });
    }
  });

  // ========================================
  // Event Page Section Routes
  // ========================================

  // Add a section to event page - legacy route
  app.post("/api/events/:eventId/page/sections", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      let page = await storage.getEventPageByEventId(event.id, "registration");
      if (!page) {
        page = await storage.createEventPage({ eventId: event.id, pageType: "registration" });
      }
      
      const existingSections = await storage.getEventPageSections(page.id);
      const maxPosition = existingSections.length > 0 
        ? Math.max(...existingSections.map(s => s.position)) + 1 
        : 0;
      
      const section = await storage.createEventPageSection({
        pageId: page.id,
        type: req.body.type,
        position: req.body.position ?? maxPosition,
        isEnabled: req.body.isEnabled ?? true,
        content: req.body.content || {}
      });
      
      res.status(201).json(section);
    } catch (error) {
      console.error("Error adding section:", error);
      res.status(500).json({ error: "Failed to add section" });
    }
  });

  // Add a section to event page by type
  app.post("/api/events/:eventId/pages/:pageType/sections", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const pageType = req.params.pageType || "registration";
      let page = await storage.getEventPageByEventId(event.id, pageType);
      if (!page) {
        page = await storage.createEventPage({ eventId: event.id, pageType });
      }
      
      const existingSections = await storage.getEventPageSections(page.id);
      const maxPosition = existingSections.length > 0 
        ? Math.max(...existingSections.map(s => s.position)) + 1 
        : 0;
      
      const section = await storage.createEventPageSection({
        pageId: page.id,
        type: req.body.type,
        position: req.body.position ?? maxPosition,
        isEnabled: req.body.isEnabled ?? true,
        content: req.body.content || {}
      });
      
      res.status(201).json(section);
    } catch (error) {
      console.error("Error adding section:", error);
      res.status(500).json({ error: "Failed to add section" });
    }
  });

  // Update a section - works for both legacy and new routes
  app.patch("/api/events/:eventId/page/sections/:sectionId", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const section = await storage.updateEventPageSection(req.params.sectionId, req.body);
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }
      res.json(section);
    } catch (error) {
      console.error("Error updating section:", error);
      res.status(500).json({ error: "Failed to update section" });
    }
  });

  // Update a section by page type
  app.patch("/api/events/:eventId/pages/:pageType/sections/:sectionId", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const section = await storage.updateEventPageSection(req.params.sectionId, req.body);
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }
      res.json(section);
    } catch (error) {
      console.error("Error updating section:", error);
      res.status(500).json({ error: "Failed to update section" });
    }
  });

  // Delete a section - legacy route
  app.delete("/api/events/:eventId/page/sections/:sectionId", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      await storage.deleteEventPageSection(req.params.sectionId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting section:", error);
      res.status(500).json({ error: "Failed to delete section" });
    }
  });

  // Delete a section by page type
  app.delete("/api/events/:eventId/pages/:pageType/sections/:sectionId", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      await storage.deleteEventPageSection(req.params.sectionId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting section:", error);
      res.status(500).json({ error: "Failed to delete section" });
    }
  });

  // Reorder sections - legacy route
  app.post("/api/events/:eventId/page/sections/reorder", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const page = await storage.getEventPageByEventId(event.id, "registration");
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      
      const { sectionIds } = req.body;
      if (!Array.isArray(sectionIds)) {
        return res.status(400).json({ error: "sectionIds must be an array" });
      }
      
      await storage.reorderEventPageSections(page.id, sectionIds);
      
      const sections = await storage.getEventPageSections(page.id);
      res.json(sections);
    } catch (error) {
      console.error("Error reordering sections:", error);
      res.status(500).json({ error: "Failed to reorder sections" });
    }
  });

  // Reorder sections by page type
  app.post("/api/events/:eventId/pages/:pageType/sections/reorder", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const pageType = req.params.pageType || "registration";
      const page = await storage.getEventPageByEventId(event.id, pageType);
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      
      const { sectionIds } = req.body;
      if (!Array.isArray(sectionIds)) {
        return res.status(400).json({ error: "sectionIds must be an array" });
      }
      
      await storage.reorderEventPageSections(page.id, sectionIds);
      
      const sections = await storage.getEventPageSections(page.id);
      res.json(sections);
    } catch (error) {
      console.error("Error reordering sections:", error);
      res.status(500).json({ error: "Failed to reorder sections" });
    }
  });

  // ==================== PRINTER MANAGEMENT ====================

  // Get printers for an event
  app.get("/api/events/:eventId/printers", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const printers = await storage.getPrintersByEvent(req.params.eventId);
      res.json(printers);
    } catch (error) {
      console.error("Error fetching printers:", error);
      res.status(500).json({ error: "Failed to fetch printers" });
    }
  });

  // Get a single printer
  app.get("/api/printers/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const printer = await storage.getPrinter(req.params.id);
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }
      res.json(printer);
    } catch (error) {
      console.error("Error fetching printer:", error);
      res.status(500).json({ error: "Failed to fetch printer" });
    }
  });

  // Create a printer
  app.post("/api/events/:eventId/printers", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = insertPrinterSchema.safeParse({
        ...req.body,
        eventId: req.params.eventId,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid printer data", details: parsed.error.errors });
      }
      const printer = await storage.createPrinter(parsed.data);
      res.status(201).json(printer);
    } catch (error) {
      console.error("Error creating printer:", error);
      res.status(500).json({ error: "Failed to create printer" });
    }
  });

  // Update a printer
  app.patch("/api/printers/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const printer = await storage.updatePrinter(req.params.id, req.body);
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }
      res.json(printer);
    } catch (error) {
      console.error("Error updating printer:", error);
      res.status(500).json({ error: "Failed to update printer" });
    }
  });

  // Delete a printer
  app.delete("/api/printers/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const deleted = await storage.deletePrinter(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Printer not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting printer:", error);
      res.status(500).json({ error: "Failed to delete printer" });
    }
  });

  // ==================== PRINT JOBS ====================

  // Get print logs for a registration
  app.get("/api/registrations/:registrationId/print-logs", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const logs = await storage.getPrintLogsByRegistration(req.params.registrationId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching print logs:", error);
      res.status(500).json({ error: "Failed to fetch print logs" });
    }
  });

  // Get print logs for an event
  app.get("/api/events/:eventId/print-logs", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const logs = await storage.getPrintLogsByEvent(req.params.eventId);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching print logs:", error);
      res.status(500).json({ error: "Failed to fetch print logs" });
    }
  });

  // Create a print job (request badge print)
  app.post("/api/registrations/:registrationId/print", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const registration = await storage.getRegistration(req.params.registrationId);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }

      const { printerId, guestId, zplSnapshot } = req.body;

      const logData = {
        registrationId: req.params.registrationId,
        guestId: guestId || null,
        printerId: printerId || null,
        status: "pending" as const,
        zplSnapshot: zplSnapshot || null,
        requestedBy: req.user!.id,
      };

      const printLog = await storage.createPrintLog(logData);
      res.status(201).json(printLog);
    } catch (error) {
      console.error("Error creating print job:", error);
      res.status(500).json({ error: "Unable to print badge. Please try again." });
    }
  });

  // Record a badge print (called after successful print via print bridge)
  app.post("/api/registrations/:registrationId/record-print", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const { registrationId } = req.params;
      const { printerId, guestId } = req.body;

      const registration = await storage.getRegistration(registrationId);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }

      // Create a print log entry to record this print
      const printLog = await storage.createPrintLog({
        registrationId,
        guestId: guestId || null,
        printerId: printerId || null,
        status: "success",
        zplSnapshot: null,
        requestedBy: req.user!.id,
      });

      // Update the print log as completed
      await storage.updatePrintLog(printLog.id, {
        status: "success",
        completedAt: new Date(),
      });

      // Record badge print count on the registration
      await storage.recordBadgePrint(registrationId);

      res.json({ success: true, printLogId: printLog.id });
    } catch (error) {
      console.error("Error recording badge print:", error);
      res.status(500).json({ error: "Failed to record badge print" });
    }
  });

  // Forward print job to print bridge (proxy endpoint)
  app.post("/api/print-bridge/print", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const { registrationId, printerId, guestId, templateId } = req.body;

      if (!registrationId || !printerId) {
        return res.status(400).json({ error: "Missing registrationId or printerId" });
      }

      const registration = await storage.getRegistration(registrationId);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }

      const event = await storage.getEvent(registration.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      const printer = await storage.getPrinter(printerId);
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      // Build QR data for the badge
      const qrData = `REG:${registration.id}:${event.id}:attendee`;

      const badgeData = {
        firstName: registration.firstName,
        lastName: registration.lastName,
        eventName: event.name,
        registrationId: registration.id,
        eventId: event.id,
        unicityId: registration.unicityId || "",
        role: "",
        qrData,
      };

      // Check if we should use a custom template
      let badgeTemplate = null;
      if (templateId) {
        badgeTemplate = await storage.getBadgeTemplate(templateId);
      } else {
        badgeTemplate = await storage.getDefaultBadgeTemplate(registration.eventId);
      }

      const printLog = await storage.createPrintLog({
        registrationId,
        guestId: guestId || null,
        printerId,
        status: "pending",
        zplSnapshot: null,
        requestedBy: req.user!.id,
      });

      const bridgeUrl = process.env.PRINT_BRIDGE_URL || "http://127.0.0.1:3100";

      try {
        await storage.updatePrintLog(printLog.id, { status: "sent", sentAt: new Date() });

        let bridgeResponse;
        let bridgeResult;

        if (badgeTemplate) {
          // Use custom template with /print-raw endpoint
          let zpl = badgeTemplate.zplTemplate;
          
          // Interpolate all placeholders
          Object.entries(badgeData).forEach(([key, value]) => {
            zpl = zpl.replace(new RegExp(`{{${key}}}`, 'g'), String(value || ""));
          });

          // Save ZPL snapshot for debugging
          await storage.updatePrintLog(printLog.id, { zplSnapshot: zpl });

          bridgeResponse = await fetch(`${bridgeUrl}/print-raw`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              printer: {
                id: printer.id,
                name: printer.name,
                ipAddress: printer.ipAddress,
                port: printer.port || 9100,
              },
              zpl,
            }),
          });
        } else {
          // Use default print bridge rendering (backward compatible)
          bridgeResponse = await fetch(`${bridgeUrl}/print`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              printer: {
                id: printer.id,
                name: printer.name,
                ipAddress: printer.ipAddress,
                port: printer.port || 9100,
              },
              badge: badgeData,
            }),
          });
        }

        bridgeResult = await bridgeResponse.json();

        if (bridgeResponse.ok) {
          await storage.updatePrintLog(printLog.id, { 
            status: "success", 
            completedAt: new Date(),
            retryCount: bridgeResult.retryCount || 0,
          });
          await storage.recordBadgePrint(registrationId);
          await storage.updatePrinter(printerId, { status: "online" });

          res.json({
            success: true,
            jobId: bridgeResult.jobId,
            printLogId: printLog.id,
            usedTemplate: badgeTemplate?.name || null,
          });
        } else {
          await storage.updatePrintLog(printLog.id, {
            status: "failed",
            errorMessage: bridgeResult.details || bridgeResult.error || "Print failed",
            completedAt: new Date(),
          });
          await storage.updatePrinter(printerId, { status: "offline" });

          res.status(500).json({
            success: false,
            error: bridgeResult.error || "Print failed",
            details: bridgeResult.details,
            printLogId: printLog.id,
          });
        }
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : "Bridge connection failed";
        await storage.updatePrintLog(printLog.id, {
          status: "failed",
          errorMessage: `Bridge error: ${errorMsg}`,
          completedAt: new Date(),
        });

        res.status(503).json({
          success: false,
          error: "Print bridge unavailable",
          details: errorMsg,
          printLogId: printLog.id,
        });
      }
    } catch (error) {
      console.error("Error forwarding to print bridge:", error);
      res.status(500).json({ error: "Failed to process print request" });
    }
  });

  // Check print bridge health
  app.get("/api/print-bridge/health", authenticateToken, async (_req: AuthenticatedRequest, res) => {
    try {
      const bridgeUrl = process.env.PRINT_BRIDGE_URL || "http://127.0.0.1:3100";
      const response = await fetch(`${bridgeUrl}/health`, { method: "GET" });
      const health = await response.json();
      res.json({ connected: true, ...health });
    } catch (error) {
      res.json({ connected: false, error: "Print bridge not reachable" });
    }
  });

  // Update print job status (called after sending to bridge)
  app.patch("/api/print-logs/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { status, errorMessage } = req.body;
      const updateData: Record<string, unknown> = { status };
      
      if (status === "sent") {
        updateData.sentAt = new Date();
      } else if (status === "success") {
        updateData.completedAt = new Date();
        const log = await storage.getPrintLog(req.params.id);
        if (log) {
          await storage.recordBadgePrint(log.registrationId);
        }
      } else if (status === "failed") {
        updateData.errorMessage = errorMessage || "Print failed";
      }

      const printLog = await storage.updatePrintLog(req.params.id, updateData);
      if (!printLog) {
        return res.status(404).json({ error: "Print log not found" });
      }
      res.json(printLog);
    } catch (error) {
      console.error("Error updating print log:", error);
      res.status(500).json({ error: "Failed to update print log" });
    }
  });

  // ==================== BADGE TEMPLATES ====================

  // Get badge templates for an event (includes global templates)
  app.get("/api/events/:eventId/badge-templates", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const templates = await storage.getBadgeTemplatesByEvent(req.params.eventId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching badge templates:", error);
      res.status(500).json({ error: "Failed to fetch badge templates" });
    }
  });

  // Get a single badge template
  app.get("/api/badge-templates/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const template = await storage.getBadgeTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Badge template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching badge template:", error);
      res.status(500).json({ error: "Failed to fetch badge template" });
    }
  });

  // Get default badge template for an event
  app.get("/api/events/:eventId/badge-templates/default", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const template = await storage.getDefaultBadgeTemplate(req.params.eventId);
      res.json(template || null);
    } catch (error) {
      console.error("Error fetching default badge template:", error);
      res.status(500).json({ error: "Failed to fetch default badge template" });
    }
  });

  // Create a badge template
  app.post("/api/events/:eventId/badge-templates", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = insertBadgeTemplateSchema.safeParse({
        ...req.body,
        eventId: req.params.eventId,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid badge template data", details: parsed.error.errors });
      }
      const template = await storage.createBadgeTemplate(parsed.data);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating badge template:", error);
      res.status(500).json({ error: "Failed to create badge template" });
    }
  });

  // Create a global badge template (no event association)
  app.post("/api/badge-templates", authenticateToken, requireRole("admin"), async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = insertBadgeTemplateSchema.safeParse({
        ...req.body,
        eventId: null,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid badge template data", details: parsed.error.errors });
      }
      const template = await storage.createBadgeTemplate(parsed.data);
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating global badge template:", error);
      res.status(500).json({ error: "Failed to create badge template" });
    }
  });

  // Update a badge template
  app.patch("/api/badge-templates/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const template = await storage.updateBadgeTemplate(req.params.id, req.body);
      if (!template) {
        return res.status(404).json({ error: "Badge template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error updating badge template:", error);
      res.status(500).json({ error: "Failed to update badge template" });
    }
  });

  // Delete a badge template
  app.delete("/api/badge-templates/:id", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const deleted = await storage.deleteBadgeTemplate(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Badge template not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting badge template:", error);
      res.status(500).json({ error: "Failed to delete badge template" });
    }
  });

  // Set default badge template for an event
  app.post("/api/events/:eventId/badge-templates/:templateId/set-default", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      await storage.setDefaultBadgeTemplate(req.params.eventId, req.params.templateId);
      const template = await storage.getBadgeTemplate(req.params.templateId);
      res.json(template);
    } catch (error) {
      console.error("Error setting default badge template:", error);
      res.status(500).json({ error: "Failed to set default badge template" });
    }
  });

  // Test print badge template (sends sample data to printer)
  app.post("/api/badge-templates/:id/test-print", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const { printerId } = req.body;
      
      if (!printerId) {
        return res.status(400).json({ error: "Missing printerId" });
      }

      const template = await storage.getBadgeTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Badge template not found" });
      }

      const printer = await storage.getPrinter(printerId);
      if (!printer) {
        return res.status(404).json({ error: "Printer not found" });
      }

      // Use sample data for test print
      const sampleData = {
        firstName: "John",
        lastName: "Doe",
        eventName: "Sample Event",
        unicityId: "12345678",
        role: "Attendee",
        qrData: "SAMPLE-QR-DATA",
      };

      // Interpolate template with sample data
      let zpl = template.zplTemplate;
      Object.entries(sampleData).forEach(([key, value]) => {
        zpl = zpl.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });

      const bridgeUrl = process.env.PRINT_BRIDGE_URL || "http://127.0.0.1:3100";

      try {
        const bridgeResponse = await fetch(`${bridgeUrl}/print-raw`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            printer: {
              id: printer.id,
              name: printer.name,
              ipAddress: printer.ipAddress,
              port: printer.port || 9100,
            },
            zpl,
          }),
        });

        const bridgeResult = await bridgeResponse.json();

        if (bridgeResponse.ok) {
          await storage.updatePrinter(printerId, { status: "online" });
          res.json({ success: true, jobId: bridgeResult.jobId });
        } else {
          await storage.updatePrinter(printerId, { status: "offline" });
          res.status(500).json({
            success: false,
            error: bridgeResult.error || "Test print failed",
            details: bridgeResult.details,
          });
        }
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : "Bridge connection failed";
        res.status(503).json({
          success: false,
          error: "Print bridge unavailable",
          details: errorMsg,
        });
      }
    } catch (error) {
      console.error("Error sending test print:", error);
      res.status(500).json({ error: "Failed to send test print" });
    }
  });

  return httpServer;
}
