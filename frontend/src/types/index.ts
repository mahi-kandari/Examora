export type ConfidenceLevel = "high" | "low";

export interface ExamField {
  id: string;
  label: string;
  value: string;
  confidence: ConfidenceLevel;
}

export interface Reminder {
  id: string;
  label: string;
  time: string;
}

export interface ExamRecord {
  id: string;
  examName: string;
  date: string; // ISO date
  reportingTime: string;
  centreName: string;
  centreAddress: string;
  travelMinutes: number;
  documents: string[];
  instructions: string[];
  reminders: Reminder[];
  completed: boolean;
  safeDepartureTime?: string;
  predictedArrivalTime?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  avatarUrl?: string;
  notificationsEnabled: boolean;
  reminderIntensity: "relaxed" | "nervous";
}

export type ReminderIntensity = UserProfile["reminderIntensity"];
