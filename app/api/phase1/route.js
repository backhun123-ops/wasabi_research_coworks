import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function numericOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRecord(row) {
  return {
    id: row.sub_id,
    subId: row.sub_id,
    initialWeight: row.initial_weight?.toString() ?? "",
    finalWeight: row.final_weight?.toString() ?? "",
    multiplicationRate: row.multiplication_rate?.toString() ?? "",
    contaminatedCount: row.contaminated_count?.toString() ?? "",
    notes: row.notes ?? "",
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

async function seedPhase1Records() {
  await sql`
    INSERT INTO phase1_records (sub_id)
    SELECT 'CYCLE_' || LPAD(i::TEXT, 2, '0')
    FROM generate_series(1, 5) AS i
    ON CONFLICT (sub_id) DO NOTHING
  `;
}

export async function GET() {
  await seedPhase1Records();
  const { rows } = await sql`
    SELECT sub_id, initial_weight, final_weight, multiplication_rate,
           contaminated_count, notes, updated_at
    FROM phase1_records
    ORDER BY sub_id
  `;
  return NextResponse.json({ records: rows.map(mapRecord) });
}

async function upsertPhase1(request) {
  const body = await request.json();
  const subId = body.subId ?? body.id;
  if (!subId) {
    return NextResponse.json({ error: "subId is required" }, { status: 400 });
  }

  const { rows } = await sql`
    INSERT INTO phase1_records (
      sub_id, initial_weight, final_weight, contaminated_count, notes, updated_at
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
    RETURNING sub_id, initial_weight, final_weight, multiplication_rate,
              contaminated_count, notes, updated_at
  `;

  return NextResponse.json({ record: mapRecord(rows[0]) });
}

export async function POST(request) {
  return upsertPhase1(request);
}

export async function PUT(request) {
  return upsertPhase1(request);
}
