import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ExamField, ExamRecord, ReminderIntensity, UserProfile } from "../types";

interface PendingUpload {
  fileName: string;
  fields: ExamField[];
  rawOcrText: string;
}

interface AppContextValue {
  isAuthenticated: boolean;
  user: UserProfile | null;
  exams: ExamRecord[];
  pendingUpload: PendingUpload | null;
  lastCreatedExamId: string | null;

  login: (email: string, _password: string) => Promise<void>;
  signup: (name: string, email: string, _password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => void;
  deleteAccount: () => void;

  uploadAdmitCard: (
    file: { name: string },
    onProgress: (pct: number, message: string) => void
  ) => Promise<void>;

  updatePendingField: (id: string, value: string) => void;
  confirmPendingUpload: (
    onStep: (message: string) => void
  ) => Promise<string>;

  toggleNotifications: () => void;
  setReminderIntensity: (intensity: ReminderIntensity) => void;

  getExamById: (id: string) => ExamRecord | undefined;
  deleteExam: (id: string) => void;
  addReminder: (examId: string, label: string, time: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const seedExams: ExamRecord[] = [
  {
    id: "exam-past-1",
    examName: "JEE Main — Paper 1",
    date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 21).toISOString(),
    reportingTime: "07:30",
    centreName: "St. Xavier's Test Centre",
    centreAddress: "MG Road, Agra, Uttar Pradesh",
    travelMinutes: 22,
    documents: ["Admit Card", "Photo ID", "Passport Photo"],
    instructions: [
      "Report at Gate 2, not Gate 1.",
      "Formal / semi-formal clothing only, no metal accessories.",
    ],
    reminders: [{ id: "r1", label: "Leave for centre", time: "06:45" }],
    completed: true,
  },
];

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function mockOcrFields(): ExamField[] {
  return [
    { id: uid("f"), label: "Exam name", value: "JEE Main — Paper 2 (B.Arch)", confidence: "high" },
    { id: uid("f"), label: "Candidate name", value: "Aarav Sharma", confidence: "high" },
    { id: uid("f"), label: "Exam date", value: "2026-08-14", confidence: "high" },
    { id: uid("f"), label: "Reporting time", value: "08:00", confidence: "high" },
    { id: uid("f"), label: "Test centre", value: "Modern Public School, Sikandra", confidence: "low" },
    { id: uid("f"), label: "Roll number", value: "26840193", confidence: "low" },
  ];
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [exams, setExams] = useState<ExamRecord[]>(seedExams);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [lastCreatedExamId, setLastCreatedExamId] = useState<string | null>(null);

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const login = useCallback(async (email: string) => {
    await delay(700);
    setUser({
      name: email.split("@")[0] || "Student",
      email,
      notificationsEnabled: true,
      reminderIntensity: "relaxed",
    });
    setIsAuthenticated(true);
  }, []);

  const signup = useCallback(async (name: string, email: string) => {
    await delay(700);
    setUser({
      name,
      email,
      notificationsEnabled: true,
      reminderIntensity: "relaxed",
    });
    setIsAuthenticated(true);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    await delay(600);
    setUser({
      name: "Aarav Sharma",
      email: "aarav.sharma@gmail.com",
      avatarUrl: undefined,
      notificationsEnabled: true,
      reminderIntensity: "relaxed",
    });
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setUser(null);
  }, []);

  const deleteAccount = useCallback(() => {
    setIsAuthenticated(false);
    setUser(null);
    setExams([]);
  }, []);

  const uploadAdmitCard = useCallback(
    async (
      file: { name: string },
      onProgress: (pct: number, message: string) => void
    ) => {
      const steps = [
        "Scanning document…",
        "Extracting text carefully…",
        "Cross-checking dates and centre details…",
        "Almost there…",
      ];
      let pct = 0;
      for (let i = 0; i < steps.length; i++) {
        onProgress(pct, steps[i]);
        await delay(550);
        pct = Math.min(92, pct + 24);
        onProgress(pct, steps[i]);
      }
      onProgress(92, "Finishing up…");
      await delay(500);
      onProgress(100, "Done");
      setPendingUpload({
        fileName: file.name,
        fields: mockOcrFields(),
        rawOcrText:
          "JEE (MAIN) 2026 ADMIT CARD\nCandidate: AARAV SHARMA\nRoll No: 26840193\nDate of Exam: 14-08-2026\nReporting Time: 08:00 AM\nCentre: MODERN PUBLIC SCHOOL, SIKANDRA, AGRA\nShift: 1",
      });
    },
    []
  );

  const updatePendingField = useCallback((id: string, value: string) => {
    setPendingUpload((prev) =>
      prev
        ? {
            ...prev,
            fields: prev.fields.map((f) =>
              f.id === id ? { ...f, value } : f
            ),
          }
        : prev
    );
  }, []);

  const confirmPendingUpload = useCallback(
    async (onStep: (message: string) => void) => {
      if (!pendingUpload) throw new Error("Nothing to confirm");
      const messages = [
        "Preparing your schedule…",
        "Scheduling reminders…",
        "Pinning the centre on Maps…",
      ];
      for (const m of messages) {
        onStep(m);
        await delay(500);
      }

      const get = (label: string) =>
        pendingUpload.fields.find((f) => f.label === label)?.value ?? "";

      const newExam: ExamRecord = {
        id: uid("exam"),
        examName: get("Exam name") || "Upcoming Exam",
        date: get("Exam date")
          ? new Date(get("Exam date")).toISOString()
          : new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
        reportingTime: get("Reporting time") || "08:00",
        centreName: get("Test centre") || "Test Centre",
        centreAddress: `${get("Test centre") || "Test Centre"}, Agra, Uttar Pradesh`,
        travelMinutes: 25,
        documents: ["Admit Card", "Photo ID", "Passport-size Photograph"],
        instructions: [
          "Report through Gate 3, security check begins 90 minutes prior.",
          "No electronic devices, geometry boxes, or calculators allowed.",
          "Carry a black/blue ballpoint pen only.",
        ],
        reminders: [
          { id: uid("rem"), label: "Leave for centre", time: "06:45" },
          { id: uid("rem"), label: "Documents check", time: "Night before, 9:00 PM" },
        ],
        completed: false,
        safeDepartureTime: "06:45 AM",
        predictedArrivalTime: "07:20 AM",
      };

      setExams((prev) => [newExam, ...prev]);
      setLastCreatedExamId(newExam.id);
      setPendingUpload(null);
      return newExam.id;
    },
    [pendingUpload]
  );

  const toggleNotifications = useCallback(() => {
    setUser((prev) =>
      prev ? { ...prev, notificationsEnabled: !prev.notificationsEnabled } : prev
    );
  }, []);

  const setReminderIntensity = useCallback((intensity: ReminderIntensity) => {
    setUser((prev) => (prev ? { ...prev, reminderIntensity: intensity } : prev));
  }, []);

  const getExamById = useCallback(
    (id: string) => exams.find((e) => e.id === id),
    [exams]
  );

  const deleteExam = useCallback((id: string) => {
    setExams((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const addReminder = useCallback((examId: string, label: string, time: string) => {
    setExams((prev) =>
      prev.map((e) =>
        e.id === examId
          ? { ...e, reminders: [...e.reminders, { id: uid("rem"), label, time }] }
          : e
      )
    );
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      isAuthenticated,
      user,
      exams,
      pendingUpload,
      lastCreatedExamId,
      login,
      signup,
      loginWithGoogle,
      logout,
      deleteAccount,
      uploadAdmitCard,
      updatePendingField,
      confirmPendingUpload,
      toggleNotifications,
      setReminderIntensity,
      getExamById,
      deleteExam,
      addReminder,
    }),
    [
      isAuthenticated,
      user,
      exams,
      pendingUpload,
      lastCreatedExamId,
      login,
      signup,
      loginWithGoogle,
      logout,
      deleteAccount,
      uploadAdmitCard,
      updatePendingField,
      confirmPendingUpload,
      toggleNotifications,
      setReminderIntensity,
      getExamById,
      deleteExam,
      addReminder,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
