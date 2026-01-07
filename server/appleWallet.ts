import { PKPass } from "passkit-generator";
import type { Registration, Event, CheckInToken } from "@shared/schema";
import { buildCheckInQRPayload } from "@shared/schema";
import { format } from "date-fns";

interface WalletCertificates {
  wwdr: string;
  signerCert: string;
  signerKey: string;
  signerKeyPassphrase?: string;
}

interface PassData {
  registration: Registration;
  event: Event;
  checkInToken: CheckInToken;
}

export class AppleWalletService {
  private certificates: WalletCertificates | null = null;
  private passTypeIdentifier: string;
  private teamIdentifier: string;

  constructor() {
    this.passTypeIdentifier = process.env.APPLE_PASS_TYPE_IDENTIFIER || "";
    this.teamIdentifier = process.env.APPLE_TEAM_IDENTIFIER || "";
  }

  isConfigured(): boolean {
    return !!(
      process.env.APPLE_WALLET_WWDR_CERT &&
      process.env.APPLE_WALLET_SIGNER_CERT &&
      process.env.APPLE_WALLET_SIGNER_KEY &&
      process.env.APPLE_PASS_TYPE_IDENTIFIER &&
      process.env.APPLE_TEAM_IDENTIFIER
    );
  }

  private getCertificates(): WalletCertificates {
    if (this.certificates) {
      return this.certificates;
    }

    const wwdr = process.env.APPLE_WALLET_WWDR_CERT;
    const signerCert = process.env.APPLE_WALLET_SIGNER_CERT;
    const signerKey = process.env.APPLE_WALLET_SIGNER_KEY;
    const signerKeyPassphrase = process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE;

    if (!wwdr || !signerCert || !signerKey) {
      throw new Error("Apple Wallet certificates not configured");
    }

    this.certificates = {
      wwdr: wwdr.replace(/\\n/g, "\n"),
      signerCert: signerCert.replace(/\\n/g, "\n"),
      signerKey: signerKey.replace(/\\n/g, "\n"),
      signerKeyPassphrase,
    };

    return this.certificates;
  }

  async generatePass(data: PassData): Promise<Buffer> {
    const { registration, event, checkInToken } = data;
    const certs = this.getCertificates();

    const qrPayload = buildCheckInQRPayload(
      checkInToken.eventId,
      checkInToken.registrationId,
      checkInToken.token
    );

    const serialNumber = `checkin-${checkInToken.token.substring(0, 16)}`;
    const attendeeName = `${registration.firstName} ${registration.lastName}`;

    const eventDate = event.startDate
      ? format(new Date(event.startDate), "MMM d, yyyy")
      : undefined;

    const eventTime = event.startDate
      ? format(new Date(event.startDate), "h:mm a")
      : undefined;

    const pass = new PKPass(
      {},
      {
        wwdr: certs.wwdr,
        signerCert: certs.signerCert,
        signerKey: certs.signerKey,
        signerKeyPassphrase: certs.signerKeyPassphrase,
      },
      {
        formatVersion: 1,
        passTypeIdentifier: this.passTypeIdentifier,
        teamIdentifier: this.teamIdentifier,
        organizationName: "Unicity International",
        description: `${event.name} Check-In Pass`,
        serialNumber,
        foregroundColor: "rgb(255, 255, 255)",
        backgroundColor: "rgb(0, 82, 147)",
        labelColor: "rgb(200, 220, 255)",
        logoText: "Unicity Events",
      }
    );

    pass.setBarcodes({
      message: qrPayload,
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
      altText: `Check-in: ${attendeeName}`,
    });

    pass.type = "eventTicket";

    pass.primaryFields.push({
      key: "event",
      label: "EVENT",
      value: event.name,
    });

    pass.secondaryFields.push({
      key: "attendee",
      label: "ATTENDEE",
      value: attendeeName,
    });

    if (eventDate) {
      pass.secondaryFields.push({
        key: "date",
        label: "DATE",
        value: eventDate,
      });
    }

    if (eventTime) {
      pass.auxiliaryFields.push({
        key: "time",
        label: "TIME",
        value: eventTime,
      });
    }

    if (event.location) {
      pass.auxiliaryFields.push({
        key: "location",
        label: "LOCATION",
        value: event.location,
      });
    }

    if (registration.unicityId) {
      pass.backFields.push({
        key: "unicityId",
        label: "Unicity ID",
        value: registration.unicityId,
      });
    }

    pass.backFields.push({
      key: "registrationId",
      label: "Registration ID",
      value: registration.id,
    });

    pass.backFields.push({
      key: "instructions",
      label: "Check-In Instructions",
      value: "Show this pass at the event check-in desk. Staff will scan your QR code to verify your registration.",
    });

    return pass.getAsBuffer();
  }

  getWalletUrl(token: string, baseUrl: string): string {
    return `${baseUrl}/api/wallet/${token}`;
  }
}

export const appleWalletService = new AppleWalletService();
