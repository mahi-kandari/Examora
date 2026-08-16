import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Rocket,
  Flag,
  Clock,
  ShieldAlert,
  FileText,
  MapPin,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Navigation,
  Car,
} from "lucide-react";

interface ResolvedMilestones {
  safeDepStr: string;
  safeDepMin: number;
  reportingStr: string;
  reportingMin: number;
  gateClosingStr: string;
  gateClosingMin: number;
}

interface ChronosVisualizationProps {
  exam: any;
  milestones: ResolvedMilestones;
  countdown?: string;
  isLocationGranted?: boolean;
}

function parseTimeStringToMinutes(timeStr?: string): number {
  if (!timeStr || typeof timeStr !== "string") return -1;
  const clean = timeStr.trim().replace(".", ":");

  const ampmMatch = clean.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10) % 12;
    if (ampmMatch[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + parseInt(ampmMatch[2], 10);
  }

  const noAmPmMatch = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (noAmPmMatch) {
    return parseInt(noAmPmMatch[1], 10) * 60 + parseInt(noAmPmMatch[2], 10);
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

function getCenterName(exam: any): string {
  if (exam?.center_name && typeof exam.center_name === "string" && exam.center_name.trim().length > 0) {
    return exam.center_name.trim();
  }
  if (exam?.center && typeof exam.center === "string") {
    const parts = exam.center.split(",");
    if (parts.length > 0) return parts[0].trim();
    return exam.center.trim();
  }
  return "Exam Centre";
}

export const ChronosVisualization: React.FC<ChronosVisualizationProps> = ({
  exam,
  milestones,
  countdown,
  isLocationGranted = true,
}) => {
  // Baseline Calculations
  const recDepMin = milestones.safeDepMin;
  const reportingMin = milestones.reportingMin;
  const gateMin = milestones.gateClosingMin;

  // Travel duration
  const baseTravelMin = exam?.travel_minutes || Math.max(20, reportingMin - recDepMin - 30);
  const predictedArrivalStr =
    exam?.predicted_arrival_time || formatMinutesToTimeString(recDepMin + baseTravelMin);

  // Slider State for "What if I leave later?"
  const [sliderDepMin, setSliderDepMin] = useState<number>(recDepMin);

  // Slider bounds
  const minSlider = useMemo(() => Math.max(0, recDepMin - 30), [recDepMin]);
  const maxSlider = useMemo(() => Math.min(1439, gateMin), [gateMin]);

  const selectedDepStr = formatMinutesToTimeString(sliderDepMin);

  // Traffic factor
  const delayFactor = useMemo(() => {
    const diff = sliderDepMin - recDepMin;
    if (diff <= 0) return 0;
    return Math.round(Math.min(25, (diff / 30) * 12));
  }, [sliderDepMin, recDepMin]);

  const simTravelMin = baseTravelMin + delayFactor;
  const simArrivalMin = sliderDepMin + simTravelMin;
  const simArrivalStr = formatMinutesToTimeString(simArrivalMin);
  const simBufferMin = reportingMin - simArrivalMin;

  // Risk Status
  const riskStatus = useMemo(() => {
    if (simArrivalMin > gateMin) {
      return {
        level: "danger",
        badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
        icon: ShieldAlert,
        label: "Gate Closed — Missed Exam",
        advice: `Arriving at ${simArrivalStr} is after gate closing (${milestones.gateClosingStr})!`,
      };
    }
    if (simBufferMin < 0) {
      return {
        level: "danger",
        badgeClass: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
        icon: AlertTriangle,
        label: "Late for Reporting",
        advice: `Arriving at ${simArrivalStr} is ${Math.abs(simBufferMin)} mins past reporting time!`,
      };
    }
    if (simBufferMin < 15) {
      return {
        level: "warning",
        badgeClass: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30",
        icon: AlertTriangle,
        label: `${simBufferMin} min tight buffer`,
        advice: `Leaves only ${simBufferMin} mins buffer before reporting at ${milestones.reportingStr}.`,
      };
    }
    return {
      level: "safe",
      badgeClass: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30",
      icon: CheckCircle2,
      label: `${simBufferMin} min safety buffer`,
      advice: `Arrive ${simBufferMin} mins before reporting at ${milestones.reportingStr}.`,
    };
  }, [simArrivalMin, simBufferMin, gateMin, simArrivalStr, milestones]);

  const isRecommended = sliderDepMin === recDepMin;
  const centerTitle = getCenterName(exam);
  const StatusIcon = riskStatus.icon;

  return (
    <div className="card bg-surface/95 dark:bg-[#0A0A0C] border border-stroke/70 dark:border-white/10 p-6 sm:p-8 rounded-3xl space-y-7 shadow-2xl">
      {/* 1. EYEBROW HEADER */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-[11px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
            CHRONOS • EXAM-DAY PLAN
          </span>
        </div>
        {countdown && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 text-white dark:bg-slate-800 text-xs font-semibold shadow-xs">
            <Clock className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] text-slate-300 uppercase font-medium">Leaving in</span>
            <span className="font-mono text-xs font-extrabold text-blue-400 tracking-wider">{countdown}</span>
          </div>
        )}
      </div>

      {/* 2. HERO — DOMINANT DEPARTURE TIME */}
      <div className="space-y-2">
        <p className="text-xs font-extrabold text-muted uppercase tracking-wider">
          Leave home by
        </p>
        <h1 className="text-5xl sm:text-6xl font-display font-extrabold text-text-primary dark:text-white tracking-tight leading-none">
          {selectedDepStr}
        </h1>
        <p className="text-sm font-semibold text-text-primary dark:text-slate-200 pt-1">
          {simTravelMin} min journey • Arrive around <span className="font-bold text-blue-600 dark:text-blue-400">{simArrivalStr}</span>
        </p>

        {/* Location Route Context */}
        <div className="pt-2.5 flex items-center gap-2 text-xs text-muted truncate flex-wrap">
          <div className="flex items-center gap-1 text-text-primary dark:text-white font-semibold">
            <Navigation className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>Home</span>
          </div>
          <span className="text-stroke dark:text-white/20">────────</span>
          <div className="flex items-center gap-1 font-mono text-blue-600 dark:text-blue-400 font-bold bg-blue-500/10 px-2.5 py-0.5 rounded-md border border-blue-500/20">
            <Car className="w-3 h-3 shrink-0" />
            <span>{simTravelMin} min</span>
          </div>
          <span className="text-stroke dark:text-white/20">────────</span>
          <div className="flex items-center gap-1 text-text-primary dark:text-white font-semibold truncate">
            <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span className="truncate">{centerTitle}</span>
          </div>
        </div>
      </div>

      {/* 3. SAFETY BUFFER STATUS BADGE */}
      <div className={`inline-flex items-center gap-2 text-xs font-bold px-3.5 py-1.5 rounded-full border ${riskStatus.badgeClass}`}>
        <StatusIcon className="w-4 h-4 shrink-0" />
        <span>{riskStatus.label}</span>
        <span className="font-medium opacity-80">• {riskStatus.advice}</span>
      </div>

      {/* 4. VISUAL TIMELINE WITH ICON AVATAR CARDS */}
      <div className="pt-3 border-t border-stroke/60 dark:border-white/10 space-y-3">
        <p className="text-[11px] font-extrabold text-muted uppercase tracking-widest">
          Timeline & Deadlines
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Step 1: Leave Home */}
          <div className="p-3.5 rounded-2xl bg-surface border border-stroke/70 dark:bg-white/[0.03] dark:border-white/10 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
                <Rocket className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-text-primary dark:text-white">Leave Home</p>
                <p className="text-[10px] text-muted font-medium">Recommended</p>
              </div>
            </div>
            <span className="font-mono text-xs font-extrabold text-blue-600 dark:text-blue-400">{milestones.safeDepStr}</span>
          </div>

          {/* Step 2: Arrive Centre */}
          <div className="p-3.5 rounded-2xl bg-surface border border-stroke/70 dark:bg-white/[0.03] dark:border-white/10 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Flag className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-text-primary dark:text-white">Arrive Centre</p>
                <p className="text-[10px] text-muted font-medium">~{baseTravelMin} min travel</p>
              </div>
            </div>
            <span className="font-mono text-xs font-extrabold text-emerald-600 dark:text-emerald-400">{predictedArrivalStr}</span>
          </div>

          {/* Step 3: Reporting Opens */}
          <div className="p-3.5 rounded-2xl bg-surface border border-stroke/70 dark:bg-white/[0.03] dark:border-white/10 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-text-primary dark:text-white">Reporting Opens</p>
                <p className="text-[10px] text-muted font-medium">Entry & Check-in</p>
              </div>
            </div>
            <span className="font-mono text-xs font-extrabold text-amber-600 dark:text-amber-400">{milestones.reportingStr}</span>
          </div>

          {/* Step 4: Gate Closes */}
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 shrink-0">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-extrabold text-rose-600 dark:text-rose-400">Gate Closes</p>
                <p className="text-[10px] text-rose-600/80 dark:text-rose-300/80 font-semibold">Hard Deadline</p>
              </div>
            </div>
            <span className="font-mono text-xs font-extrabold text-rose-600 dark:text-rose-400">{milestones.gateClosingStr}</span>
          </div>
        </div>
      </div>

      {/* 5. DEPARTURE SIMULATOR — "WHAT IF YOU LEAVE LATER?" */}
      <div className="pt-3 border-t border-stroke/60 dark:border-white/10 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Sliders className="w-4 h-4" />
            </div>
            <span className="text-xs font-extrabold text-text-primary dark:text-white uppercase tracking-wider">
              What if you leave later?
            </span>
          </div>
          {!isRecommended && (
            <button
              onClick={() => setSliderDepMin(recDepMin)}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset ({milestones.safeDepStr})
            </button>
          )}
        </div>

        {/* Clean Neutral Slider */}
        <div className="py-1">
          <input
            type="range"
            min={minSlider}
            max={maxSlider}
            step={5}
            value={sliderDepMin}
            onChange={(e) => setSliderDepMin(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-gradient-to-r from-blue-500 via-amber-500 to-rose-500 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[11px] text-muted font-mono mt-1.5 font-bold">
            <span>{formatMinutesToTimeString(minSlider)}</span>
            <span className="text-blue-600 dark:text-blue-400">◄ Slide Departure Time ►</span>
            <span>{formatMinutesToTimeString(maxSlider)} (Gate Closes)</span>
          </div>
        </div>

        {/* Live Simulation Output Card */}
        <div className="bg-surface border border-stroke dark:bg-black/40 dark:border-white/10 p-3.5 rounded-2xl flex items-center justify-between flex-wrap gap-2 text-xs">
          <div>
            <span className="text-muted font-medium">Simulated departure: </span>
            <strong className="font-mono font-extrabold text-text-primary dark:text-white">{selectedDepStr}</strong>
          </div>
          <div>
            <span className="text-muted font-medium">Est. arrival: </span>
            <strong className="font-mono font-extrabold text-text-primary dark:text-white">{simArrivalStr}</strong>
          </div>
          <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${riskStatus.badgeClass}`}>
            {riskStatus.label}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChronosVisualization;
