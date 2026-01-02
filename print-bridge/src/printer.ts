import net from "net";
import type { Printer } from "./types.js";

const DEFAULT_TIMEOUT = parseInt(process.env.PRINTER_TIMEOUT_MS || "5000", 10);
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "3", 10);

export interface PrintResult {
  success: boolean;
  error?: string;
  retryCount: number;
}

export async function sendToPrinter(
  printer: Printer,
  zpl: string,
  options?: { timeout?: number; maxRetries?: number }
): Promise<PrintResult> {
  const timeout = options?.timeout || DEFAULT_TIMEOUT;
  const maxRetries = options?.maxRetries || MAX_RETRIES;

  let lastError: string | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await sendZPL(printer.ipAddress, printer.port, zpl, timeout);
      return { success: true, retryCount: attempt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.log(
        `[Printer] Attempt ${attempt + 1}/${maxRetries} failed: ${lastError}`
      );

      if (attempt < maxRetries - 1) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  return {
    success: false,
    error: lastError || "Unknown error",
    retryCount: maxRetries,
  };
}

function sendZPL(
  host: string,
  port: number,
  zpl: string,
  timeout: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();

    const timeoutId = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Connection timed out after ${timeout}ms`));
    }, timeout);

    socket.on("connect", () => {
      socket.write(zpl, "utf8", (err) => {
        clearTimeout(timeoutId);
        if (err) {
          socket.destroy();
          reject(new Error(`Failed to write to printer: ${err.message}`));
        } else {
          socket.end();
        }
      });
    });

    socket.on("close", () => {
      clearTimeout(timeoutId);
      resolve();
    });

    socket.on("error", (err) => {
      clearTimeout(timeoutId);
      socket.destroy();
      reject(new Error(`Printer connection error: ${err.message}`));
    });

    socket.connect(port, host);
  });
}

export async function checkPrinterStatus(printer: Printer): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 2000;

    const timeoutId = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);

    socket.on("connect", () => {
      clearTimeout(timeoutId);
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      clearTimeout(timeoutId);
      socket.destroy();
      resolve(false);
    });

    socket.connect(printer.port, printer.ipAddress);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
