import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

import type {
  Printer,
  PrintJob,
  PrintJobRequest,
  PrinterRegistration,
  HealthResponse,
  PrintResponse,
  TestPrintResponse,
  ErrorResponse,
  ErrorCode,
} from "./types.js";
import { renderBadgeZPL, renderTestLabelZPL } from "./zpl.js";
import { sendToPrinter, checkPrinterStatus } from "./printer.js";
import {
  getAllPrinters,
  getPrinter,
  addPrinter,
  updatePrinter,
  removePrinter,
  getJob,
  addJob,
  updateJob,
  cleanupOldJobs,
} from "./store.js";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3100", 10);
const startTime = Date.now();
const VERSION = "1.0.0";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  details?: string
): void {
  const errorResponse: ErrorResponse = { error: message, code, details };
  res.status(status).json(errorResponse);
}

app.get("/health", (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: "healthy",
    version: VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    printers: getAllPrinters().length,
  };
  res.json(response);
});

app.get("/printers", async (_req: Request, res: Response) => {
  const printers = getAllPrinters();

  const printersWithStatus = await Promise.all(
    printers.map(async (printer) => {
      const isOnline = await checkPrinterStatus(printer);
      const status = isOnline ? "online" : "offline";

      if (printer.status !== status) {
        updatePrinter(printer.id, {
          status,
          lastSeen: isOnline ? new Date() : printer.lastSeen,
        });
      }

      return { ...printer, status, lastSeen: isOnline ? new Date() : printer.lastSeen };
    })
  );

  res.json(printersWithStatus);
});

app.post("/printers", (req: Request, res: Response) => {
  const { name, ipAddress, port } = req.body as PrinterRegistration;

  if (!name || !ipAddress) {
    return sendError(res, 400, "INVALID_REQUEST", "Missing required fields: name, ipAddress");
  }

  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ipAddress)) {
    return sendError(res, 400, "INVALID_REQUEST", "Invalid IP address format");
  }

  const printer: Printer = {
    id: `printer-${uuidv4().slice(0, 8)}`,
    name,
    ipAddress,
    port: port || 9100,
    status: "unknown",
  };

  addPrinter(printer);

  console.log(`[Printer] Registered: ${printer.name} at ${printer.ipAddress}:${printer.port}`);

  res.status(201).json(printer);
});

app.delete("/printers/:printerId", (req: Request, res: Response) => {
  const { printerId } = req.params;
  const printer = getPrinter(printerId);

  if (!printer) {
    return sendError(res, 404, "PRINTER_NOT_FOUND", "Printer not found");
  }

  removePrinter(printerId);
  console.log(`[Printer] Removed: ${printer.name}`);

  res.json({ success: true, message: `Printer ${printer.name} removed` });
});

app.post("/print", async (req: Request, res: Response) => {
  const { printerId, printer: printerInfo, badge } = req.body as PrintJobRequest;

  if (!badge) {
    return sendError(res, 400, "INVALID_REQUEST", "Missing required field: badge");
  }

  if (!badge.firstName || !badge.lastName || !badge.eventName || !badge.registrationId) {
    return sendError(
      res,
      400,
      "INVALID_REQUEST",
      "Missing badge fields: firstName, lastName, eventName, registrationId"
    );
  }

  let printer: Printer | undefined;

  if (printerInfo) {
    printer = {
      id: printerInfo.id,
      name: printerInfo.name,
      ipAddress: printerInfo.ipAddress,
      port: printerInfo.port || 9100,
      status: "unknown",
    };
    const existingPrinter = getPrinter(printerInfo.id);
    if (!existingPrinter) {
      addPrinter(printer);
    } else {
      printer = existingPrinter;
    }
  } else if (printerId) {
    printer = getPrinter(printerId);
    if (!printer) {
      return sendError(res, 404, "PRINTER_NOT_FOUND", `Printer ${printerId} not found`);
    }
  } else {
    return sendError(res, 400, "INVALID_REQUEST", "Missing required field: printerId or printer");
  }

  let zpl: string;
  try {
    zpl = renderBadgeZPL(badge);
  } catch (error) {
    return sendError(
      res,
      500,
      "INVALID_ZPL",
      "Failed to render badge",
      error instanceof Error ? error.message : undefined
    );
  }

  const job: PrintJob = {
    jobId: uuidv4(),
    printerId: printer.id,
    status: "pending",
    badge,
    zpl,
    retryCount: 0,
  };

  addJob(job);

  console.log(`[Print] Job ${job.jobId} created for ${badge.firstName} ${badge.lastName}`);

  updateJob(job.jobId, { status: "sent", sentAt: new Date() });

  const result = await sendToPrinter(printer, zpl);

  if (result.success) {
    updateJob(job.jobId, {
      status: "success",
      completedAt: new Date(),
      retryCount: result.retryCount,
    });
    updatePrinter(printer.id, { status: "online", lastSeen: new Date() });

    console.log(`[Print] Job ${job.jobId} completed successfully`);
  } else {
    updateJob(job.jobId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: result.error,
      retryCount: result.retryCount,
    });
    updatePrinter(printer.id, { status: "offline" });

    console.log(`[Print] Job ${job.jobId} failed: ${result.error}`);
  }

  const updatedJob = getJob(job.jobId)!;
  const response: PrintResponse = {
    jobId: updatedJob.jobId,
    status: updatedJob.status,
    sentAt: updatedJob.sentAt?.toISOString(),
  };

  if (updatedJob.status === "failed") {
    return sendError(
      res,
      500,
      "PRINTER_OFFLINE",
      "Print job failed",
      updatedJob.errorMessage
    );
  }

  res.json(response);
});

app.get("/jobs/:jobId", (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = getJob(jobId);

  if (!job) {
    return sendError(res, 404, "INVALID_REQUEST", "Job not found");
  }

  res.json({
    jobId: job.jobId,
    status: job.status,
    sentAt: job.sentAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    errorMessage: job.errorMessage,
  });
});

// Print raw ZPL directly (for custom templates)
app.post("/print-raw", async (req: Request, res: Response) => {
  const { printerId, printer: printerInfo, zpl } = req.body;

  if (!zpl) {
    return sendError(res, 400, "INVALID_REQUEST", "Missing required field: zpl");
  }

  let printer: Printer | undefined;

  if (printerInfo) {
    printer = {
      id: printerInfo.id,
      name: printerInfo.name,
      ipAddress: printerInfo.ipAddress,
      port: printerInfo.port || 9100,
      status: "unknown",
    };
    const existingPrinter = getPrinter(printerInfo.id);
    if (!existingPrinter) {
      addPrinter(printer);
    } else {
      printer = existingPrinter;
    }
  } else if (printerId) {
    printer = getPrinter(printerId);
    if (!printer) {
      return sendError(res, 404, "PRINTER_NOT_FOUND", `Printer ${printerId} not found`);
    }
  } else {
    return sendError(res, 400, "INVALID_REQUEST", "Missing required field: printerId or printer");
  }

  const job: PrintJob = {
    jobId: uuidv4(),
    printerId: printer.id,
    status: "pending",
    badge: { firstName: "RAW", lastName: "ZPL", eventName: "Raw Print", registrationId: "raw" },
    zpl,
    retryCount: 0,
  };

  addJob(job);

  console.log(`[Print-Raw] Job ${job.jobId} created for raw ZPL print`);

  updateJob(job.jobId, { status: "sent", sentAt: new Date() });

  const result = await sendToPrinter(printer, zpl);

  if (result.success) {
    updateJob(job.jobId, {
      status: "success",
      completedAt: new Date(),
      retryCount: result.retryCount,
    });
    updatePrinter(printer.id, { status: "online", lastSeen: new Date() });

    console.log(`[Print-Raw] Job ${job.jobId} completed successfully`);
  } else {
    updateJob(job.jobId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: result.error,
      retryCount: result.retryCount,
    });
    updatePrinter(printer.id, { status: "offline" });

    console.log(`[Print-Raw] Job ${job.jobId} failed: ${result.error}`);
  }

  const updatedJob = getJob(job.jobId)!;
  const response: PrintResponse = {
    jobId: updatedJob.jobId,
    status: updatedJob.status,
    sentAt: updatedJob.sentAt?.toISOString(),
  };

  if (updatedJob.status === "failed") {
    return sendError(
      res,
      500,
      "PRINTER_OFFLINE",
      "Print job failed",
      updatedJob.errorMessage
    );
  }

  res.json(response);
});

app.post("/printers/:printerId/test", async (req: Request, res: Response) => {
  const { printerId } = req.params;
  const printer = getPrinter(printerId);

  if (!printer) {
    return sendError(res, 404, "PRINTER_NOT_FOUND", "Printer not found");
  }

  const zpl = renderTestLabelZPL(printer.name);

  console.log(`[Test] Sending test print to ${printer.name}`);

  const result = await sendToPrinter(printer, zpl);

  if (result.success) {
    updatePrinter(printerId, { status: "online", lastSeen: new Date() });

    const response: TestPrintResponse = {
      success: true,
      message: "Test label printed successfully",
    };
    res.json(response);
  } else {
    updatePrinter(printerId, { status: "offline" });

    return sendError(res, 500, "PRINTER_OFFLINE", "Test print failed", result.error);
  }
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Error]", err.message);
  sendError(res, 500, "NETWORK_ERROR", "Internal server error", err.message);
});

setInterval(() => {
  const cleaned = cleanupOldJobs();
  if (cleaned > 0) {
    console.log(`[Cleanup] Removed ${cleaned} old print jobs`);
  }
}, 60000);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    PRINT BRIDGE SERVICE                    ║
╠════════════════════════════════════════════════════════════╣
║  Version: ${VERSION.padEnd(47)}║
║  Port: ${PORT.toString().padEnd(50)}║
║  Status: Running                                           ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║    GET  /health              - Service health check        ║
║    GET  /printers            - List all printers           ║
║    POST /printers            - Register a printer          ║
║    DELETE /printers/:id      - Remove a printer            ║
║    POST /print               - Print a badge               ║
║    POST /print-raw           - Print raw ZPL               ║
║    GET  /jobs/:id            - Get job status              ║
║    POST /printers/:id/test   - Send test print             ║
╚════════════════════════════════════════════════════════════╝
  `);
});
