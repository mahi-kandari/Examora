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

export const ChronosVisualization: React.FC<ChronosVisualizationProps> = ({
  exam,
  milestones,
  countdown,
  isLocationGranted = true,
}) => {
  // Safe departure baseline
  const recDepMin = milestones.safeDepMin;
  const reportingMin = milestones.reportingMin;
  const gateMin = milestones.gateClosingMin;

  // Estimate travel duration
  const baseTravelMin = exam?.travel_minutes || Math.max(20, reportingMin - recDepMin - 30);
  const predictedArrivalStr =
    exam?.predicted_arrival_time || formatMinutesToTimeString(recDepMin + baseTravelMin);

  // Slider State for "What if I leave later?"
  const [sliderDepMin, setSliderDepMin] = useState<number>(recDepMin);

  // Slider bounds
  const minSlider = useMemo(() => Math.max(0, recDepMin - 30), [recDepMin]);
  const maxSlider = useMemo(() => Math.min(1439, gateMin), [gateMin]);

  // Calculations for current slider position
  const selectedDepStr = formatMinutesToTimeString(sliderDepMin);
  
  // Traffic factor: leaving closer to reporting peak increases travel time slightly
  const delayFactor = useMemo(() => {
    const diff = sliderDepMin - recDepMin;
    if (diff <= 0) return 0;
    return Math.round(Math.min(25, (diff / 30) * 12));
  }, [sliderDepMin, recDepMin]);

  const simTravelMin = baseTravelMin + delayFactor;
  const simArrivalMin = sliderDepMin + simTravelMin;
  const simArrivalStr = formatMinutesToTimeString(simArrivalMin);
  const simBufferMin = reportingMin - simArrivalMin;

  // Risk Classification
  const riskStatus = useMemo(() => {
    if (simArrivalMin > gateMin) {
      return {
        level: "danger",
        badgeText: "GATE CLOSED - MISSED EXAM",
        colorClass: "text-rose-400 bg-rose-500/10 border-rose-500/30",
        icon: ShieldAlert,
        advice: `If you leave at ${selectedDepStr}, you will arrive at ${simArrivalStr}, after the gate closes at ${milestones.gateClosingStr}!`,
      };
    }
    if (simBufferMin < 0) {
      return {
        level: "danger",
        badgeText: "LATE FOR REPORTING",
        colorClass: "text-rose-400 bg-rose-500/10 border-rose-500/30",
        icon: AlertTriangle,
        advice: `Leaving at ${selectedDepStr} puts arrival at ${simArrivalStr}, which is ${Math.abs(simBufferMin)} minutes after reporting time!`,
      };
    }
    if (simBufferMin < 15) {
      return {
        level: "warning",
        badgeText: "TIGHT BUFFER",
        colorClass: "text-amber-300 bg-amber-500/10 border-amber-500/30",
        icon: AlertTriangle,
        advice: `Leaving at ${selectedDepStr} leaves only ${simBufferMin} minutes of buffer before reporting at ${milestones.reportingStr}. High risk of delays.`,
      };
    }
    return {
      level: "safe",
      badgeText: "COMFORTABLE BUFFER",
      colorClass: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      icon: CheckCircle2,
      advice: `Leaving at ${selectedDepStr} gives you approximately ${simBufferMin} minutes of safety buffer before reporting at ${milestones.reportingStr}.`,
    };
  }, [simArrivalMin, simBufferMin, gateMin, selectedDepStr, simArrivalStr, milestones]);

  const isRecommended = sliderDepMin === recDepMin;
  const RiskIcon = riskStatus.icon;

  return (
    <div className="space-y-4">
      {/* 1. Header & Time Until Departure Countdown */}
      <div className="card-linear p-5 rounded-2xl animate-fadeInUp shadow-2xl">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#5E6AD2]/15 text-[#818CF8]">
              <Sparkles className="w-4 h-4" />
            </div>
            <p className="text-xs font-semibold text-[#818CF8] uppercase tracking-wider">
              Chronos Travel Assistant
            </p>
          </div>
          {countdown && (
            <div className="bg-[#020203] border border-white/[0.06] px-3.5 py-1.5 rounded-full flex items-center gap-2 shadow-inner">
              <Clock className="w-3.5 h-3.5 text-[#818CF8]" />
              <span className="text-[10px] text-[#8A8F98] uppercase font-mono">Leave In:</span>
              <span className="font-mono text-xs font-bold text-[#818CF8] tracking-wider">
                {countdown}
              </span>
            </div>
          )}
        </div>

        {/* 2. Hero Section: LEAVE BY -> ARRIVE BY */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {/* LEAVE BY HERO */}
          <motion.div
            whileHover={{ y: -1 }}
            className="relative overflow-hidden bg-[#5E6AD2]/10 border border-[#5E6AD2]/30 rounded-xl p-4 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-1.5 text-[#818CF8] mb-1">
                <Rocket className="w-4 h-4" />
                <p className="text-[10px] font-mono uppercase tracking-widest">
                  LEAVE HOME BY
                </p>
              </div>
              <h2 className="text-3xl font-display font-semibold text-[#EDEDEF] tracking-tight">
                {selectedDepStr}
              </h2>
            </div>
            <p className="text-xs text-[#8A8F98] mt-2 font-normal">
              {isRecommended ? "Recommended departure time" : "Simulated departure time"}
            </p>
          </motion.div>

          {/* ARRIVE BY HERO */}
          <motion.div
            whileHover={{ y: -1 }}
            className="relative overflow-hidden bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                <Flag className="w-4 h-4" />
                <p className="text-[10px] font-mono uppercase tracking-widest">
                  ESTIMATED ARRIVAL
                </p>
              </div>
              <h2 className="text-3xl font-display font-semibold text-[#EDEDEF] tracking-tight">
                {simArrivalStr}
              </h2>
            </div>
            <p className="text-xs text-[#8A8F98] mt-2 font-normal">
              Estimated arrival at test centre
            </p>
          </motion.div>
        </div>

        {/* Journey Connector Badge */}
        <div className="flex items-center justify-center gap-2 text-xs text-[#8A8F98] font-normal bg-[#020203]/80 border border-white/[0.06] py-2 px-4 rounded-xl mt-3">
          <span className="flex items-center gap-1"><Navigation className="w-3.5 h-3.5 text-[#5E6AD2]" /> Home</span>
          <span className="text-[#818CF8] font-semibold px-2">➜ 🚗 {simTravelMin} min journey ➜</span>
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-rose-500" /> Exam Centre</span>
        </div>
      </div>

      {/* 3. Safety Buffer Badge & Status */}
      <motion.div
        whileHover={{ y: -1 }}
        className={`card-linear border p-4 rounded-2xl transition-all duration-200 ${riskStatus.colorClass}`}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-current/10">
              <RiskIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-semibold tracking-wider uppercase">
                {simBufferMin >= 0 ? `${simBufferMin} MIN SAFETY BUFFER` : "NO SAFETY BUFFER"}
              </h3>
              <p className="text-xs opacity-90 mt-0.5 font-normal">
                {simBufferMin >= 0
                  ? `Arrive ${simBufferMin} mins before reporting at ${milestones.reportingStr}`
                  : `Arriving late after reporting time (${milestones.reportingStr})`}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase px-3 py-1 rounded-full border bg-black/40 backdrop-blur-md">
            {riskStatus.badgeText}
          </span>
        </div>
      </motion.div>

      {/* 4. Visual 4-Step Journey Timeline */}
      <div className="card-linear p-5 rounded-2xl space-y-4">
        <p className="text-xs font-semibold text-[#8A8F98] uppercase tracking-wider">
          Exam-Day Milestone Timeline
        </p>

        <div className="relative pl-7 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-[#5E6AD2] before:via-emerald-500 to-rose-500">
          {/* Step 1: Leave Home */}
          <div className="relative flex items-start justify-between gap-3">
            <div className="absolute -left-7 top-0 p-1.5 rounded-md bg-[#5E6AD2] text-white shadow-[0_0_10px_rgba(94,106,210,0.4)]">
              <Rocket className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[#EDEDEF]">
                Leave Home
              </h4>
              <p className="text-[11px] text-[#8A8F98]">Recommended departure for a smooth commute</p>
            </div>
            <span className="font-mono text-xs font-semibold text-[#818CF8] bg-[#5E6AD2]/15 px-2.5 py-1 rounded-full border border-[#5E6AD2]/30 shrink-0">
              {milestones.safeDepStr}
            </span>
          </div>

          {/* Step 2: Estimated Arrival */}
          <div className="relative flex items-start justify-between gap-3">
            <div className="absolute -left-7 top-0 p-1.5 rounded-md bg-emerald-500 text-white shadow-md shadow-emerald-500/30">
              <Flag className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[#EDEDEF]">
                Estimated Arrival
              </h4>
              <p className="text-[11px] text-[#8A8F98]">Approx. {baseTravelMin} mins travel from home</p>
            </div>
            <span className="font-mono text-xs font-semibold text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full border border-emerald-500/30 shrink-0">
              {predictedArrivalStr}
            </span>
          </div>

          {/* Step 3: Reporting Time */}
          <div className="relative flex items-start justify-between gap-3">
            <div className="absolute -left-7 top-0 p-1.5 rounded-md bg-amber-500 text-white shadow-md shadow-amber-500/30">
              <FileText className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[#EDEDEF]">
                Reporting & Entry Opens
              </h4>
              <p className="text-[11px] text-[#8A8F98]">Document verification & biometric check-in</p>
            </div>
            <span className="font-mono text-xs font-semibold text-amber-300 bg-amber-500/15 px-2.5 py-1 rounded-full border border-amber-500/30 shrink-0">
              {milestones.reportingStr}
            </span>
          </div>

          {/* Step 4: Gate Closes (HARD DEADLINE) */}
          <div className="relative flex items-start justify-between gap-3 pt-2 border-t border-rose-500/20">
            <div className="absolute -left-7 top-2.5 p-1.5 rounded-md bg-rose-500 text-white shadow-md shadow-rose-500/30">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-rose-400 flex items-center gap-1.5">
                GATE CLOSES (HARD DEADLINE)
              </h4>
              <p className="text-[11px] text-rose-400/80 font-normal">
                ⛔ Do not cross this point. Gates strictly locked!
              </p>
            </div>
            <span className="font-mono text-xs font-semibold text-rose-400 bg-rose-500/15 px-2.5 py-1 rounded-full border border-rose-500/30 shrink-0">
              {milestones.gateClosingStr}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Interactive "What if I leave later?" Departure Slider */}
      <div className="card-linear p-5 rounded-2xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#8A8F98] uppercase tracking-wider">
            <Sliders className="w-3.5 h-3.5 text-[#818CF8]" />
            <span>What if I leave at a different time?</span>
          </div>
          {!isRecommended && (
            <button
              onClick={() => setSliderDepMin(recDepMin)}
              className="text-xs font-semibold text-[#818CF8] hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset ({milestones.safeDepStr})
            </button>
          )}
        </div>

        {/* Slider input */}
        <div className="py-2">
          <input
            type="range"
            min={minSlider}
            max={maxSlider}
            step={5}
            value={sliderDepMin}
            onChange={(e) => setSliderDepMin(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-gradient-to-r from-[#5E6AD2] via-amber-500 to-rose-500 rounded-lg appearance-none cursor-pointer accent-[#5E6AD2]"
          />
          <div className="flex justify-between text-[11px] text-[#8A8F98] font-mono mt-1.5">
            <span>{formatMinutesToTimeString(minSlider)}</span>
            <span className="text-[#818CF8] font-semibold">◄ Move Slider ►</span>
            <span>{formatMinutesToTimeString(maxSlider)} (Gate Closes)</span>
          </div>
        </div>

        {/* Human-Readable Advice Box */}
        <div className="bg-[#020203]/80 border border-white/[0.06] p-3.5 rounded-xl text-xs text-[#EDEDEF] leading-relaxed font-normal">
          <p>{riskStatus.advice}</p>
        </div>
      </div>
    </div>
  );
};

export default ChronosVisualization;
