import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PHASE1_SUB_IDS = ["CYCLE_01", "CYCLE_02", "CYCLE_03", "CYCLE_04", "CYCLE_05"];

function numericOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fallbackRecord(subId) {
  return {
    id: subId,
    subId,
    initialWeight: "",
    finalWeight: "",
    multiplicationRate: "",
    contaminatedCount: "",
    notes: "",
    updatedAt: "",
  };
}

function fallbackRecords() {
  return PHASE1_SUB_IDS.map(fallbackRecord);
}

function errorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

function mapRecord(row) {
  if (!row) return fallbackRecord("CYCLE_01");

  return {
    id: row.sub_id,
    subId: row.sub_id,
    initialWeight: row.initial_weight?.toString() ?? "",
    finalWeight: row.final_weight?.toString() ?? "",
    multiplicationRate: row.multiplication_rate?.toString() ?? "",
    contaminatedCount: row.contaminated_count?.toString() ?? "",
    notes: row.notes ?? "",
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at ?? "",
  };
}

function recordFromBody(body) {
  const subId = body.subId ?? body.id ?? "CYCLE_01";
  const initialWeight = body.initialWeight ?? "";
  const finalWeight = body.finalWeight ?? "";
  const initial = numericOrNull(initialWeight);
  const final = numericOrNull(finalWeight);

  return {
    id: subId,
    subId,
    initialWeight,
    finalWeight,
    multiplicationRate:
      initial && final !== null ? (final / initial).toString() : "",
    contaminatedCount: body.contaminatedCount ?? "",
    notes: body.notes ?? "",
    updatedAt: new Date().toISOString(),
  };
}

async function ensurePhase1Table() {
  await sql`
    CREATE TABLE IF NOT EXISTS phase1_records (
      sub_id TEXT PRIMARY KEY,
      initial_weight NUMERIC,
      final_weight NUMERIC,
      multiplication_rate NUMERIC GENERATED ALWAYS AS (
        CASE
          WHEN initial_weight IS NULL OR initial_weight = 0 OR final_weight IS NULL THEN NULL
          ELSE final_weight / initial_weight
        END
      ) STORED,
      contaminated_count NUMERIC,
      notes TEXT DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    ALTER TABLE phase1_records
    ADD COLUMN IF NOT EXISTS initial_weight NUMERIC
  `;
  await sql`
    ALTER TABLE phase1_records
    ADD COLUMN IF NOT EXISTS final_weight NUMERIC
  `;
  await sql`
    ALTER TABLE phase1_records
    ADD COLUMN IF NOT EXISTS multiplication_rate NUMERIC GENERATED ALWAYS AS (
      CASE
        WHEN initial_weight IS NULL OR initial_weight = 0 OR final_weight IS NULL THEN NULL
        ELSE final_weight / initial_weight
      END
    ) STORED
  `;
  await sql`
    ALTER TABLE phase1_records
    ADD COLUMN IF NOT EXISTS contaminated_count NUMERIC
  `;
  await sql`
    ALTER TABLE phase1_records
    ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''
  `;
  await sql`
    ALTER TABLE phase1_records
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `;
}

async function seedPhase1Records() {
  await ensurePhase1Table();
  await sql`
    INSERT INTO phase1_records (sub_id)
    SELECT 'CYCLE_' || LPAD(i::TEXT, 2, '0')
    FROM generate_series(1, 5) AS i
    ON CONFLICT (sub_id) DO NOTHING
  `;
}

async function fetchPhase1Records() {
  const { rows } = await sql`
    SELECT
      sub_id,
      initial_weight,
      final_weight,
      multiplication_rate,
      contaminated_count,
      notes,
      updated_at
    FROM phase1_records
    ORDER BY sub_id
  `;

  if (rows.length === 0) return fallbackRecords();

  const bySubId = new Map(rows.map((row) => [row.sub_id, mapRecord(row)]));
  return PHASE1_SUB_IDS.map((subId) => bySubId.get(subId) ?? fallbackRecord(subId));
}

export async function GET() {
  try {
    await seedPhase1Records();
    const records = await fetchPhase1Records();
    return NextResponse.json({ records });
  } catch (error) {
    console.error("/api/phase1 GET failed", error);
    return NextResponse.json(
      {
        records: fallbackRecords(),
        persisted: false,
        error: errorMessage(error, "Failed to load phase1 records"),
      },
      { status: 200 },
    );
  }
}

async function upsertPhase1(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const subId = body.subId ?? body.id;
  if (!subId) {
    return NextResponse.json({ error: "subId is required" }, { status: 400 });
  }

  try {
    await ensurePhase1Table();

    const { rows } = await sql`
      INSERT INTO phase1_records (
        sub_id,
        initial_weight,
        final_weight,
        contaminated_count,
        notes,
        updated_at
      )
      VALUES (
        ${subId},
        ${numericOrNull(body.initialWeight)},
        ${numericOrNull(body.finalWeight)},
        ${numericOrNull(body.contaminatedCount)},
        ${body.notes ?? ""},
        NOW()
      )
      ON CONFLICT (sub_id) DO UPDATE SET
        initial_weight = EXCLUDED.initial_weight,
        final_weight = EXCLUDED.final_weight,
        contaminated_count = EXCLUDED.contaminated_count,
        notes = EXCLUDED.notes,
        updated_at = NOW()
      RETURNING
        sub_id,
        initial_weight,
        final_weight,
        multiplication_rate,
        contaminated_count,
        notes,
        updated_at
    `;

    return NextResponse.json({ record: mapRecord(rows[0]), persisted: true });
  } catch (error) {
    console.error("/api/phase1 write failed", error);
    return NextResponse.json(
      {
        record: recordFromBody(body),
        persisted: false,
        error: errorMessage(error, "Failed to save phase1 record"),
      },
      { status: 200 },
    );
  }
}

export async function POST(request) {
  return upsertPhase1(request);
}

export async function PUT(request) {
  return upsertPhase1(request);
}
