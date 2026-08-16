import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { User } from "firebase/auth";
import { motion } from "framer-motion";
import {
  QrCode,
  FileText,
  Calendar,
  MapPin,
  Clock,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Zap,
} from "lucide-react";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import Screen from "../components/Screen";
import { useCountdown } from "../hooks/useCountdown";
import relaxingImg from "../assets/relaxing.webp";
import studyImg from "../assets/study.png";

// ---------- Types ----------
interface ExamRecord {
  id: string;
  exam_title?: string;
  exam_date?: string;
  reporting_time?: string;
  safe_departure_time?: string;
  center_name?: string;
  center?: string;
  upload_timestamp?: string;
}

// ---------- Helpers ----------
function getCenterName(exam: ExamRecord): string {
  if (exam.center_name && exam.center_name.trim().length > 0) return exam.center_name.trim();
  if (exam.center && typeof exam.center === "string") {
    const parts = exam.center.split(",");
    if (parts.length > 0) return parts[0].trim();
    return exam.center.trim();
  }
  return "Exam Centre";
}

function isExamCompleted(dateIso: string): boolean {
  if (!dateIso) return false;
  const examDate = new Date(dateIso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  examDate.setHours(0, 0, 0, 0);
  return examDate < today;
}

function daysUntil(dateIso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateIso);
  target.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

function formatDate(dateIso: string) {
  if (!dateIso) return "";
  return new Date(dateIso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getRelativeTimeLabel(dateIso: string): string {
  if (!dateIso) return "UPCOMING";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(dateIso);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "TODAY";
  if (diffDays === 1) return "TOMORROW";
  if (diffDays <= 7) return "THIS WEEK";
  if (diffDays <= 14) return "NEXT WEEK";

  return target.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();
}

function getTimeBasedGreeting(): { greeting: string; emoji: string } {
  const hour = new Date().getHours();
  if (hour < 12) return { greeting: "Good morning", emoji: "☀️" };
  if (hour < 17) return { greeting: "Good afternoon", emoji: "🌤️" };
  return { greeting: "Good evening", emoji: "👋" };
}

// ---------- Component ----------
const Home: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const { greeting, emoji } = getTimeBasedGreeting();

  useEffect(() => {
    if (!user) return;
    const uid = (user as User).uid;

    const fetchExams = async () => {
      try {
        const q = query(
          collection(db, "exams"),
          where("userId", "==", uid),
          orderBy("exam_date", "asc")
        );
        const snapshot = await getDocs(q);
        const examList: ExamRecord[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setExams(examList);
      } catch (err) {
        console.error("Failed to load exams:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchExams();
  }, [user]);

  // Chronologically sorted upcoming exams
  const upcoming = useMemo(() => {
    return exams
      .filter((e) => e.exam_date && !isExamCompleted(e.exam_date))
      .sort((a, b) => new Date(a.exam_date!).getTime() - new Date(b.exam_date!).getTime());
  }, [exams]);

  // Completed exams
  const completed = useMemo(() => {
    return exams
      .filter((e) => e.exam_date && isExamCompleted(e.exam_date))
      .sort((a, b) => new Date(b.exam_date!).getTime() - new Date(a.exam_date!).getTime());
  }, [exams]);

  // NEXT EXAM (Single top upcoming exam ONLY)
  const nextExam = upcoming[0];

  // OTHER EXAMS (Excludes nextExam to ensure ZERO DUPLICATES anywhere!)
  const otherUpcoming = useMemo(() => {
    if (!nextExam) return [];
    return upcoming.filter((e) => e.id !== nextExam.id);
  }, [upcoming, nextExam]);

  // Group remaining exams by relative time label
  const groupedOtherExams = useMemo(() => {
    const map = new Map<string, ExamRecord[]>();
    otherUpcoming.forEach((exam) => {
      const label = getRelativeTimeLabel(exam.exam_date!);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(exam);
    });
    return map;
  }, [otherUpcoming]);

  // Live countdown for Next Exam Hero
  const urgentCountdown = useCountdown(
    nextExam?.exam_date,
    nextExam?.safe_departure_time || nextExam?.reporting_time
  );

  const userName = (user as User)?.displayName || (user as User)?.email || "User";
  const firstName = userName.split(" ")[0];
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  if (loading) {
    return (
      <Screen withNav>
        <div className="flex justify-center mt-16">
          <div className="animate-spin h-8 w-8 border-2 border-[#5E6AD2]/30 border-t-[#5E6AD2] rounded-full" />
        </div>
      </Screen>
    );
  }

  // ---------- 1. No exams at all ----------
  if (exams.length === 0) {
    return (
      <Screen withNav>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-semibold text-xl sm:text-2xl text-gradient tracking-tight leading-snug">
              {greeting}, {firstName} {emoji}
            </h1>
            <p className="text-[#8A8F98] text-xs mt-1 font-normal">
              Your exam schedule is ready to be created.
            </p>
          </div>
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-[#5E6AD2]/20 border border-[#5E6AD2]/30 flex items-center justify-center font-display font-semibold text-white text-xs shrink-0 shadow-[0_0_15px_rgba(94,106,210,0.25)]">
            {initials}
          </div>
        </div>

        {/* Hero Empty State Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="card-linear p-6 text-center mb-6"
        >
          <img
            src={studyImg}
            alt="Student studying"
            className="w-44 h-36 mx-auto object-contain mb-3 opacity-90"
          />
          <h2 className="font-display font-semibold text-base text-[#EDEDEF] mb-1">
            Your exam companion is ready
          </h2>
          <p className="text-[#8A8F98] text-xs leading-relaxed max-w-xs mx-auto">
            Scan your first admit card to automatically extract schedule, logistics, and countdowns.
          </p>
        </motion.div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3.5 mb-6">
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card-linear p-4 text-left group flex flex-col justify-between"
          >
            <div className="h-9 w-9 rounded-lg bg-[#5E6AD2]/15 border border-[#5E6AD2]/30 text-[#818CF8] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <p className="font-display font-semibold text-xs text-[#EDEDEF]">Scan Admit Card</p>
              <p className="text-[#8A8F98] text-[11px] mt-0.5 font-normal">Import in seconds</p>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card-linear p-4 text-left group flex flex-col justify-between"
          >
            <div className="h-9 w-9 rounded-lg bg-[#5E6AD2]/15 border border-[#5E6AD2]/30 text-[#818CF8] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="font-display font-semibold text-xs text-[#EDEDEF]">Upload Date Sheet</p>
              <p className="text-[#8A8F98] text-[11px] mt-0.5 font-normal">Auto-create schedule</p>
            </div>
          </motion.button>
        </div>

        <p className="text-center text-[11px] text-[#8A8F98] font-mono tracking-wider uppercase mt-8">
          Precision Exam Assistant
        </p>
      </Screen>
    );
  }

  // ---------- 2. Exams exist, but no upcoming exams ----------
  if (upcoming.length === 0) {
    return (
      <Screen withNav>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-semibold text-xl sm:text-2xl text-gradient tracking-tight leading-snug">
              {greeting}, {firstName} {emoji}
            </h1>
            <p className="text-[#8A8F98] text-xs mt-1 font-normal">
              You're all caught up! No upcoming exams.
            </p>
          </div>
          <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-[#5E6AD2]/20 border border-[#5E6AD2]/30 flex items-center justify-center font-display font-semibold text-white text-xs shrink-0 shadow-[0_0_15px_rgba(94,106,210,0.25)]">
            {initials}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="card-linear p-6 text-center mb-6"
        >
          <img
            src={relaxingImg}
            alt="Student relaxing"
            className="w-36 h-36 mx-auto mb-3 object-contain opacity-90"
          />
          <h2 className="font-display font-semibold text-base text-[#EDEDEF] mb-1">
            All caught up!
          </h2>
          <p className="text-[#8A8F98] text-xs leading-relaxed max-w-xs mx-auto">
            Take a break. We'll notify you when a new exam is scheduled.
          </p>
        </motion.div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3.5 mb-6">
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card-linear p-4 text-left group flex flex-col justify-between"
          >
            <div className="h-9 w-9 rounded-lg bg-[#5E6AD2]/15 border border-[#5E6AD2]/30 text-[#818CF8] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <p className="font-display font-semibold text-xs text-[#EDEDEF]">Scan Admit Card</p>
              <p className="text-[#8A8F98] text-[11px] mt-0.5 font-normal">Import in seconds</p>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card-linear p-4 text-left group flex flex-col justify-between"
          >
            <div className="h-9 w-9 rounded-lg bg-[#5E6AD2]/15 border border-[#5E6AD2]/30 text-[#818CF8] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="font-display font-semibold text-xs text-[#EDEDEF]">Upload Date Sheet</p>
              <p className="text-[#8A8F98] text-[11px] mt-0.5 font-normal">Auto-create schedule</p>
            </div>
          </motion.button>
        </div>

        {completed.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-[#8A8F98] uppercase tracking-wider mb-3">
              Recently Completed
            </p>
            <div className="space-y-2.5">
              {completed.slice(0, 3).map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => navigate(`/exam/${exam.id}`)}
                  className="w-full text-left card-linear p-3.5 flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs text-[#EDEDEF] truncate">
                      {exam.exam_title || "Exam"}
                    </p>
                    <p className="text-[#8A8F98] text-[11px] font-normal">
                      {exam.exam_date ? formatDate(exam.exam_date) : ""}
                    </p>
                  </div>
                  <span className="badge-linear">Completed</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Screen>
    );
  }

  // ---------- 3. Upcoming Exams Exist ----------
  const daysUntilNext = daysUntil(nextExam.exam_date!);
  const relativeNextTag =
    daysUntilNext === 0
      ? "TODAY"
      : daysUntilNext === 1
      ? "TOMORROW"
      : getRelativeTimeLabel(nextExam.exam_date!);

  return (
    <Screen withNav>
      {/* 1. HEADER (Linear Gradient Header) */}
      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-semibold text-xl sm:text-2xl text-gradient tracking-tight leading-snug">
            Let's organize your{" "}
            <span className="inline-flex items-center px-2.5 py-0.5 bg-[#5E6AD2] text-white rounded-md font-semibold text-xs sm:text-sm shadow-[0_0_12px_rgba(94,106,210,0.4)] align-middle">
              {upcoming.length} {upcoming.length === 1 ? "exam" : "exams"}
            </span>{" "}
            today!
          </h1>
          <p className="text-[#8A8F98] text-xs mt-1 font-normal">
            Your exam schedule is optimized and ready.
          </p>
        </div>
        <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-xl bg-[#5E6AD2]/20 border border-[#5E6AD2]/30 flex items-center justify-center font-display font-semibold text-white text-xs shrink-0 shadow-[0_0_16px_rgba(94,106,210,0.3)]">
          {initials}
        </div>
      </div>

      {/* 2. NEXT EXAM - PRIMARY HERO CARD (Linear Card Style) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="card-linear p-5 mb-6 border-[#5E6AD2]/30 relative overflow-hidden"
      >
        {/* Top Tag & Badge */}
        <div className="flex items-center justify-between mb-3">
          <span className="badge-linear">
            <Zap className="w-3 h-3 mr-1 fill-current" />
            {relativeNextTag} • NEXT EXAM
          </span>
          <span className="text-[11px] text-[#8A8F98] font-mono">
            {formatDate(nextExam.exam_date!)}
          </span>
        </div>

        {/* Title */}
        <h2 className="font-display font-semibold text-base sm:text-lg text-[#EDEDEF] leading-snug mb-3.5">
          {nextExam.exam_title || "Upcoming Exam"}
        </h2>

        {/* Info Grid */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          {nextExam.reporting_time && (
            <div className="inline-flex items-center gap-1.5 text-xs text-[#EDEDEF] bg-white/[0.04] border border-white/[0.06] px-3 py-1.5 rounded-lg">
              <Clock className="h-3.5 w-3.5 text-[#818CF8] shrink-0" />
              <span>Reporting: <strong className="font-semibold text-white">{nextExam.reporting_time}</strong></span>
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 text-xs text-[#8A8F98] bg-white/[0.04] border border-white/[0.06] px-3 py-1.5 rounded-lg truncate max-w-full">
            <MapPin className="h-3.5 w-3.5 text-[#5E6AD2] shrink-0" />
            <span className="truncate">{getCenterName(nextExam)}</span>
          </div>
        </div>

        {/* Integrated Countdown Box (Linear Dark Display) */}
        {urgentCountdown && (
          <div className="bg-[#020203]/90 border border-white/[0.06] p-3.5 rounded-xl flex items-center justify-between gap-2 mb-4">
            <div>
              <p className="text-[10px] uppercase font-mono text-[#8A8F98] tracking-widest">
                Time Until Departure
              </p>
              <p className="font-mono text-lg font-bold text-[#818CF8] tracking-wider">
                {urgentCountdown}
              </p>
            </div>
            <span className="h-2 w-2 rounded-full bg-[#5E6AD2] animate-ping shrink-0" />
          </div>
        )}

        {/* Primary Hero CTA Pill Button */}
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate(`/exam/${nextExam.id}`)}
          className="btn-linear-primary w-full text-xs py-3 px-4 flex items-center justify-between"
        >
          <span>View Exam Logistics</span>
          <div className="h-6 w-6 rounded-md bg-white/20 flex items-center justify-center shrink-0">
            <ArrowRight className="h-3.5 w-3.5 text-white" />
          </div>
        </motion.button>
      </motion.div>

      {/* 3. QUICK ACTIONS */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-[#8A8F98] uppercase tracking-wider mb-3">
          Quick Actions
        </p>
        <div className="grid grid-cols-2 gap-3.5">
          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card-linear p-4 text-left group flex flex-col justify-between"
          >
            <div className="h-9 w-9 rounded-lg bg-[#5E6AD2]/15 border border-[#5E6AD2]/30 text-[#818CF8] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shrink-0">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <p className="font-display font-semibold text-xs text-[#EDEDEF]">Scan Admit Card</p>
              <p className="text-[#8A8F98] text-[11px] mt-0.5 font-normal">Import in seconds</p>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card-linear p-4 text-left group flex flex-col justify-between"
          >
            <div className="h-9 w-9 rounded-lg bg-[#5E6AD2]/15 border border-[#5E6AD2]/30 text-[#818CF8] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="font-display font-semibold text-xs text-[#EDEDEF]">Upload Date Sheet</p>
              <p className="text-[#8A8F98] text-[11px] mt-0.5 font-normal">Auto-create schedule</p>
            </div>
          </motion.button>
        </div>
      </div>

      {/* 4. YOUR EXAMS SECTION */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-[#8A8F98] uppercase tracking-wider">
            Your Exams
          </p>
          <span className="text-[11px] text-[#8A8F98] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
            {upcoming.length} total
          </span>
        </div>

        {otherUpcoming.length > 0 ? (
          <div className="space-y-4">
            {Array.from(groupedOtherExams.entries()).map(([label, examGroup]) => (
              <div key={label} className="space-y-2.5">
                <p className="text-[10px] font-mono text-[#818CF8] uppercase tracking-widest px-1">
                  {label}
                </p>
                <div className="space-y-2.5">
                  {examGroup.map((exam) => (
                    <motion.button
                      key={exam.id}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => navigate(`/exam/${exam.id}`)}
                      className="w-full text-left card-linear p-4 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        <div className="h-9 w-9 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[#818CF8] flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs text-[#EDEDEF] truncate">
                            {exam.exam_title || "Upcoming Exam"}
                          </p>
                          <div className="flex items-center gap-2.5 text-[11px] text-[#8A8F98] mt-0.5">
                            {exam.exam_date && <span>{formatDate(exam.exam_date)}</span>}
                            {exam.reporting_time && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-[#5E6AD2]" />
                                {exam.reporting_time}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#8A8F98] truncate mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#5E6AD2] shrink-0" />
                            <span className="truncate">{getCenterName(exam)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="h-7 w-7 rounded-md bg-white/[0.04] flex items-center justify-center group-hover:bg-[#5E6AD2] group-hover:text-white transition-all shrink-0">
                        <ChevronRight className="h-3.5 w-3.5 text-[#8A8F98] group-hover:text-white" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card-linear p-4 text-center text-xs text-[#8A8F98] font-normal">
            No additional upcoming exams scheduled.
          </div>
        )}
      </div>

      {/* 5. RECENTLY COMPLETED EXAMS */}
      {completed.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-[#8A8F98] uppercase tracking-wider mb-2.5">
            Recently Completed
          </p>
          <div className="space-y-2">
            {completed.slice(0, 3).map((exam) => (
              <button
                key={exam.id}
                onClick={() => navigate(`/exam/${exam.id}`)}
                className="w-full text-left card-linear p-3.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs text-[#EDEDEF] truncate">
                      {exam.exam_title || "Completed Exam"}
                    </p>
                    <p className="text-[#8A8F98] text-[11px] font-normal">
                      {exam.exam_date ? formatDate(exam.exam_date) : ""}
                    </p>
                  </div>
                </div>
                <span className="badge-linear">Completed</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Screen>
  );
};

export default Home;