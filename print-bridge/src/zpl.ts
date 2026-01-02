import type { BadgeData } from "./types.js";

export function renderBadgeZPL(badge: BadgeData): string {
  const {
    firstName,
    lastName,
    eventName,
    registrationId,
    eventId,
    unicityId,
    role,
  } = badge;

  const safeFirstName = sanitizeForZPL(firstName.toUpperCase());
  const safeLastName = sanitizeForZPL(lastName.toUpperCase());
  const safeEventName = sanitizeForZPL(eventName.toUpperCase());
  const safeUnicityId = unicityId ? sanitizeForZPL(unicityId) : "";
  const safeRole = role ? sanitizeForZPL(role.toUpperCase()) : "";

  const qrData = `REG:${registrationId}:${eventId || "unknown"}:attendee`;

  let zpl = `^XA

^PW812
^LL1218

^FO0,80^A0N,60,60^FB812,1,0,C^FD${safeEventName}^FS

^FO100,160^GB612,4,4^FS

^FO0,250^A0N,100,100^FB812,1,0,C^FD${safeFirstName}^FS

^FO0,370^A0N,100,100^FB812,1,0,C^FD${safeLastName}^FS

^FO306,520^BQN,2,6^FDQA,${qrData}^FS
`;

  if (safeUnicityId) {
    zpl += `
^FO0,820^A0N,35,35^FB812,1,0,C^FDID: ${safeUnicityId}^FS
`;
  }

  if (safeRole) {
    zpl += `
^FO256,900^GB300,60,60^FS
^FO256,900^FR^A0N,40,40^FB300,1,0,C^FD${safeRole}^FS
`;
  }

  zpl += `
^XZ`;

  return zpl;
}

export function renderTestLabelZPL(printerName: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");

  return `^XA

^PW812
^LL406

^FO0,50^A0N,50,50^FB812,1,0,C^FDTEST PRINT^FS

^FO100,120^GB612,4,4^FS

^FO0,150^A0N,35,35^FB812,1,0,C^FDPrinter: ${sanitizeForZPL(printerName)}^FS

^FO0,200^A0N,30,30^FB812,1,0,C^FD${timestamp}^FS

^FO0,260^A0N,25,25^FB812,1,0,C^FDPrint Bridge Connection OK^FS

^FO256,310^BQN,2,4^FDQA,TEST:${Date.now()}^FS

^XZ`;
}

function sanitizeForZPL(text: string): string {
  return text
    .replace(/\^/g, "")
    .replace(/~/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}
