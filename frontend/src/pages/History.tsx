import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  orderBy,
} from "firebase/firestore";
import { db } from "../services/firebase";
import { useAuth } from "../contexts/AuthContext";
import Screen from "../components/Screen";
import { User } from "firebase/auth";
import { TrashIcon } from "@heroicons/react/24/outline";

// ---------- Types ----------
interface ExamRecord {
  id: string;
  exam_title?: string;
  exam_date?: string;
  reporting_time?: string;
  center_name?: string;
  center?: string;
  upload_timestamp?: string;
  completed?: boolean;
}

type SortMode = "date-asc" | "upload-desc" | "name-asc";

// ---------- Helpers ----------
function formatDate(dateIso: string) {
  if (!dateIso) return "";
  return new Date(dateIso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
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

function getExamStatus(dateIso: string) {
  if (!dateIso)
    return {
      dotColor: "bg-accent",
      borderColor: "border-accent",
      isCompleted: false,
    };
  const completed = isExamCompleted(dateIso);
  if (completed)
    return {
      dotColor: "bg-success",
      borderColor: "border-success",
      isCompleted: true,
    };
  const days = daysUntil(dateIso);
  if (days === 0)
    return {
      dotColor: "bg-red-500",
      borderColor: "border-red-500",
      isCompleted: false,
    };
  return {
    dotColor: "bg-accent",
    borderColor: "border-accent",
    isCompleted: false,
  };
}

function getCenterName(exam: ExamRecord): string {
  if (exam.center_name?.trim()) return exam.center_name.trim();
  if (exam.center && typeof exam.center === "string") {
    const parts = exam.center.split(",");
    if (parts.length > 0) return parts[0].trim();
    return exam.center.trim();
  }
  return "Exam Centre";
}

// ---------- Exam Card (now with always‑visible delete button) ----------
const ExamCard: React.FC<{
  exam: ExamRecord;
  onOpen: () => void;
  onDelete: () => void;
}> = ({ exam, onOpen, onDelete }) => {
  const { dotColor, borderColor, isCompleted } = getExamStatus(
    exam.exam_date || ""
  );

  return (
    <div className="relative">
      {/* Delete button – glass square, always visible on the right */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 glass !rounded-xl p-2 text-red-400 hover:text-red-300 transition-colors"
        aria-label="Delete exam"
      >
        <TrashIcon className="h-5 w-5" />
      </button>

      {/* Main card content */}
      <button
        onClick={onOpen}
        className={`w-full text-left glass p-5 border-r-4 ${borderColor} ${isCompleted ? "shadow-[0_0_24px_-8px_rgba(34,197,94,0.35)]" : ""
          } pr-14`} // extra right padding to avoid text overlapping the delete icon
      >
        <div className="flex items-center justify-between mb-2">
          <span className={`h-2 w-2 rounded-full ${dotColor}`} />
          <span className="text-xs text-muted font-semibold">
            {exam.exam_date ? formatDate(exam.exam_date) : ""}
          </span>
        </div>
        <h3 className="font-display font-medium text-[15px] text-text-primary truncate">
          {exam.exam_title || "Exam"}
        </h3>
        <p className="text-muted text-xs mt-1 truncate">
          {getCenterName(exam)}
        </p>
      </button>
    </div>
  );
};

// ---------- History Component ----------
const History: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("date-asc");

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
        const list: ExamRecord[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setExams(list);
      } catch (err) {
        console.error("Failed to load exams:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchExams();
  }, [user]);

  const handleDelete = async (examId: string) => {
    try {
      await deleteDoc(doc(db, "exams", examId));
      setExams((prev) => prev.filter((e) => e.id !== examId));
    } catch (err) {
      console.error("Failed to delete exam:", err);
    }
  };

  const sortedExams = [...exams].sort((a, b) => {
    switch (sortMode) {
      case "date-asc": {
        const da = a.exam_date ? new Date(a.exam_date).getTime() : 0;
        const db2 = b.exam_date ? new Date(b.exam_date).getTime() : 0;
        return da - db2;
      }
      case "upload-desc": {
        const ua = a.upload_timestamp
          ? new Date(a.upload_timestamp).getTime()
          : 0;
        const ub = b.upload_timestamp
          ? new Date(b.upload_timestamp).getTime()
          : 0;
        return ub - ua;
      }
      case "name-asc": {
        const na = (a.exam_title || "").toLowerCase();
        const nb = (b.exam_title || "").toLowerCase();
        return na.localeCompare(nb);
      }
      default:
        return 0;
    }
  });

  const upcoming = sortedExams.filter(
    (e) => e.exam_date && !isExamCompleted(e.exam_date)
  );
  const completed = sortedExams.filter(
    (e) => e.exam_date && isExamCompleted(e.exam_date)
  );

  if (loading) {
    return (
      <Screen withNav>
        <div className="flex justify-center mt-16">
          <div className="animate-spin h-10 w-10 border-4 border-accent/30 border-t-accent rounded-full" />
        </div>
      </Screen>
    );
  }

  if (exams.length === 0) {
    return (
      <Screen withNav>
        <h1 className="font-display font-semibold text-2xl text-text-primary mb-8">
          Your Exams
        </h1>
        <div className="glass p-8 text-center mt-10 animate-fadeInUp">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-text-primary font-medium mb-2">No exams yet</p>
          <p className="text-muted text-sm mb-6">
            Head to Home to scan your first admit card.
          </p>
          <button onClick={() => navigate("/home")} className="btn-primary w-full">
            Go to Home
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen withNav>
      <h1 className="font-display font-semibold text-2xl text-text-primary mb-2">
        Your Exams
      </h1>

      {/* Sort buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        {([
          { key: "date-asc", label: "Nearest Date" },
          { key: "upload-desc", label: "Latest Upload" },
          { key: "name-asc", label: "A–Z" },
        ] as { key: SortMode; label: string }[]).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortMode(opt.key)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${sortMode === opt.key
                ? "bg-accent/20 text-accent"
                : "text-muted bg-stroke/10"
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {upcoming.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <p className="text-sm font-medium text-text-primary">Upcoming</p>
          </div>
          <div className="space-y-3">
            {upcoming.map((exam) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                onOpen={() => navigate(`/exam/${exam.id}`)}
                onDelete={() => handleDelete(exam.id)}
              />
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-success" />
            <p className="text-sm font-medium text-text-primary">Completed</p>
          </div>
          <div className="space-y-3">
            {completed.map((exam) => (
              <ExamCard
                key={exam.id}
                exam={exam}
                onOpen={() => navigate(`/exam/${exam.id}`)}
                onDelete={() => handleDelete(exam.id)}
              />
            ))}
          </div>
        </div>
      )}
    </Screen>
  );
};

export default History;