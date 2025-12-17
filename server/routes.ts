import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertEventSchema, insertRegistrationSchema, insertGuestSchema, insertFlightSchema, insertReimbursementSchema } from "@shared/schema";
import { z } from "zod";

const HYDRA_API_BASE = process.env.NODE_ENV === "production" 
  ? "https://hydra.unicity.net/v6"
  : "https://hydraqa.unicity.net/v6-test";

interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; role: string };
}

function generateToken(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

const tokenStore = new Map<string, { userId: string; email: string; expiresAt: Date }>();

async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const session = tokenStore.get(token);
  if (!session || session.expiresAt < new Date()) {
    tokenStore.delete(token);
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
        user = await storage.createUser({
          email,
          name: email.split("@")[0],
          role: email.endsWith("@unicity.com") ? "admin" : "readonly",
          customerId,
        });
      }

      const token = generateToken();
      tokenStore.set(token, {
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

  app.post("/api/auth/logout", (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];
    if (token) {
      tokenStore.delete(token);
    }
    res.json({ success: true });
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

  // Public event endpoint for registration page
  app.get("/api/events/:id/public", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      if (event.status !== "published") {
        return res.status(404).json({ error: "Event not available" });
      }
      // Return public-safe event data
      res.json({
        id: event.id,
        name: event.name,
        nameEs: event.nameEs,
        description: event.description,
        descriptionEs: event.descriptionEs,
        location: event.location,
        startDate: event.startDate,
        endDate: event.endDate,
        capacity: event.capacity,
        buyInPrice: event.buyInPrice,
      });
    } catch (error) {
      console.error("Get public event error:", error);
      res.status(500).json({ error: "Failed to get event" });
    }
  });

  app.post("/api/events", authenticateToken, requireRole("admin", "event_manager"), async (req: AuthenticatedRequest, res) => {
    try {
      const data = insertEventSchema.parse({
        ...req.body,
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
      const updates = {
        ...req.body,
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

  // Public Event Registration
  app.post("/api/events/:eventId/register", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.eventId);
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
        shirtSize: req.body.shirtSize,
        dietaryRestrictions: req.body.dietaryRestrictions,
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

  return httpServer;
}
