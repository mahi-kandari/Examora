import React, { useState, useMemo } from "react";

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
  const predictedArrivalMin = parseTimeStringToMinutes(predictedArrivalStr) > 0
    ? parseTimeStringToMinutes(predictedArrivalStr)
    : recDepMin + baseTravelMin;

  // Recommended buffer
  const recBufferMin = reportingMin - predictedArrivalMin;

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
    return Math.round(Math.min(25, (diff / 30) * 12)); // up to +25 min delay in peak traffic
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
        badgeText: "🔴 GATE CLOSED - MISSED EXAM",
        label: "Gate Closed",
        colorClass: "text-rose-400 border-rose-500/30 bg-rose-500/10",
        advice: `If you leave at ${selectedDepStr}, you will arrive at ${simArrivalStr}, after the gate closes at ${milestones.gateClosingStr}!`,
      };
    }
    if (simBufferMin < 0) {
      return {
        level: "danger",
        badgeText: "🔴 LATE FOR REPORTING",
        label: "Missed Reporting",
        colorClass: "text-rose-400 border-rose-500/30 bg-rose-500/10",
        advice: `Leaving at ${selectedDepStr} puts arrival at ${simArrivalStr}, which is ${Math.abs(simBufferMin)} minutes after reporting time!`,
      };
    }
    if (simBufferMin < 15) {
      return {
        level: "warning",
        badgeText: "🟡 TIGHT BUFFER",
        label: "Tight Window",
        colorClass: "text-amber-400 border-amber-500/30 bg-amber-500/10",
        advice: `Leaving at ${selectedDepStr} leaves only ${simBufferMin} minutes of buffer before reporting at ${milestones.reportingStr}. High risk of delays.`,
      };
    }
    return {
      level: "safe",
      badgeText: "🟢 COMFORTABLE BUFFER",
      label: "Safe Schedule",
      colorClass: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
      advice: `Leaving at ${selectedDepStr} gives you approximately ${simBufferMin} minutes of safety buffer before reporting at ${milestones.reportingStr}.`,
    };
  }, [simArrivalMin, simBufferMin, gateMin, selectedDepStr, simArrivalStr, milestones]);

  const isRecommended = sliderDepMin === recDepMin;

  return (
    <div className="space-y-4">
      {/* 1. Header & Time Until Departure Countdown */}
      <div className="card bg-glass/60 border border-white/10 p-5 rounded-2xl animate-fadeInUp shadow-xl">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-accent animate-ping" />
            <p className="text-xs font-semibold text-accent uppercase tracking-wider">
              Chronos Exam-Day Assistant
            </p>
          </div>
          {countdown && (
            <div className="bg-glass/80 px-3 py-1 rounded-full border border-white/10 flex items-center gap-2">
              <span className="text-[10px] text-muted uppercase font-semibold">Leave In:</span>
              <span className="font-mono text-sm font-bold text-accent tracking-wider">
                {countdown}
              </span>
            </div>
          )}
        </div>

        {/* 2. Hero Section: LEAVE BY -> ARRIVE BY */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mt-2">
          {/* LEAVE BY HERO */}
          <div className="relative overflow-hidden bg-gradient-to-br from-blue-500/15 via-blue-600/10 to-transparent border border-blue-500/30 rounded-2xl p-4 flex flex-col justify-between shadow-inner">
            <div>
              <p className="text-[11px] font-bold text-blue-400 uppercase tracking-widest flex items-center gap-1.5">
                🚀 LEAVE HOME BY
              </p>
              <h2 className="text-3xl font-display font-extrabold text-white mt-1 tracking-tight">
                {selectedDepStr}
              </h2>
            </div>
            <p className="text-xs text-blue-200/70 mt-2 font-medium">
              {isRecommended ? "Recommended departure time" : "Simulated departure time"}
            </p>
          </div>

          {/* ARRIVE BY HERO */}
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500/15 via-emerald-600/10 to-transparent border border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between shadow-inner">
            <div>
              <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                🏁 ESTIMATED ARRIVAL
              </p>
              <h2 className="text-3xl font-display font-extrabold text-white mt-1 tracking-tight">
                {simArrivalStr}
              </h2>
            </div>
            <p className="text-xs text-emerald-200/70 mt-2 font-medium">
              Estimated arrival at test centre
            </p>
          </div>
        </div>

        {/* Journey Connector Badge */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted font-medium bg-black/30 border border-white/5 py-2 px-4 rounded-xl mt-3">
          <span>🏠 Home</span>
          <span className="text-accent font-semibold">➜ 🚗 {simTravelMin} min journey ➜</span>
          <span>📍 Exam Centre</span>
        </div>
      </div>

      {/* 3. Safety Buffer Badge & Status */}
      <div className={`card border p-4 rounded-2xl transition-all duration-300 ${riskStatus.colorClass}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">
              {riskStatus.level === "safe" ? "🟢" : riskStatus.level === "warning" ? "🟡" : "🔴"}
            </span>
            <div>
              <h3 className="text-sm font-bold tracking-wide uppercase">
                {simBufferMin >= 0 ? `${simBufferMin} MIN SAFETY BUFFER` : "NO SAFETY BUFFER"}
              </h3>
              <p className="text-xs opacity-90 mt-0.5">
                {simBufferMin >= 0
                  ? `Arrive ${simBufferMin} mins before reporting at ${milestones.reportingStr}`
                  : `Arriving late after reporting time (${milestones.reportingStr})`}
              </p>
            </div>
          </div>
          <span className="text-xs font-extrabold uppercase px-3 py-1 rounded-full border bg-black/40 backdrop-blur-md">
            {riskStatus.badgeText}
          </span>
        </div>
      </div>

      {/* 4. Visual 4-Step Journey Timeline */}
      <div className="card bg-glass p-5 rounded-2xl border border-white/10 space-y-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">
          Exam-Day Milestone Timeline
        </p>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gradient-to-b before:from-blue-500 before:via-emerald-500 to-rose-500">
          {/* Step 1: Leave Home */}
          <div className="relative flex items-start justify-between gap-3">
            <span className="absolute -left-6 top-0.5 h-5 w-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg shadow-blue-500/50">
              1
            </span>
            <div>
              <h4 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                🏠 Leave Home
              </h4>
              <p className="text-xs text-muted">Recommended departure for a smooth commute</p>
            </div>
            <span className="font-mono text-sm font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20 shrink-0">
              {milestones.safeDepStr}
            </span>
          </div>

          {/* Step 2: Estimated Arrival */}
          <div className="relative flex items-start justify-between gap-3">
            <span className="absolute -left-6 top-0.5 h-5 w-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg shadow-emerald-500/50">
              2
            </span>
            <div>
              <h4 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                🏁 Estimated Arrival
              </h4>
              <p className="text-xs text-muted">Approx. {baseTravelMin} mins travel from home</p>
            </div>
            <span className="font-mono text-sm font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 shrink-0">
              {predictedArrivalStr}
            </span>
          </div>

          {/* Step 3: Reporting Time */}
          <div className="relative flex items-start justify-between gap-3">
            <span className="absolute -left-6 top-0.5 h-5 w-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg shadow-amber-500/50">
              3
            </span>
            <div>
              <h4 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                📋 Reporting & Entry Opens
              </h4>
              <p className="text-xs text-muted">Document verification & biometric check-in</p>
            </div>
            <span className="font-mono text-sm font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 shrink-0">
              {milestones.reportingStr}
            </span>
          </div>

          {/* Step 4: Gate Closes (HARD DEADLINE) */}
          <div className="relative flex items-start justify-between gap-3 pt-2 border-t border-rose-500/20">
            <span className="absolute -left-6 top-2.5 h-5 w-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-lg shadow-rose-500/50">
              4
            </span>
            <div>
              <h4 className="text-sm font-extrabold text-rose-400 flex items-center gap-1.5">
                🚪 GATE CLOSES (HARD DEADLINE)
              </h4>
              <p className="text-xs text-rose-300/80 font-medium">
                ⛔ Do not cross this point. Gates strictly locked!
              </p>
            </div>
            <span className="font-mono text-sm font-extrabold text-rose-400 bg-rose-500/20 px-2.5 py-1 rounded-lg border border-rose-500/40 shrink-0">
              {milestones.gateClosingStr}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Interactive "What if I leave later?" Departure Slider */}
      <div className="card bg-glass/80 p-5 rounded-2xl border border-white/10 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            What if I leave at a different time?
          </p>
          {!isRecommended && (
            <button
              onClick={() => setSliderDepMin(recDepMin)}
              className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
            >
              🔄 Reset to Recommended ({milestones.safeDepStr})
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
            className="w-full h-2 bg-gradient-to-r from-blue-500 via-amber-500 to-rose-500 rounded-lg appearance-none cursor-pointer accent-accent"
          />
          <div className="flex justify-between text-[11px] text-muted font-mono mt-1.5">
            <span>{formatMinutesToTimeString(minSlider)}</span>
            <span className="text-accent font-bold">◄ Move Slider ►</span>
            <span>{formatMinutesToTimeString(maxSlider)} (Gate Closes)</span>
          </div>
        </div>

        {/* Human-Readable Advice Box */}
        <div className="bg-black/30 p-3.5 rounded-xl border border-white/5 text-xs text-text-primary leading-relaxed">
          <p>{riskStatus.advice}</p>
        </div>
      </div>
    </div>
  );
};

export default ChronosVisualization;
