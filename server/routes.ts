import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, insertRegistrationSchema, insertGuestSchema, insertFlightSchema, insertReimbursementSchema, insertSwagItemSchema, insertSwagAssignmentSchema, insertQualifiedRegistrantSchema } from "@shared/schema";
import { z } from "zod";
import { stripeService } from "./stripeService";
import { getStripePublishableKey } from "./stripeClient";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";

const HYDRA_API_BASE = process.env.NODE_ENV === "production" 
  ? "https://hydra.unicity.net/v6"
  : "https://hydraqa.unicity.net/v6-test";

// Whitelist of admin email addresses (case-insensitive)
const ADMIN_EMAILS = [
  "colby.cook@unicity.com",
  "biani.gonzalez@unicity.com",
  "ashley.milliken@unicity.com",
].map(e => e.toLowerCase());

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

      // Only allow whitelisted admin emails to log in
      if (!ADMIN_EMAILS.includes(email.toLowerCase())) {
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

      const response = await fetch(`${HYDRA_API_BASE}/otp/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
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
      } else if (process.env.NODE_ENV === "production") {
        const response = await fetch(`${HYDRA_API_BASE}/otp/magic-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        });

        const data = await response.json();
        
        if (response.ok && data.success) {
          isValid = true;
          customerId = data.customer?.id;
          bearerToken = data.token;
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
        // Only whitelisted emails get admin role
        const role = ADMIN_EMAILS.includes(email.toLowerCase()) ? "admin" : "readonly";
        user = await storage.createUser({
          email,
          name: email.split("@")[0],
          role,
          customerId,
        });
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
      const response = await fetch(`${HYDRA_API_BASE}/otp/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
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
      res.status(500).json({ error: "Failed to send verification code" });
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

      // For development, accept test code
      if (process.env.NODE_ENV !== "production" && code === "123456") {
        isValid = true;
        // Mock customer data for development
        customerData = {
          id: { unicity: "12345678" },
          humanName: { firstName: "Test", lastName: "User" },
          email: email,
        };
      } else if (process.env.NODE_ENV === "production") {
        // Production: Validate with Hydra
        console.log("Validating OTP with Hydra for email:", email, "code length:", code?.length);
        const response = await fetch(`${HYDRA_API_BASE}/otp/magic-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code }),
        });

        const data = await response.json();
        console.log("Hydra OTP validation response status:", response.status);
        console.log("Hydra OTP validation response:", JSON.stringify(data, null, 2));
        
        if (response.ok && data.success) {
          isValid = true;
          customerId = data.customer?.id;
          bearerToken = data.token;
          customerData = data.customer;
        } else {
          console.log("Hydra validation failed - response.ok:", response.ok, "data.success:", data.success);
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
        profile,
        isQualified,
        qualificationMessage,
        redirectToken,
        // Include auth token for admin users
        token: authToken,
        user: adminUser,
      });
    } catch (error) {
      console.error("Registration OTP validate error:", error);
      res.status(500).json({ error: "Failed to validate code" });
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

  // Events Routes
  app.get("/api/events", async (req, res) => {
    try {
      const events = await storage.getEvents();
      res.json(events);
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
        formFields: event.formFields,
        registrationSettings: event.registrationSettings,
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
      
      const data = insertEventSchema.parse({
        ...req.body,
        slug: normalizedSlug,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        qualificationStartDate: req.body.qualificationStartDate ? new Date(req.body.qualificationStartDate) : undefined,
        qualificationEndDate: req.body.qualificationEndDate ? new Date(req.body.qualificationEndDate) : undefined,
        createdBy: req.user!.id,
      });
      const event = await storage.createEvent(data);
      res.status(201).json(event);
    } catch (error) {
      console.error("Create event error:", error);
      if (error instanceof z.ZodError) {
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
      
      const updates = {
        ...req.body,
        slug: normalizedSlug,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
        qualificationStartDate: req.body.qualificationStartDate ? new Date(req.body.qualificationStartDate) : undefined,
        qualificationEndDate: req.body.qualificationEndDate ? new Date(req.body.qualificationEndDate) : undefined,
      };
      const event = await storage.updateEvent(req.params.id, updates);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      res.json(event);
    } catch (error) {
      console.error("Update event error:", error);
      res.status(500).json({ error: "Failed to update event" });
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
        registeredAt: new Date(),
      });

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
      const registration = await storage.updateRegistration(req.params.id, req.body);
      if (!registration) {
        return res.status(404).json({ error: "Registration not found" });
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

  return httpServer;
}
