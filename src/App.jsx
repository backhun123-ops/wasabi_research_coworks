"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardList,
  Download,
  FlaskConical,
  Grid3X3,
  Layers3,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
  Sprout,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PHASE2_STATUSES = ["대기중", "배양중", "수확완료", "오염됨"];
const RB_LEVELS = ["9:1", "7:3", "5:5"];
const FR_LEVELS = [0, 10];
const PPFD_LEVELS = [30, 50, 80, 120];
const PHOTOPERIOD = "16/8";
const MONITORING_ROUNDS = [
  { week: 0, label: "0주차" },
  { week: 2, label: "2주차" },
  { week: 4, label: "4주차" },
  { week: 6, label: "6주차" },
  { week: 8, label: "8주차" },
];
const PRESET_MESSAGES = [
  "[곰팡이 오염 발생]",
  "[타이머 16/8 정상 작동 확인]",
  "[생체중 측정 완료]",
  "[결측치 발생, 확인 필요]",
];
const LOG_AUTHORS = ["상훈", "명호", "준형", "김교수님"];
const DASHBOARD_PASSWORD = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD ?? "wasabi2026";
const PROPOSAL_CATEGORIES = ["논문", "알고리즘", "실험 아이디어", "분석 노트"];
const PROPOSAL_STATUSES = ["검토중", "실행 예정", "보류", "완료"];

const numericLabels = {
  initialWeight: "초기무게",
  finalWeight: "최종무게",
  contaminatedCount: "오염 용기 수",
  vesselCount: "입식 용기 수",
  fw: "생체중_FW",
  dw: "건체중_DW",
  gluco: "GSL_Gluco",
  sinigrin: "GSL_Sinigrin",
  gluconapin: "GSL_Gluconapin (μmol/g)",
  ohGlucobrassicin: "GSL_4-OH-Glucobrassicin (μmol/g)",
  glucobrassicin: "GSL_Glucobrassicin (μmol/g)",
  glucoerucin: "GSL_Glucoerucin (μmol/g)",
  gluconasturtiin: "GSL_Gluconasturtiin (μmol/g)",
  chloroA: "엽록소_a (mg/g FW)",
  chloroB: "엽록소_b (mg/g FW)",
  monitorFw: "모니터링 생체중",
};

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRate(initialValue, finalValue) {
  const initial = numberOrNull(initialValue);
  const final = numberOrNull(finalValue);
  if (!initial || final === null) return null;
  return final / initial;
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildPhase1Records() {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `CYCLE_${String(index + 1).padStart(2, "0")}`,
    subId: `CYCLE_${String(index + 1).padStart(2, "0")}`,
    initialWeight: "",
    finalWeight: "",
    multiplicationRate: "",
    contaminatedCount: "",
    notes: "",
    updatedAt: new Date().toISOString(),
  }));
}

function buildPhase2Samples() {
  const samples = [];
  let condition = 1;

  for (const rb of RB_LEVELS) {
    for (const fr of FR_LEVELS) {
      for (const ppfd of PPFD_LEVELS) {
        for (let repeat = 1; repeat <= 6; repeat += 1) {
          samples.push({
            id: `EXP_${String(condition).padStart(2, "0")}_${repeat}`,
            status: "대기중",
            rb,
            fr,
            ppfd,
            photoperiod: PHOTOPERIOD,
            repeat,
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
            updatedAt: new Date().toISOString(),
          });
        }
        condition += 1;
      }
    }
  }

  return samples;
}

function normalizePhase1(saved) {
  return Array.isArray(saved) && saved.length ? saved : buildPhase1Records();
}

function normalizePhase2(saved, legacy, initialSamples) {
  const source = Array.isArray(saved) && saved.length === 144 ? saved : legacy;
  if (!Array.isArray(source) || source.length !== 144) return initialSamples;

  const sourceMap = new Map(source.map((sample) => [sample.id, sample]));
  return initialSamples.map((sample) => {
    const previous = sourceMap.get(sample.id);
    return previous
      ? {
          ...sample,
          status: PHASE2_STATUSES.includes(previous.status) ? previous.status : sample.status,
          photoperiod: previous.photoperiod ?? PHOTOPERIOD,
          fw: previous.fw ?? previous.finalFw ?? "",
          dw: previous.dw ?? "",
          gluco: previous.gluco ?? previous.gsl ?? "",
          sinigrin: previous.sinigrin ?? "",
          gluconapin: previous.gluconapin ?? "",
          ohGlucobrassicin: previous.ohGlucobrassicin ?? "",
          glucobrassicin: previous.glucobrassicin ?? "",
          glucoerucin: previous.glucoerucin ?? "",
          gluconasturtiin: previous.gluconasturtiin ?? "",
          chloroA: previous.chloroA ?? "",
          chloroB: previous.chloroB ?? "",
          notes: previous.notes ?? "",
          updatedAt: previous.updatedAt ?? sample.updatedAt,
        }
      : sample;
  });
}

function buildMonitoringRecords(samples) {
  return samples.flatMap((sample) =>
    MONITORING_ROUNDS.map((round) => ({
      id: `${sample.id}_W${round.week}`,
      sampleId: sample.id,
      week: round.week,
      label: round.label,
      checkedAt: "",
      status: "정상",
      monitorFw: "",
      contamination: "없음",
      notes: "",
      updatedAt: new Date().toISOString(),
    })),
  );
}

function normalizeMonitoring(saved, samples) {
  const initial = buildMonitoringRecords(samples);
  if (!Array.isArray(saved) || saved.length === 0) return initial;

  const savedMap = new Map(saved.map((record) => [record.id, record]));
  return initial.map((record) => {
    const previous = savedMap.get(record.id);
    return previous
      ? {
          ...record,
          checkedAt: previous.checkedAt ?? "",
          status: previous.status ?? "정상",
          monitorFw: previous.monitorFw ?? "",
          contamination: previous.contamination ?? "없음",
          notes: previous.notes ?? "",
          updatedAt: previous.updatedAt ?? record.updatedAt,
        }
      : record;
  });
}

function normalizeProposals(saved) {
  return Array.isArray(saved) ? saved : [];
}

function conditionNumber(id) {
  return Number(/^EXP_(\d{2})_\d+$/.exec(id)?.[1] ?? 0);
}

function repeatNumber(id) {
  return Number(/^EXP_\d{2}_(\d+)$/.exec(id)?.[1] ?? 0);
}

function buildBalancedLayout(samples) {
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

const DashboardContext = createContext(null);

async function fetchJson(url, options) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${url} ${response.status}`);
  }
  return response.json();
}

function layoutFromSamples(samples) {
  const positioned = samples.filter((sample) => Number.isInteger(sample.positionIndex));
  if (positioned.length === samples.length) {
    return [...samples]
      .sort((a, b) => a.positionIndex - b.positionIndex)
      .map((sample) => sample.id);
  }
  return buildBalancedLayout(samples);
}

function applyPendingRecords(records, pendingRef) {
  return records.map((record) => pendingRef.current.get(record.id) ?? record);
}

function scheduleSave(timerRef, id, callback) {
  const existingTimer = timerRef.current.get(id);
  if (existingTimer) window.clearTimeout(existingTimer);
  const nextTimer = window.setTimeout(() => {
    timerRef.current.delete(id);
    callback();
  }, 450);
  timerRef.current.set(id, nextTimer);
}

function clearSaveTimers(timerRef) {
  timerRef.current.forEach((timer) => window.clearTimeout(timer));
  timerRef.current.clear();
}

function DashboardProvider({ children }) {
  const initialPhase2 = useMemo(buildPhase2Samples, []);
  const [activePhase, setActivePhase] = useState("phase1");
  const [phase1, setPhase1] = useState(buildPhase1Records);
  const [phase2, setPhase2] = useState(initialPhase2);
  const [monitoring, setMonitoring] = useState(() => buildMonitoringRecords(initialPhase2));
  const [proposals, setProposals] = useState([]);
  const [layout, setLayout] = useState(() => buildBalancedLayout(initialPhase2));
  const [logs, setLogs] = useState([
    {
      id: createId(),
      author: "시스템",
      message: "와사비 Phase 1/2 실험 대시보드가 초기화되었습니다.",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [syncError, setSyncError] = useState("");
  const [selectedId, setSelectedId] = useState("EXP_01_1");
  const [flashId, setFlashId] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [readOnlyMode, setReadOnlyMode] = useState(false);
  const phase1PendingRef = useRef(new Map());
  const phase2PendingRef = useRef(new Map());
  const monitoringPendingRef = useRef(new Map());
  const proposalPendingRef = useRef(new Map());
  const phase1SaveTimersRef = useRef(new Map());
  const phase2SaveTimersRef = useRef(new Map());
  const monitoringSaveTimersRef = useRef(new Map());
  const proposalSaveTimersRef = useRef(new Map());

  const refreshPhase1 = useCallback(async () => {
    const data = await fetchJson("/api/phase1", { cache: "no-store" });
    setPhase1(applyPendingRecords(normalizePhase1(data.records), phase1PendingRef));
  }, []);

  const refreshSamples = useCallback(async () => {
    const data = await fetchJson("/api/samples", { cache: "no-store" });
    const samples = applyPendingRecords(
      normalizePhase2(data.samples, null, initialPhase2),
      phase2PendingRef,
    );
    setPhase2(samples);
    setMonitoring(applyPendingRecords(normalizeMonitoring(data.monitoring, samples), monitoringPendingRef));
    setLayout(layoutFromSamples(samples));
  }, [initialPhase2]);

  const refreshChat = useCallback(async () => {
    const data = await fetchJson("/api/chat", { cache: "no-store" });
    setLogs(data.messages ?? []);
  }, []);

  const refreshProposals = useCallback(async () => {
    const data = await fetchJson("/api/proposals", { cache: "no-store" });
    setProposals(applyPendingRecords(normalizeProposals(data.proposals), proposalPendingRef));
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      setSyncError("");
      await Promise.all([refreshPhase1(), refreshSamples(), refreshChat(), refreshProposals()]);
    } catch (error) {
      setSyncError(error.message);
    }
  }, [refreshPhase1, refreshSamples, refreshChat, refreshProposals]);

  useEffect(() => {
    refreshAll();
    const timer = window.setInterval(refreshAll, 15000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  useEffect(() => {
    return () => {
      clearSaveTimers(phase1SaveTimersRef);
      clearSaveTimers(phase2SaveTimersRef);
      clearSaveTimers(monitoringSaveTimersRef);
      clearSaveTimers(proposalSaveTimersRef);
    };
  }, []);

  useEffect(() => {
    const savedUser = window.sessionStorage.getItem("wasabi_current_user");
    if (savedUser && LOG_AUTHORS.includes(savedUser)) {
      setCurrentUser(savedUser);
    }
  }, []);

  const isAuthenticated = Boolean(currentUser);

  const authenticate = useCallback((user, password) => {
    if (!LOG_AUTHORS.includes(user) || password !== DASHBOARD_PASSWORD) {
      return false;
    }
    setCurrentUser(user);
    setReadOnlyMode(false);
    window.sessionStorage.setItem("wasabi_current_user", user);
    setSyncError("");
    return true;
  }, []);

  const enterReadOnlyMode = useCallback(() => {
    setReadOnlyMode(true);
    setSyncError("");
  }, []);

  const blockUnauthenticatedWrite = useCallback(() => {
    if (currentUser) return false;
    setSyncError("인증되지 않은 사용자는 읽기 전용으로만 볼 수 있습니다.");
    return true;
  }, [currentUser]);

  const phase2Map = useMemo(() => new Map(phase2.map((sample) => [sample.id, sample])), [phase2]);

  const savePhase1 = useCallback(
    async (record) => {
      try {
        const data = await fetchJson("/api/phase1", {
          method: "PUT",
          body: JSON.stringify(record),
        });
        if (data.persisted === false) {
          throw new Error(data.error || "Phase 1 data was not persisted");
        }
        const latestPending = phase1PendingRef.current.get(record.id);
        if (latestPending?.updatedAt === record.updatedAt) {
          phase1PendingRef.current.delete(record.id);
          if (data.record) {
            setPhase1((current) =>
              current.map((item) => (item.id === record.id ? data.record : item)),
            );
          }
        }
      } catch (error) {
        setSyncError(error.message);
      }
    },
    [],
  );

  const updatePhase1 = useCallback((id, patch) => {
    if (blockUnauthenticatedWrite()) return;
    const currentRecord = phase1.find((record) => record.id === id);
    if (!currentRecord) return;
    const nextRecord = {
      ...currentRecord,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setPhase1((current) =>
      current.map((record) =>
        record.id === id ? nextRecord : record,
      ),
    );
    phase1PendingRef.current.set(id, nextRecord);
    scheduleSave(phase1SaveTimersRef, id, () => {
      void savePhase1(nextRecord);
    });
  }, [blockUnauthenticatedWrite, phase1, savePhase1]);

  const saveSample = useCallback(
    async (sample) => {
      try {
        const data = await fetchJson("/api/samples", {
          method: "PUT",
          body: JSON.stringify({ sample }),
        });
        if (data.persisted === false) {
          throw new Error(data.error || "Phase 2 sample data was not persisted");
        }
        const latestPending = phase2PendingRef.current.get(sample.id);
        if (latestPending?.updatedAt === sample.updatedAt) {
          phase2PendingRef.current.delete(sample.id);
          if (data.sample) {
            setPhase2((current) =>
              current.map((item) => (item.id === sample.id ? data.sample : item)),
            );
          }
        }
      } catch (error) {
        setSyncError(error.message);
      }
    },
    [],
  );

  const updatePhase2 = useCallback((id, patch) => {
    if (blockUnauthenticatedWrite()) return;
    const currentSample = phase2.find((sample) => sample.id === id);
    if (!currentSample) return;
    const nextSample = {
      ...currentSample,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setPhase2((current) =>
      current.map((sample) =>
        sample.id === id ? nextSample : sample,
      ),
    );
    phase2PendingRef.current.set(id, nextSample);
    scheduleSave(phase2SaveTimersRef, id, () => {
      void saveSample(nextSample);
    });
  }, [blockUnauthenticatedWrite, phase2, saveSample]);

  const saveMonitoring = useCallback(
    async (record) => {
      try {
        const data = await fetchJson("/api/samples", {
          method: "PUT",
          body: JSON.stringify({ kind: "monitoring", record }),
        });
        if (data.persisted === false) {
          throw new Error(data.error || "Monitoring data was not persisted");
        }
        const latestPending = monitoringPendingRef.current.get(record.id);
        if (latestPending?.updatedAt === record.updatedAt) {
          monitoringPendingRef.current.delete(record.id);
          if (data.monitoring) {
            setMonitoring(applyPendingRecords(normalizeMonitoring(data.monitoring, phase2), monitoringPendingRef));
          }
        }
      } catch (error) {
        setSyncError(error.message);
      }
    },
    [phase2],
  );

  const updateMonitoring = useCallback((id, patch) => {
    if (blockUnauthenticatedWrite()) return;
    const currentRecord = monitoring.find((record) => record.id === id);
    if (!currentRecord) return;
    const nextRecord = {
      ...currentRecord,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    setMonitoring((current) =>
      current.map((record) =>
        record.id === id ? nextRecord : record,
      ),
    );
    monitoringPendingRef.current.set(id, nextRecord);
    scheduleSave(monitoringSaveTimersRef, id, () => {
      void saveMonitoring(nextRecord);
    });
  }, [blockUnauthenticatedWrite, monitoring, saveMonitoring]);

  const selectSample = useCallback((id) => {
    setActivePhase("phase2");
    setSelectedId(id);
    setFlashId(id);
    window.setTimeout(() => setFlashId((current) => (current === id ? "" : current)), 1400);
  }, []);

  const rebuildLayout = useCallback(() => {
    if (blockUnauthenticatedWrite()) return;
    const nextLayout = buildBalancedLayout(phase2);
    const positionById = new Map(nextLayout.map((id, index) => [id, index]));
    const nextSamples = phase2.map((sample) => {
      const positionIndex = positionById.get(sample.id);
      return {
        ...sample,
        positionIndex,
        chamberRow: Math.floor(positionIndex / 12),
        chamberCol: positionIndex % 12,
        updatedAt: new Date().toISOString(),
      };
    });
    setLayout(nextLayout);
    setPhase2(nextSamples);
    void fetchJson("/api/samples", {
      method: "PUT",
      body: JSON.stringify({
        layout: nextLayout.map((id, positionIndex) => ({ id, positionIndex })),
      }),
    })
      .then(refreshSamples)
      .catch((error) => {
        setSyncError(error.message);
        void refreshSamples();
      });
  }, [blockUnauthenticatedWrite, phase2, refreshSamples]);

  const addLog = useCallback((message) => {
    if (blockUnauthenticatedWrite()) return;
    const trimmed = message.trim();
    if (!trimmed) return;
    const optimisticMessage = {
      id: createId(),
      author: currentUser,
      message: trimmed,
      createdAt: new Date().toISOString(),
    };
    setLogs((current) => [optimisticMessage, ...current]);
    void fetchJson("/api/chat", {
      method: "POST",
      body: JSON.stringify(optimisticMessage),
    })
      .then(refreshChat)
      .catch((error) => {
        setSyncError(error.message);
        void refreshChat();
      });
  }, [blockUnauthenticatedWrite, currentUser, refreshChat]);

  const saveProposal = useCallback(
    async (proposal) => {
      try {
        const data = await fetchJson("/api/proposals", {
          method: "PUT",
          body: JSON.stringify(proposal),
        });
        if (data.persisted === false) {
          throw new Error(data.error || "Research proposal was not persisted");
        }
        const latestPending = proposalPendingRef.current.get(proposal.id);
        if (latestPending?.updatedAt === proposal.updatedAt) {
          proposalPendingRef.current.delete(proposal.id);
          if (data.proposal) {
            setProposals((current) =>
              current.map((item) => (item.id === proposal.id ? data.proposal : item)),
            );
          }
        }
      } catch (error) {
        setSyncError(error.message);
      }
    },
    [],
  );

  const addProposal = useCallback((draft) => {
    if (blockUnauthenticatedWrite()) return;
    const nextProposal = {
      id: createId(),
      category: draft.category,
      status: "검토중",
      title: draft.title,
      paperTitle: draft.paperTitle,
      paperUrl: draft.paperUrl,
      algorithm: draft.algorithm,
      discussion: draft.discussion,
      author: currentUser,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setProposals((current) => [nextProposal, ...current]);
    proposalPendingRef.current.set(nextProposal.id, nextProposal);
    void saveProposal(nextProposal);
  }, [blockUnauthenticatedWrite, currentUser, saveProposal]);

  const updateProposal = useCallback((id, patch) => {
    if (blockUnauthenticatedWrite()) return;
    const currentProposal = proposals.find((proposal) => proposal.id === id);
    if (!currentProposal) return;
    const nextProposal = {
      ...currentProposal,
      ...patch,
      author: currentUser,
      updatedAt: new Date().toISOString(),
    };
    setProposals((current) =>
      current.map((proposal) => (proposal.id === id ? nextProposal : proposal)),
    );
    proposalPendingRef.current.set(id, nextProposal);
    scheduleSave(proposalSaveTimersRef, id, () => {
      void saveProposal(nextProposal);
    });
  }, [blockUnauthenticatedWrite, currentUser, proposals, saveProposal]);

  const value = useMemo(
    () => ({
      activePhase,
      setActivePhase,
      phase1,
      phase2,
      monitoring,
      proposals,
      phase2Map,
      layout,
      logs,
      selectedId,
      flashId,
      syncError,
      currentUser,
      isAuthenticated,
      showAuthModal: !currentUser && !readOnlyMode,
      authenticate,
      enterReadOnlyMode,
      updatePhase1,
      updatePhase2,
      updateMonitoring,
      selectSample,
      rebuildLayout,
      addLog,
      addProposal,
      updateProposal,
    }),
    [
      activePhase,
      phase1,
      phase2,
      monitoring,
      proposals,
      phase2Map,
      layout,
      logs,
      selectedId,
      flashId,
      syncError,
      currentUser,
      isAuthenticated,
      readOnlyMode,
      authenticate,
      enterReadOnlyMode,
      updatePhase1,
      updatePhase2,
      updateMonitoring,
      selectSample,
      rebuildLayout,
      addLog,
      addProposal,
      updateProposal,
    ],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

function useDashboard() {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("DashboardContext is missing");
  return value;
}

function Header() {
  const { activePhase, setActivePhase, phase1, phase2, monitoring, proposals } = useDashboard();
  const title =
    activePhase === "phase1"
      ? "Phase 1: 대량 계대·출발 모재 확보"
      : activePhase === "phase2"
        ? "Phase 2: 광질·광량 정밀제어 본실험"
        : "연구 제안: 논문·알고리즘 토론";

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-4 px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
            <Sprout className="h-6 w-6 text-zinc-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-normal text-zinc-950 sm:text-2xl">{title}</h1>
            <p className="text-sm text-zinc-500">
              CNU-RISE 와사비 조직배양체 생산량 증대 프로젝트 데이터 보드
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-lg border border-zinc-100 bg-zinc-50 p-1">
            {[
              ["phase1", "Phase 1 증식"],
              ["phase2", "Phase 2 본실험"],
              ["proposal", "연구 제안"],
            ].map(([id, label]) => (
              <button
                className={[
                  "rounded-md px-3 py-2 text-sm font-medium transition",
                  activePhase === id
                    ? "border border-zinc-200 bg-white text-zinc-950 shadow-none"
                    : "text-zinc-500 hover:text-zinc-900",
                ].join(" ")}
                key={id}
                onClick={() => setActivePhase(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
            onClick={() =>
              activePhase === "phase1"
                ? downloadPhase1Csv(phase1)
                : activePhase === "phase2"
                  ? downloadPhase2Csv(phase2, monitoring)
                  : downloadProposalsCsv(proposals)
            }
            type="button"
          >
            <Download className="h-4 w-4" />
            CSV 다운로드
          </button>
        </div>
      </div>
    </header>
  );
}

function KpiCard({ label, value, hint, icon: Icon }) {
  return (
    <article className="rounded-xl border border-zinc-100 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-normal text-zinc-950">{value}</p>
          <p className="mt-1 text-xs text-zinc-400">{hint}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50">
          <Icon className="h-5 w-5 text-zinc-500" />
        </div>
      </div>
    </article>
  );
}

function Phase1Kpis() {
  const { phase1 } = useDashboard();
  const stats = useMemo(() => {
    const complete = phase1.filter((record) => numberOrNull(record.finalWeight) !== null).length;
    const contaminated = phase1.reduce(
      (sum, record) => sum + (numberOrNull(record.contaminatedCount) ?? 0),
      0,
    );
    const rates = phase1.map((record) => getRate(record.initialWeight, record.finalWeight)).filter(Boolean);
    const finalWeights = phase1.map((record) => numberOrNull(record.finalWeight)).filter(Boolean);
    return {
      progress: phase1.length ? Math.round((complete / phase1.length) * 100) : 0,
      contaminated,
      avgRate: rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : 0,
      avgFinal: finalWeights.length
        ? finalWeights.reduce((sum, value) => sum + value, 0) / finalWeights.length
        : 0,
    };
  }, [phase1]);

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Phase 1 진행률" value={`${stats.progress}%`} hint="최종무게 입력 회차 기준" icon={CheckCircle2} />
      <KpiCard label="평균 증식률" value={`${stats.avgRate.toFixed(2)}x`} hint="최종무게 / 초기무게" icon={BarChart3} />
      <KpiCard label="총 오염 용기" value={`${stats.contaminated}개`} hint="전체 배치 합산" icon={AlertTriangle} />
      <KpiCard label="평균 최종무게" value={stats.avgFinal.toFixed(2)} hint="숫자 입력 배치 기준" icon={FlaskConical} />
    </section>
  );
}

function Phase2Kpis() {
  const { phase2 } = useDashboard();
  const stats = useMemo(() => {
    const complete = phase2.filter((sample) => sample.status === "수확완료").length;
    const contaminated = phase2.filter((sample) => sample.status === "오염됨").length;
    const fw = phase2
      .filter((sample) => sample.status !== "오염됨")
      .map((sample) => numberOrNull(sample.fw))
      .filter((value) => value !== null);
    return {
      progress: Math.round((complete / phase2.length) * 100),
      contaminated,
      avgFw: fw.length ? fw.reduce((sum, value) => sum + value, 0) / fw.length : 0,
      active: phase2.length - contaminated,
    };
  }, [phase2]);

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Phase 2 진행률" value={`${stats.progress}%`} hint="144구 수확완료 기준" icon={CheckCircle2} />
      <KpiCard label="총 오염 탈락" value={`${stats.contaminated}개`} hint={`유효 샘플 ${stats.active}개`} icon={AlertTriangle} />
      <KpiCard label="평균 생체중" value={stats.avgFw.toFixed(3)} hint="오염 샘플 제외" icon={FlaskConical} />
      <KpiCard label="광주기" value={PHOTOPERIOD} hint="모든 본실험 조건 고정" icon={Layers3} />
    </section>
  );
}

function GuidePanel({ phase }) {
  const phase1Guides = [
    ["숫자만 입력", "무게와 용기 수에는 단위를 쓰지 않습니다. 32.5g가 아니라 32.5로 입력합니다."],
    ["현장 즉시 기록", "저울 측정 직후 입력하여 누락과 버전 꼬임을 줄입니다."],
    ["증식률 자동 계산", "초기무게와 최종무게만 입력하면 증식률은 자동 산출됩니다."],
    ["오염 즉시 공유", "곰팡이나 박테리아가 보이면 오염 용기 수와 비고, 로그보드에 남깁니다."],
  ];
  const phase2Guides = [
    ["144개 네임택", "EXP_01_1부터 EXP_24_6까지 병 ID를 반드시 유지합니다."],
    ["광질 세팅", "R:B는 9:1, 7:3, 5:5로 관리하고 FR은 0% 또는 10%로 고정합니다."],
    ["광량 세팅", "PPFD 30, 50, 80, 120을 PAR 센서 기준으로 맞춥니다."],
    ["광주기 고정", "본실험 광주기는 16시간 점등 / 8시간 소등으로 모든 조건에 동일 적용합니다."],
    ["교대 배치", "동일 PPFD와 조건이 한쪽에 몰리지 않도록 선반에 균형 배치합니다."],
  ];
  const guides = phase === "phase1" ? phase1Guides : phase2Guides;

  return (
    <section className="rounded-xl border border-zinc-100 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bell className="h-5 w-5 text-zinc-500" />
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {phase === "phase1" ? "대량 증식 입력 원칙" : "본실험 세팅 가이드"}
          </h2>
          <p className="text-xs text-zinc-500">공지 내용을 작업 화면용 체크 규칙으로 요약했습니다.</p>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {guides.map(([title, body]) => (
          <article className="rounded-lg border border-zinc-100 bg-zinc-50 p-3" key={title}>
            <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function NumericInput({ value, disabled, label, onChange }) {
  const [error, setError] = useState("");

  function handleChange(event) {
    const next = event.target.value;
    if (next !== "" && !/^\d*\.?\d*$/.test(next)) {
      setError(`${label}에는 숫자와 소수점만 입력할 수 있습니다.`);
      return;
    }
    setError("");
    onChange(next);
  }

  return (
    <div className="min-w-28">
      <input
        className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-300 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
        disabled={disabled}
        inputMode="decimal"
        onChange={handleChange}
        onClick={(event) => event.stopPropagation()}
        placeholder="0.000"
        value={value}
      />
      {error ? <p className="mt-1 max-w-40 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

function TextInput({ value, placeholder, onChange, className = "w-44", disabled }) {
  return (
    <input
      className={`${className} rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-300 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400`}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      placeholder={placeholder}
      value={value}
    />
  );
}

function StatusSelect({ value, options, onChange, disabled }) {
  return (
    <select
      className="w-28 rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 outline-none transition focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-100"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      value={value}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function Phase1Chart() {
  const { phase1 } = useDashboard();
  const data = phase1.map((record) => ({
    batch: record.id.replace("CYCLE_", "C"),
    rate: Number((getRate(record.initialWeight, record.finalWeight) ?? 0).toFixed(2)),
  }));

  return <ChartCard title="배치별 증식률" data={data} dataKey="rate" xKey="batch" />;
}

function Phase2Chart() {
  const { phase2 } = useDashboard();
  const data = PPFD_LEVELS.map((ppfd) => {
    const values = phase2
      .filter((sample) => sample.ppfd === ppfd && sample.status !== "오염됨")
      .map((sample) => numberOrNull(sample.fw))
      .filter((value) => value !== null);
    return {
      ppfd: `PPFD ${ppfd}`,
      avgFw: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : 0,
    };
  });

  return <ChartCard title="PPFD별 평균 생체중" data={data} dataKey="avgFw" xKey="ppfd" />;
}

function ChartCard({ title, data, dataKey, xKey }) {
  return (
    <section className="rounded-xl border border-zinc-100 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-zinc-500" />
        <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      </div>
      <div className="h-64">
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(200, 200, 200, 0.4)" vertical={false} />
            <XAxis dataKey={xKey} stroke="#a1a1aa" tick={{ fontSize: 12 }} />
            <YAxis stroke="#a1a1aa" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                background: "#ffffff",
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                color: "#18181b",
              }}
            />
            <Bar dataKey={dataKey} fill="#18181b" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Phase1Table() {
  const { phase1, updatePhase1, isAuthenticated } = useDashboard();

  return (
    <section className="rounded-xl border border-zinc-100 bg-white">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-zinc-500" />
          <div>
            <h2 className="text-base font-semibold text-zinc-950">Phase 1 대량 증식 기록 테이블</h2>
            <p className="text-xs text-zinc-500">6~7월 출발 모재 확보를 위한 계대 배치별 증식률과 오염률을 기록합니다.</p>
          </div>
        </div>
      </div>
      <div className="max-h-[620px] overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white text-xs text-zinc-500">
            <tr>
              {[
                "회차 ID",
                "초기무게_g",
                "최종무게_g",
                "증식률",
                "오염 용기 수",
                "비고",
              ].map((header) => (
                <th className="border-b border-zinc-100 px-3 py-3 font-semibold" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {phase1.map((record) => (
              <tr className="border-b border-zinc-100 hover:bg-zinc-50" key={record.id}>
                <td className="px-3 py-2 font-semibold text-zinc-950">{record.id}</td>
                <td className="px-3 py-2">
                  <NumericInput disabled={!isAuthenticated} value={record.initialWeight} label={numericLabels.initialWeight} onChange={(initialWeight) => updatePhase1(record.id, { initialWeight })} />
                </td>
                <td className="px-3 py-2">
                  <NumericInput disabled={!isAuthenticated} value={record.finalWeight} label={numericLabels.finalWeight} onChange={(finalWeight) => updatePhase1(record.id, { finalWeight })} />
                </td>
                <td className="px-3 py-2 font-semibold text-zinc-950">
                  {getRate(record.initialWeight, record.finalWeight)?.toFixed(2) ?? "-"}
                </td>
                <td className="px-3 py-2">
                  <NumericInput disabled={!isAuthenticated} value={record.contaminatedCount} label={numericLabels.contaminatedCount} onChange={(contaminatedCount) => updatePhase1(record.id, { contaminatedCount })} />
                </td>
                <td className="px-3 py-2">
                  <TextInput disabled={!isAuthenticated} className="w-64" value={record.notes} placeholder="특이사항" onChange={(notes) => updatePhase1(record.id, { notes })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getPpfdClass(ppfd, contaminated, selected) {
  if (contaminated) return "border-rose-200 bg-rose-50 text-rose-700";
  if (selected) return "border-zinc-800 bg-zinc-900 text-white";
  const scale = {
    30: "border-zinc-100 bg-zinc-50 text-zinc-400",
    50: "border-zinc-200 bg-zinc-100 text-zinc-500",
    80: "border-zinc-300 bg-zinc-200 text-zinc-700",
    120: "border-zinc-400 bg-zinc-300 text-zinc-900",
  };
  return scale[ppfd];
}

function ChamberGrid() {
  const { layout, phase2Map, selectedId, flashId, selectSample, rebuildLayout, isAuthenticated } = useDashboard();

  return (
    <section className="rounded-xl border border-zinc-100 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-5 w-5 text-zinc-500" />
          <div>
            <h2 className="text-base font-semibold text-zinc-950">챔버 균형 배치도</h2>
            <p className="text-xs text-zinc-500">12 × 12 선반, 인접 PPFD 중복 없이 교대 배치</p>
          </div>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400"
          disabled={!isAuthenticated}
          onClick={rebuildLayout}
          type="button"
        >
          <RefreshCw className="h-4 w-4" />
          균형 재배치
        </button>
      </div>
      <div className="grid grid-cols-12 gap-1.5">
        {layout.map((id, index) => {
          const sample = phase2Map.get(id);
          const selected = selectedId === id;
          const contaminated = sample?.status === "오염됨";
          return (
            <button
              className={[
                "relative aspect-square min-h-0 rounded-md border p-1 text-[10px] font-semibold leading-tight transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-zinc-400",
                getPpfdClass(sample?.ppfd, contaminated, selected),
                flashId === id ? "cell-flash" : "",
              ].join(" ")}
              key={`${id}-${index}`}
              onClick={() => selectSample(id)}
              title={`${id} / PPFD ${sample?.ppfd}`}
              type="button"
            >
              <span className="block truncate">{id}</span>
              <span className="block text-[9px] opacity-70">{sample?.ppfd}</span>
              {contaminated ? <X className="absolute inset-0 m-auto h-7 w-7 text-rose-500" /> : null}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-500">
        {PPFD_LEVELS.map((ppfd) => (
          <span className="inline-flex items-center gap-1" key={ppfd}>
            <span className={["h-3 w-3 rounded-sm border", getPpfdClass(ppfd, false, false)].join(" ")} />
            PPFD {ppfd}
          </span>
        ))}
      </div>
    </section>
  );
}

function Phase2Table() {
  const { phase2, selectedId, flashId, updatePhase2, selectSample, isAuthenticated } = useDashboard();
  const rowRefs = useRef({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    rowRefs.current[selectedId]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selectedId]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return phase2;
    return phase2.filter((sample) => sample.id.toLowerCase().includes(normalized));
  }, [phase2, query]);

  return (
    <section className="rounded-xl border border-zinc-100 bg-white">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-zinc-500" />
          <div>
            <h2 className="text-base font-semibold text-zinc-950">Phase 2 광질·광량 본실험 마스터 테이블</h2>
            <p className="text-xs text-zinc-500">24개 광조건 × 반복 6개, 오염 샘플은 수치 입력이 잠깁니다.</p>
          </div>
        </div>
        <label className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-300 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="EXP_05_3 검색"
            value={query}
          />
        </label>
      </div>
      <div className="max-h-[680px] overflow-auto">
        <table className="w-full min-w-[1460px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white text-xs text-zinc-500">
            <tr>
              {[
                "ID",
                "상태",
                "변수_광질_R:B",
                "변수_FR_첨가",
                "변수_광량_PPFD",
                "광주기_L/D",
                "반복수_N",
                "GSL_Gluco (μmol/g)",
                "GSL_Sinigrin (μmol/g)",
                "GSL_Gluconapin (μmol/g)",
                "GSL_4-OH-Glucobrassicin (μmol/g)",
                "GSL_Glucobrassicin (μmol/g)",
                "GSL_Glucoerucin (μmol/g)",
                "GSL_Gluconasturtiin (μmol/g)",
                "엽록소_a (mg/g FW)",
                "엽록소_b (mg/g FW)",
                "건체중_DW (g)",
                "생체중_FW (g)",
                "비고",
              ].map((header) => (
                <th className="border-b border-zinc-100 px-3 py-3 font-semibold" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((sample) => {
              const contaminated = sample.status === "오염됨";
              return (
                <tr
                  className={[
                    "cursor-pointer border-b border-zinc-100 transition hover:bg-zinc-50",
                    contaminated ? "bg-red-50/60" : "bg-white",
                    selectedId === sample.id ? "outline outline-1 outline-zinc-300" : "",
                    flashId === sample.id ? "row-flash" : "",
                  ].join(" ")}
                  key={sample.id}
                  onClick={() => selectSample(sample.id)}
                  ref={(node) => {
                    rowRefs.current[sample.id] = node;
                  }}
                >
                  <td className="px-3 py-2 font-semibold text-zinc-950">{sample.id}</td>
                  <td className="px-3 py-2">
                    <StatusSelect
                      disabled={!isAuthenticated}
                      value={sample.status}
                      options={PHASE2_STATUSES}
                      onChange={(status) => updatePhase2(sample.id, { status })}
                    />
                  </td>
                  <td className="px-3 py-2 text-zinc-600">{sample.rb}</td>
                  <td className="px-3 py-2 text-zinc-600">{sample.fr}</td>
                  <td className="px-3 py-2 text-zinc-600">{sample.ppfd}</td>
                  <td className="px-3 py-2 text-zinc-600">{sample.photoperiod}</td>
                  <td className="px-3 py-2 text-zinc-600">{sample.repeat}</td>
                  {[
                    "gluco",
                    "sinigrin",
                    "gluconapin",
                    "ohGlucobrassicin",
                    "glucobrassicin",
                    "glucoerucin",
                    "gluconasturtiin",
                    "chloroA",
                    "chloroB",
                    "dw",
                    "fw",
                  ].map((field) => (
                    <td className="px-3 py-2" key={field}>
                      <NumericInput
                        disabled={contaminated || !isAuthenticated}
                        label={numericLabels[field]}
                        value={sample[field]}
                        onChange={(value) => updatePhase2(sample.id, { [field]: value })}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <TextInput
                      disabled={!isAuthenticated}
                      className="w-56"
                      value={sample.notes}
                      placeholder="특이사항"
                      onChange={(notes) => updatePhase2(sample.id, { notes })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Phase2MonitoringTable() {
  const { monitoring, phase2Map, updateMonitoring, selectSample, isAuthenticated } = useDashboard();
  const [week, setWeek] = useState(2);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return monitoring.filter((record) => {
      const sameWeek = record.week === week;
      const matchesQuery = !normalized || record.sampleId.toLowerCase().includes(normalized);
      return sameWeek && matchesQuery;
    });
  }, [monitoring, week, query]);

  return (
    <section className="rounded-xl border border-zinc-100 bg-white">
      <div className="flex flex-col gap-3 border-b border-zinc-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-zinc-500" />
          <div>
            <h2 className="text-base font-semibold text-zinc-950">2주 간격 생장 모니터링</h2>
            <p className="text-xs text-zinc-500">0/2/4/6/8주차 회차별 FW, 오염 여부, 특이사항을 long-format CSV로 저장합니다.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
            onChange={(event) => setWeek(Number(event.target.value))}
            value={week}
          >
            {MONITORING_ROUNDS.map((round) => (
              <option key={round.week} value={round.week}>
                {round.label}
              </option>
            ))}
          </select>
          <label className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-300 focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="EXP_05_3 검색"
              value={query}
            />
          </label>
        </div>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white text-xs text-zinc-500">
            <tr>
              {[
                "회차",
                "ID",
                "R:B",
                "FR",
                "PPFD",
                "광주기_L/D",
                "확인일",
                "상태",
                "생체중_FW (g)",
                "오염 여부",
                "비고",
              ].map((header) => (
                <th className="border-b border-zinc-100 px-3 py-3 font-semibold" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((record) => {
              const sample = phase2Map.get(record.sampleId);
              return (
                <tr
                  className="cursor-pointer border-b border-zinc-100 bg-white transition hover:bg-zinc-50"
                  key={record.id}
                  onClick={() => selectSample(record.sampleId)}
                >
                  <td className="px-3 py-2 text-zinc-600">{record.label}</td>
                  <td className="px-3 py-2 font-semibold text-zinc-950">{record.sampleId}</td>
                  <td className="px-3 py-2 text-zinc-600">{sample?.rb}</td>
                  <td className="px-3 py-2 text-zinc-600">{sample?.fr}</td>
                  <td className="px-3 py-2 text-zinc-600">{sample?.ppfd}</td>
                  <td className="px-3 py-2 text-zinc-600">{sample?.photoperiod ?? PHOTOPERIOD}</td>
                  <td className="px-3 py-2">
                    <TextInput
                      disabled={!isAuthenticated}
                      className="w-32"
                      value={record.checkedAt}
                      placeholder="2026-08-14"
                      onChange={(checkedAt) => updateMonitoring(record.id, { checkedAt })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <StatusSelect
                      disabled={!isAuthenticated}
                      value={record.status}
                      options={["정상", "성장저하", "오염의심", "오염확정", "수확"]}
                      onChange={(status) => updateMonitoring(record.id, { status })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <NumericInput
                      disabled={!isAuthenticated}
                      label={numericLabels.monitorFw}
                      value={record.monitorFw}
                      onChange={(monitorFw) => updateMonitoring(record.id, { monitorFw })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <StatusSelect
                      disabled={!isAuthenticated}
                      value={record.contamination}
                      options={["없음", "곰팡이", "박테리아", "폐기"]}
                      onChange={(contamination) => updateMonitoring(record.id, { contamination })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <TextInput
                      disabled={!isAuthenticated}
                      className="w-64"
                      value={record.notes}
                      placeholder="색 변화, 생장저하, 위치 이상"
                      onChange={(notes) => updateMonitoring(record.id, { notes })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LogBoard() {
  const { logs, addLog, currentUser, isAuthenticated } = useDashboard();
  const [message, setMessage] = useState("");

  function send() {
    addLog(message);
    setMessage("");
  }

  return (
    <aside className="rounded-xl border border-zinc-100 bg-white p-4 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)]">
      <div className="mb-4 flex items-center gap-2">
        <MessageSquareText className="h-5 w-5 text-zinc-500" />
        <h2 className="text-base font-semibold text-zinc-950">연구실 로그보드</h2>
      </div>
      <div className="mb-3 grid grid-cols-1 gap-2">
        {PRESET_MESSAGES.map((preset) => (
          <button
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-xs text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-400"
            disabled={!isAuthenticated}
            key={preset}
            onClick={() => setMessage((current) => (current ? `${current} ${preset}` : preset))}
            type="button"
          >
            {preset}
          </button>
        ))}
      </div>
      <div className="grid gap-2">
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-950">
          작성자: {currentUser ?? "읽기 전용"}
        </div>
        <textarea
          className="min-h-24 resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
          disabled={!isAuthenticated}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="인수인계 내용을 입력"
          value={message}
        />
        <button
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
          disabled={!isAuthenticated || !message.trim()}
          onClick={send}
          type="button"
        >
          <Send className="h-4 w-4" />
          전송
        </button>
      </div>
      <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
        {logs.map((log) => (
          <article className="rounded-lg border border-zinc-100 bg-zinc-50 p-3" key={log.id}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-zinc-950">{log.author}</span>
              <time className="text-zinc-400">{formatDateTime(log.createdAt)}</time>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{log.message}</p>
          </article>
        ))}
      </div>
    </aside>
  );
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsv(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function downloadPhase1Csv(records) {
  downloadCsv(
    `wasabi_phase1_mass_propagation_${new Date().toISOString().slice(0, 10)}.csv`,
    [
      "sub_id",
      "initial_weight_g",
      "final_weight_g",
      "multiplication_rate",
      "contaminated_count",
      "notes",
      "updated_at",
    ],
    records.map((record) => [
      record.id,
      record.initialWeight,
      record.finalWeight,
      getRate(record.initialWeight, record.finalWeight)?.toFixed(4) ?? "",
      record.contaminatedCount,
      record.notes,
      record.updatedAt,
    ]),
  );
}

function parseRbRatio(rb) {
  const [red, blue] = String(rb).split(":").map((value) => Number(value));
  return {
    rb_red_ratio: Number.isFinite(red) ? red : "",
    rb_blue_ratio: Number.isFinite(blue) ? blue : "",
  };
}

function downloadPhase2Csv(samples, monitoring) {
  downloadCsv(
    `wasabi_phase2_ml_final_${new Date().toISOString().slice(0, 10)}.csv`,
    [
      "sample_id",
      "status",
      "condition_no",
      "repeat_n",
      "rb_ratio",
      "rb_red_ratio",
      "rb_blue_ratio",
      "fr_percent",
      "ppfd_umol_m2_s",
      "photoperiod_light_h",
      "photoperiod_dark_h",
      "gsl_gluco_umol_g",
      "gsl_sinigrin_umol_g",
      "gsl_gluconapin_umol_g",
      "gsl_4_oh_glucobrassicin_umol_g",
      "gsl_glucobrassicin_umol_g",
      "gsl_glucoerucin_umol_g",
      "gsl_gluconasturtiin_umol_g",
      "chlorophyll_a_mg_g_fw",
      "chlorophyll_b_mg_g_fw",
      "dw_g",
      "fw_g",
      "notes",
      "updated_at",
    ],
    samples.map((sample) => {
      const rb = parseRbRatio(sample.rb);
      return [
        sample.id,
        sample.status,
        conditionNumber(sample.id),
        sample.repeat,
        sample.rb,
        rb.rb_red_ratio,
        rb.rb_blue_ratio,
        sample.fr,
        sample.ppfd,
        16,
        8,
        sample.gluco,
        sample.sinigrin,
        sample.gluconapin,
        sample.ohGlucobrassicin,
        sample.glucobrassicin,
        sample.glucoerucin,
        sample.gluconasturtiin,
        sample.chloroA,
        sample.chloroB,
        sample.dw,
        sample.fw,
        sample.notes,
        sample.updatedAt,
      ];
    }),
  );

  downloadCsv(
    `wasabi_phase2_monitoring_long_${new Date().toISOString().slice(0, 10)}.csv`,
    [
      "sample_id",
      "week",
      "round_label",
      "checked_at",
      "status",
      "contamination",
      "monitor_fw_g",
      "rb_ratio",
      "rb_red_ratio",
      "rb_blue_ratio",
      "fr_percent",
      "ppfd_umol_m2_s",
      "photoperiod_light_h",
      "photoperiod_dark_h",
      "repeat_n",
      "notes",
      "updated_at",
    ],
    monitoring.map((record) => {
      const sample = samples.find((item) => item.id === record.sampleId);
      const rb = parseRbRatio(sample?.rb);
      return [
        record.sampleId,
        record.week,
        record.label,
        record.checkedAt,
        record.status,
        record.contamination,
        record.monitorFw,
        sample?.rb ?? "",
        rb.rb_red_ratio,
        rb.rb_blue_ratio,
        sample?.fr ?? "",
        sample?.ppfd ?? "",
        16,
        8,
        sample?.repeat ?? "",
        record.notes,
        record.updatedAt,
      ];
    }),
  );
}

function downloadProposalsCsv(proposals) {
  downloadCsv(
    `wasabi_research_proposals_${new Date().toISOString().slice(0, 10)}.csv`,
    [
      "id",
      "category",
      "status",
      "title",
      "paper_title",
      "paper_url",
      "algorithm",
      "discussion",
      "author",
      "created_at",
      "updated_at",
    ],
    proposals.map((proposal) => [
      proposal.id,
      proposal.category,
      proposal.status,
      proposal.title,
      proposal.paperTitle,
      proposal.paperUrl,
      proposal.algorithm,
      proposal.discussion,
      proposal.author,
      proposal.createdAt,
      proposal.updatedAt,
    ]),
  );
}

function ResearchProposalView() {
  const { proposals, addProposal, updateProposal, isAuthenticated } = useDashboard();
  const [draft, setDraft] = useState({
    category: "논문",
    title: "",
    paperTitle: "",
    paperUrl: "",
    algorithm: "",
    discussion: "",
  });

  const canSubmit = isAuthenticated && (draft.title.trim() || draft.discussion.trim());

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submitProposal(event) {
    event.preventDefault();
    if (!canSubmit) return;
    addProposal(draft);
    setDraft({
      category: "논문",
      title: "",
      paperTitle: "",
      paperUrl: "",
      algorithm: "",
      discussion: "",
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-100 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-zinc-500" />
          <div>
            <h2 className="text-base font-semibold text-zinc-950">연구 제안 보드</h2>
            <p className="text-xs text-zinc-500">
              논문 후보, RSM/머신러닝 알고리즘, 후속 실험 아이디어를 팀 공용으로 기록합니다.
            </p>
          </div>
        </div>
        <form className="grid gap-3 lg:grid-cols-2" onSubmit={submitProposal}>
          <label className="grid gap-1 text-xs font-semibold text-zinc-600">
            분류
            <select
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              disabled={!isAuthenticated}
              onChange={(event) => updateDraft("category", event.target.value)}
              value={draft.category}
            >
              {PROPOSAL_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-zinc-600">
            제안 제목
            <input
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              disabled={!isAuthenticated}
              onChange={(event) => updateDraft("title", event.target.value)}
              placeholder="예: RSM + Random Forest 비교 분석"
              value={draft.title}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-zinc-600">
            논문명
            <input
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              disabled={!isAuthenticated}
              onChange={(event) => updateDraft("paperTitle", event.target.value)}
              placeholder="참고 논문 제목"
              value={draft.paperTitle}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-zinc-600">
            논문/자료 링크
            <input
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              disabled={!isAuthenticated}
              onChange={(event) => updateDraft("paperUrl", event.target.value)}
              placeholder="https://..."
              value={draft.paperUrl}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-zinc-600 lg:col-span-2">
            알고리즘 후보
            <input
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              disabled={!isAuthenticated}
              onChange={(event) => updateDraft("algorithm", event.target.value)}
              placeholder="RSM, Random Forest, XGBoost, Gaussian Process, Bayesian Optimization 등"
              value={draft.algorithm}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-zinc-600 lg:col-span-2">
            토론 메모
            <textarea
              className="min-h-28 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              disabled={!isAuthenticated}
              onChange={(event) => updateDraft("discussion", event.target.value)}
              placeholder="왜 필요한지, 어떤 데이터 컬럼을 쓸지, 검증 방법은 무엇인지 기록"
              value={draft.discussion}
            />
          </label>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 lg:col-span-2"
            disabled={!canSubmit}
            type="submit"
          >
            <Send className="h-4 w-4" />
            제안 등록
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-zinc-100 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-100 p-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-950">공유 제안 목록</h2>
            <p className="text-xs text-zinc-500">총 {proposals.length}건</p>
          </div>
        </div>
        <div className="grid gap-3 p-4">
          {proposals.length === 0 ? (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm text-zinc-500">
              아직 등록된 연구 제안이 없습니다.
            </div>
          ) : null}
          {proposals.map((proposal) => (
            <article className="rounded-lg border border-zinc-100 bg-zinc-50 p-4" key={proposal.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700">
                      {proposal.category}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {proposal.author} · {formatDateTime(proposal.updatedAt)}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-zinc-950">{proposal.title || "제목 없음"}</h3>
                  {proposal.paperTitle ? (
                    <p className="text-sm text-zinc-600">논문: {proposal.paperTitle}</p>
                  ) : null}
                  {proposal.algorithm ? (
                    <p className="text-sm text-zinc-600">알고리즘: {proposal.algorithm}</p>
                  ) : null}
                  {proposal.paperUrl ? (
                    <p className="break-all text-xs text-zinc-500">{proposal.paperUrl}</p>
                  ) : null}
                </div>
                <StatusSelect
                  disabled={!isAuthenticated}
                  onChange={(status) => updateProposal(proposal.id, { status })}
                  options={PROPOSAL_STATUSES}
                  value={proposal.status}
                />
              </div>
              <textarea
                className="mt-3 min-h-24 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                disabled={!isAuthenticated}
                onChange={(event) => updateProposal(proposal.id, { discussion: event.target.value })}
                value={proposal.discussion}
              />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Phase1View() {
  return (
    <div className="space-y-4">
      <Phase1Kpis />
      <GuidePanel phase="phase1" />
      <Phase1Table />
      <Phase1Chart />
    </div>
  );
}

function Phase2View() {
  return (
    <div className="space-y-4">
      <Phase2Kpis />
      <GuidePanel phase="phase2" />
      <Phase2Table />
      <Phase2MonitoringTable />
      <div className="grid gap-4 2xl:grid-cols-[minmax(540px,0.95fr)_minmax(420px,1.05fr)]">
        <ChamberGrid />
        <Phase2Chart />
      </div>
    </div>
  );
}

function AuthModal() {
  const { showAuthModal, authenticate, enterReadOnlyMode } = useDashboard();
  const [selectedUser, setSelectedUser] = useState(LOG_AUTHORS[0]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (!showAuthModal) return null;

  function submit(event) {
    event.preventDefault();
    const ok = authenticate(selectedUser, password);
    if (!ok) {
      setError("비밀번호가 맞지 않습니다.");
      return;
    }
    setError("");
    setPassword("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/25 px-4 backdrop-blur-sm">
      <form
        className="w-full max-w-sm rounded-xl border border-zinc-100 bg-white p-5 shadow-xl"
        onSubmit={submit}
      >
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-zinc-500" />
          <div>
            <h2 className="text-base font-semibold text-zinc-950">연구원 접속 확인</h2>
            <p className="text-xs text-zinc-500">
              연구원 이름을 선택하고 접속 비밀번호를 입력하세요.
            </p>
          </div>
        </div>
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-zinc-600">
            연구원
            <select
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
              onChange={(event) => setSelectedUser(event.target.value)}
              value={selectedUser}
            >
              {LOG_AUTHORS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-zinc-600">
            접속 비밀번호
            <input
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호"
              type="password"
              value={password}
            />
          </label>
          {error ? <p className="text-xs font-semibold text-rose-600">{error}</p> : null}
          <button
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700"
            type="submit"
          >
            접속
          </button>
          <button
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50"
            onClick={enterReadOnlyMode}
            type="button"
          >
            읽기 전용으로 보기
          </button>
        </div>
      </form>
    </div>
  );
}

function DashboardShell() {
  const { activePhase, syncError, currentUser, isAuthenticated } = useDashboard();

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto grid max-w-[1760px] gap-4 px-4 py-4 sm:px-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-100 bg-white px-4 py-3 text-sm text-zinc-600">
            접속 상태:{" "}
            <span className="font-semibold text-zinc-950">
              {isAuthenticated ? `${currentUser} 연구원` : "읽기 전용"}
            </span>
          </div>
          {syncError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              DB 동기화 오류: {syncError}
            </div>
          ) : null}
          {activePhase === "phase1" ? (
            <Phase1View />
          ) : activePhase === "phase2" ? (
            <Phase2View />
          ) : (
            <ResearchProposalView />
          )}
        </div>
        <LogBoard />
      </main>
      <AuthModal />
    </div>
  );
}

function App() {
  return (
    <DashboardProvider>
      <DashboardShell />
    </DashboardProvider>
  );
}

export default App;
