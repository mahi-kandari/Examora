import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { User } from "firebase/auth";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../services/firebase";
import Screen from "../components/Screen";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

function parseTimeStringToMinutes(timeStr?: string): number {
  if (!timeStr) return -1;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return -1;
  let [, hourText, minuteText, meridiem] = match;
  let hour = Number(hourText) % 12;
  if (meridiem.toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(minuteText);
}

function useCountdown(examDate: string | undefined, timeStr: string | undefined) {
  const [remaining, setRemaining] = useState("--:--:--");

  useEffect(() => {
    if (!examDate || !timeStr) return;
    const [time, meridiem] = timeStr.split(" ");
    const [h, m] = time.split(":").map(Number);
    let hour24 = h % 12;
    if (meridiem === "PM") hour24 += 12;

    const deadline = new Date(
      `${examDate}T${String(hour24).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
    );

    const tick = () => {
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();
      if (diff <= 0) {
        setRemaining("Time to leave!");
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setRemaining(
        `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
      );
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [examDate, timeStr]);

  return remaining;
}

interface ResolvedMilestones {
  safeDepStr: string;
  safeDepMin: number;
  reportingStr: string;
  reportingMin: number;
  gateClosingStr: string;
  gateClosingMin: number;
}

function resolveExamMilestones(exam: any): ResolvedMilestones {
  let depMin = parseTimeStringToMinutes(exam?.safe_departure_time);
  let repMin = parseTimeStringToMinutes(exam?.reporting_time);
  let gateMin = parseTimeStringToMinutes(exam?.gate_closing_time);

  if (gateMin < 0 && exam?.gate_details && typeof exam.gate_details === "string") {
    const match = exam.gate_details.match(/(\d{1,2}:\d{2}\s*[AP]?M?)/i);
    if (match) gateMin = parseTimeStringToMinutes(match[1]);
  }

  if (repMin < 0 && depMin >= 0) repMin = depMin + 30;
  if (repMin < 0) repMin = 540; // 09:00 AM

  if (depMin < 0) depMin = Math.max(0, repMin - 30);
  if (gateMin < 0) gateMin = repMin + 30;

  if (depMin >= repMin) depMin = Math.max(0, repMin - 30);
  if (gateMin <= repMin) gateMin = repMin + 30;

  return {
    safeDepStr: formatMinutesToTimeString(depMin),
    safeDepMin: depMin,
    reportingStr: formatMinutesToTimeString(repMin),
    reportingMin: repMin,
    gateClosingStr: formatMinutesToTimeString(gateMin),
    gateClosingMin: gateMin,
  };
}

function buildExamTrafficData(milestones: ResolvedMilestones): Array<{ label: string; min: number; duration: number }> {
  const { safeDepMin, reportingMin, gateClosingMin, safeDepStr, reportingStr, gateClosingStr } = milestones;

  const windowStart = Math.max(0, safeDepMin - 45);
  const windowEnd = Math.min(1439, gateClosingMin + 15);

  const slotSet = new Map<number, string>();

  for (let m = windowStart; m <= windowEnd; m += 15) {
    slotSet.set(m, formatMinutesToTimeString(m));
  }

  slotSet.set(safeDepMin, safeDepStr);
  slotSet.set(reportingMin, reportingStr);
  slotSet.set(gateClosingMin, gateClosingStr);

  const sortedMinutes = Array.from(slotSet.keys()).sort((a, b) => a - b);
  const totalSlots = sortedMinutes.length;
  const peakIndex = Math.floor(totalSlots * 0.4);

  return sortedMinutes.map((min, idx) => {
    const label = slotSet.get(min)!;
    const dist = idx - peakIndex;
    const weight = Math.exp(-0.5 * (dist / 3) ** 2);
    let travelTime = Math.round(22 + 18 * weight);

    if (min === safeDepMin) travelTime = Math.round(26 + 14 * weight);
    if (min === reportingMin) travelTime = Math.round(22 + 18 * weight);
    if (min === gateClosingMin) travelTime = Math.round(20 + 10 * weight);

    return { label, min, duration: travelTime };
  });
}

function formatMinutesToTimeString(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const meridiem = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${meridiem}`;
}

const Success: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth() as { user: User | null; logout: () => Promise<void> };

  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ✅ Listen to the exam document in real time – always shows the latest data
  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, "exams", id), (snap) => {
      if (snap.exists()) {
        setExam({ id: snap.id, ...snap.data() });
        setLoading(false);
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [id]);

  const countdown = useCountdown(exam?.exam_date, exam?.safe_departure_time);

  const storedPermission = localStorage.getItem("examora_location_permission");

  const isLocationDenied =
    (exam as any)?.location_permission === "denied" ||
    (exam as any)?.location_shared === false ||
    storedPermission === "denied";

  const isLocationGranted =
    !isLocationDenied &&
    ((exam as any)?.location_permission === "granted" ||
      (exam as any)?.location_shared === true ||
      storedPermission === "granted" ||
      Boolean(exam?.traffic_data && Object.keys(exam.traffic_data).length > 0));

  const milestones = useMemo(() => resolveExamMilestones(exam), [exam]);

  const trafficDataItems = useMemo(() => {
    return buildExamTrafficData(milestones);
  }, [milestones]);

  const chartData = useMemo(
    () => ({
      labels: trafficDataItems.map((item) => item.label),
      datasets: [
        {
          data: trafficDataItems.map((item) => item.duration),
          borderColor: (ctx: any) => {
            const { chartArea, ctx: canvasCtx } = ctx.chart;
            if (!chartArea) return "#3B82F6";
            const gradient = canvasCtx.createLinearGradient(
              chartArea.left,
              0,
              chartArea.right,
              0
            );
            gradient.addColorStop(0, "#3B82F6");   // Blue at Safe Departure
            gradient.addColorStop(0.5, "#22C55E"); // Green at Reporting Time
            gradient.addColorStop(1, "#EF4444");   // Red at Gate Closing
            return gradient;
          },
          backgroundColor: (ctx: any) => {
            const { chartArea, ctx: canvasCtx } = ctx.chart;
            if (!chartArea) return "rgba(59,130,246,0.1)";
            const gradient = canvasCtx.createLinearGradient(
              0,
              chartArea.top,
              0,
              chartArea.bottom
            );
            gradient.addColorStop(0, "rgba(59, 130, 246, 0.22)");
            gradient.addColorStop(0.5, "rgba(34, 197, 94, 0.12)");
            gradient.addColorStop(1, "rgba(239, 68, 68, 0.02)");
            return gradient;
          },
          fill: true,
          tension: 0.4,
          pointRadius: (ctx: any) => {
            const label = ctx.chart.data.labels?.[ctx.dataIndex];
            if (
              label === milestones.safeDepStr ||
              label === milestones.reportingStr ||
              label === milestones.gateClosingStr
            ) {
              return 8;
            }
            return 0;
          },
          pointBackgroundColor: (ctx: any) => {
            const label = ctx.chart.data.labels?.[ctx.dataIndex];
            if (label === milestones.safeDepStr) return "#3B82F6";
            if (label === milestones.reportingStr) return "#22C55E";
            if (label === milestones.gateClosingStr) return "#EF4444";
            return "transparent";
          },
          pointBorderColor: (ctx: any) => {
            const label = ctx.chart.data.labels?.[ctx.dataIndex];
            if (
              label === milestones.safeDepStr ||
              label === milestones.reportingStr ||
              label === milestones.gateClosingStr
            ) {
              return "#FFFFFF";
            }
            return "transparent";
          },
          pointBorderWidth: 3,
          pointHoverRadius: (ctx: any) => {
            const label = ctx.chart.data.labels?.[ctx.dataIndex];
            if (
              label === milestones.safeDepStr ||
              label === milestones.reportingStr ||
              label === milestones.gateClosingStr
            ) {
              return 12;
            }
            return 0;
          },
          borderWidth: 3,
        },
      ],
    }),
    [trafficDataItems, milestones]
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          titleColor: "#F8FAFC",
          bodyColor: "#CBD5E1",
          borderColor: "rgba(59, 130, 246, 0.4)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: {
            title: (items: any) => `Time: ${items[0].label}`,
            label: (item: any) => {
              const val = item.formattedValue;
              const label = item.label;
              if (label === milestones.safeDepStr) {
                return `🚀 Safe Departure Time (Blue Dot): ${val} mins travel`;
              }
              if (label === milestones.reportingStr) {
                return `🟢 Safe Reporting Time (Green Dot): Target arrival window`;
              }
              if (label === milestones.gateClosingStr) {
                return `🔴 Gate Closing Time (Red Dot): Urgent deadline — Gates close!`;
              }
              return `Est. Travel Time: ${val} mins`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(148,163,184,0.08)" },
          ticks: {
            color: "rgba(148,163,184,0.8)",
            font: { size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 7,
          },
        },
        y: {
          grid: { color: "rgba(148,163,184,0.08)" },
          ticks: { color: "rgba(148,163,184,0.8)", font: { size: 10 } },
          min: 0,
          suggestedMax: 60,
          title: {
            display: true,
            text: "Travel Time (min)",
            color: "rgba(148,163,184,0.7)",
            font: { size: 10 },
          },
        },
      },
    }),
    [milestones]
  );

  if (loading) {
    return (
      <Screen className="flex flex-col min-h-screen justify-center">
        <div className="flex justify-center">
          <div className="animate-spin h-10 w-10 border-4 border-accent/30 border-t-accent rounded-full" />
        </div>
      </Screen>
    );
  }

  if (!exam) {
    return (
      <Screen className="flex flex-col min-h-screen justify-center">
        <p className="text-center text-muted">Exam data not found.</p>
        <button onClick={() => navigate("/home")} className="btn-primary mt-4 mx-auto">
          Go Home
        </button>
      </Screen>
    );
  }

  const firstName =
    (user as User)?.displayName?.split(" ")[0] ||
    (user as User)?.email?.split("@")[0] ||
    "Student";

  return (
    <Screen className="flex flex-col min-h-screen justify-center">
      <div className="flex flex-col items-center text-center animate-fadeInUp">
        <svg width="72" height="72" viewBox="0 0 72 72" className="mb-6">
          <circle cx="36" cy="36" r="34" fill="hsl(var(--success) / 0.12)" />
          <circle cx="36" cy="36" r="28" fill="none" stroke="hsl(var(--success))" strokeWidth="2.5" />
          <path
            d="M23 37 L32 46 L49 27"
            fill="none"
            stroke="hsl(var(--success))"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="100"
            strokeDashoffset="100"
            className="animate-checkmarkDraw"
          />
        </svg>

        <h1 className="font-display font-semibold text-2xl text-text-primary">
          Your exam plan is ready!
        </h1>
        <p className="text-accent font-medium text-[15px] mt-2">
          Best of luck for your {exam.exam_title}, {firstName}!
        </p>

        <div className="mt-4 space-y-1 max-w-xs sm:max-w-sm md:max-w-md">
          <p className="text-muted text-sm leading-relaxed">
            We've set {exam.reminders?.length ?? 2} reminders and pinned the centre on Maps.
          </p>
          <p className="text-muted text-sm leading-relaxed">
            We verified {exam.required_documents?.length ?? 3} important instructions so you
            don't have to.
          </p>
        </div>
      </div>

      {exam.safe_departure_time && (
        <div className="mt-7 rounded-3xl border border-accent/40 bg-accent/5 p-5 animate-fadeInUp">
          <p className="font-display font-semibold text-text-primary text-[15px]">
            🚀 Leave Home by {exam.safe_departure_time} Sharp
          </p>
          <p className="text-muted text-xs mt-1">
            Predicted arrival: {exam.predicted_arrival_time} (with 30 min buffer)
          </p>
          <p className="font-display text-3xl text-accent tracking-wider mt-3 tabular-nums">
            {countdown}
          </p>
        </div>
      )}

      <div className="mt-7 glass p-5 animate-fadeInUp">
        {isLocationGranted ? (
          <>
            <p className="text-sm font-medium text-text-primary">
              Estimated travel time by departure time
            </p>
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <span className="text-[11px] font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-full border border-blue-500/30 flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block animate-pulse"></span>
                Departure: {milestones.safeDepStr}
              </span>
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                Reporting: {milestones.reportingStr}
              </span>
              <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/30 flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block animate-pulse"></span>
                Gate Closes: {milestones.gateClosingStr}
              </span>
            </div>
            <div className="h-44 mt-4">
              <Line data={chartData} options={chartOptions} />
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">
            Travel time estimates unavailable. Share your location when confirming this exam to enable them.
          </p>
        )}
      </div>

      <button
        onClick={() => navigate(`/exam/${exam.id}`)}
        className="btn-primary w-full mt-7"
      >
        View Full Details
      </button>
    </Screen>
  );
};

export default Success;
