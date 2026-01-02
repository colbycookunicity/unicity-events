import type { Printer, PrintJob } from "./types.js";

const printers: Map<string, Printer> = new Map();
const printJobs: Map<string, PrintJob> = new Map();

export function getAllPrinters(): Printer[] {
  return Array.from(printers.values());
}

export function getPrinter(id: string): Printer | undefined {
  return printers.get(id);
}

export function addPrinter(printer: Printer): Printer {
  printers.set(printer.id, printer);
  return printer;
}

export function updatePrinter(
  id: string,
  updates: Partial<Printer>
): Printer | undefined {
  const existing = printers.get(id);
  if (!existing) return undefined;

  const updated = { ...existing, ...updates };
  printers.set(id, updated);
  return updated;
}

export function removePrinter(id: string): boolean {
  return printers.delete(id);
}

export function getJob(jobId: string): PrintJob | undefined {
  return printJobs.get(jobId);
}

export function addJob(job: PrintJob): PrintJob {
  printJobs.set(job.jobId, job);
  return job;
}

export function updateJob(
  jobId: string,
  updates: Partial<PrintJob>
): PrintJob | undefined {
  const existing = printJobs.get(jobId);
  if (!existing) return undefined;

  const updated = { ...existing, ...updates };
  printJobs.set(jobId, updated);
  return updated;
}

export function cleanupOldJobs(maxAgeMs: number = 3600000): number {
  const now = Date.now();
  let deleted = 0;

  for (const [jobId, job] of printJobs) {
    const jobTime = job.completedAt || job.sentAt;
    if (jobTime && now - jobTime.getTime() > maxAgeMs) {
      printJobs.delete(jobId);
      deleted++;
    }
  }

  return deleted;
}
