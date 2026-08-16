import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { User } from "firebase/auth";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import Screen from "../components/Screen";
import { useCountdown } from "../hooks/useCountdown";
import { Camera, FileText, Clock, MapPin, ChevronRight, Sun, CloudSun, Hand } from "lucide-react";
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

function getTimeBasedGreeting(): { greeting: string; icon: React.ReactNode } {
  const hour = new Date().getHours();
  if (hour < 12) return { greeting: "Good morning", icon: <Sun className="w-4 h-4 text-amber-500 inline ml-1" /> };
  if (hour < 17) return { greeting: "Good afternoon", icon: <CloudSun className="w-4 h-4 text-amber-500 inline ml-1" /> };
  return { greeting: "Good evening", icon: <Hand className="w-4 h-4 text-amber-500 inline ml-1" /> };
}

// ---------- Component ----------
const Home: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const { greeting, icon: greetingIcon } = getTimeBasedGreeting();

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

  // OTHER EXAMS (Excludes nextExam to ensure NO DUPLICATES anywhere!)
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
          <div className="animate-spin h-10 w-10 border-4 border-accent/30 border-t-accent rounded-full" />
        </div>
      </Screen>
    );
  }

  // ---------- 1. No exams at all (First-time User) ----------
  if (exams.length === 0) {
    return (
      <Screen withNav>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-display font-bold text-xl text-text-primary tracking-tight flex items-center">
              {greeting}, {firstName} {greetingIcon}
            </h1>
            <p className="text-muted text-xs mt-0.5 font-medium">
              Your exam schedule is ready to be created.
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-accent-gradient flex items-center justify-center font-display font-bold text-white text-xs shrink-0 shadow-md">
            {initials}
          </div>
        </div>

        {/* Hero Card */}
        <div className="glass p-5 text-center animate-fadeInUp mb-4 border border-stroke rounded-2xl">
          <img
            src={studyImg}
            alt="Student studying"
            className="w-48 h-36 mx-auto object-contain mb-2"
          />
          <h2 className="font-display font-bold text-base text-text-primary mb-1">
            Your exam companion is ready
          </h2>
          <p className="text-muted text-xs leading-relaxed max-w-xs mx-auto">
            Scan your first admit card and we’ll automatically build your complete exam schedule.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => navigate("/upload")}
            className="glass overflow-hidden p-3.5 text-left hover:border-accent/50 border border-stroke/60 dark:border-white/10 rounded-2xl transition-all group"
          >
            <div className="h-8 w-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110 shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <p className="font-display font-semibold text-xs text-text-primary">Scan Admit Card</p>
            <p className="text-muted text-[10px] mt-0.5">Import in seconds</p>
          </button>
          <button
            onClick={() => navigate("/upload")}
            className="glass overflow-hidden p-3.5 text-left hover:border-accent/50 border border-stroke/60 dark:border-white/10 rounded-2xl transition-all group"
          >
            <div className="h-8 w-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <p className="font-display font-semibold text-xs text-text-primary">Upload Date Sheet</p>
            <p className="text-muted text-[10px] mt-0.5">Auto-create schedule</p>
          </button>
        </div>

        <p className="text-center text-[11px] text-muted mt-8">
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
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="font-display font-bold text-xl text-text-primary tracking-tight flex items-center">
              {greeting}, {firstName} {greetingIcon}
            </h1>
            <p className="text-muted text-xs mt-0.5 font-medium">
              You're all caught up! No upcoming exams.
            </p>
          </div>
          <div className="h-10 w-10 rounded-full bg-accent-gradient flex items-center justify-center font-display font-bold text-white text-xs shrink-0 shadow-md">
            {initials}
          </div>
        </div>

        <div className="glass p-6 text-center animate-fadeInUp mb-5 border border-stroke rounded-2xl">
          <img
            src={relaxingImg}
            alt="Student relaxing"
            className="w-40 h-40 mx-auto mb-3 object-contain"
          />
          <h2 className="font-display font-bold text-base text-text-primary mb-1">
            All caught up!
          </h2>
          <p className="text-muted text-xs leading-relaxed max-w-xs mx-auto">
            Take a break. We'll notify you when a new exam is scheduled.
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => navigate("/upload")}
            className="glass overflow-hidden p-3.5 text-left hover:border-accent/50 border border-stroke/60 dark:border-white/10 rounded-2xl transition-all group"
          >
            <div className="h-8 w-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110 shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <p className="font-display font-semibold text-xs text-text-primary">Scan Admit Card</p>
            <p className="text-muted text-[10px] mt-0.5">Import in seconds</p>
          </button>
          <button
            onClick={() => navigate("/upload")}
            className="glass overflow-hidden p-3.5 text-left hover:border-accent/50 border border-stroke/60 dark:border-white/10 rounded-2xl transition-all group"
          >
            <div className="h-8 w-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <p className="font-display font-semibold text-xs text-text-primary">Upload Date Sheet</p>
            <p className="text-muted text-[10px] mt-0.5">Auto-create schedule</p>
          </button>
        </div>

        {completed.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              Recently Completed
            </h2>
            <div className="space-y-2.5">
              {completed.slice(0, 3).map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => navigate(`/exam/${exam.id}`)}
                  className="w-full text-left glass p-3.5 rounded-xl border border-stroke/50 hover:border-accent/40 transition-all flex items-center justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-text-primary truncate">
                      {exam.exam_title || "Exam"}
                    </p>
                    <p className="text-muted text-xs">
                      {exam.exam_date ? formatDate(exam.exam_date) : ""}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
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
      {/* 1. HEADER */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary tracking-tight flex items-center">
            {greeting}, {firstName} {greetingIcon}
          </h1>
          <p className="text-muted text-xs mt-0.5 font-medium">
            Your exam schedule is looking good.
          </p>
        </div>
        <div className="h-10 w-10 rounded-full bg-accent-gradient flex items-center justify-center font-display font-bold text-white text-xs shrink-0 shadow-md">
          {initials}
        </div>
      </div>

      {/* 2. NEXT EXAM - PRIMARY HERO CARD */}
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-surface dark:from-amber-500/15 dark:via-orange-500/10 dark:to-transparent border border-orange-500/30 dark:border-orange-500/40 rounded-2xl p-5 mb-5 shadow-xl animate-fadeInUp">
        {/* Top Tag & Badge */}
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 bg-orange-500/15 dark:bg-orange-500/20 px-2.5 py-0.5 rounded-full border border-orange-500/30 tracking-wider">
            {relativeNextTag} • NEXT EXAM
          </span>
          <span className="text-xs text-muted font-medium">
            {formatDate(nextExam.exam_date!)}
          </span>
        </div>

        {/* Title */}
        <h2 className="font-display font-bold text-lg text-text-primary leading-snug mb-3">
          {nextExam.exam_title || "Upcoming Exam"}
        </h2>

        {/* Info Grid */}
        <div className="space-y-1.5 mb-4">
          {nextExam.reporting_time && (
            <div className="flex items-center gap-2 text-xs text-text-primary">
              <Clock className="h-4 w-4 text-orange-500 shrink-0" />
              <span>Reporting: <strong className="text-text-primary font-semibold">{nextExam.reporting_time}</strong></span>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted truncate">
            <MapPin className="h-4 w-4 text-orange-500 shrink-0" />
            <span className="truncate">{getCenterName(nextExam)}</span>
          </div>
        </div>

        {/* Integrated Countdown Box (Without Glowing Dot) */}
        {urgentCountdown && (
          <div className="bg-surface/90 border border-stroke dark:bg-black/40 dark:border-white/10 p-3 rounded-xl flex items-center justify-between gap-2 mb-4 shadow-sm">
            <div>
              <p className="text-[10px] uppercase font-bold text-muted tracking-wider">
                Time Until Departure
              </p>
              <p className="font-mono text-xl font-extrabold text-accent tracking-wider">
                {urgentCountdown}
              </p>
            </div>
          </div>
        )}

        {/* Primary Hero CTA */}
        <button
          onClick={() => navigate(`/exam/${nextExam.id}`)}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs py-2.5 rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
        >
          <span>View Exam Logistics</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 3. QUICK ACTIONS (Apple-Style Compact Tiles with Vector Icons) */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">
          Quick Actions
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/upload")}
            className="glass overflow-hidden p-3.5 text-left hover:border-accent/50 border border-stroke/60 dark:border-white/10 rounded-2xl transition-all group"
          >
            <div className="h-8 w-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110 shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <p className="font-display font-semibold text-xs text-text-primary">Scan Admit Card</p>
            <p className="text-muted text-[10px] mt-0.5">Import in seconds</p>
          </button>
          <button
            onClick={() => navigate("/upload")}
            className="glass overflow-hidden p-3.5 text-left hover:border-accent/50 border border-stroke/60 dark:border-white/10 rounded-2xl transition-all group"
          >
            <div className="h-8 w-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-2 transition-transform duration-300 group-hover:scale-110 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <p className="font-display font-semibold text-xs text-text-primary">Upload Date Sheet</p>
            <p className="text-muted text-[10px] mt-0.5">Auto schedule</p>
          </button>
        </div>
      </div>

      {/* 4. YOUR EXAMS SECTION (Excludes Next Exam - Zero Duplicates!) */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Your Exams
          </p>
          <span className="text-xs text-muted font-medium">
            {upcoming.length} total ({otherUpcoming.length} upcoming)
          </span>
        </div>

        {otherUpcoming.length > 0 ? (
          <div className="space-y-4">
            {Array.from(groupedOtherExams.entries()).map(([label, examGroup]) => (
              <div key={label} className="space-y-2">
                <p className="text-[11px] font-bold text-accent uppercase tracking-widest px-1">
                  {label}
                </p>
                <div className="space-y-2">
                  {examGroup.map((exam) => (
                    <button
                      key={exam.id}
                      onClick={() => navigate(`/exam/${exam.id}`)}
                      className="w-full text-left glass p-3.5 rounded-2xl border border-stroke/60 dark:border-white/10 hover:border-accent/40 transition-all flex items-center justify-between group"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <p className="font-display font-semibold text-sm text-text-primary truncate">
                          {exam.exam_title || "Upcoming Exam"}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-muted mt-1">
                          {exam.exam_date && <span>{formatDate(exam.exam_date)}</span>}
                          {exam.reporting_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-muted" /> {exam.reporting_time}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted truncate mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-muted shrink-0" /> {getCenterName(exam)}
                        </p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass p-4 rounded-2xl border border-stroke/50 text-center text-xs text-muted">
            No additional upcoming exams scheduled.
          </div>
        )}
      </div>

      {/* 5. RECENTLY COMPLETED EXAMS */}
      {completed.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2.5">
            Recently Completed
          </p>
          <div className="space-y-2">
            {completed.slice(0, 3).map((exam) => (
              <button
                key={exam.id}
                onClick={() => navigate(`/exam/${exam.id}`)}
                className="w-full text-left glass p-3 rounded-xl border border-stroke/50 hover:border-accent/40 transition-all flex items-center justify-between"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <p className="font-medium text-xs text-text-primary truncate">
                    {exam.exam_title || "Completed Exam"}
                  </p>
                  <p className="text-muted text-[11px]">
                    {exam.exam_date ? formatDate(exam.exam_date) : ""}
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
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