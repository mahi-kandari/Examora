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
          <div className="animate-spin h-10 w-10 border-4 border-blue-500/30 border-t-blue-600 rounded-full" />
        </div>
      </Screen>
    );
  }

  // ---------- 1. No exams at all (First-time User) ----------
  if (exams.length === 0) {
    return (
      <Screen withNav>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
              {greeting}, {firstName} {emoji}
            </h1>
            <p className="text-muted text-xs mt-1 font-medium">
              Your exam schedule is ready to be created.
            </p>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-display font-bold text-white text-xs shrink-0 shadow-lg shadow-blue-500/25">
            {initials}
          </div>
        </div>

        {/* Hero Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-surface border border-stroke p-6 text-center mb-5 rounded-3xl shadow-xl"
        >
          <img
            src={studyImg}
            alt="Student studying"
            className="w-48 h-36 mx-auto object-contain mb-3"
          />
          <h2 className="font-display font-extrabold text-lg text-text-primary mb-1">
            Your exam companion is ready
          </h2>
          <p className="text-muted text-xs leading-relaxed max-w-xs mx-auto">
            Scan your first admit card and we’ll automatically build your complete exam schedule.
          </p>
        </motion.div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3.5 mb-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card bg-surface border border-stroke p-4 text-left rounded-3xl transition-all shadow-md group flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display font-bold text-sm text-text-primary">Scan Admit Card</p>
              <p className="text-muted text-[11px] mt-0.5 font-medium">Import in seconds</p>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card bg-surface border border-stroke p-4 text-left rounded-3xl transition-all shadow-md group flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display font-bold text-sm text-text-primary">Upload Date Sheet</p>
              <p className="text-muted text-[11px] mt-0.5 font-medium">Auto-create schedule</p>
            </div>
          </motion.button>
        </div>

        <p className="text-center text-xs text-muted mt-8 font-medium">
          Helping students stay exam-ready.
        </p>
      </Screen>
    );
  }

  // ---------- 2. Exams exist, but no upcoming exams ----------
  if (upcoming.length === 0) {
    return (
      <Screen withNav>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight">
              {greeting}, {firstName} {emoji}
            </h1>
            <p className="text-muted text-xs mt-1 font-medium">
              You're all caught up! No upcoming exams.
            </p>
          </div>
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-display font-bold text-white text-xs shrink-0 shadow-lg shadow-blue-500/25">
            {initials}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="card bg-surface border border-stroke p-6 text-center mb-5 rounded-3xl shadow-xl"
        >
          <img
            src={relaxingImg}
            alt="Student relaxing"
            className="w-40 h-40 mx-auto mb-3 object-contain"
          />
          <h2 className="font-display font-extrabold text-lg text-text-primary mb-1">
            All caught up!
          </h2>
          <p className="text-muted text-xs leading-relaxed max-w-xs mx-auto">
            Take a break. We'll notify you when a new exam is scheduled.
          </p>
        </motion.div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3.5 mb-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card bg-surface border border-stroke p-4 text-left rounded-3xl transition-all shadow-md group flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display font-bold text-sm text-text-primary">Scan Admit Card</p>
              <p className="text-muted text-[11px] mt-0.5 font-medium">Import in seconds</p>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card bg-surface border border-stroke p-4 text-left rounded-3xl transition-all shadow-md group flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display font-bold text-sm text-text-primary">Upload Date Sheet</p>
              <p className="text-muted text-[11px] mt-0.5 font-medium">Auto-create schedule</p>
            </div>
          </motion.button>
        </div>

        {completed.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
              Recently Completed
            </p>
            <div className="space-y-2.5">
              {completed.slice(0, 3).map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => navigate(`/exam/${exam.id}`)}
                  className="w-full text-left card bg-surface border border-stroke p-3.5 rounded-2xl hover:border-blue-500/40 transition-all flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-text-primary truncate">
                      {exam.exam_title || "Exam"}
                    </p>
                    <p className="text-muted text-xs font-medium">
                      {exam.exam_date ? formatDate(exam.exam_date) : ""}
                    </p>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20 shrink-0">
                    Completed
                  </span>
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
      {/* 1. HEADER (EverSync Dribbble Style Header) */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-extrabold text-2xl text-text-primary tracking-tight flex items-center gap-2">
            <span>Let's organize your</span>
            <span className="px-3 py-0.5 bg-blue-600 text-white rounded-xl font-bold shadow-md shadow-blue-500/30 inline-block">
              {upcoming.length} {upcoming.length === 1 ? "exam" : "exams"}
            </span>
            <span>today!</span>
          </h1>
          <p className="text-muted text-xs mt-1 font-medium">
            Your exam schedule is looking good.
          </p>
        </div>
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center font-display font-bold text-white text-xs shrink-0 shadow-lg shadow-blue-500/25">
          {initials}
        </div>
      </div>

      {/* 2. NEXT EXAM - PRIMARY HERO CARD (EverSync Hero Card Style) */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden card bg-surface border border-blue-500/20 dark:border-blue-500/30 p-5 mb-6 rounded-3xl shadow-xl"
      >
        {/* Top Tag & Badge */}
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 tracking-wider">
            <Zap className="w-3 h-3 fill-current" />
            {relativeNextTag} • NEXT EXAM
          </span>
          <span className="text-xs text-muted font-bold font-mono">
            {formatDate(nextExam.exam_date!)}
          </span>
        </div>

        {/* Title */}
        <h2 className="font-display font-extrabold text-lg text-text-primary leading-snug mb-3.5">
          {nextExam.exam_title || "Upcoming Exam"}
        </h2>

        {/* Info Grid */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          {nextExam.reporting_time && (
            <div className="inline-flex items-center gap-1.5 text-xs text-text-primary font-medium bg-surface border border-stroke px-3 py-1.5 rounded-xl shadow-xs">
              <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Reporting: <strong className="font-bold">{nextExam.reporting_time}</strong></span>
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 text-xs text-muted font-medium bg-surface border border-stroke px-3 py-1.5 rounded-xl shadow-xs truncate max-w-full">
            <MapPin className="h-3.5 w-3.5 text-red-500 shrink-0" />
            <span className="truncate">{getCenterName(nextExam)}</span>
          </div>
        </div>

        {/* Integrated Countdown Box (EverSync Pill Display) */}
        {urgentCountdown && (
          <div className="bg-slate-900 text-white dark:bg-slate-800/90 p-3.5 rounded-2xl border border-slate-700 flex items-center justify-between gap-2 mb-4 shadow-inner">
            <div>
              <p className="text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">
                Time Until Departure
              </p>
              <p className="font-mono text-xl font-extrabold text-blue-400 tracking-wider">
                {urgentCountdown}
              </p>
            </div>
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-ping shrink-0" />
          </div>
        )}

        {/* Primary Hero CTA Pill Button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => navigate(`/exam/${nextExam.id}`)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3.5 px-5 rounded-full shadow-lg shadow-blue-500/30 transition-all flex items-center justify-between"
        >
          <span>View Exam Logistics</span>
          <div className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <ArrowRight className="h-4 w-4 text-white" />
          </div>
        </motion.button>
      </motion.div>

      {/* 3. QUICK ACTIONS (EverSync Style 2-Column Action Cards) */}
      <div className="mb-6">
        <p className="text-xs font-extrabold text-muted uppercase tracking-wider mb-3">
          Quick Actions
        </p>
        <div className="grid grid-cols-2 gap-3.5">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card bg-surface border border-stroke p-4 text-left rounded-3xl transition-all shadow-md group flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display font-bold text-sm text-text-primary">Scan Admit Card</p>
              <p className="text-muted text-[11px] mt-0.5 font-medium">Import in seconds</p>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate("/upload")}
            className="card bg-surface border border-stroke p-4 text-left rounded-3xl transition-all shadow-md group flex flex-col justify-between"
          >
            <div className="h-10 w-10 rounded-2xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <p className="font-display font-bold text-sm text-text-primary">Upload Date Sheet</p>
              <p className="text-muted text-[11px] mt-0.5 font-medium">Auto-create schedule</p>
            </div>
          </motion.button>
        </div>
      </div>

      {/* 4. YOUR EXAMS SECTION (Excludes Next Exam - ZERO DUPLICATES!) */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-extrabold text-muted uppercase tracking-wider">
            Your Exams
          </p>
          <span className="text-xs text-muted font-bold bg-surface border border-stroke px-2.5 py-0.5 rounded-full">
            {upcoming.length} total ({otherUpcoming.length} upcoming)
          </span>
        </div>

        {otherUpcoming.length > 0 ? (
          <div className="space-y-4">
            {Array.from(groupedOtherExams.entries()).map(([label, examGroup]) => (
              <div key={label} className="space-y-2.5">
                <p className="text-[11px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest px-1">
                  {label}
                </p>
                <div className="space-y-2.5">
                  {examGroup.map((exam) => (
                    <motion.button
                      key={exam.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => navigate(`/exam/${exam.id}`)}
                      className="w-full text-left card bg-surface border border-stroke p-4 rounded-3xl hover:border-blue-500/40 transition-all flex items-center justify-between shadow-md group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-2">
                        <div className="h-10 w-10 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 flex items-center justify-center shrink-0">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-display font-bold text-sm text-text-primary truncate">
                            {exam.exam_title || "Upcoming Exam"}
                          </p>
                          <div className="flex items-center gap-2.5 text-xs text-muted mt-0.5 font-medium">
                            {exam.exam_date && <span>{formatDate(exam.exam_date)}</span>}
                            {exam.reporting_time && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-blue-500" />
                                {exam.reporting_time}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted truncate mt-0.5 flex items-center gap-1 font-medium">
                            <MapPin className="w-3 h-3 text-red-500 shrink-0" />
                            <span className="truncate">{getCenterName(exam)}</span>
                          </p>
                        </div>
                      </div>
                      <div className="h-8 w-8 rounded-full bg-stroke/30 dark:bg-white/10 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-all shrink-0">
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card bg-surface border border-stroke p-4 rounded-3xl text-center text-xs text-muted font-medium">
            No additional upcoming exams scheduled.
          </div>
        )}
      </div>

      {/* 5. RECENTLY COMPLETED EXAMS */}
      {completed.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-extrabold text-muted uppercase tracking-wider mb-2.5">
            Recently Completed
          </p>
          <div className="space-y-2">
            {completed.slice(0, 3).map((exam) => (
              <button
                key={exam.id}
                onClick={() => navigate(`/exam/${exam.id}`)}
                className="w-full text-left card bg-surface border border-stroke p-3.5 rounded-2xl hover:border-blue-500/40 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-text-primary truncate">
                      {exam.exam_title || "Completed Exam"}
                    </p>
                    <p className="text-muted text-[11px] font-medium">
                      {exam.exam_date ? formatDate(exam.exam_date) : ""}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                  Completed
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Screen>
  );
};

export default Home;