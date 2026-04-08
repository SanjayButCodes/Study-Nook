export interface ChapterNote {
  id: string;
  text: string;
}

export interface Chapter {
  id: string;
  name: string;
  checks: Record<string, boolean>;
  notes: ChapterNote[];
}

export interface Group {
  id: string;
  label: string;
  chapters: Chapter[];
  columns: Column[];
}

export interface SubjectData {
  color: string;
  bg: string;
  groups: Group[];
}

export interface Column {
  id: string;
  name: string;
  isDefault?: boolean;
  countsForPct?: boolean;
}

export interface Exam {
  id: string;
  name: string;
  date: string;
  color: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  text: string;
  image?: string;
  isTyping?: boolean;
  timestamp?: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  timestamp: number;
}

export interface Reminder {
  id: string;
  subject: string;
  time: string; // "HH:mm"
  enabled: boolean;
  lastTriggered?: string; // "YYYY-MM-DD"
}

export interface Test {
  id: string;
  name: string;
  date: string;
}

export interface Profile {
  name: string;
  exams: Exam[];
  tests?: Test[];
  onboarded: boolean;
  darkMode: boolean;
  chatSessions: ChatSession[];
  customApiKey?: string;
  reminders?: Reminder[];
  voiceEnabled: boolean;
  friendCode?: string;
  lastMotivationDate?: string; // "YYYY-MM-DD"
  motivation?: string;
}

export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  date: string; // "YYYY-MM-DD"
}

export interface FriendRequest {
  id: string;
  from: string;
  to: string;
  status: "pending" | "accepted" | "rejected";
  timestamp: number;
}

export interface AppState {
  data: Record<string, SubjectData>;
}
