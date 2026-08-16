import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot, updateDoc, arrayUnion } from "firebase/firestore";
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
import { db } from "../services/firebase";
import Screen from "../components/Screen";
import { useCountdown } from "../hooks/useCountdown";
import { useGeofence } from "../hooks/useGeofence";
import { generateGoogleCalendarUrl } from "../utils/calendar";
import { ChronosVisualization } from "../components/ChronosVisualization";
import { Navigation, MapPin, Car, RefreshCw, CheckCircle2 } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

function formatDate(dateIso: string) {
  if (!dateIso) return "";
  return new Date(dateIso).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getCenterName(exam: any): string {
  if (exam.center_name?.trim()) return exam.center_name.trim();
  if (exam.center && typeof exam.center === "string") {
    const parts = exam.center.split(",");
    if (parts.length > 0) return parts[0].trim();
    return exam.center.trim();
  }
  return "Exam Centre";
}

interface ExamData {
  id: string;
  exam_title?: string;
  exam_date?: string;
  reporting_time?: string;
  safe_departure_time?: string;
  predicted_arrival_time?: string;
  center_name?: string;
  center_address?: string;
  travel_minutes?: number;
  required_documents?: string[];
  extracted_instructions?: string[];
  reminders?: { label: string; time: string }[];
  completed?: boolean;
  center?: string;
  traffic_data?: Record<string, number>; // e.g. { "6:00 AM": 35, "6:15 AM": 38 }
  traffic_data_source?: "live" | "estimated" | null;
}

function parseTimeStringToMinutes(timeStr?: string): number {
  if (!timeStr || typeof timeStr !== "string") return -1;
  const clean = timeStr.trim().replace(".", ":");

  // Format 1: "01:30 AM", "2:30 PM", "12:00PM"
  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10) % 12;
    if (ampmMatch[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + parseInt(ampmMatch[2], 10);
  }

  // Format 2: "14:30", "02:30", "2:30"
  const noAmPmMatch = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (noAmPmMatch) {
    const hour = parseInt(noAmPmMatch[1], 10);
    const minute = parseInt(noAmPmMatch[2], 10);
    return hour * 60 + minute;
  }

  return -1;
}

function formatMinutesToTimeString(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const meridiem = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${meridiem}`;
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

const ExamDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [exam, setExam] = useState<ExamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addingReminder, setAddingReminder] = useState(false);
  const [reminderLabel, setReminderLabel] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminders, setReminders] = useState<{ label: string; time: string }[]>([]);

  // ✅ Real‑time listener – always shows the latest data from Firestore
  useEffect(() => {
    if (!id) return;
    const unsubscribe = onSnapshot(doc(db, "exams", id), (snap) => {
      if (!snap.exists()) {
        setError("Exam not found.");
        setLoading(false);
        return;
      }
      const data = snap.data() as ExamData;
      setExam({ ...data, id: snap.id });
      setReminders(data.reminders || []);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [id]);

  const countdown = useCountdown(exam?.exam_date, exam?.safe_departure_time);
  const geofence = useGeofence(
    (exam as any)?.center_lat || (exam as any)?.lat,
    (exam as any)?.center_lng || (exam as any)?.lng
  );

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

  const handleAddReminder = async () => {
    if (!reminderLabel || !reminderTime || !id) return;
    const newReminder = { label: reminderLabel, time: reminderTime };
    const updatedReminders = [...reminders, newReminder];
    setReminders(updatedReminders);
    setReminderLabel("");
    setReminderTime("");
    setAddingReminder(false);

    try {
      await updateDoc(doc(db, "exams", id), {
        reminders: arrayUnion(newReminder),
      });
    } catch (err) {
      console.error("Failed to save reminder:", err);
    }
  };

  if (loading) {
    return (
      <Screen withNav>
        <div className="flex justify-center mt-16">
          <div className="animate-spin h-10 w-10 border-4 border-accent/30 border-t-accent rounded-full" />
        </div>
      </Screen>
    );
  }

  if (error || !exam) {
    return (
      <Screen withNav>
        <p className="text-muted text-center mt-16">{error || "Exam not found."}</p>
        <button onClick={() => navigate(-1)} className="btn-ghost mx-auto mt-4 block">
          Go back
        </button>
      </Screen>
    );
  }

  const daysLeft = exam.exam_date
    ? Math.max(
        Math.ceil(
          (new Date(exam.exam_date).setHours(0, 0, 0, 0) -
            new Date().setHours(0, 0, 0, 0)) /
            (1000 * 60 * 60 * 24)
        ),
        0
      )
    : 0;

  const toList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
      : typeof value === "string" && value.trim()
      ? value.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  const documents = toList(exam.required_documents);
  const instructions = toList(exam.extracted_instructions);
  const centreDisplayName = getCenterName(exam);
  const centreLocation = [
    centreDisplayName === "Exam Centre" ? "" : centreDisplayName,
    exam.center_address,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(", ");
  const mapsUrl = centreLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(centreLocation)}`
    : "#";

  return (
    <Screen withNav>
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigate(-1)}
          className="text-muted text-sm hover:text-text-primary transition-colors"
        >
          ← Back
        </button>
        <button
          aria-label="Share"
          className="h-9 w-9 rounded-full glass !rounded-full flex items-center justify-center text-text-primary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .05 2.06l-6.02 3.5a3 3 0 1 0 0 4.88l6.02 3.5A3 3 0 1 0 18 16a2.99 2.99 0 0 0-.83.12L11.15 12.6a3 3 0 0 0 0-1.2l6.02-3.5A3 3 0 0 0 18 8Z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
          </svg>
        </button>
      </div>

      <div className="glass p-6 animate-fadeInUp">
        {!exam.completed && (
          <span className="badge mb-3">
            {daysLeft === 0 ? "Today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} to go`}
          </span>
        )}
        {exam.completed && (
          <span className="badge !bg-success/10 !text-success !border-success/20 mb-3">
            Completed
          </span>
        )}
        <h1 className="font-display font-semibold text-xl text-text-primary leading-snug">
          {exam.exam_title || "Exam"}
        </h1>
        <p className="text-muted text-sm mt-2">
          {exam.exam_date ? formatDate(exam.exam_date) : ""}
        </p>
        <p className="text-muted text-sm">Reports at {exam.reporting_time || "N/A"}</p>
      </div>

      <div className="mt-4">
        <ChronosVisualization
          exam={exam}
          milestones={milestones}
          countdown={countdown}
          isLocationGranted={isLocationGranted}
        />
      </div>

      <div className="card mt-4 animate-fadeInUp space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-accent" />
            <p className="text-xs font-extrabold text-text-primary dark:text-white uppercase tracking-wide">
              Geofence & Proximity Tracker
            </p>
          </div>
          <div className="flex items-center gap-2">
            {geofence.isWithinGeofence ? (
              <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30 animate-pulse flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Inside 2.0 km Geofence
              </span>
            ) : (
              <span className="text-[11px] font-bold text-blue-500 dark:text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" /> Live GPS Active
              </span>
            )}
            <button
              onClick={geofence.requestGPS}
              title="Refresh GPS Location"
              className="p-1 rounded-lg hover:bg-surface text-muted hover:text-text-primary transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${geofence.isLoading ? "animate-spin text-accent" : ""}`} />
            </button>
          </div>
        </div>

        {geofence.distanceKm !== null ? (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-2 text-sm font-bold text-text-primary dark:text-white">
              {geofence.isWithinGeofence ? (
                <span className="text-emerald-500 dark:text-emerald-400 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4" /> You are {geofence.distanceKm} km from your test centre!
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-accent" /> {geofence.distanceKm} km away from test centre
                </span>
              )}
            </div>
            <p className="text-xs text-muted leading-relaxed">
              {geofence.isWithinGeofence
                ? "You are inside the 2.0 km geofence zone. Have your Admit Card, Original Photo ID, and required items ready at the gate!"
                : "Geofence notifications trigger automatically when you arrive within 2.0 km of the test centre."}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between text-xs text-muted pt-1">
            <span>
              {geofence.error
                ? `GPS Status: ${geofence.error}`
                : "Acquiring live GPS location to calculate distance..."}
            </span>
            <button
              onClick={geofence.requestGPS}
              className="text-accent font-semibold hover:underline flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Retry GPS
            </button>
          </div>
        )}
      </div>

      <div className="card mt-4 animate-fadeInUp">
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Centre</p>
        <p className="text-text-primary text-sm font-medium">{centreDisplayName}</p>
        <p className="text-muted text-sm mt-1">{exam.center_address || ""}</p>
        {exam.travel_minutes && (
          <p className="text-muted text-xs mt-2">
            Approx. {exam.travel_minutes} min from your home
          </p>
        )}
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost w-full mt-4 text-center block !py-2.5 text-sm"
        >
          Open in Google Maps
        </a>
      </div>

      <div className="card mt-4 animate-fadeInUp">
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
          Calendar & Event Sync
        </p>
        <a
          href={generateGoogleCalendarUrl(exam)}
          target="_blank"
          rel="noreferrer"
          className="btn-primary w-full text-center block !py-2.5 text-sm font-medium"
        >
          📅 Add to Google Calendar
        </a>
      </div>

      <div className="card mt-4 animate-fadeInUp">
        <p className="text-xs font-medium text-danger uppercase tracking-wide mb-3">
          Documents to bring (denied if missing)
        </p>
        {documents.length > 0 ? (
          <ul className="space-y-2.5">
            {documents.map((doc, idx) => (
              <li key={idx} className="flex items-center gap-2.5 text-sm text-text-primary">
                <span className="h-5 w-5 rounded-full bg-success/15 text-success flex items-center justify-center text-xs shrink-0">✓</span>
                {doc}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-sm">No document details extracted.</p>
        )}
      </div>

      <div className="card mt-4 animate-fadeInUp">
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
          Instructions
        </p>
        {instructions.length > 0 ? (
          <ul className="space-y-2.5">
            {instructions.map((line, i) => (
              <li key={i} className="text-sm text-text-primary leading-relaxed flex gap-2.5">
                <span className="text-accent">•</span>
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-sm">No special instructions.</p>
        )}
      </div>

      <div className="card mt-4 animate-fadeInUp">
        <p className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
          Reminders
        </p>
        {reminders.length > 0 ? (
          <ul className="space-y-2.5 mb-4">
            {reminders.map((r, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between text-sm text-text-primary bg-glass/40 rounded-xl px-3.5 py-2.5"
              >
                <span>{r.label}</span>
                <span className="text-muted">{r.time}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-sm mb-4">No reminders set.</p>
        )}

        {addingReminder ? (
          <div className="space-y-2.5 animate-fadeInUp">
            <input
              placeholder="Reminder label"
              value={reminderLabel}
              onChange={(e) => setReminderLabel(e.target.value)}
              className="input-field !py-3"
            />
            <input
              placeholder="Time (e.g. 7:00 AM)"
              value={reminderTime}
              onChange={(e) => setReminderTime(e.target.value)}
              className="input-field !py-3"
            />
            <button onClick={handleAddReminder} className="btn-primary w-full !py-2.5 text-sm">
              Save reminder
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingReminder(true)}
            className="text-accent text-sm font-medium hover:opacity-80 transition-opacity"
          >
            + Add another reminder
          </button>
        )}
      </div>

      <button onClick={() => navigate("/home")} className="btn-ghost w-full mt-6">
        Back to Home
      </button>
    </Screen>
  );
};

export default ExamDetail;
