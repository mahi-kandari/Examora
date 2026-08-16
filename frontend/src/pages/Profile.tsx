import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User } from "firebase/auth";
import { collection, query, where, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";
import { db } from "../services/firebase";
import Screen from "../components/Screen";
import { Moon, Sun } from "lucide-react";

const Profile: React.FC = () => {
  // Tell TypeScript that logout is async
  const { user, logout } = useAuth() as {
    user: User | null;
    logout: () => Promise<void>;
  };
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  // Local preferences (could later be stored in Firestore)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [reminderIntensity, setReminderIntensity] = useState<"relaxed" | "nervous">("relaxed");
  const [examCount, setExamCount] = useState(0);

  // Fetch exams count for current user
  useEffect(() => {
    if (!user) return;
    const fetchExams = async () => {
      try {
        const q = query(
          collection(db, "exams"),
          where("userId", "==", (user as User).uid)
        );
        const snap = await getDocs(q);
        setExamCount(snap.size);
      } catch (err) {
        console.error("Failed to load exam count:", err);
      }
    };
    fetchExams();
  }, [user]);

  // Load persisted notification preferences from users/{uid}.
  useEffect(() => {
    if (!user) return;
    const loadPrefs = async () => {
      try {
        const snap = await getDoc(doc(db, "users", (user as User).uid));
        if (snap.exists()) {
          const data = snap.data();
          if (typeof data.notificationsEnabled === "boolean") {
            setNotificationsEnabled(data.notificationsEnabled);
          }
          if (data.reminderIntensity === "relaxed" || data.reminderIntensity === "nervous") {
            setReminderIntensity(data.reminderIntensity);
          }
        }
      } catch (err) {
        console.error("Failed to load profile settings:", err);
      }
    };
    loadPrefs();
  }, [user]);

  // Persist a preference change to users/{uid} (logic only — no UI change).
  const persistProfile = async (partial: Record<string, unknown>) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "users", (user as User).uid), partial, { merge: true });
    } catch (err) {
      console.error("Failed to save profile setting:", err);
    }
  };

  if (!user) return null;

  const currentUser = user as User;
  const name = currentUser.displayName || currentUser.email || "User";
  const email = currentUser.email || "";
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSignOut = async () => {
    await logout();
    navigate("/login");
  };

  const handleDelete = () => {
    if (confirm("Delete your account? This cannot be undone.")) {
      logout();
      navigate("/login");
    }
  };

  return (
    <Screen withNav>
      <h1 className="font-display font-semibold text-2xl text-text-primary mb-6">
        Profile
      </h1>

      {/* Avatar & basic info */}
      <div className="glass p-6 flex items-center gap-4 animate-fadeInUp">
        <div className="h-14 w-14 rounded-full bg-accent-gradient flex items-center justify-center font-display font-semibold text-white text-lg shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-display font-medium text-text-primary truncate">
            {name}
          </p>
          <p className="text-muted text-sm truncate">{email}</p>
        </div>
      </div>

      {/* Notifications toggle */}
      <div className="card mt-4 animate-fadeInUp">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-text-primary text-sm font-medium">Notifications</p>
            <p className="text-muted text-xs mt-0.5">
              Reminders and departure alerts
            </p>
          </div>
          <button
            onClick={() => {
              const next = !notificationsEnabled;
              setNotificationsEnabled(next);
              persistProfile({ notificationsEnabled: next });
            }}
            aria-pressed={notificationsEnabled}
            className={`h-7 w-12 rounded-full relative transition-colors duration-300 ${
              notificationsEnabled ? "bg-accent" : "bg-stroke/40"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all duration-300 ${
                notificationsEnabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Reminder intensity */}
      <div className="card mt-4 animate-fadeInUp">
        <p className="text-text-primary text-sm font-medium mb-1">
          Reminder intensity
        </p>
        <p className="text-muted text-xs mb-4">
          How often we should check in with you
        </p>
        <div className="flex bg-stroke/10 rounded-2xl p-1">
          <button
            onClick={() => {
              setReminderIntensity("relaxed");
              persistProfile({ reminderIntensity: "relaxed" });
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              reminderIntensity === "relaxed"
                ? "bg-accent/20 text-accent"
                : "text-muted"
            }`}
          >
            Relaxed
          </button>
          <button
            onClick={() => {
              setReminderIntensity("nervous");
              persistProfile({ reminderIntensity: "nervous" });
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              reminderIntensity === "nervous"
                ? "bg-accent/20 text-accent"
                : "text-muted"
            }`}
          >
            Nervous
          </button>
        </div>
        <p className="text-muted text-xs mt-3 leading-relaxed">
          {reminderIntensity === "relaxed"
            ? "A few key reminders — departure time and documents."
            : "Frequent check-ins on documents, timing, and travel."}
        </p>
      </div>

      {/* Appearance / Theme option */}
      <div className="card mt-4 animate-fadeInUp">
        <p className="text-text-primary text-sm font-medium mb-1">
          Appearance
        </p>
        <p className="text-muted text-xs mb-4">
          Choose between dark mode and light mode
        </p>
        <div className="flex bg-stroke/15 rounded-2xl p-1">
          <button
            onClick={() => setTheme("dark")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
              theme === "dark"
                ? "bg-accent/20 text-accent font-semibold shadow-sm"
                : "text-muted hover:text-text-primary"
            }`}
          >
            <Moon className="w-4 h-4" /> Dark Mode
          </button>
          <button
            onClick={() => setTheme("light")}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex items-center justify-center gap-2 ${
              theme === "light"
                ? "bg-accent/20 text-accent font-semibold shadow-sm"
                : "text-muted hover:text-text-primary"
            }`}
          >
            <Sun className="w-4 h-4" /> Light Mode
          </button>
        </div>
      </div>

      {/* Stats */}
      <p className="text-center text-muted text-sm mt-6">
        You've organised {examCount} exam{examCount === 1 ? "" : "s"} with
        Examora.
      </p>

      {/* Sign out & delete */}
      <div className="mt-8 space-y-3">
        <button onClick={handleSignOut} className="btn-ghost w-full">
          Sign out
        </button>
        <button
          onClick={handleDelete}
          className="w-full text-center text-danger text-sm py-2 hover:opacity-80 transition-opacity"
        >
          Delete Account
        </button>
      </div>
    </Screen>
  );
};

export default Profile;