import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, insertRegistrationSchema, insertGuestSchema, insertFlightSchema, insertReimbursementSchema, insertSwagItemSchema, insertSwagAssignmentSchema, insertQualifiedRegistrantSchema, insertUserSchema, userRoleEnum } from "@shared/schema";
import { z } from "zod";
import { stripeService } from "./stripeService";
import { getStripePublishableKey } from "./stripeClient";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { iterableService } from "./iterable";

const HYDRA_API_BASE = process.env.NODE_ENV === "production" 
  ? "https://hydra.unicity.net/v6"
  : "https://hydraqa.unicity.net/v6-test";

// Fallback admin emails for initial setup (used only if no users exist in database)
const FALLBACK_ADMIN_EMAILS = [
  "colby.cook@unicity.com",
  "biani.gonzalez@unicity.com",
  "ashley.milliken@unicity.com",
  "william.hall@unicity.com",
];

// Check if email is an authorized admin (database-driven with fallback)
async function isAdminEmail(email: string): Promise<boolean> {
  const normalized = email.toLowerCase().trim();
  // Reject any email with a plus sign - these are aliases
  if (normalized.includes('+')) {
    return false;
  }
  
  // Check if user exists in the database
  const user = await storage.getUserByEmail(normalized);
  if (user) {
    return true; // User exists in database, they're authorized
  }
  
  // Fallback: Check hardcoded list (for bootstrapping first admin)
  // This allows initial admins to log in before they're in the database
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
  
  // Auth Routes
  app.post("/api/auth/otp/generate", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

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
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: "Email and code are required" });
      }

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
        // Include the validation_id from the OTP session
        console.log("Admin Hydra OTP validation - email:", email, "validation_id:", session.validationId);
        const response = await fetch(`${HYDRA_API_BASE}/otp/magic-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email, 
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
        // Only whitelisted emails get admin role (exact match, no plus aliases)
        const role = await isAdminEmail(email) ? "admin" : "readonly";
        user = await storage.createUser({
          email,
          name: email.split("@")[0],
          role,
          customerId,
        });
      } else {
        // Verify and correct role on each login to prevent unauthorized admin access
        const expectedRole = await isAdminEmail(email) ? "admin" : "readonly";
        if (user.role === "admin" && expectedRole !== "admin") {
          // Demote user who shouldn't be admin
          await storage.updateUser(user.id, { role: "readonly" });
          user = { ...user, role: "readonly" };
          console.log(`Security: Demoted user ${email} from admin to readonly`);
        }
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

  // Public Registration OTP (for distributor verification - no admin whitelist)
  app.post("/api/register/otp/generate", async (req, res) => {
    try {
      const { email, eventId } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Verify event exists and is published
      if (eventId) {
        const event = await storage.getEventByIdOrSlug(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }
        if (event.status !== "published") {
          return res.status(400).json({ error: "Registration is not open for this event" });
        }
        
        // Check if user is qualified for this event (or already registered)
        if (event.requiresQualification) {
          const normalizedEmail = email.toLowerCase().trim();
          const qualifier = await storage.getQualifiedRegistrantByEmail(event.id, normalizedEmail);
          const existingRegistration = await storage.getRegistrationByEmail(event.id, normalizedEmail);
          
          if (!qualifier && !existingRegistration) {
            return res.status(403).json({ 
              error: `You are not qualified for this event. The email "${normalizedEmail}" was not found in the qualified list. If you believe this is an error, please contact americasevent@unicity.com` 
            });
          }
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
      });

      res.json({ success: true, message: "Verification code sent" });
    } catch (error) {
      console.error("Registration OTP generate error:", error);
      res.status(500).json({ error: "Failed to send verification code. Please try again." });
    }
  });

  app.post("/api/register/otp/validate", async (req, res) => {
    try {
      const { email, code, eventId } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: "Email and code are required" });
      }

      // Verify there's a pending session
      const session = await storage.getOtpSession(email);
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
          email: email,
        };
      } else {
        // Validate with Hydra (works in all environments)
        // Include the validation_id from the OTP session
        console.log("Validating OTP with Hydra for email:", email, "code length:", code?.length, "validation_id:", session.validationId);
        const response = await fetch(`${HYDRA_API_BASE}/otp/magic-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            email, 
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
          // For qualified registrants, we should still allow them to proceed
          if (errorMessage.toLowerCase().includes("customer not found") && eventId) {
            console.log("Customer not found in Hydra, checking qualified list for eventId:", eventId);
            const event = await storage.getEventByIdOrSlug(eventId);
            if (event) {
              const qualifiedRegistrant = await storage.getQualifiedRegistrantByEmail(event.id, email);
              if (qualifiedRegistrant) {
                console.log("User is in qualified list, allowing verification:", qualifiedRegistrant);
                isValid = true;
                // Use qualifier data as customer data
                customerData = {
                  id: { unicity: qualifiedRegistrant.unicityId },
                  humanName: { 
                    firstName: qualifiedRegistrant.firstName || "", 
                    lastName: qualifiedRegistrant.lastName || "" 
                  },
                  email: email,
                };
              } else {
                return res.status(400).json({ error: errorMessage });
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
      await storage.updateOtpSession(session.id, {
        verified: true,
        verifiedAt: new Date(),
        customerId,
        bearerToken,
        redirectToken,
        redirectTokenExpiresAt,
        redirectTokenConsumed: false,
        customerData,
      });

      // Check qualification if event requires it
      let isQualified = true;
      let qualificationMessage = "";
      
      if (eventId) {
        const event = await storage.getEventByIdOrSlug(eventId);
        if (event?.requiresQualification) {
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
              qualificationMessage = "You are not on the qualified registrants list for this event.";
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
      const profile = {
        unicityId: customerData?.id?.unicity || customerData?.unicity_id || qualifierData?.unicityId || "",
        email: email,
        firstName: customerData?.humanName?.firstName || customerData?.first_name || qualifierData?.firstName || "",
        lastName: customerData?.humanName?.lastName || customerData?.last_name || qualifierData?.lastName || "",
        phone: customerData?.phone || customerData?.mobilePhone || "",
        customerId: customerId,
      };

      console.log("Profile extracted:", profile);

      // Check if this is an admin email - if so, create auth session
      let authToken: string | undefined;
      let adminUser: any | undefined;
      
      if (email.toLowerCase().endsWith("@unicity.com")) {
        // Find or create admin user
        let user = await storage.getUserByEmail(email);
        if (!user) {
          // Create new admin user
          user = await storage.createUser({
            email: email.toLowerCase(),
            name: email.split("@")[0],
            role: "admin",
          });
        }
        
        // Create auth session with full session data
        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const session = await storage.createAuthSession({
          token: sessionToken,
          userId: user.id,
          email: user.email,
          expiresAt,
        });
        authToken = session.token;
        adminUser = user;
      }

      res.json({ 
        success: true, 
        verified: true,
        verifiedByHydra,
        profile,
        isQualified,
        qualificationMessage,
        redirectToken,
        // Include auth token for admin users
        token: authToken,
        user: adminUser,
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

      const user = await storage.createUser(parsed.data);
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
      
      // Event managers only see their own events
      if (user.role === "event_manager") {
        const events = await storage.getEventsForManager(user.id);
        res.json(events);
      } else {
        // Admins, marketing, readonly see all events
        const events = await storage.getEvents();
        res.json(events);
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
        requiresVerification: event.requiresVerification,
        requiresQualification: event.requiresQualification,
        qualificationStartDate: event.qualificationStartDate,
        qualificationEndDate: event.qualificationEndDate,
      });
    } catch (error) {
      console.error("Get public event error:", error);
      res.status(500).json({ error: "Failed to get event" });
    }
  });

  app.post("/api/events", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
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
        requiresVerification: req.body.requiresVerification !== undefined ? req.body.requiresVerification : true,
        guestPolicy,
        createdBy: req.user!.id,
      };
      
      // Only include buyInPrice if it has a value (otherwise omit to allow DB null)
      if (buyInPrice !== null && buyInPrice !== undefined) {
        eventData.buyInPrice = buyInPrice;
      } else {
        delete eventData.buyInPrice;
      }
      
      const data = insertEventSchema.parse(eventData);
      const event = await storage.createEvent(data);
      res.status(201).json(event);
    } catch (error) {
      console.error("Create event error:", error);
      if (error instanceof z.ZodError) {
        console.error("Zod validation errors:", JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ error: "Invalid event data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create event" });
    }
  });

  app.patch("/api/events/:id", authenticateToken, requireRole("admin", "event_manager"), async (req, res) => {
    try {
      // Normalize slug: empty/whitespace -> null
      const normalizedSlug = req.body.slug !== undefined 
        ? (req.body.slug?.trim() || null) 
        : undefined;
      
      // Normalize formTemplateId: empty/whitespace -> null
      const normalizedFormTemplateId = req.body.formTemplateId !== undefined
        ? (req.body.formTemplateId?.trim() || null)
        : undefined;
      
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
      if (req.body.requiresQualification !== undefined) updates.requiresQualification = req.body.requiresQualification;
      if (req.body.registrationLayout !== undefined) updates.registrationLayout = req.body.registrationLayout;
      if (req.body.requiresVerification !== undefined) updates.requiresVerification = req.body.requiresVerification;
      if (req.body.formFields !== undefined) updates.formFields = req.body.formFields;
      if (normalizedFormTemplateId !== undefined) updates.formTemplateId = normalizedFormTemplateId;
      if (normalizedSlug !== undefined) updates.slug = normalizedSlug;
      
      // Handle dates
      if (req.body.startDate) updates.startDate = new Date(req.body.startDate);
      if (req.body.endDate) updates.endDate = new Date(req.body.endDate);
      if (req.body.qualificationStartDate) updates.qualificationStartDate = new Date(req.body.qualificationStartDate);
      if (req.body.qualificationEndDate) updates.qualificationEndDate = new Date(req.body.qualificationEndDate);
      
      const event = await storage.updateEvent(req.params.id, updates);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error: any) {
      console.error("Update event error:", error);
      const message = error?.message || "Failed to update event";
      res.status(500).json({ error: "Failed to update event", details: message });
    }
  });

  app.delete("/api/events/:id", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteEvent(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete event error:", error);
      res.status(500).json({ error: "Failed to delete event" });
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
    try {
      const event = await storage.getEventByIdOrSlug(req.params.eventIdOrSlug);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }

      if (event.status !== "published") {
        return res.status(400).json({ error: "Registration is not open for this event" });
      }

      const existingReg = await storage.getRegistrationByEmail(event.id, req.body.email);
      if (existingReg) {
        return res.status(400).json({ error: "You are already registered for this event" });
      }

      const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

      const registration = await storage.createRegistration({
        eventId: event.id,
        email: req.body.email,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        phone: req.body.phone,
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
        roomType: req.body.roomType,
        language: req.body.language || "en",
        status: "registered",
        termsAccepted: req.body.termsAccepted,
        termsAcceptedAt: req.body.termsAccepted ? new Date() : null,
        termsAcceptedIp: req.body.termsAccepted ? String(clientIp) : null,
        verifiedByHydra: req.body.verifiedByHydra || false,
        registeredAt: new Date(),
      });

      // Send confirmation email via Iterable
      if (process.env.ITERABLE_API_KEY) {
        try {
          await iterableService.sendRegistrationConfirmation(
            registration.email,
            registration,
            event,
            registration.language
          );
        } catch (err) {
          console.error('Failed to send confirmation email:', err);
        }
      }

      res.status(201).json(registration);
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid registration data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to register" });
    }
  });

  // Registrations Routes
  app.get("/api/registrations", authenticateToken, async (req, res) => {
    try {
      const eventId = req.query.eventId as string | undefined;
      const registrations = await storage.getRegistrations(eventId);
      res.json(registrations);
    } catch (error) {
      console.error("Get registrations error:", error);
      res.status(500).json({ error: "Failed to get registrations" });
    }
  });

  app.get("/api/registrations/recent", authenticateToken, async (req, res) => {
    try {
      const registrations = await storage.getRecentRegistrations(10);
      res.json(registrations);
    } catch (error) {
      console.error("Get recent registrations error:", error);
      res.status(500).json({ error: "Failed to get recent registrations" });
    }
  });

  app.get("/api/registrations/:id", authenticateToken, async (req, res) => {
    try {
      const registration = await storage.getRegistration(req.params.id);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }
      res.json(registration);
    } catch (error) {
      console.error("Get registration error:", error);
      res.status(500).json({ error: "Failed to get registration" });
    }
  });

  app.patch("/api/registrations/:id", authenticateToken, requireRole("admin", "event_manager"), async (req, res) => {
    try {
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
      
      // Send update notification if important fields changed
      if (process.env.ITERABLE_API_KEY && (req.body.status || req.body.roomType || req.body.shirtSize)) {
        try {
          const event = await storage.getEvent(registration.eventId);
          if (event) {
            await iterableService.sendRegistrationUpdate(
              registration.email,
              registration,
              event,
              registration.language
            );
          }
        } catch (err) {
          console.error('Failed to send update email:', err);
        }
      }
      
      res.json(registration);
    } catch (error) {
      console.error("Update registration error:", error);
      res.status(500).json({ error: "Failed to update registration" });
    }
  });

  app.post("/api/registrations/:id/check-in", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const registration = await storage.checkInRegistration(req.params.id, req.user!.id);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }
      res.json(registration);
    } catch (error) {
      console.error("Check-in error:", error);
      res.status(500).json({ error: "Failed to check in" });
    }
  });

  app.delete("/api/registrations/:id", authenticateToken, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteRegistration(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Delete registration error:", error);
      res.status(500).json({ error: "Failed to delete registration" });
    }
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

  // Stripe Payment Routes
  app.get("/api/stripe/config", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error) {
      console.error("Get Stripe config error:", error);
      res.status(500).json({ error: "Failed to get Stripe configuration" });
    }
  });

  app.post("/api/guests/:guestId/checkout", authenticateToken, async (req, res) => {
    try {
      const guest = await storage.getGuestsByRegistration(req.params.guestId);
      const guestData = guest.find(g => g.id === req.params.guestId);
      
      if (!guestData) {
        return res.status(404).json({ error: "Guest not found" });
      }

      const registration = await storage.getRegistration(guestData.registrationId);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
      }

      const event = await storage.getEvent(registration.eventId);
      if (!event || !event.buyInPrice) {
        return res.status(400).json({ error: "Event buy-in price not configured" });
      }

      const host = req.headers.host || 'localhost:5000';
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const baseUrl = `${protocol}://${host}`;

      const session = await stripeService.createCheckoutSessionForGuest(
        guestData.id,
        `${guestData.firstName} ${guestData.lastName}`,
        event.buyInPrice * 100, // Convert to cents
        event.name,
        `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        `${baseUrl}/payment/cancel`
      );

      res.json({ url: session.url });
    } catch (error) {
      console.error("Checkout error:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/payment/verify", authenticateToken, async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "Session ID required" });
      }

      const success = await stripeService.handlePaymentSuccess(sessionId);
      res.json({ success });
    } catch (error) {
      console.error("Payment verification error:", error);
      res.status(500).json({ error: "Failed to verify payment" });
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
      const assignments = await storage.getSwagAssignmentsByEvent(req.params.eventId);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching swag assignments:", error);
      res.status(500).json({ error: "Failed to fetch swag assignments" });
    }
  });

  // Get assignments by registration
  app.get("/api/registrations/:registrationId/swag-assignments", authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const assignments = await storage.getSwagAssignmentsByRegistration(req.params.registrationId);
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
      const validated = bulkSwagAssignmentSchema.parse(req.body);
      const { swagItemId, registrationIds, guestIds, size } = validated;
      const assignments = [];
      
      if (registrationIds?.length) {
        for (const registrationId of registrationIds) {
          const assignment = await storage.createSwagAssignment({
            swagItemId,
            registrationId,
            size,
            status: 'assigned',
          });
          assignments.push(assignment);
        }
      }
      
      if (guestIds?.length) {
        for (const guestId of guestIds) {
          const assignment = await storage.createSwagAssignment({
            swagItemId,
            guestId,
            size,
            status: 'assigned',
          });
          assignments.push(assignment);
        }
      }
      
      res.status(201).json(assignments);
    } catch (error) {
      if (error instanceof z.ZodError) {
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
      lastName: z.string().min(1),
      email: z.string().email(),
      unicityId: z.string().optional(),
    })),
    clearExisting: z.boolean().optional().default(false),
  });

  app.post("/api/events/:eventId/qualifiers/import", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const validated = csvImportSchema.parse(req.body);
      const eventId = req.params.eventId;
      const importedBy = req.user!.id;

      // Optionally clear existing qualifiers
      if (validated.clearExisting) {
        await storage.deleteQualifiedRegistrantsByEvent(eventId);
      }

      // Prepare registrants for bulk insert
      const registrantsToInsert = validated.registrants.map(r => ({
        eventId,
        firstName: r.firstName.trim(),
        lastName: r.lastName.trim(),
        email: r.email.trim().toLowerCase(),
        unicityId: r.unicityId?.trim() || null,
        importedBy,
      }));

      const created = await storage.createQualifiedRegistrantsBulk(registrantsToInsert);
      res.status(201).json({ 
        imported: created.length, 
        registrants: created 
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

  // Get event page with sections (public - for rendering landing pages)
  // Accepts optional ?pageType=login|registration|thank_you query param (defaults to registration)
  app.get("/api/public/event-pages/:eventId", async (req, res) => {
    try {
      const event = await storage.getEventByIdOrSlug(req.params.eventId);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const pageType = (req.query.pageType as string) || "registration";
      const pageData = await storage.getEventPageWithSections(event.id, pageType);
      if (!pageData) {
        return res.status(404).json({ error: "Page not found" });
      }
      
      // Only return published pages to public
      if (pageData.page.status !== 'published') {
        return res.status(404).json({ error: "Page not found" });
      }
      
      // Strip deprecated registrationSettings from event response
      const { registrationSettings, ...eventWithoutLegacy } = event;
      res.json({ ...pageData, event: eventWithoutLegacy });
    } catch (error) {
      console.error("Error fetching event page:", error);
      res.status(500).json({ error: "Failed to fetch event page" });
    }
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

  return httpServer;
}
