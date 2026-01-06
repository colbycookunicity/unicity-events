export interface Printer {
  id: string;
  name: string;
  ipAddress: string;
  port: number;
  status: "online" | "offline" | "unknown";
  lastSeen?: Date;
}

export interface BadgeData {
  firstName: string;
  lastName: string;
  eventName: string;
  registrationId: string;
  eventId?: string;
  unicityId?: string;
  role?: string;
}

export interface PrintJobRequest {
  printerId?: string;
  printer?: {
    id: string;
    name: string;
    ipAddress: string;
    port: number;
  };
  badge: BadgeData;
}

export interface PrintJob {
  jobId: string;
  printerId: string;
  status: "pending" | "sent" | "success" | "failed";
  badge: BadgeData;
  zpl?: string;
  sentAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
  retryCount: number;
}

export interface PrinterRegistration {
  name: string;
  ipAddress: string;
  port?: number;
}

export interface HealthResponse {
  status: "healthy";
  version: string;
  uptime: number;
  printers: number;
}

export interface PrintResponse {
  jobId: string;
  status: PrintJob["status"];
  sentAt?: string;
}

export interface TestPrintResponse {
  success: boolean;
  message: string;
}

export interface ErrorResponse {
  error: string;
  code: string;
  details?: string;
}

export type ErrorCode = 
  | "PRINTER_OFFLINE"
  | "TIMEOUT"
  | "INVALID_ZPL"
  | "NETWORK_ERROR"
  | "PRINTER_NOT_FOUND"
  | "INVALID_REQUEST";
