import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { User } from "firebase/auth";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import Screen from "../components/Screen";
import { useCountdown } from "../hooks/useCountdown";
import { MapPinIcon, ClockIcon } from "@heroicons/react/24/outline";
import relaxingImg from "../assets/relaxing.webp";
import studyImg from "../assets/study.png";          // ← study illustration

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
  const target = new Date(dateIso);
  const diff = Math.ceil(
    (target.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
  );
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

function getTimeBasedGreeting(): {
  greeting: string;
  question: string;
  emoji: string;
} {
  const hour = new Date().getHours();
  if (hour < 12) {
    return { greeting: "Good Morning", question: "Let's make today count.", emoji: "☀️" };
  } else if (hour < 17) {
    return { greeting: "Good Afternoon", question: "Stay focused, you’re doing great.", emoji: "🌤️" };
  } else {
    return { greeting: "Good Evening", question: "Ready for your next exam?", emoji: "👋" };
  }
}

function getBorderColor(dateIso: string): string {
  const days = daysUntil(dateIso);
  if (days === 0) return "border-l-red-500";
  if (days === 1) return "border-l-orange-400";
  return "border-l-blue-500";
}

// ---------- Progress Ring ----------
const RADIUS = 30;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ProgressRing: React.FC<{ daysLeft: number; totalWindow?: number }> = ({
  daysLeft,
  totalWindow = 30,
}) => {
  const clamped = Math.max(0, Math.min(daysLeft, totalWindow));
  const progress = 1 - clamped / totalWindow;
  const offset = CIRCUMFERENCE * (1 - progress);

  return (
    <svg width="76" height="76" viewBox="0 0 76 76" className="shrink-0 -rotate-90">
      <circle cx="38" cy="38" r={RADIUS} fill="none" stroke="hsl(var(--stroke) / 0.3)" strokeWidth="6" />
      <circle
        cx="38"
        cy="38"
        r={RADIUS}
        fill="none"
        stroke="hsl(var(--accent))"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x="38"
        y="42"
        textAnchor="middle"
        transform="rotate(90 38 38)"
        className="fill-text-primary font-display font-semibold"
        fontSize="20"
      >
        {daysLeft}
      </text>
    </svg>
  );
};

// ---------- Component ----------
const Home: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const { greeting, emoji } = getTimeBasedGreeting();
  const newUserQuestion = "Let's get your exam schedule ready.";

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

  const upcoming = exams.filter((e) => e.exam_date && !isExamCompleted(e.exam_date));
  const completed = exams
    .filter((e) => e.exam_date && isExamCompleted(e.exam_date))
    .sort((a, b) => {
      const dateA = a.exam_date ? new Date(a.exam_date).getTime() : 0;
      const dateB = b.exam_date ? new Date(b.exam_date).getTime() : 0;
      return dateB - dateA;
    });

  const nextExam = upcoming[0];
  // Live countdown for the urgent banner — counts down to the departure time
  // (or reporting time) on the exam day, using the same logic as Success.
  const urgentCountdown = useCountdown(
    nextExam?.exam_date,
    nextExam?.safe_departure_time || nextExam?.reporting_time
  );

  const userName = (user as User)?.displayName || (user as User)?.email || "User";
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

  // ---------- 1. No exams at all (first‑time user) ----------
  if (exams.length === 0) {
    return (
      <Screen withNav>
        {/* Greeting + avatar */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-display font-semibold text-2xl text-text-primary">
              {greeting}, {userName.split(" ")[0]} {emoji}
            </h1>
            <p className="text-muted text-sm mt-1">{newUserQuestion}</p>
          </div>
          <div className="h-12 w-12 rounded-full bg-accent-gradient flex items-center justify-center font-display font-semibold text-white text-sm shrink-0">
            {initials}
          </div>
        </div>

        {/* Hero card with study illustration */}
        <div className="glass p-4 text-center animate-fadeInUp mb-3">
          <img
            src={studyImg}
            alt="Student studying"
            className="w-60 h-45 mx-auto object-contain"
          />
          <h2 className="font-display font-semibold text-lg text-text-primary mb-2">
            Your exam companion is ready
          </h2>
          <p className="text-muted text-sm leading-relaxed">
            Scan your first admit card and we’ll automatically create your complete exam schedule.
          </p>
        </div>

        {/* Why students use Examora */}
        <div className="grid grid-cols-1 gap-3 mb-6">
          <div className="glass p-4 flex items-start gap-3 animate-fadeInUp">
            <div className="text-2xl shrink-0">📄</div>
            <div>
              <p className="font-medium text-sm text-text-primary">Auto‑import exams</p>
              <p className="text-muted text-xs mt-0.5">Never type dates manually.</p>
            </div>
          </div>
          <div className="glass p-4 flex items-start gap-3 animate-fadeInUp">
            <div className="text-2xl shrink-0">🔔</div>
            <div>
              <p className="font-medium text-sm text-text-primary">Smart reminders</p>
              <p className="text-muted text-xs mt-0.5">Stay prepared before every exam.</p>
            </div>
          </div>
          <div className="glass p-4 flex items-start gap-3 animate-fadeInUp">
            <div className="text-2xl shrink-0">📍</div>
            <div>
              <p className="font-medium text-sm text-text-primary">Admit cards in one place</p>
              <p className="text-muted text-xs mt-0.5">Everything you need on exam day.</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <button onClick={() => navigate("/upload")} className="btn-primary w-full">
          Get Started
        </button>

        <p className="text-center text-xs italics text-muted mt-8 ">
          Helping students stay exam-ready.
        </p>
      </Screen>
    );
  }

  // ---------- 2. Exams exist, but no upcoming exams ----------
  if (upcoming.length === 0) {
    return (
      <Screen withNav>
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display font-semibold text-2xl text-text-primary">
              {greeting}, {userName.split(" ")[0]} {emoji}
            </h1>
            <p className="text-muted text-sm mt-1">{newUserQuestion}</p>
          </div>
          <div className="h-12 w-12 rounded-full bg-accent-gradient flex items-center justify-center font-display font-semibold text-white text-sm shrink-0">
            {initials}
          </div>
        </div>

        <div className="glass p-8 text-center animate-fadeInUp mb-6">
          <img
            src={relaxingImg}
            alt="Student relaxing"
            className="w-50 h-50 mx-auto mb-5 object-contain"
          />
          <h2 className="font-display font-semibold text-lg text-text-primary mb-2">
            You're all caught up!
          </h2>
          <p className="text-muted text-sm leading-relaxed">
            Take a break. We'll notify you when a new exam appears.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => navigate("/upload")}
            className="glass p-5 text-left hover:border-accent/40 border border-transparent transition-colors animate-fadeInUp"
          >
            <div className="text-2xl mb-3">📷</div>
            <p className="font-display font-medium text-sm text-text-primary">Scan Admit Card</p>
            <p className="text-muted text-xs mt-1">Import exam in 10 sec</p>
          </button>
          <button
            onClick={() => navigate("/upload")}
            className="glass p-5 text-left hover:border-accent/40 border border-transparent transition-colors animate-fadeInUp"
          >
            <div className="text-2xl mb-3">📄</div>
            <p className="font-display font-medium text-sm text-text-primary">Upload Date Sheet</p>
            <p className="text-muted text-xs mt-1">Auto-create your schedule</p>
          </button>
        </div>

        {completed.length > 0 && (
          <div className="mb-6">
            <h2 className="font-display font-semibold text-sm text-text-primary mb-3 uppercase tracking-wide">
              Recently completed
            </h2>
            <div className="space-y-3">
              {completed.slice(0, 3).map((exam) => (
                <button
                  key={exam.id}
                  onClick={() => navigate(`/exam/${exam.id}`)}
                  className="w-full text-left glass p-4 animate-fadeInUp flex items-center gap-3"
                >
                  <span className="text-xl shrink-0">📄</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-text-primary truncate">
                      {exam.exam_title || "Exam"}
                    </p>
                    <p className="text-muted text-xs">
                      {exam.exam_date ? formatDate(exam.exam_date) : ""}
                    </p>
                  </div>
                  <span className="badge !bg-success/10 !text-success !border-success/20 shrink-0">
                    Completed
                  </span>
                </button>
              ))}
            </div>
            {completed.length > 3 && (
              <button
                onClick={() => navigate("/exams")}
                className="text-accent text-sm mt-3 hover:underline"
              >
                View all completed exams
              </button>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted mt-8">
          Every exam completed is one step closer.
        </p>
      </Screen>
    );
  }

  // ---------- 3. Upcoming exams exist ----------
  return (
    <Screen withNav>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-display font-semibold text-2xl text-text-primary">
            {greeting}, {userName.split(" ")[0]} {emoji}
          </h1>
          <p className="text-muted text-sm mt-1">{newUserQuestion}</p>
        </div>
        <div className="h-12 w-12 rounded-full bg-accent-gradient flex items-center justify-center font-display font-semibold text-white text-sm shrink-0">
          {initials}
        </div>
      </div>

      {nextExam && daysUntil(nextExam.exam_date!) <= 1 && (
        <div className="glass p-5 mb-6 animate-fadeInUp">
          <span className="badge mb-3">
            {daysUntil(nextExam.exam_date!) === 0 ? "Today" : "Tomorrow"}
          </span>
          <h3 className="font-display font-semibold text-lg text-text-primary leading-snug truncate">
            {nextExam.exam_title || "Exam"}
          </h3>
          {nextExam.reporting_time && (
            <div className="flex items-center gap-1.5 text-muted text-sm mt-1.5">
              <ClockIcon className="h-4 w-4 shrink-0" />
              <span>Reports {nextExam.reporting_time}</span>
            </div>
          )}
          <p className="font-display text-2xl text-accent tracking-wider mt-3 tabular-nums">
            {urgentCountdown}
          </p>
        </div>
      )}

      {nextExam && (
        <button
          onClick={() => navigate(`/exam/${nextExam.id}`)}
          className={`w-full text-left glass p-6 animate-fadeInUp mb-6 border-l-4 ${getBorderColor(
            nextExam.exam_date!
          )}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <span className="badge mb-3">
                {daysUntil(nextExam.exam_date!) === 0
                  ? "Today"
                  : `${daysUntil(nextExam.exam_date!)} day${
                      daysUntil(nextExam.exam_date!) === 1 ? "" : "s"
                    } to go`}
              </span>
              <h3 className="font-display font-semibold text-lg text-text-primary leading-snug truncate">
                {nextExam.exam_title || "Exam"}
              </h3>

              <div className="flex items-center gap-1.5 text-muted text-sm mt-1.5">
                <ClockIcon className="h-4 w-4 shrink-0" />
                <span>
                  {nextExam.exam_date ? formatDate(nextExam.exam_date) : ""}
                  {nextExam.reporting_time && <> · Reports {nextExam.reporting_time}</>}
                </span>
              </div>

              <div className="flex items-center gap-1.5 text-muted text-sm truncate mt-1">
                <MapPinIcon className="h-4 w-4 shrink-0" />
                <span>{getCenterName(nextExam)}</span>
              </div>

              <div className="mt-4 pt-3 border-t border-stroke/20 space-y-1">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="text-green-400">✓</span> Admit Card Ready
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="text-green-400">✓</span> Centre Saved
                </div>
              </div>
            </div>
            <ProgressRing daysLeft={daysUntil(nextExam.exam_date!)} />
          </div>
        </button>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={() => navigate("/upload")}
          className="glass p-5 text-left hover:border-accent/40 border border-transparent transition-colors animate-fadeInUp"
        >
          <div className="text-2xl mb-3">📷</div>
          <p className="font-display font-medium text-sm text-text-primary">Scan Admit Card</p>
          <p className="text-muted text-xs mt-1">Import exam in 10 sec</p>
        </button>
        <button
          onClick={() => navigate("/upload")}
          className="glass p-5 text-left hover:border-accent/40 border border-transparent transition-colors animate-fadeInUp"
        >
          <div className="text-2xl mb-3">📄</div>
          <p className="font-display font-medium text-sm text-text-primary">Upload Date Sheet</p>
          <p className="text-muted text-xs mt-1">Auto-create your schedule</p>
        </button>
      </div>

      {completed.length > 0 && (
        <div className="mb-6">
          <h2 className="font-display font-semibold text-sm text-text-primary mb-3 uppercase tracking-wide">
            Recently completed
          </h2>
          <div className="space-y-3">
            {completed.slice(0, 3).map((exam) => (
              <button
                key={exam.id}
                onClick={() => navigate(`/exam/${exam.id}`)}
                className="w-full text-left glass p-4 animate-fadeInUp flex items-center gap-3"
              >
                <span className="text-xl shrink-0">📄</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-text-primary truncate">
                    {exam.exam_title || "Exam"}
                  </p>
                  <p className="text-muted text-xs">
                    {exam.exam_date ? formatDate(exam.exam_date) : ""}
                  </p>
                </div>
                <span className="badge !bg-success/10 !text-success !border-success/20 shrink-0">
                  Completed
                </span>
              </button>
            ))}
          </div>
          {completed.length > 3 && (
            <button
              onClick={() => navigate("/exams")}
              className="text-accent text-sm mt-3 hover:underline"
            >
              View all completed exams
            </button>
          )}
        </div>
      )}

      <p className="text-center text-xs text-muted mt-8">
        Every exam completed is one step closer.
      </p>
    </Screen>
  );
};

export default Home;