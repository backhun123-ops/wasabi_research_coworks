import { sql } from "@vercel/postgres";
import { NextResponse } from "next/server";

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

async function seedSamples() {
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
    SELECT *
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
  await seedSamples();
  await seedMonitoring();
  return NextResponse.json(await fetchSamplesAndMonitoring());
}

async function updateLayout(layout) {
  if (!Array.isArray(layout) || layout.length !== 144) {
    return NextResponse.json({ error: "layout must contain 144 items" }, { status: 400 });
  }

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
  const positionIndex = Number(body.positionIndex ?? body.position_index ?? 0);

  const { rows } = await sql`
    INSERT INTO samples (
      sample_id, status, condition_no, repeat_n, rb_ratio, rb_red_ratio,
      rb_blue_ratio, fr_percent, ppfd_umol_m2_s, photoperiod_light_h,
      photoperiod_dark_h, position_index, chamber_row, chamber_col,
      gsl_gluco_umol_g, gsl_sinigrin_umol_g, dw_g, fw_g, notes, updated_at
    )
    VALUES (
      ${sampleId}, ${body.status ?? "대기중"}, ${conditionNumber(sampleId)},
      ${Number(body.repeat ?? repeatNumber(sampleId))}, ${body.rb ?? "9:1"},
      ${Number.isFinite(rbParts[0]) ? rbParts[0] : 9},
      ${Number.isFinite(rbParts[1]) ? rbParts[1] : 1},
      ${numericOrNull(body.fr) ?? 0}, ${numericOrNull(body.ppfd) ?? 30},
      16, 8, ${positionIndex}, ${Math.floor(positionIndex / 12)},
      ${positionIndex % 12}, ${numericOrNull(body.gluco)},
      ${numericOrNull(body.sinigrin)}, ${numericOrNull(body.dw)},
      ${numericOrNull(body.fw)}, ${body.notes ?? ""}, NOW()
    )
    ON CONFLICT (sample_id) DO UPDATE SET
      status = EXCLUDED.status,
      gsl_gluco_umol_g = EXCLUDED.gsl_gluco_umol_g,
      gsl_sinigrin_umol_g = EXCLUDED.gsl_sinigrin_umol_g,
      dw_g = EXCLUDED.dw_g,
      fw_g = EXCLUDED.fw_g,
      notes = EXCLUDED.notes,
      position_index = EXCLUDED.position_index,
      chamber_row = EXCLUDED.chamber_row,
      chamber_col = EXCLUDED.chamber_col,
      updated_at = NOW()
    RETURNING *
  `;

  return NextResponse.json({ sample: mapSample(rows[0]) });
}

async function handleWrite(request) {
  const body = await request.json();
  if (body.layout) return updateLayout(body.layout);
  if (body.kind === "monitoring") return upsertMonitoring(body.record ?? body);
  return upsertSample(body.sample ?? body);
}

export async function POST(request) {
  return handleWrite(request);
}

export async function PUT(request) {
  return handleWrite(request);
}
