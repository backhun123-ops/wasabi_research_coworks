import { NextResponse } from "next/server";
import { sql } from "../db";

export const dynamic = "force-dynamic";

const RB_LEVELS = [
  { ratio: "9:1", red: 9, blue: 1 },
  { ratio: "7:3", red: 7, blue: 3 },
  { ratio: "5:5", red: 5, blue: 5 },
];
const FR_LEVELS = [0, 10];
const PPFD_LEVELS = [30, 50, 80, 120];
const MONITORING_ROUNDS = [
  { week: 0, label: "0주차" },
  { week: 2, label: "2주차" },
  { week: 4, label: "4주차" },
  { week: 6, label: "6주차" },
  { week: 8, label: "8주차" },
];

function numericOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function conditionNumber(id) {
  return Number(/^EXP_(\d{2})_\d+$/.exec(id)?.[1] ?? 0);
}

function repeatNumber(id) {
  return Number(/^EXP_\d{2}_(\d+)$/.exec(id)?.[1] ?? 0);
}

function buildSeedSamples() {
  const samples = [];
  let conditionNo = 1;
  for (const rb of RB_LEVELS) {
    for (const fr of FR_LEVELS) {
      for (const ppfd of PPFD_LEVELS) {
        for (let repeat = 1; repeat <= 6; repeat += 1) {
          samples.push({
            id: `EXP_${String(conditionNo).padStart(2, "0")}_${repeat}`,
            conditionNo,
            repeat,
            rb,
            fr,
            ppfd,
          });
        }
        conditionNo += 1;
      }
    }
  }
  return samples;
}

function fallbackSamples() {
  const seedSamples = buildSeedSamples();
  const layout = buildBalancedLayoutIds(seedSamples);
  const positionById = new Map(layout.map((id, index) => [id, index]));

  return seedSamples.map((sample) => {
    const positionIndex = positionById.get(sample.id);
    return {
      id: sample.id,
      status: "대기중",
      rb: sample.rb.ratio,
      fr: sample.fr.toString(),
      ppfd: sample.ppfd,
      photoperiod: "16/8",
      repeat: sample.repeat,
      positionIndex,
      chamberRow: Math.floor(positionIndex / 12),
      chamberCol: positionIndex % 12,
      gluco: "",
      sinigrin: "",
      gluconapin: "",
      ohGlucobrassicin: "",
      glucobrassicin: "",
      glucoerucin: "",
      gluconasturtiin: "",
      chloroA: "",
      chloroB: "",
      dw: "",
      fw: "",
      notes: "",
      updatedAt: "",
    };
  });
}

function fallbackMonitoring(samples = fallbackSamples()) {
  return samples.flatMap((sample) =>
    MONITORING_ROUNDS.map((round) => ({
      id: `${sample.id}_W${round.week}`,
      sampleId: sample.id,
      week: round.week,
      label: round.label,
      checkedAt: "",
      status: "정상",
      contamination: "없음",
      monitorFw: "",
      notes: "",
      updatedAt: "",
    })),
  );
}

function buildBalancedLayoutIds(samples) {
  const pattern = [30, 80, 50, 120];
  const queues = new Map(
    PPFD_LEVELS.map((ppfd) => [
      ppfd,
      samples
        .filter((sample) => sample.ppfd === ppfd)
        .sort(
          (a, b) =>
            repeatNumber(a.id) - repeatNumber(b.id) ||
            conditionNumber(a.id) - conditionNumber(b.id),
        ),
    ]),
  );

  const layout = [];
  for (let row = 0; row < 12; row += 1) {
    for (let col = 0; col < 12; col += 1) {
      const ppfd = pattern[(row + col) % pattern.length];
      layout.push(queues.get(ppfd).shift().id);
    }
  }
  return layout;
}

function mapSample(row) {
  return {
    id: row.sample_id,
    status: row.status,
    rb: row.rb_ratio,
    fr: row.fr_percent?.toString() ?? "",
    ppfd: Number(row.ppfd_umol_m2_s),
    photoperiod: `${row.photoperiod_light_h}/${row.photoperiod_dark_h}`,
    repeat: row.repeat_n,
    positionIndex: row.position_index,
    chamberRow: row.chamber_row,
    chamberCol: row.chamber_col,
    gluco: row.gsl_gluco_umol_g?.toString() ?? "",
    sinigrin: row.gsl_sinigrin_umol_g?.toString() ?? "",
    gluconapin: row.gluconapin?.toString() ?? "",
    ohGlucobrassicin: row.oh_glucobrassicin?.toString() ?? "",
    glucobrassicin: row.glucobrassicin?.toString() ?? "",
    glucoerucin: row.glucoerucin?.toString() ?? "",
    gluconasturtiin: row.gluconasturtiin?.toString() ?? "",
    chloroA: row.chloro_a?.toString() ?? "",
    chloroB: row.chloro_b?.toString() ?? "",
    dw: row.dw_g?.toString() ?? "",
    fw: row.fw_g?.toString() ?? "",
    notes: row.notes ?? "",
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

function mapMonitoring(row) {
  return {
    id: row.id,
    sampleId: row.sample_id,
    week: row.week,
    label: row.round_label,
    checkedAt: row.checked_at ?? "",
    status: row.status,
    contamination: row.contamination,
    monitorFw: row.monitor_fw_g?.toString() ?? "",
    notes: row.notes ?? "",
    updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
  };
}

async function ensureSamplesSchema() {
  await sql`
    CREATE TABLE IF NOT EXISTS samples (
      sample_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT '대기중',
      condition_no INTEGER,
      repeat_n INTEGER,
      rb_ratio TEXT,
      rb_red_ratio NUMERIC,
      rb_blue_ratio NUMERIC,
      fr_percent NUMERIC,
      ppfd_umol_m2_s NUMERIC,
      photoperiod_light_h INTEGER DEFAULT 16,
      photoperiod_dark_h INTEGER DEFAULT 8,
      position_index INTEGER UNIQUE,
      chamber_row INTEGER,
      chamber_col INTEGER,
      gsl_gluco_umol_g NUMERIC,
      gsl_sinigrin_umol_g NUMERIC,
      gluconapin NUMERIC,
      oh_glucobrassicin NUMERIC,
      glucobrassicin NUMERIC,
      glucoerucin NUMERIC,
      gluconasturtiin NUMERIC,
      chloro_a NUMERIC,
      chloro_b NUMERIC,
      dw_g NUMERIC,
      fw_g NUMERIC,
      notes TEXT DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '대기중'`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS condition_no INTEGER`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS repeat_n INTEGER`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS rb_ratio TEXT`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS rb_red_ratio NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS rb_blue_ratio NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS fr_percent NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS ppfd_umol_m2_s NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS photoperiod_light_h INTEGER DEFAULT 16`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS photoperiod_dark_h INTEGER DEFAULT 8`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS position_index INTEGER`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS chamber_row INTEGER`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS chamber_col INTEGER`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS gsl_gluco_umol_g NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS gsl_sinigrin_umol_g NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS gluconapin NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS oh_glucobrassicin NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS glucobrassicin NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS glucoerucin NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS gluconasturtiin NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS chloro_a NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS chloro_b NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS dw_g NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS fw_g NUMERIC`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`;
  await sql`ALTER TABLE samples ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS samples_position_unique_idx ON samples (position_index)`;
  await sql`CREATE INDEX IF NOT EXISTS samples_condition_idx ON samples (condition_no, repeat_n)`;

  await sql`
    CREATE TABLE IF NOT EXISTS phase2_monitoring (
      id TEXT PRIMARY KEY,
      sample_id TEXT NOT NULL REFERENCES samples(sample_id) ON DELETE CASCADE,
      week INTEGER NOT NULL,
      round_label TEXT NOT NULL,
      checked_at TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT '정상',
      contamination TEXT NOT NULL DEFAULT '없음',
      monitor_fw_g NUMERIC,
      notes TEXT DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (sample_id, week)
    )
  `;

  await sql`ALTER TABLE phase2_monitoring ADD COLUMN IF NOT EXISTS checked_at TEXT DEFAULT ''`;
  await sql`ALTER TABLE phase2_monitoring ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '정상'`;
  await sql`ALTER TABLE phase2_monitoring ADD COLUMN IF NOT EXISTS contamination TEXT DEFAULT '없음'`;
  await sql`ALTER TABLE phase2_monitoring ADD COLUMN IF NOT EXISTS monitor_fw_g NUMERIC`;
  await sql`ALTER TABLE phase2_monitoring ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`;
  await sql`ALTER TABLE phase2_monitoring ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`;
  await sql`
    CREATE INDEX IF NOT EXISTS phase2_monitoring_sample_week_idx
    ON phase2_monitoring (sample_id, week)
  `;
}

async function seedSamples() {
  await ensureSamplesSchema();

  const { rows } = await sql`SELECT COUNT(*)::INT AS count FROM samples`;
  if (rows[0]?.count > 0) return;

  const samples = buildSeedSamples();
  const layout = buildBalancedLayoutIds(samples);
  const positionById = new Map(layout.map((id, index) => [id, index]));

  for (const sample of samples) {
    const positionIndex = positionById.get(sample.id);
    await sql`
      INSERT INTO samples (
        sample_id, status, condition_no, repeat_n, rb_ratio, rb_red_ratio,
        rb_blue_ratio, fr_percent, ppfd_umol_m2_s, photoperiod_light_h,
        photoperiod_dark_h, position_index, chamber_row, chamber_col
      )
      VALUES (
        ${sample.id}, '대기중', ${sample.conditionNo}, ${sample.repeat},
        ${sample.rb.ratio}, ${sample.rb.red}, ${sample.rb.blue}, ${sample.fr},
        ${sample.ppfd}, 16, 8, ${positionIndex}, ${Math.floor(positionIndex / 12)},
        ${positionIndex % 12}
      )
      ON CONFLICT (sample_id) DO NOTHING
    `;
  }
}

async function seedMonitoring() {
  await ensureSamplesSchema();

  for (const sample of buildSeedSamples()) {
    for (const round of MONITORING_ROUNDS) {
      await sql`
        INSERT INTO phase2_monitoring (id, sample_id, week, round_label)
        VALUES (${`${sample.id}_W${round.week}`}, ${sample.id}, ${round.week}, ${round.label})
        ON CONFLICT (id) DO NOTHING
      `;
    }
  }
}

async function fetchSamplesAndMonitoring() {
  const sampleResult = await sql`
    SELECT
      sample_id,
      status,
      condition_no,
      repeat_n,
      rb_ratio,
      fr_percent,
      ppfd_umol_m2_s,
      photoperiod_light_h,
      photoperiod_dark_h,
      position_index,
      chamber_row,
      chamber_col,
      gsl_gluco_umol_g,
      gsl_sinigrin_umol_g,
      gluconapin,
      oh_glucobrassicin,
      glucobrassicin,
      glucoerucin,
      gluconasturtiin,
      chloro_a,
      chloro_b,
      dw_g,
      fw_g,
      notes,
      updated_at
    FROM samples
    ORDER BY position_index NULLS LAST, sample_id
  `;
  const monitoringResult = await sql`
    SELECT *
    FROM phase2_monitoring
    ORDER BY week, sample_id
  `;
  return {
    samples: sampleResult.rows.map(mapSample),
    monitoring: monitoringResult.rows.map(mapMonitoring),
  };
}

export async function GET() {
  try {
    await seedSamples();
    await seedMonitoring();
    return NextResponse.json(await fetchSamplesAndMonitoring());
  } catch (error) {
    console.error("/api/samples GET failed", error);
    const samples = fallbackSamples();
    return NextResponse.json(
      {
        samples,
        monitoring: fallbackMonitoring(samples),
        persisted: false,
        error: error instanceof Error ? error.message : "Failed to load samples",
      },
      { status: 200 },
    );
  }
}

async function updateLayout(layout) {
  if (!Array.isArray(layout) || layout.length !== 144) {
    return NextResponse.json({ error: "layout must contain 144 items" }, { status: 400 });
  }

  await ensureSamplesSchema();

  await sql`
    UPDATE samples
    SET position_index = position_index + 10000
    WHERE position_index IS NOT NULL
  `;

  for (const item of layout) {
    const sampleId = item.id ?? item.sampleId;
    const positionIndex = Number(item.positionIndex ?? item.position_index);
    if (!sampleId || !Number.isInteger(positionIndex)) continue;
    await sql`
      UPDATE samples
      SET position_index = ${positionIndex},
          chamber_row = ${Math.floor(positionIndex / 12)},
          chamber_col = ${positionIndex % 12},
          updated_at = NOW()
      WHERE sample_id = ${sampleId}
    `;
  }

  return NextResponse.json(await fetchSamplesAndMonitoring());
}

async function upsertMonitoring(body) {
  if (!body.id || !body.sampleId) {
    return NextResponse.json({ error: "monitoring id and sampleId are required" }, { status: 400 });
  }

  await ensureSamplesSchema();

  await sql`
    INSERT INTO phase2_monitoring (
      id, sample_id, week, round_label, checked_at, status,
      contamination, monitor_fw_g, notes, updated_at
    )
    VALUES (
      ${body.id}, ${body.sampleId}, ${Number(body.week)}, ${body.label ?? ""},
      ${body.checkedAt ?? ""}, ${body.status ?? "정상"},
      ${body.contamination ?? "없음"}, ${numericOrNull(body.monitorFw)},
      ${body.notes ?? ""}, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      checked_at = EXCLUDED.checked_at,
      status = EXCLUDED.status,
      contamination = EXCLUDED.contamination,
      monitor_fw_g = EXCLUDED.monitor_fw_g,
      notes = EXCLUDED.notes,
      updated_at = NOW()
  `;

  return NextResponse.json(await fetchSamplesAndMonitoring());
}

async function upsertSample(body) {
  const sampleId = body.id ?? body.sampleId;
  if (!sampleId) {
    return NextResponse.json({ error: "sample id is required" }, { status: 400 });
  }

  const rbParts = String(body.rb ?? "9:1").split(":").map(Number);
  const requestedPositionIndex = body.positionIndex ?? body.position_index;
  const positionIndex =
    requestedPositionIndex === undefined || requestedPositionIndex === null
      ? null
      : Number(requestedPositionIndex);

  await ensureSamplesSchema();

  const { rows } = await sql`
    INSERT INTO samples (
      sample_id, status, condition_no, repeat_n, rb_ratio, rb_red_ratio,
      rb_blue_ratio, fr_percent, ppfd_umol_m2_s, photoperiod_light_h,
      photoperiod_dark_h, position_index, chamber_row, chamber_col,
      gsl_gluco_umol_g, gsl_sinigrin_umol_g, gluconapin, oh_glucobrassicin,
      glucobrassicin, glucoerucin, gluconasturtiin, chloro_a, chloro_b,
      dw_g, fw_g, notes, updated_at
    )
    VALUES (
      ${sampleId}, ${body.status ?? "대기중"}, ${conditionNumber(sampleId)},
      ${Number(body.repeat ?? repeatNumber(sampleId))}, ${body.rb ?? "9:1"},
      ${Number.isFinite(rbParts[0]) ? rbParts[0] : 9},
      ${Number.isFinite(rbParts[1]) ? rbParts[1] : 1},
      ${numericOrNull(body.fr) ?? 0}, ${numericOrNull(body.ppfd) ?? 30},
      16, 8, ${Number.isInteger(positionIndex) ? positionIndex : null},
      ${Number.isInteger(positionIndex) ? Math.floor(positionIndex / 12) : null},
      ${Number.isInteger(positionIndex) ? positionIndex % 12 : null},
      ${numericOrNull(body.gluco)},
      ${numericOrNull(body.sinigrin)}, ${numericOrNull(body.gluconapin)},
      ${numericOrNull(body.ohGlucobrassicin)}, ${numericOrNull(body.glucobrassicin)},
      ${numericOrNull(body.glucoerucin)}, ${numericOrNull(body.gluconasturtiin)},
      ${numericOrNull(body.chloroA)}, ${numericOrNull(body.chloroB)}, ${numericOrNull(body.dw)},
      ${numericOrNull(body.fw)}, ${body.notes ?? ""}, NOW()
    )
    ON CONFLICT (sample_id) DO UPDATE SET
      status = EXCLUDED.status,
      gsl_gluco_umol_g = EXCLUDED.gsl_gluco_umol_g,
      gsl_sinigrin_umol_g = EXCLUDED.gsl_sinigrin_umol_g,
      gluconapin = EXCLUDED.gluconapin,
      oh_glucobrassicin = EXCLUDED.oh_glucobrassicin,
      glucobrassicin = EXCLUDED.glucobrassicin,
      glucoerucin = EXCLUDED.glucoerucin,
      gluconasturtiin = EXCLUDED.gluconasturtiin,
      chloro_a = EXCLUDED.chloro_a,
      chloro_b = EXCLUDED.chloro_b,
      dw_g = EXCLUDED.dw_g,
      fw_g = EXCLUDED.fw_g,
      notes = EXCLUDED.notes,
      position_index = COALESCE(EXCLUDED.position_index, samples.position_index),
      chamber_row = COALESCE(EXCLUDED.chamber_row, samples.chamber_row),
      chamber_col = COALESCE(EXCLUDED.chamber_col, samples.chamber_col),
      updated_at = NOW()
    RETURNING *
  `;

  return NextResponse.json({ sample: mapSample(rows[0]) });
}

async function handleWrite(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body.layout) return updateLayout(body.layout);
    if (body.kind === "monitoring") return upsertMonitoring(body.record ?? body);
    return upsertSample(body.sample ?? body);
  } catch (error) {
    console.error("/api/samples write failed", error);
    return NextResponse.json(
      {
        persisted: false,
        error: error instanceof Error ? error.message : "Failed to save samples",
      },
      { status: 200 },
    );
  }
}

export async function POST(request) {
  return handleWrite(request);
}

export async function PUT(request) {
  return handleWrite(request);
}
