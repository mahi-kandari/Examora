import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Clock, Navigation, MapPin, Sliders, RotateCcw, Sparkles } from "lucide-react";

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
        dotColor: "bg-rose-500",
        textColor: "text-rose-600 dark:text-rose-400",
        label: "Gate Closed — Missed Exam",
        advice: `Arriving at ${simArrivalStr} is after gate closing (${milestones.gateClosingStr})!`,
      };
    }
    if (simBufferMin < 0) {
      return {
        level: "danger",
        dotColor: "bg-rose-500",
        textColor: "text-rose-600 dark:text-rose-400",
        label: "Late for Reporting",
        advice: `Arriving at ${simArrivalStr} is ${Math.abs(simBufferMin)} mins past reporting time!`,
      };
    }
    if (simBufferMin < 15) {
      return {
        level: "warning",
        dotColor: "bg-amber-500",
        textColor: "text-amber-600 dark:text-amber-400",
        label: `${simBufferMin} min tight buffer`,
        advice: `Leaves only ${simBufferMin} mins buffer before reporting at ${milestones.reportingStr}.`,
      };
    }
    return {
      level: "safe",
      dotColor: "bg-emerald-500",
      textColor: "text-emerald-600 dark:text-emerald-400",
      label: `${simBufferMin} min safety buffer`,
      advice: `Arrive ${simBufferMin} mins before reporting at ${milestones.reportingStr}.`,
    };
  }, [simArrivalMin, simBufferMin, gateMin, simArrivalStr, milestones]);

  const isRecommended = sliderDepMin === recDepMin;
  const centerTitle = getCenterName(exam);

  return (
    <div className="card bg-surface/95 dark:bg-[#0A0A0C] border border-stroke/70 dark:border-white/10 p-6 sm:p-8 rounded-3xl space-y-7 shadow-2xl">
      {/* 1. EYEBROW HEADER — ENHANCED HEADING SIZE */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#FF5A43] dark:text-coral" />
          <span className="text-xs sm:text-sm font-extrabold text-[#FF5A43] dark:text-coral uppercase tracking-widest">
            CHRONOS • EXAM-DAY PLAN
          </span>
        </div>
        {countdown && (
          <div className="flex items-center gap-1.5 text-xs text-muted font-medium bg-surface/80 dark:bg-white/5 border border-stroke dark:border-white/10 px-3 py-1 rounded-full">
            <Clock className="w-3.5 h-3.5 text-accent" />
            <span>Leaving in <strong className="font-mono font-bold text-text-primary dark:text-white">{countdown}</strong></span>
          </div>
        )}
      </div>

      {/* 2. HERO — DOMINANT DEPARTURE TIME */}
      <div className="space-y-2">
        <p className="text-xs sm:text-sm text-text-primary dark:text-white uppercase tracking-wider font-extrabold">
          Leave home by
        </p>
        <h1 className="text-5xl sm:text-6xl font-display font-extrabold text-text-primary dark:text-white tracking-tight leading-none">
          {selectedDepStr}
        </h1>
        <p className="text-sm sm:text-base text-muted font-semibold pt-1">
          {simTravelMin} min journey • Arrive around <strong className="font-bold text-text-primary dark:text-white">{simArrivalStr}</strong>
        </p>

        {/* Location Route Context */}
        <div className="pt-2.5 flex items-center gap-2 text-xs sm:text-sm text-muted truncate">
          <Navigation className="w-4 h-4 text-accent shrink-0" />
          <span className="font-bold text-text-text-primary dark:text-white">Home</span>
          <span className="text-stroke dark:text-white/20">─────────</span>
          <span className="font-mono text-accent font-extrabold text-xs">{simTravelMin} min</span>
          <span className="text-stroke dark:text-white/20">─────────</span>
          <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="truncate font-bold text-text-primary dark:text-white">{centerTitle}</span>
        </div>
      </div>

      {/* 3. SAFETY BUFFER STATUS LINE */}
      <div className="flex items-center gap-2.5 text-xs sm:text-sm font-extrabold pt-1">
        <span className={`h-2.5 w-2.5 rounded-full ${riskStatus.dotColor} shrink-0 animate-pulse`} />
        <span className={riskStatus.textColor}>{riskStatus.label}</span>
        <span className="text-muted font-medium opacity-90">• {riskStatus.advice}</span>
      </div>

      {/* 4. MINIMAL HORIZONTAL JOURNEY TIMELINE — ENHANCED HEADING SIZE */}
      <div className="pt-3 border-t border-stroke/60 dark:border-white/10 space-y-3">
        <p className="text-xs sm:text-sm font-extrabold text-text-primary dark:text-white uppercase tracking-widest">
          Timeline & Deadlines
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          {/* Step 1: Leave */}
          <div className="p-3.5 rounded-2xl bg-surface border border-stroke/60 dark:bg-white/[0.03] dark:border-white/5 space-y-1">
            <span className="font-mono text-xs font-bold text-accent">{milestones.safeDepStr}</span>
            <p className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">Leave Home</p>
            <p className="text-xs text-muted font-medium">Recommended</p>
          </div>

          {/* Step 2: Arrive */}
          <div className="p-3.5 rounded-2xl bg-surface border border-stroke/60 dark:bg-white/[0.03] dark:border-white/5 space-y-1">
            <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">{predictedArrivalStr}</span>
            <p className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">Arrive Centre</p>
            <p className="text-xs text-muted font-medium">~{baseTravelMin} min travel</p>
          </div>

          {/* Step 3: Report */}
          <div className="p-3.5 rounded-2xl bg-surface border border-stroke/60 dark:bg-white/[0.03] dark:border-white/5 space-y-1">
            <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">{milestones.reportingStr}</span>
            <p className="text-sm sm:text-base font-semibold text-text-primary dark:text-white">Reporting Opens</p>
            <p className="text-xs text-muted font-medium">Entry & Check-in</p>
          </div>

          {/* Step 4: Gate Closes */}
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-1">
            <span className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">{milestones.gateClosingStr}</span>
            <p className="text-sm sm:text-base font-semibold text-rose-600 dark:text-rose-400">Gate Closes</p>
            <p className="text-xs text-rose-600/80 dark:text-rose-300/80 font-bold">Hard Deadline</p>
          </div>
        </div>
      </div>

      {/* 5. DEPARTURE SIMULATOR — ENHANCED HEADING SIZE */}
      <div className="pt-3 border-t border-stroke/60 dark:border-white/10 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent" />
            <span className="text-sm sm:text-base font-semibold text-text-primary dark:text-white tracking-tight">
              What if you leave later?
            </span>
          </div>
          {!isRecommended && (
            <button
              onClick={() => setSliderDepMin(recDepMin)}
              className="text-xs font-bold text-accent hover:underline flex items-center gap-1"
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
            className="w-full h-2 bg-stroke dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-[11px] text-muted font-mono mt-1.5 font-bold">
            <span>{formatMinutesToTimeString(minSlider)}</span>
            <span>{formatMinutesToTimeString(maxSlider)} (Gate Closes)</span>
          </div>
        </div>

        {/* Live Simulation Output Card */}
        <div className="bg-surface border border-stroke dark:bg-black/30 dark:border-white/5 p-3.5 rounded-2xl flex items-center justify-between flex-wrap gap-2 text-xs sm:text-sm">
          <div>
            <span className="text-muted font-medium">Simulated departure: </span>
            <strong className="font-mono font-bold text-text-primary dark:text-white">{selectedDepStr}</strong>
          </div>
          <div>
            <span className="text-muted font-medium">Est. arrival: </span>
            <strong className="font-mono font-bold text-text-primary dark:text-white">{simArrivalStr}</strong>
          </div>
          <span className={`text-xs sm:text-sm font-extrabold ${riskStatus.textColor}`}>
            {riskStatus.label}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChronosVisualization;
