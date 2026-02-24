/**
 * Silent Migration Script: May Method Event Registrations
 * Event ID: 97d6166f-c686-4891-8b73-6c69f1dfd915
 *
 * Usage:
 *   npx tsx scripts/import-may-method-event-97.ts [--dry-run] [--csv=path/to/file.csv]
 *
 * Flags:
 *   --dry-run       Preview changes without inserting anything
 *   --csv=<path>    Path to CSV file (default: ./attached_assets/registered-the-method-may_1771970127290.csv)
 *
 * CRITICAL: This script bypasses ALL email triggers, Iterable events, webhooks,
 * and confirmation flows. It performs a completely silent backfill migration.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.js";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";
import readline from "readline";

const { Pool } = pg;

const EVENT_ID = "97d6166f-c686-4891-8b73-6c69f1dfd915";

const isDryRun = process.argv.includes("--dry-run");
const csvArg = process.argv.find((a) => a.startsWith("--csv="));
const csvPath = csvArg
  ? csvArg.split("=")[1]
  : path.resolve(
      "./attached_assets/registered-the-method-may_1771970127290.csv"
    );

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let inQuotes = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(filePath: string): { headers: string[]; rows: string[][] } {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim() !== "");
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map(parseCsvLine);
  return { headers, rows };
}

// ─── Field Normalizers ────────────────────────────────────────────────────────

function normalizeLanguage(raw: string): "en" | "es" {
  const val = raw.trim().toLowerCase();
  if (val.includes("spanish") || val.includes("español")) return "es";
  return "en";
}

function normalizeBool(raw: string): boolean {
  return raw.trim().toLowerCase() === "yes";
}

function normalizeDietary(raw: string): string[] {
  const val = raw.trim().toLowerCase();
  if (!val || val === "no" || val === "n/a" || val === "none") return [];
  const restrictions: string[] = [];
  if (val.includes("vegan")) restrictions.push("vegan");
  else if (val.includes("vegetarian")) restrictions.push("vegetarian");
  if (val.includes("gluten")) restrictions.push("gluten-free");
  if (val.includes("halal")) restrictions.push("halal");
  if (val.includes("kosher")) restrictions.push("kosher");
  if (val.includes("pork")) restrictions.push("no-pork");
  if (
    restrictions.length === 0 &&
    val !== "" &&
    val !== "no" &&
    val !== "n/a"
  ) {
    restrictions.push(val);
  }
  return restrictions;
}

// ─── Row Type ─────────────────────────────────────────────────────────────────

interface ParsedRow {
  rowIndex: number;
  unicityId: string;
  email: string;
  firstName: string;
  lastName: string;
  language: "en" | "es";
  isFirstMethod: boolean;
  dietaryRestrictions: string[];
  headphonesAcknowledgment: boolean;
  breathingAcknowledgment: boolean;
  releaseForms: boolean;
  noShowFee: boolean;
  cancellationFee: boolean;
  travelAgreement: boolean;
  errors: string[];
}

// ─── CSV → Parsed Rows ────────────────────────────────────────────────────────

function parseRows(
  headers: string[],
  rows: string[][]
): { valid: ParsedRow[]; invalid: ParsedRow[] } {
  const valid: ParsedRow[] = [];
  const invalid: ParsedRow[] = [];

  // Map header index positions
  const h = (name: string) =>
    headers.findIndex((hdr) =>
      hdr.toLowerCase().includes(name.toLowerCase())
    );

  const idxUnicityId = h("Distributor");
  const idxEmail = h("Email");
  const idxFirstName = h("First Name");
  const idxLastName = h("Last Name");
  const idxLanguage = h("language");
  const idxFirstMethodEn = h("first Method you are attending");
  const idxFirstMethodEs = h("primer Método");
  const idxDietary = h("Vegetarian or Vegan");
  const idxHeadphones = h("Headphones and travel");
  const idxBreathing = h("Breathing");
  const idxRelease = h("Release Forms");
  const idxNoShow = h("200");
  const idxCancellation = h("Cancellation Fee");
  const idxTravelAgreement = h("Travel Agreement and Headphones");

  rows.forEach((cols, i) => {
    const rowIndex = i + 2; // 1-based, row 1 is header
    const errors: string[] = [];

    const get = (idx: number) => (idx >= 0 ? (cols[idx] ?? "").trim() : "");

    const unicityId = get(idxUnicityId);
    const email = get(idxEmail);
    const firstName = get(idxFirstName);
    const lastName = get(idxLastName);
    const rawLanguage = get(idxLanguage);
    const language = normalizeLanguage(rawLanguage);

    // Validate required fields
    if (!unicityId) errors.push("Missing Distributor ID");
    if (!email || !email.includes("@")) errors.push("Invalid or missing email");
    if (!firstName) errors.push("Missing first name");
    if (!lastName) errors.push("Missing last name");

    // First Method: use English column for EN, Spanish column for ES
    const firstMethodRaw =
      language === "es" ? get(idxFirstMethodEs) : get(idxFirstMethodEn);
    const isFirstMethod = normalizeBool(firstMethodRaw);

    const dietaryRestrictions = normalizeDietary(get(idxDietary));
    const headphonesAcknowledgment = normalizeBool(get(idxHeadphones));
    const breathingAcknowledgment = normalizeBool(get(idxBreathing));
    const releaseForms = normalizeBool(get(idxRelease));
    const noShowFee = normalizeBool(get(idxNoShow));
    const cancellationFee = normalizeBool(get(idxCancellation));
    const travelAgreement = normalizeBool(get(idxTravelAgreement));

    const parsed: ParsedRow = {
      rowIndex,
      unicityId,
      email,
      firstName,
      lastName,
      language,
      isFirstMethod,
      dietaryRestrictions,
      headphonesAcknowledgment,
      breathingAcknowledgment,
      releaseForms,
      noShowFee,
      cancellationFee,
      travelAgreement,
      errors,
    };

    if (errors.length > 0) {
      invalid.push(parsed);
    } else {
      valid.push(parsed);
    }
  });

  return { valid, invalid };
}

// ─── Confirmation Prompt ──────────────────────────────────────────────────────

async function confirm(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log("");
  console.log("════════════════════════════════════════════════════════════");
  console.log("  MAY METHOD EVENT — SILENT MIGRATION IMPORT");
  console.log("  Event ID:", EVENT_ID);
  console.log("  CSV:", csvPath);
  console.log("  Mode:", isDryRun ? "DRY RUN (no inserts)" : "LIVE INSERT");
  console.log("════════════════════════════════════════════════════════════");
  console.log("");

  // Load CSV
  if (!fs.existsSync(csvPath)) {
    console.error("ERROR: CSV file not found at:", csvPath);
    process.exit(1);
  }

  const { headers, rows } = parseCsv(csvPath);
  console.log(`Detected ${rows.length} data rows (${headers.length} columns).`);

  const { valid, invalid } = parseRows(headers, rows);

  console.log(`\nValidation results:`);
  console.log(`  ✓ Valid rows:   ${valid.length}`);
  console.log(`  ✗ Invalid rows: ${invalid.length}`);

  if (invalid.length > 0) {
    console.log("\nInvalid rows:");
    invalid.forEach((r) => {
      console.log(
        `  Row ${r.rowIndex} [${r.email || r.unicityId || "unknown"}]: ${r.errors.join(", ")}`
      );
    });
  }

  // Check for existing registrations (duplicate detection)
  const existingRegs = await db
    .select({ email: schema.registrations.email })
    .from(schema.registrations)
    .where(eq(schema.registrations.eventId, EVENT_ID));

  const existingEmails = new Set(existingRegs.map((r) => r.email.toLowerCase()));

  const toInsert = valid.filter(
    (r) => !existingEmails.has(r.email.toLowerCase())
  );
  const alreadyRegistered = valid.filter((r) =>
    existingEmails.has(r.email.toLowerCase())
  );

  console.log(`\nDuplicate check:`);
  console.log(`  Already registered (will skip): ${alreadyRegistered.length}`);
  if (alreadyRegistered.length > 0) {
    alreadyRegistered.forEach((r) => {
      console.log(`    - ${r.email} (${r.firstName} ${r.lastName})`);
    });
  }
  console.log(`  New registrations to create:    ${toInsert.length}`);

  console.log("\nRegistrations to be created:");
  toInsert.forEach((r) => {
    console.log(
      `  Row ${r.rowIndex}: ${r.firstName} ${r.lastName} <${r.email}> [${r.unicityId}] lang=${r.language}`
    );
  });

  if (toInsert.length === 0) {
    console.log(
      "\nNothing to insert — all rows are already registered or invalid."
    );
    await pool.end();
    return;
  }

  if (isDryRun) {
    console.log(
      "\n[DRY RUN] No changes made. Remove --dry-run flag to execute.\n"
    );
    await pool.end();
    return;
  }

  console.log("\n──────────────────────────────────────────────────────────");
  console.log("  CONFIRMATION REQUIRED");
  console.log("  This will insert", toInsert.length, "registrations.");
  console.log("  No emails or Iterable events will be triggered.");
  console.log("──────────────────────────────────────────────────────────");

  const answer = await confirm('\nType YES_IMPORT to proceed: ');
  if (answer.trim() !== "YES_IMPORT") {
    console.log("\nAborted. No changes made.");
    await pool.end();
    return;
  }

  // ── Insert registrations ──────────────────────────────────────────────────
  let created = 0;
  let failed = 0;
  const failures: string[] = [];

  const now = new Date();

  for (const row of toInsert) {
    try {
      await db.insert(schema.registrations).values({
        eventId: EVENT_ID,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        unicityId: row.unicityId,
        language: row.language,
        status: "registered",
        paymentStatus: "not_required",
        dietaryRestrictions: row.dietaryRestrictions,
        termsAccepted: true,
        termsAcceptedAt: now,
        registeredAt: now,
        formData: {
          firstMethodAttending: row.isFirstMethod ? "yes" : "no",
          headphonesAccommodationAcknowledgment: row.headphonesAcknowledgment,
          breathingExercisesAcknowledgment: row.breathingAcknowledgment,
          releaseForms: row.releaseForms,
          cancellationFeeAgreement: row.noShowFee || row.cancellationFee,
          travelAgreement: row.travelAgreement,
          silentImport: true,
          importSource: "migration_may_method_external",
        },
      });
      created++;
      console.log(
        `  [${created}/${toInsert.length}] Created: ${row.firstName} ${row.lastName} <${row.email}>`
      );
    } catch (err) {
      failed++;
      const msg = `Row ${row.rowIndex} (${row.email}): ${(err as Error).message}`;
      failures.push(msg);
      console.error(`  FAILED: ${msg}`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("");
  console.log("════════════════════════════════════════════════════════════");
  console.log("  IMPORT COMPLETE");
  console.log("════════════════════════════════════════════════════════════");
  console.log(`  Total rows processed:    ${rows.length}`);
  console.log(`  Skipped (invalid):       ${invalid.length}`);
  console.log(`  Skipped (already exist): ${alreadyRegistered.length}`);
  console.log(`  Registrations created:   ${created}`);
  console.log(`  Failures:                ${failed}`);
  console.log(`  Execution time:          ${elapsed}s`);

  if (failures.length > 0) {
    console.log("\nFailure details:");
    failures.forEach((f) => console.log("  -", f));
  }

  console.log("");
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
