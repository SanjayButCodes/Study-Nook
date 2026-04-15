import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Volume2,
  Mic,
  MicOff,
  Loader2,
  BookOpen, 
  Zap, 
  FlaskConical, 
  Sigma, 
  Sparkles, 
  Settings, 
  X, 
  Maximize2, 
  Minimize2, 
  MessageSquare, 
  History,
  Plus,
  Send, 
  Image as ImageIcon, 
  Trash2, 
  ChevronRight, 
  LayoutDashboard,
  Moon,
  Sun,
  Flame,
  CheckCircle2,
  Check,
  Circle,
  MoreVertical,
  Keyboard,
  Download,
  Upload,
  AlertTriangle,
  FileText,
  Calendar,
  Quote,
  RefreshCw,
  Target,
  Search,
  Bell,
  Clock,
  ToggleLeft,
  ToggleRight,
  Share2,
  Trophy,
  Cloud,
  CloudOff,
  AlertCircle,
  Users,
  Edit2,
  Pencil,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toPng } from "html-to-image";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { cn } from "./lib/utils";
import { DEFAULTS, DEFAULT_COLUMNS } from "./constants";
import { AppState, Profile, Chapter, Group, Exam, Column, ChatSession, SubjectData, Reminder, Todo, FriendRequest, ChatMessage, ChapterNote } from "./types";
import { callGemini } from "./services/gemini";
import { auth, db, googleProvider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot, setDoc, getDoc, getDocFromServer, Timestamp, collection, query, where, or, addDoc, deleteDoc, getDocs } from "firebase/firestore";

// --- Types & Constants ---
const uid = () => Math.random().toString(36).substring(2, 9);
type Tab = "all" | "physics" | "chemistry" | "mathematics" | "friends";
type SubjectKey = "physics" | "chemistry" | "mathematics";

const SUBJ_KEYS = ["physics", "chemistry", "mathematics"] as const;
const SUBJ_LABELS: Record<string, string> = { physics: "Physics", chemistry: "Chemistry", mathematics: "Mathematics" };
const SUBJ_ICONS: Record<string, React.ReactNode> = { 
  physics: <Zap className="w-5 h-5" />, 
  chemistry: <FlaskConical className="w-5 h-5" />, 
  mathematics: <Sigma className="w-5 h-5" /> 
};

const SUBJ_COLORS: Record<string, string> = {
  physics: "var(--phy)",
  chemistry: "var(--chem)",
  mathematics: "var(--math)"
};

// --- Components ---

function Logo({ className = "w-6 h-6", iconClassName = "w-4 h-4" }: { className?: string, iconClassName?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center rounded-[28%] bg-gradient-to-br from-[var(--amber)] to-[var(--gold)] shadow-sm", className)}>
      <BookOpen className={cn("text-white", iconClassName)} />
    </div>
  );
}

function TypingText({ text, onComplete }: { text: string, onComplete?: () => void }) {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText(prev => prev + text[index]);
        setIndex(prev => prev + 1);
      }, 15);
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [index, text, onComplete]);

  return (
    <ReactMarkdown 
      remarkPlugins={[remarkMath]} 
      rehypePlugins={[rehypeKatex]}
    >
      {displayedText}
    </ReactMarkdown>
  );
}

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[var(--cream)] flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-6">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h1 className="font-serif text-3xl font-medium text-[var(--ink)]">Something went wrong</h1>
            <p className="text-[var(--ink3)]">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-8 py-3 bg-[var(--ink)] text-[var(--cream)] rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              Refresh App
            </button>
            {process.env.NODE_ENV === 'development' && (
              <pre className="mt-8 p-4 bg-red-50 text-red-700 text-xs text-left overflow-auto rounded-lg border border-red-100">
                {this.state.error?.toString()}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Firestore Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export default function App() {
  // --- Auth & Firebase State ---
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(() => {
    return localStorage.getItem("jee_skip_auth") !== "true";
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [lastSynced, setLastSynced] = useState<number | null>(null);

  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem("jee_notifications") === "true");

  const requestNotificationPermission = async () => {
    if (!("Notification" in window)) {
      setAlertDialog({
        isOpen: true,
        title: "Not Supported",
        message: "Your browser does not support desktop notifications."
      });
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
      localStorage.setItem("jee_notifications", "true");
      new Notification("Study Nook", {
        body: "Notifications enabled! We'll keep you updated on your JEE journey. ✨",
        icon: "/favicon.ico"
      });
    } else {
      setNotificationsEnabled(false);
      localStorage.setItem("jee_notifications", "false");
    }
  };

  const sendNotification = (title: string, body: string) => {
    if (notificationsEnabled && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    }
  };

  // --- State ---
  const [appState, setAppState] = useState<AppState>(() => {
    const saved = localStorage.getItem("jee_v6");
    const data = saved ? JSON.parse(saved) : DEFAULTS;
    
    // Migration: ensure each group has columns
    if (data && data.data) {
      Object.keys(data.data).forEach(subj => {
        const subjData = data.data[subj];
        if (!subjData) return;
        
        if (subjData.columns) {
          (subjData.groups || []).forEach((g: Group) => {
            if (!g.columns) {
              g.columns = [...subjData.columns];
            }
          });
          delete subjData.columns;
        } else {
          (subjData.groups || []).forEach((g: Group) => {
            if (!g.columns) {
              g.columns = DEFAULTS.data[subj as SubjectKey]?.groups.find(dg => dg.id === g.id)?.columns || [];
            }
          });
        }
      });
    }
    
    // Migration: remove global columns if they exist from older versions
    if (data.columns) {
      delete data.columns;
    }
    return data;
  });

  const [profile, setProfile] = useState<Profile>(() => {
    const saved = localStorage.getItem("jee_profile_v3");
    const defaultProfile: Profile = {
      name: "",
      exams: [],
      tests: [],
      onboarded: false,
      darkMode: false,
      chatSessions: [],
      reminders: [],
      voiceEnabled: true,
      friendCode: Math.floor(100000 + Math.random() * 900000).toString()
    };
    if (!saved) return defaultProfile;
    try {
      const parsed = JSON.parse(saved);
      return {
        ...defaultProfile,
        ...parsed,
        tests: parsed.tests || [],
        voiceEnabled: parsed.voiceEnabled ?? true,
        friendCode: parsed.friendCode || Math.floor(100000 + Math.random() * 900000).toString()
      };
    } catch (e) {
      return defaultProfile;
    }
  });

  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [settingsTab, setSettingsTab] = useState<"profile" | "columns" | "chapters" | "data">("profile");
  const [drawerSubj, setDrawerSubj] = useState<string>("physics");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [isTutorOpen, setIsTutorOpen] = useState(false);
  const [tutorTab, setTutorTab] = useState<"chat" | "history">("chat");
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => Math.random().toString(36).substring(2, 11));
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [motivation, setMotivation] = useState("✨ Summoning your personalized AI motivation...");
  const [isKbModalOpen, setIsKbModalOpen] = useState(false);
  const [isSnapModalOpen, setIsSnapModalOpen] = useState(false);
  const [isRevModalOpen, setIsRevModalOpen] = useState(false);
  const [isRemindersOpen, setIsRemindersOpen] = useState(false);
  const [activeReminder, setActiveReminder] = useState<Reminder | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newTodoText, setNewTodoText] = useState("");
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const todoInputRef = useRef<HTMLInputElement>(null);

  // AI Tutor State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem("jee_chat_v1");
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((m: any) => ({ 
        ...m, 
        id: m.id || Math.random().toString(36).substring(2, 9),
        role: m.role === "model" ? "ai" : m.role // Migration for role name if needed
      }));
    }
    return [
      { id: "initial-ai-msg", role: "ai", text: "Hello! I'm Nova, your AI Study Coach. How can I help you conquer JEE today? ✨" }
    ];
  });
  const [chatInput, setChatInput] = useState("");
  const [chatImage, setChatImage] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showAiHint, setShowAiHint] = useState(() => localStorage.getItem("jee_hide_ai_hint") !== "true");
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  } | null>(null);

  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 100);
    }
  }, [chatMessages, isChatLoading, tutorTab]);

  const startNewChat = () => {
    if (chatMessages.length > 1) {
      const existingSession = profile.chatSessions.find(s => s.id === currentSessionId);
      if (existingSession) {
        setProfile(p => ({
          ...p,
          chatSessions: p.chatSessions.map(s => s.id === currentSessionId ? { ...s, messages: chatMessages, timestamp: Date.now() } : s)
        }));
      } else {
        const title = chatMessages.find(m => m.role === "user")?.text.slice(0, 30) + "..." || "New Chat";
        const newSession: ChatSession = {
          id: currentSessionId,
          title,
          messages: chatMessages,
          timestamp: Date.now()
        };
        setProfile(p => ({
          ...p,
          chatSessions: [newSession, ...p.chatSessions]
        }));
      }
    }
    const newId = Math.random().toString(36).substring(2, 11);
    setCurrentSessionId(newId);
    setChatMessages([{ id: uid(), role: "ai", text: "Hello! I'm Nova, your AI Study Coach. How can I help you conquer JEE today? ✨" }]);
    setTutorTab("chat");
  };

  const loadChatSession = (session: ChatSession) => {
    // Save current if needed
    if (chatMessages.length > 1) {
      const existing = profile.chatSessions.find(s => s.id === currentSessionId);
      if (existing) {
        setProfile(p => ({
          ...p,
          chatSessions: p.chatSessions.map(s => s.id === currentSessionId ? { ...s, messages: chatMessages, timestamp: Date.now() } : s)
        }));
      } else {
        const title = chatMessages.find(m => m.role === "user")?.text.slice(0, 30) + "..." || "New Chat";
        setProfile(p => ({
          ...p,
          chatSessions: [{ id: currentSessionId, title, messages: chatMessages, timestamp: Date.now() }, ...p.chatSessions]
        }));
      }
    }
    setCurrentSessionId(session.id);
    setChatMessages(session.messages);
    setTutorTab("chat");
  };

  const deleteChatSession = (id: string) => {
    setProfile(p => ({
      ...p,
      chatSessions: (p.chatSessions || []).filter(s => s.id !== id)
    }));
    if (currentSessionId === id) {
      startNewChat();
    }
  };
  const handleSendFriendRequest = async () => {
    if (!user || !friendIdInput.trim()) return;
    setIsSearching(true);
    try {
      let querySnapshot = await getDocs(query(collection(db, "userPublic"), where("profile.friendCode", "==", friendIdInput.trim())));
      
      if (querySnapshot.empty) {
        setAlertDialog({ isOpen: true, title: "Not Found", message: "No user found with this friend code." });
        return;
      }

      const targetUser = querySnapshot.docs[0];
      const targetUserId = targetUser.id;

      if (targetUserId === user.uid) {
        setAlertDialog({ isOpen: true, title: "Wait a minute...", message: "You can't add yourself as a friend!" });
        return;
      }

      // Check if already friends or request pending
      const existing = friendRequests.find(r => 
        (r.from === user.uid && r.to === targetUserId) || 
        (r.from === targetUserId && r.to === user.uid)
      );

      if (existing) {
        setAlertDialog({ isOpen: true, title: "Already Connected", message: "You already have a connection or pending request with this user." });
        return;
      }

      await addDoc(collection(db, "friendRequests"), {
        from: user.uid,
        to: targetUserId,
        status: "pending",
        timestamp: Date.now()
      });

      setAlertDialog({ isOpen: true, title: "Request Sent!", message: `Friend request sent to ${targetUser.data().profile?.name || "the user"}.` });
      setFriendIdInput("");
      setIsAddFriendOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, "friendRequests");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAcceptFriend = async (requestId: string) => {
    try {
      await setDoc(doc(db, "friendRequests", requestId), { status: "accepted" }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `friendRequests/${requestId}`);
    }
  };

  const handleRejectFriend = async (requestId: string) => {
    try {
      await deleteDoc(doc(db, "friendRequests", requestId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `friendRequests/${requestId}`);
    }
  };

  const handleRemoveFriend = async (requestId: string, friendName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Remove Friend?",
      message: `Are you sure you want to remove ${friendName} from your Study Circle?`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, "friendRequests", requestId));
          setConfirmDialog(null);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `friendRequests/${requestId}`);
        }
      }
    });
  };
  const [selectedChapter, setSelectedChapter] = useState<{subj: string, ch: Chapter} | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editingTodoText, setEditingTodoText] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);

  const updateGroupLabel = (subj: SubjectKey, groupId: string, newLabel: string) => {
    setAppState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [subj]: {
          ...prev.data[subj],
          groups: prev.data[subj].groups.map(g => g.id === groupId ? { ...g, label: newLabel } : g)
        }
      }
    }));
  };

  const moveGroup = (subj: SubjectKey, groupId: string, direction: 'up' | 'down') => {
    setAppState(prev => {
      const groups = [...prev.data[subj].groups];
      const idx = groups.findIndex(g => g.id === groupId);
      if (idx < 0) return prev;
      if (direction === 'up' && idx > 0) {
        [groups[idx - 1], groups[idx]] = [groups[idx], groups[idx - 1]];
      } else if (direction === 'down' && idx < groups.length - 1) {
        [groups[idx + 1], groups[idx]] = [groups[idx], groups[idx + 1]];
      } else {
        return prev;
      }
      return { ...prev, data: { ...prev.data, [subj]: { ...prev.data[subj], groups } } };
    });
  };

  const updateChapterName = (subj: SubjectKey, groupId: string, chapterId: string, newName: string) => {
    setAppState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [subj]: {
          ...prev.data[subj],
          groups: prev.data[subj].groups.map(g => g.id === groupId ? {
            ...g,
            chapters: g.chapters.map(ch => ch.id === chapterId ? { ...ch, name: newName } : ch)
          } : g)
        }
      }
    }));
  };

  const moveChapter = (subj: SubjectKey, groupId: string, chapterId: string, direction: 'up' | 'down') => {
    setAppState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [subj]: {
          ...prev.data[subj],
          groups: prev.data[subj].groups.map(g => {
            if (g.id !== groupId) return g;
            const chapters = [...g.chapters];
            const idx = chapters.findIndex(ch => ch.id === chapterId);
            if (idx < 0) return g;
            if (direction === 'up' && idx > 0) {
              [chapters[idx - 1], chapters[idx]] = [chapters[idx], chapters[idx - 1]];
            } else if (direction === 'down' && idx < chapters.length - 1) {
              [chapters[idx + 1], chapters[idx]] = [chapters[idx], chapters[idx + 1]];
            }
            return { ...g, chapters };
          })
        }
      }
    }));
  };

  const updateColumnName = (subj: SubjectKey, groupId: string, columnId: string, newName: string) => {
    setAppState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [subj]: {
          ...prev.data[subj],
          groups: prev.data[subj].groups.map(g => g.id === groupId ? {
            ...g,
            columns: (g.columns || []).map(c => c.id === columnId ? { ...c, name: newName } : c)
          } : g)
        }
      }
    }));
  };

  const moveColumn = (subj: SubjectKey, groupId: string, columnId: string, direction: 'left' | 'right') => {
    setAppState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [subj]: {
          ...prev.data[subj],
          groups: prev.data[subj].groups.map(g => {
            if (g.id !== groupId) return g;
            const columns = [...(g.columns || [])];
            const idx = columns.findIndex(c => c.id === columnId);
            if (idx < 0) return g;
            if (direction === 'left' && idx > 0) {
              [columns[idx - 1], columns[idx]] = [columns[idx], columns[idx - 1]];
            } else if (direction === 'right' && idx < columns.length - 1) {
              [columns[idx + 1], columns[idx]] = [columns[idx], columns[idx + 1]];
            }
            return { ...g, columns };
          })
        }
      }
    }));
  };

  const toggleTodo = (id: string) => {
    setTodoList(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTodo = (id: string) => {
    setTodoList(prev => prev.filter(t => t.id !== id));
  };

  const addTodo = () => {
    if (newTodoText.trim()) {
      const newTodo = { id: uid(), text: newTodoText.trim(), completed: false, date: todoDate };
      setTodoList(prev => [...prev, newTodo]);
      setNewTodoText("");
    }
  };

  const startEditingTodo = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setEditingTodoText(todo.text);
  };

  const saveEditingTodo = () => {
    if (editingTodoId && editingTodoText.trim()) {
      setTodoList(prev => prev.map(t => t.id === editingTodoId ? { ...t, text: editingTodoText.trim() } : t));
      setEditingTodoId(null);
      setEditingTodoText("");
    }
  };
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [todoList, setTodoList] = useState<Todo[]>(() => {
    const saved = localStorage.getItem("jee_todo_v1");
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((t: any) => ({ 
        ...t, 
        id: t.id || Math.random().toString(36).substring(2, 9) 
      }));
    }
    return [];
  });
  const [todoDate, setTodoDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Friends State
  const [isFriendsModalOpen, setIsFriendsModalOpen] = useState(false);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friendsData, setFriendsData] = useState<Record<string, any>>({});
  const [friendIdInput, setFriendIdInput] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Motivation State

  // STT Setup
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAlertDialog({
        isOpen: true,
        title: "Not Supported",
        message: "Speech recognition is not supported in this browser."
      });
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setChatInput(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.start();
  };

  const handleSpeak = async (text: string, index: number) => {
    if (speakingMsgIndex === index) {
      setSpeakingMsgIndex(null);
      return;
    }
    setSpeakingMsgIndex(index);
    const { callGeminiTTS } = await import("./services/gemini");
    const base64Audio = await callGeminiTTS(text);
    
    if (base64Audio) {
      try {
        const binaryString = window.atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Add WAV header (PCM, 16-bit, Mono, 24000Hz)
        const sampleRate = 24000;
        const header = new ArrayBuffer(44);
        const view = new DataView(header);
        view.setUint32(0, 0x52494646, false); // RIFF
        view.setUint32(4, 36 + bytes.length, true);
        view.setUint32(8, 0x57415645, false); // WAVE
        view.setUint32(12, 0x666d7420, false); // fmt 
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        view.setUint32(36, 0x64617461, false); // data
        view.setUint32(40, bytes.length, true);

        const blob = new Blob([header, bytes], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
          setSpeakingMsgIndex(null);
          URL.revokeObjectURL(url);
        };
        audio.play();
      } catch (err) {
        console.error("Error playing audio:", err);
        setSpeakingMsgIndex(null);
      }
    } else {
      setSpeakingMsgIndex(null);
    }
  };

  // --- Effects ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser) {
        setShowAuthModal(false);
        localStorage.removeItem("jee_skip_auth");
        setProfile(prev => {
          if (!prev.name && currentUser.displayName) {
            return { ...prev, name: currentUser.displayName.split(' ')[0] };
          }
          return prev;
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user) {
      setIsDataLoaded(true);
      return;
    }

    const docRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      // If the snapshot is from a local write, we already have the state
      if (docSnap.metadata.hasPendingWrites) return;

      if (docSnap.exists()) {
        const data = docSnap.data();
        
        const localLastUpdated = lastSavedTimeRef.current;
        const cloudLastUpdated = data.lastUpdated || 0;

        // If cloud data is not newer than our local data, ignore it to prevent sync loops
        if (cloudLastUpdated <= localLastUpdated) {
          setIsDataLoaded(true);
          return;
        }

        isStateFromCloudRef.current = true;

        // Update local state
        if (data.appState) setAppState(data.appState);
        if (data.profile) {
          setProfile(prev => ({
            ...prev,
            ...data.profile,
            friendCode: data.profile.friendCode || prev.friendCode || Math.floor(100000 + Math.random() * 900000).toString()
          }));
        }
        if (data.todoList) setTodoList(data.todoList);
        if (data.chatMessages) setChatMessages(data.chatMessages);
        
        setLastSynced(Date.now());
      }
      setIsDataLoaded(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  useEffect(() => {
    if (profile.darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("jee_profile_v3", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem("jee_v6", JSON.stringify(appState));
  }, [appState]);

  useEffect(() => {
    localStorage.setItem("jee_chat_v1", JSON.stringify(chatMessages));
  }, [chatMessages]);

  useEffect(() => {
    localStorage.setItem("jee_todo_v1", JSON.stringify(todoList));
  }, [todoList]);

  const lastSavedTimeRef = useRef<number>(0);
  const isStateFromCloudRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isDataLoaded || !user) return;
    
    if (isStateFromCloudRef.current) {
      isStateFromCloudRef.current = false;
      return;
    }

    const saveToFirebase = async () => {
      if (quotaExceeded || !isDataLoaded || !user || !isOnline) return;
      
      const payloadObjForCompare = JSON.parse(JSON.stringify({
        appState,
        profile,
        todoList,
        chatMessages,
        displayName: user.displayName,
        photoURL: user.photoURL,
        email: user.email,
        friendCode: profile.friendCode,
      }));
      
      const now = Date.now();
      lastSavedTimeRef.current = now;

      setIsSyncing(true);
      try {
        const payload = {
          ...payloadObjForCompare,
          lastUpdated: now,
          updatedAt: Timestamp.now()
        };
        await setDoc(doc(db, "users", user.uid), payload, { merge: true });
        
        // Write public summary for friends
        const publicPayload = JSON.parse(JSON.stringify({
          profile: { name: profile.name, friendCode: profile.friendCode },
          todoList: todoList,
          lastUpdated: now
        }));
        await setDoc(doc(db, "userPublic", user.uid), publicPayload, { merge: true });

        setLastSynced(Date.now());
        setQuotaExceeded(false); // Reset if successful
      } catch (error: any) {
        if (error?.code === 'resource-exhausted' || error?.message?.includes('quota')) {
          setQuotaExceeded(true);
        }
        handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
      } finally {
        setIsSyncing(false);
      }
    };
    
    // Increased debounce to 30 seconds to significantly reduce sync frequency
    const timeout = setTimeout(saveToFirebase, 30000);
    return () => clearTimeout(timeout);
  }, [appState, profile, todoList, chatMessages, isDataLoaded, user, quotaExceeded, isOnline]);



  const forceSync = async () => {
    if (!user) return;
    if (!isOnline) {
      setAlertDialog({ isOpen: true, title: "Offline", message: "You are currently offline. Please check your connection." });
      return;
    }
    setIsSyncing(true);
    try {
      const now = Date.now();
      lastSavedTimeRef.current = now;
      
      const payloadObj = JSON.parse(JSON.stringify({
        appState,
        profile,
        todoList,
        chatMessages,
        displayName: user.displayName,
        photoURL: user.photoURL,
        email: user.email,
        friendCode: profile.friendCode,
      }));
      const payload = { ...payloadObj, lastUpdated: now, updatedAt: Timestamp.now() };
      await setDoc(doc(db, "users", user.uid), payload, { merge: true });
      
      const publicPayload = JSON.parse(JSON.stringify({
        profile: { name: profile.name, friendCode: profile.friendCode },
        todoList: todoList,
        lastUpdated: now
      }));
      await setDoc(doc(db, "userPublic", user.uid), publicPayload, { merge: true });

      setLastSynced(Date.now());
      setQuotaExceeded(false);
      setAlertDialog({ isOpen: true, title: "Synced!", message: "Your progress has been manually saved to the cloud." });
    } catch (error: any) {
      if (error?.code === 'resource-exhausted' || error?.message?.includes('quota')) {
        setQuotaExceeded(true);
      }
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Fetch Friend Requests
  useEffect(() => {
    if (!user) return;
    
    const qFrom = query(collection(db, "friendRequests"), where("from", "==", user.uid));
    const qTo = query(collection(db, "friendRequests"), where("to", "==", user.uid));

    let reqsFrom: FriendRequest[] = [];
    let reqsTo: FriendRequest[] = [];

    const updateReqs = () => {
      const combined = [...reqsFrom, ...reqsTo];
      const unique = Array.from(new Map(combined.map(r => [r.id, r])).values());
      setFriendRequests(unique);
    };

    const unsubFrom = onSnapshot(qFrom, (snapshot) => {
      reqsFrom = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FriendRequest));
      updateReqs();
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "friendRequests/from");
    });

    const unsubTo = onSnapshot(qTo, (snapshot) => {
      reqsTo = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FriendRequest));
      updateReqs();
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, "friendRequests/to");
    });

    return () => {
      unsubFrom();
      unsubTo();
    };
  }, [user]);

  // Fetch Friends Data
  useEffect(() => {
    if (!user) return;
    const relevantUsers = Array.from(new Set([
      ...(friendRequests || []).filter(r => r.status === "accepted").map(r => r.from === user.uid ? r.to : r.from),
      ...(friendRequests || []).filter(r => r.to === user.uid && r.status === "pending").map(r => r.from),
      ...(friendRequests || []).filter(r => r.from === user.uid && r.status === "pending").map(r => r.to)
    ])).sort();

    const relevantUsersStr = relevantUsers.join(',');

    // Cleanup friendsData for users who are no longer relevant
    setFriendsData(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(key => {
        if (!relevantUsers.includes(key)) {
          delete next[key];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    
    if (relevantUsers.length === 0) return;

    const unsubscribes: (() => void)[] = [];
    
    relevantUsers.forEach(friendId => {
      const unsub = onSnapshot(doc(db, "userPublic", friendId), (docSnap) => {
        if (docSnap.exists()) {
          setFriendsData(prev => ({ ...prev, [friendId]: docSnap.data() }));
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `userPublic/${friendId}`);
      });
      unsubscribes.push(unsub);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [user, JSON.stringify((friendRequests || []).map(r => r.id + r.status).sort())]);

  // Disable background scrolling when modals are open
  useEffect(() => {
    if (isShareModalOpen || isRemindersOpen || isFriendsModalOpen || isDrawerOpen || isNoteModalOpen || isKbModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isShareModalOpen, isRemindersOpen, isFriendsModalOpen, isDrawerOpen, isNoteModalOpen, isKbModalOpen]);

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const today = now.toISOString().slice(0, 10);

      if (!profile.reminders) return;

      profile.reminders.forEach(reminder => {
        if (reminder.enabled && reminder.time === currentTime && reminder.lastTriggered !== today) {
          setActiveReminder(reminder);
          sendNotification("Study Reminder 📚", `Time for your ${reminder.subject} session!`);
          // Update lastTriggered to avoid multiple triggers in the same minute
          setProfile(p => ({
            ...p,
            reminders: p.reminders?.map(r => r.id === reminder.id ? { ...r, lastTriggered: today } : r)
          }));
        }
      });
    };

    const interval = setInterval(checkReminders, 60000); // Check every minute
    checkReminders(); // Initial check

    return () => clearInterval(interval);
  }, [profile.reminders]);

  useEffect(() => {
    generateMotivation();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);

  const handleShare = async () => {
    if (!shareCardRef.current) return;
    setIsSharing(true);
    try {
      const dataUrl = await toPng(shareCardRef.current, { cacheBust: true, quality: 0.95 });
      const link = document.createElement('a');
      link.download = `JEE-Progress-${new Date().toISOString().split('T')[0]}.png`;
      link.href = dataUrl;
      link.click();
      setAlertDialog({
        isOpen: true,
        title: "Progress Shared!",
        message: "Your JEE progress scorecard has been downloaded. Share it with your friends to stay motivated! 🚀"
      });
    } catch (err) {
      console.error("Error generating image:", err);
      setAlertDialog({
        isOpen: true,
        title: "Share Failed",
        message: "Failed to generate the scorecard image. Please try again."
      });
    } finally {
      setIsSharing(false);
      setIsShareModalOpen(false);
    }
  };

  const generateMotivation = async (force = false) => {
    const today = new Date().toISOString().split('T')[0];
    if (!force && profile.lastMotivationDate === today && profile.motivation) {
      setMotivation(profile.motivation);
      return;
    }

    const prompt = `Write a completely unique, highly motivational ONE-SENTENCE quote for an IIT JEE student named ${profile.name || 'Aspirant'}. 
    Use extremely simple, basic words that a 10-year-old would understand. 
    Avoid complex vocabulary. Make it intense, empowering, and very short (max 12 words). 
    Just return the quote text.`;
    const res = await callGemini(prompt, undefined, undefined, undefined, undefined, undefined, profile.name);
    const quote = res.text || "";
    setMotivation(quote);
    setProfile(p => ({ ...p, motivation: quote, lastMotivationDate: today }));
  };

  const toggleChapterCheck = (subj: string, chId: string, colId: string, forceStatus?: boolean) => {
    if (subj === "all" || !appState.data[subj]) return;
    
    setAppState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [subj]: {
          ...prev.data[subj],
          groups: prev.data[subj].groups.map(g => ({
            ...g,
            chapters: g.chapters.map(ch => {
              if (ch.id === chId) {
                return {
                  ...ch,
                  checks: { ...(ch.checks || {}), [colId]: forceStatus !== undefined ? forceStatus : !(ch.checks?.[colId]) }
                };
              }
              return ch;
            })
          }))
        }
      }
    }));
  };

  const updateChapterNote = (subj: string, chId: string, noteId: string, noteText: string) => {
    if (subj === "all" || !appState.data[subj]) return;
    
    setAppState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [subj]: {
          ...prev.data[subj],
          groups: prev.data[subj].groups.map(g => ({
            ...g,
            chapters: g.chapters.map(ch => {
              if (ch.id === chId) {
                return {
                  ...ch,
                  notes: [...(ch.notes || []), { id: noteId, text: noteText }]
                };
              }
              return ch;
            })
          }))
        }
      }
    }));
  };

  const getSubjStatsForState = (key: string, state: AppState) => {
    if (!state || !state.data) return { total: 0, done: 0, partial: 0, pct: 0 };
    const subjData = state.data[key];
    if (!subjData) return { total: 0, done: 0, partial: 0, pct: 0 };
    
    let totalChecks = 0;
    let doneChecks = 0;
    let totalChapters = 0;
    let chaptersDone = 0;
    let chaptersPartial = 0;

    (subjData.groups || []).forEach(g => {
      const countCols = (g.columns || []).filter(c => c.countsForPct);
      (g.chapters || []).forEach(ch => {
        totalChapters++;
        totalChecks += countCols.length;
        
        const checks = countCols.filter(c => ch.checks && ch.checks[c.id]).length;
        doneChecks += checks;
        
        if (countCols.length > 0) {
          if (checks === countCols.length) chaptersDone++;
          else if (checks > 0) chaptersPartial++;
        }
      });
    });

    return {
      total: totalChapters,
      done: chaptersDone,
      partial: chaptersPartial,
      pct: totalChecks ? Math.round((doneChecks / totalChecks) * 100) : 0
    };
  };

  const calculateOverallPct = (state: AppState) => {
    if (!state || !state.data) return 0;
    let totalChecks = 0;
    let doneChecks = 0;
    
    SUBJ_KEYS.forEach(k => {
      const subjData = state.data[k];
      if (subjData) {
        (subjData.groups || []).forEach(g => {
          const countCols = (g.columns || []).filter(c => c.countsForPct);
          (g.chapters || []).forEach(ch => {
            totalChecks += countCols.length;
            doneChecks += countCols.filter(c => ch.checks && ch.checks[c.id]).length;
          });
        });
      }
    });
    
    return totalChecks ? Math.round((doneChecks / totalChecks) * 100) : 0;
  };

  const getSubjStats = (key: string) => getSubjStatsForState(key, appState);

  const handleGoogleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Sign in error", error);
      setAlertDialog({
        isOpen: true,
        title: "Sign In Failed",
        message: "Could not sign in with Google. Please try again."
      });
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setProfile({
        name: "",
        exams: [],
        onboarded: false,
        darkMode: false,
        chatSessions: [],
        reminders: [],
        voiceEnabled: true
      });
      setAppState(DEFAULTS);
      setTodoList([]);
      setChatMessages([{ id: uid(), role: "ai", text: "Hello! I'm Nova, your AI Study Coach. How can I help you conquer JEE today? ✨" }]);
    } catch (error) {
      console.error("Sign out error", error);
    }
  };

  const handleSkipSignIn = () => {
    setShowAuthModal(false);
    localStorage.setItem("jee_skip_auth", "true");
  };

  const overallPct = useMemo(() => {
    return calculateOverallPct(appState);
  }, [appState]);

  const handleChatImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setChatImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() && !chatImage) return;
    
    const userMsg = { id: uid(), role: "user" as const, text: chatInput, image: chatImage || undefined };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatImage(null);
    setIsChatLoading(true);

    const prompt = chatInput || "What's in this image?";
    const imageBase64 = chatImage?.split(",")[1];
    const imageMimeType = chatImage?.split(";")[0].split(":")[1];

    // Prepare context for AI (Optimized to prevent quota issues)
    const context = {
      activeSubject: SUBJ_LABELS[activeTab as SubjectKey] || activeTab,
      progressSummary: Object.keys(appState.data || {}).map(subj => ({
        subject: subj,
        completedChapters: getSubjStats(subj).done,
        totalChapters: getSubjStats(subj).total,
      })),
      groups: Object.keys(appState.data || {}).map(subj => ({
        subject: subj,
        groups: (appState.data[subj as SubjectKey]?.groups || []).map(g => ({
          id: g.id,
          label: g.label,
          columns: (g.columns || []).map(c => ({ id: c.id, name: c.name })),
          chapters: g.chapters.map(ch => ({
            id: ch.id,
            name: ch.name,
            progress: Object.values(ch.checks || {}).filter(Boolean).length + "/" + (g.columns || []).length
          }))
        }))
      })),
      exams: profile.exams,
      todoList: (todoList || []).filter(t => !t.completed) // Only send incomplete todos
    };

    const history = chatMessages.slice(-6).map(m => ({
      role: m.role === "user" ? "user" as const : "model" as const,
      parts: [{ text: m.text }]
    }));

    const res = await callGemini(prompt, imageBase64, imageMimeType, context, history, undefined, profile.name);
    
    if (res.functionCalls) {
      for (const call of res.functionCalls) {
        if (call.name === "updateChapterStatus") {
          const { subject, chapterName, columnId, completed } = call.args as any;
          setAppState(prev => {
            if (subject === "all" || !prev.data[subject as SubjectKey]) return prev;
            return {
              ...prev,
              data: {
                ...prev.data,
                [subject]: {
                  ...prev.data[subject as SubjectKey],
                  groups: prev.data[subject as SubjectKey].groups.map(g => ({
                    ...g,
                    chapters: g.chapters.map(ch => {
                      if (ch.name.toLowerCase() === chapterName.toLowerCase()) {
                        return {
                          ...ch,
                          checks: { ...(ch.checks || {}), [columnId]: completed !== undefined ? completed : !(ch.checks?.[columnId]) }
                        };
                      }
                      return ch;
                    })
                  }))
                }
              }
            };
          });
        } else if (call.name === "addChapterNote") {
          const { subject, chapterName, note } = call.args as any;
          setAppState(prev => {
            if (subject === "all" || !prev.data[subject as SubjectKey]) return prev;
            return {
              ...prev,
              data: {
                ...prev.data,
                [subject]: {
                  ...prev.data[subject as SubjectKey],
                  groups: prev.data[subject as SubjectKey].groups.map(g => ({
                    ...g,
                    chapters: g.chapters.map(ch => {
                      if (ch.name.toLowerCase() === chapterName.toLowerCase()) {
                        // Format math properly if it's not already formatted
                        let formattedNote = note;
                        if (!formattedNote.includes('$')) {
                          // Simple heuristic: if it contains math symbols but no $, wrap it
                          if (/[=+\-*/^_{}\\]/.test(formattedNote) && !/[a-zA-Z]{5,}/.test(formattedNote)) {
                            formattedNote = `$$${formattedNote}$$`;
                          }
                        }
                        return {
                          ...ch,
                          notes: [...(ch.notes || []), { id: uid(), text: formattedNote }]
                        };
                      }
                      return ch;
                    })
                  }))
                }
              }
            };
          });
        } else if (call.name === "addExam") {
          const { name, date } = call.args as any;
          if (name && date) {
            setProfile(p => ({ ...p, exams: [...p.exams, { id: uid(), name, date, color: "amber" }] }));
          }
        } else if (call.name === "addTest") {
          const { name, date } = call.args as any;
          if (name && date) {
            setProfile(p => ({ ...p, tests: [...(p.tests || []), { id: uid(), name, date }] }));
          }
        } else if (call.name === "addChapter") {
          const { subject, groupId, name } = call.args as any;
          setAppState(prev => ({
            ...prev,
            data: {
              ...prev.data,
              [subject]: {
                ...prev.data[subject],
                groups: prev.data[subject].groups.map((g: Group) => 
                  g.id === groupId 
                    ? { ...g, chapters: [...g.chapters, { id: uid(), name, checks: {}, notes: [] }] }
                    : g
                )
              }
            }
          }));
        } else if (call.name === "updateTodoList") {
          const { action, item, date, index } = call.args as any;
          if (action === "add" && item) {
            setTodoList(prev => [...prev, { id: uid(), text: item, completed: false, date: date || new Date().toISOString().split('T')[0] }]);
          } else if (action === "remove" && index !== undefined) {
            setTodoList(prev => prev.filter((_, i) => i !== index));
          } else if (action === "toggle" && index !== undefined) {
            setTodoList(prev => prev.map((it, i) => i === index ? { ...it, completed: !it.completed } : it));
          }
        } else if (call.name === "updateGroupColumns") {
          const { subject, groupId, columns } = call.args as any;
          setAppState(prev => ({
            ...prev,
            data: {
              ...prev.data,
              [subject]: {
                ...prev.data[subject as SubjectKey],
                groups: prev.data[subject as SubjectKey].groups.map(g => 
                  g.id === groupId ? { ...g, columns } : g
                )
              }
            }
          }));
        }
      }
    }

    setChatMessages(prev => [...prev, { id: uid(), role: "ai", text: res.text || "I've updated your tracker based on our conversation!", isTyping: true }]);
    setIsChatLoading(false);
  };

  // --- Render ---
  if (!isAuthReady || !isDataLoaded) {
    return (
      <div className="fixed inset-0 bg-[var(--cream)] flex items-center justify-center p-6 z-[2000]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--amber)]" />
      </div>
    );
  }

  if (!profile.onboarded) {
    if (showAuthModal && !user) {
      return (
        <div className="fixed inset-0 bg-[var(--cream)] flex items-center justify-center p-6 z-[2000]">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[var(--cream)] rounded-3xl p-10 w-full max-w-md shadow-[var(--sh-lg)] border border-[var(--parch)] relative overflow-hidden text-center"
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--amber)] to-[var(--gold)]" />
            <div className="w-20 h-20 bg-[var(--amber-lt)]/20 text-[var(--amber)] rounded-full flex items-center justify-center mx-auto mb-6">
              <Cloud className="w-10 h-10" />
            </div>
            <h1 className="font-serif text-3xl font-medium mb-2">Sync Your Progress</h1>
            <p className="text-[var(--ink3)] text-sm mb-8 leading-relaxed">
              Sign in with Google to backup your study progress, notes, and tasks to the cloud. Access your data from any device!
            </p>
            
            <div className="space-y-3">
              <button 
                onClick={handleGoogleSignIn}
                className="w-full py-4 bg-[var(--ink)] text-[var(--cream)] rounded-2xl font-bold flex items-center justify-center gap-3 hover:opacity-90 transition-opacity shadow-lg"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </button>
              
              <button 
                onClick={handleSkipSignIn}
                className="w-full py-3 text-[var(--ink3)] font-medium hover:text-[var(--ink)] transition-colors text-sm"
              >
                Skip for now
              </button>
            </div>

            <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3 text-left">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Warning:</strong> If you skip, your data will only be saved locally on this browser. You will lose everything if you clear your cache or switch devices.
              </p>
            </div>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 bg-[var(--cream)] flex items-center justify-center p-6 z-[2000]">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[var(--cream)] rounded-3xl p-10 w-full max-w-md shadow-[var(--sh-lg)] border border-[var(--parch)] relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--amber)] to-[var(--gold)]" />
          <Logo className="w-16 h-16 mb-6" iconClassName="w-10 h-10" />
          <h1 className="font-serif text-3xl font-medium mb-2">Welcome to Study Nook</h1>
          <p className="text-[var(--ink3)] text-sm mb-8">Your cozy corner for cracking JEE, one chapter at a time.</p>
          
          <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)] mb-2 block">What should we call you?</label>
          <input 
            className="w-full p-4 bg-[var(--cream2)] border-2 border-[var(--parch)] rounded-xl mb-6 outline-none focus:border-[var(--amber)] transition-colors"
            placeholder="e.g. Sanjay"
            value={profile.name}
            onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && setProfile(prev => ({ ...prev, onboarded: true }))}
          />
          <button 
            className="w-full p-4 bg-[var(--amber)] text-white rounded-xl font-serif text-lg font-medium hover:bg-[var(--amber-dk)] transition-all transform hover:-translate-y-0.5 active:translate-y-0 shadow-[var(--sh-md)]"
            onClick={() => setProfile(prev => ({ ...prev, onboarded: true }))}
          >
            Open the Nook →
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))]">
      {/* Header */}
      <header className="sticky top-0 z-[100] glass h-16 flex items-center px-6 md:px-8 pt-[env(safe-area-inset-top)] box-content">
        <div className="max-w-[1320px] w-full mx-auto flex items-center gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab("all")}>
            <div className="hidden md:block">
              <Logo className="w-8 h-8" iconClassName="w-5 h-5" />
            </div>
            <span className="font-serif text-lg font-medium">Study <span className="text-[var(--amber)]">Nook</span></span>
            {user && (
              <div className="hidden sm:flex items-center gap-1.5 ml-2 px-2 py-1 bg-[var(--cream2)] border border-[var(--parch)] rounded-full">
                {quotaExceeded ? (
                  <>
                    <AlertCircle className="w-2.5 h-2.5 text-red-500" />
                    <span className="text-[8px] font-mono uppercase tracking-tighter text-red-600">Paused</span>
                  </>
                ) : !isOnline ? (
                  <>
                    <CloudOff className="w-2.5 h-2.5 text-[var(--ink4)]" />
                    <span className="text-[8px] font-mono uppercase tracking-tighter text-[var(--ink4)]">Offline</span>
                  </>
                ) : isSyncing ? (
                  <>
                    <RefreshCw className="w-2.5 h-2.5 text-[var(--amber)] animate-spin" />
                    <span className="text-[8px] font-mono uppercase tracking-tighter text-[var(--amber)]">Syncing</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-2.5 h-2.5 text-[var(--done)]" />
                    <span className="text-[8px] font-mono uppercase tracking-tighter text-[var(--ink4)]">Synced</span>
                  </>
                )}
              </div>
            )}
          </div>
          
          <div className="flex-1" />

          <nav className="hidden md:flex overflow-x-auto scrollbar-hide bg-[var(--cream2)] border border-[var(--parch)] p-1 rounded-full gap-1">
            {(["all", "physics", "chemistry", "mathematics"] as const).map(t => (
              <button
                key={t}
                onClick={() => { setActiveTab(t); setSearchQuery(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs md:text-sm transition-all whitespace-nowrap",
                  activeTab === t ? "bg-[var(--cream)] shadow-[var(--sh-sm)] text-[var(--ink)] font-medium" : "text-[var(--ink3)] hover:text-[var(--ink)]"
                )}
              >
                {t === "all" ? "Overview" : SUBJ_LABELS[t]}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            {user && (
              <button 
                onClick={() => setIsFriendsModalOpen(true)}
                className={cn(
                  "flex items-center gap-2 p-2 border rounded-lg transition-all shadow-[var(--sh-sm)] relative",
                  isFriendsModalOpen ? "bg-[var(--amber)] text-white border-[var(--amber)]" : "bg-[var(--cream2)] border-[var(--parch)] text-[var(--ink3)] hover:bg-[var(--cream3)]"
                )}
                title="Friends"
              >
                <Users className="w-4 h-4" />
                {(friendRequests || []).filter(r => r.to === user.uid && r.status === "pending").length > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[var(--cream)]" />
                )}
              </button>
            )}

            <button 
              onClick={() => setIsRemindersOpen(true)}
              className="flex items-center gap-2 p-2 bg-[var(--cream2)] border border-[var(--parch)] text-[var(--ink3)] rounded-lg hover:bg-[var(--cream3)] transition-all shadow-[var(--sh-sm)]"
              title="Study Reminders"
            >
              <Bell className="w-4 h-4" />
            </button>

            <button 
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-2 p-2 bg-[var(--amber)] text-white rounded-lg hover:bg-[var(--amber-dk)] transition-all shadow-[var(--sh-sm)]"
              title="Share Progress"
            >
              <Share2 className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 bg-[var(--cream2)] border border-[var(--parch)] px-3 py-1.5 rounded-full shadow-[var(--sh-sm)]">
              <div className="relative w-7 h-7">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="14" fill="none" stroke="var(--cream3)" strokeWidth="3" />
                  <circle 
                    cx="16" cy="16" r="14" fill="none" stroke="var(--amber)" strokeWidth="3" 
                    strokeDasharray={88} strokeDashoffset={88 - (88 * overallPct) / 100}
                    strokeLinecap="round" className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[8px] font-mono font-bold">{overallPct}</div>
              </div>
              <div className="hidden xs:block">
                <div className="text-xs font-mono font-bold leading-none">{overallPct}%</div>
                <div className="text-[9px] font-mono text-[var(--ink3)] uppercase">overall</div>
              </div>
            </div>

            <button 
              onClick={() => setIsDrawerOpen(true)}
              className="p-2 bg-[var(--cream2)] border border-[var(--parch)] rounded-lg hover:border-[var(--amber)] transition-all shadow-[var(--sh-sm)]"
            >
              <Settings className="w-4 h-4 text-[var(--ink3)]" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero & Bento Grid Header */}
      <AnimatePresence mode="wait">
        {activeTab === "all" && (
          <motion.section 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="max-w-[1320px] mx-auto px-6 md:px-8 pt-8 pb-6 overflow-hidden"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Upcoming Tests (Full Width Row) */}
              <div className="lg:col-span-12 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg font-medium text-[var(--ink)]">Upcoming Tests</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {(profile.tests || []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((test, idx) => {
                    const testDate = new Date(test.date + "T00:00:00");
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const diffTime = testDate.getTime() - today.getTime();
                    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    
                    return (
                      <div key={test.id ? `test-${test.id}-${idx}` : `test-${idx}`} className="flex items-center justify-between p-3 bg-[var(--cream)] border border-[var(--parch)] rounded-xl group hover:border-[var(--amber)] transition-all shadow-[var(--sh-sm)]">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-[var(--ink2)] truncate">{test.name}</h4>
                          <p className="text-[10px] font-mono text-[var(--ink4)] uppercase tracking-wider">
                            {new Date(test.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <button 
                          onClick={() => setProfile(p => ({ ...p, tests: (p.tests || []).filter(t => t.id !== test.id) }))}
                          className="p-1 text-[var(--ink4)] hover:text-red-500 hover:bg-red-500/10 rounded transition-all opacity-0 group-hover:opacity-100 ml-2"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {(profile.tests || []).length === 0 && (
                    <div className="col-span-full text-xs italic text-[var(--ink4)] text-center py-4 bg-[var(--cream2)]/30 border border-dashed border-[var(--parch)] rounded-xl">No upcoming tests.</div>
                  )}
                </div>
              </div>

              {/* Main Welcome & Motivation (Bento Large) */}
              <div className="lg:col-span-8 space-y-6">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[var(--cream)] border border-[var(--parch)] rounded-[2.5rem] p-8 md:p-10 shadow-[var(--sh-sm)] relative overflow-hidden group"
                >
                  <div className="relative z-10">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--ink4)] mb-4">
                      {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}
                    </div>
                    <h2 className="font-serif text-3xl md:text-6xl font-medium leading-[1.1] tracking-tight mb-8">
                      Hey, <span className="italic text-[var(--amber)]">{profile.name || "Aspirant"}</span>. <br />
                      Ready to <span className="underline decoration-[var(--gold)] underline-offset-8">conquer</span> today?
                    </h2>
                    
                    <div className="max-w-2xl">
                      <div className="p-6 bg-[var(--cream2)] rounded-2xl border-l-4 border-[var(--amber)] relative">
                        <Quote className="absolute -top-3 -left-3 w-8 h-8 text-[var(--amber)] opacity-20" />
                        <div className="text-sm md:text-base italic text-[var(--ink2)] leading-relaxed prose prose-sm prose-stone dark:prose-invert max-w-none">
                          <ReactMarkdown 
                            remarkPlugins={[remarkMath]} 
                            rehypePlugins={[rehypeKatex]}
                          >
                            {motivation}
                          </ReactMarkdown>
                        </div>
                        <button 
                          onClick={() => generateMotivation(true)}
                          className="mt-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--amber)] hover:text-[var(--amber-dk)] transition-all group/btn"
                        >
                          <RefreshCw className="w-3 h-3 group-hover/btn:rotate-180 transition-transform duration-500" />
                          New Perspective
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Quick Stats / Mini Bento Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {SUBJ_KEYS.map((key, idx) => {
                    const stats = getSubjStats(key);
                    const color = SUBJ_COLORS[key];
                    return (
                      <motion.div 
                        key={key}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 * (idx + 1) }}
                        onClick={() => setActiveTab(key as Tab)}
                        className="bg-[var(--cream)] border border-[var(--parch)] rounded-3xl p-6 shadow-[var(--sh-sm)] hover:shadow-[var(--sh-md)] transition-all cursor-pointer group relative overflow-hidden"
                      >
                        <div className="absolute -right-4 -bottom-4 text-7xl opacity-5 group-hover:opacity-10 transition-opacity grayscale group-hover:grayscale-0">
                          {SUBJ_ICONS[key]}
                        </div>
                        <div className="relative z-10">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                              <h3 className="font-serif text-base font-medium">{SUBJ_LABELS[key]}</h3>
                            </div>
                            <ChevronRight className="w-4 h-4 text-[var(--ink4)] group-hover:text-[var(--amber)] transition-colors" />
                          </div>
                          
                          <div className="flex items-end justify-between mb-4">
                            <div className="flex items-baseline gap-1">
                              <span className="text-3xl font-mono font-bold tracking-tighter">{stats.pct}%</span>
                              <span className="text-[10px] text-[var(--ink4)] uppercase font-mono">Mastered</span>
                            </div>
                            <div className="text-[10px] font-mono text-[var(--ink3)] text-right">
                              <span className="font-bold text-[var(--ink)]">{stats.done}</span>/{stats.total} Chapters
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="h-2 bg-[var(--cream3)] rounded-full overflow-hidden">
                              <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${stats.pct}%` }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            </div>
                            <div className="flex justify-between text-[9px] font-mono uppercase tracking-tighter text-[var(--ink4)]">
                              <span>Progress</span>
                              <span>{stats.partial} Partial</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Sidebar Bento (Today's Focus & Exams) */}
              <div className="lg:col-span-4 space-y-6 h-full flex flex-col">
                {/* Today's Focus */}
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-[var(--cream)] border border-[var(--parch)] rounded-[2.5rem] p-8 shadow-[var(--sh-sm)] flex-1 flex flex-col"
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[var(--amber-lt)] rounded-xl">
                        <CheckCircle2 className="w-5 h-5 text-[var(--amber)]" />
                      </div>
                      <h3 className="font-serif text-lg font-medium">Daily Focus</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex items-center">
                        <input 
                          type="date" 
                          value={todoDate}
                          onChange={(e) => setTodoDate(e.target.value)}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-50"
                          onClick={(e) => {
                            try {
                              (e.target as HTMLInputElement).showPicker();
                            } catch (err) {}
                          }}
                        />
                        <div className="px-3 py-1.5 bg-[var(--cream2)] border border-[var(--parch)] rounded-lg text-xs font-mono font-medium flex items-center gap-2 pointer-events-none">
                          <Calendar className="w-3.5 h-3.5 text-[var(--ink3)]" />
                          {new Date(todoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
                        </div>
                      </div>
                      <div className="px-3 py-1.5 bg-[var(--cream2)] border border-[var(--parch)] rounded-full text-[10px] font-mono font-bold">
                        {((todoList || []).filter(t => t.date === todoDate && t.completed).length)}/{((todoList || []).filter(t => t.date === todoDate || (!t.completed && t.date < todoDate)).length)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-1 space-y-3 overflow-y-auto pr-2 ai-scrollbar min-h-[200px]">
                    <AnimatePresence initial={false}>
                      {(todoList || []).filter(t => t.date === todoDate || (!t.completed && t.date < todoDate)).map((todo, idx) => {
                        const isOverdue = !todo.completed && todo.date < todoDate;
                        const formattedTodoDate = new Date(todo.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
                        const isEditing = editingTodoId === todo.id;

                        return (
                          <motion.div 
                            key={todo.id ? `todo-${todo.id}-${idx}` : `todo-${idx}`}
                            initial={{ opacity: 0, height: 0, x: -10 }}
                            animate={{ opacity: 1, height: "auto", x: 0 }}
                            exit={{ opacity: 0, height: 0, x: 10 }}
                            layout
                            className={cn(
                              "flex items-center gap-3 group p-3 rounded-2xl transition-all border",
                              isOverdue ? "bg-red-50/50 border-red-200 hover:border-red-300" : "hover:bg-[var(--cream2)] border-transparent hover:border-[var(--parch)]"
                            )}
                          >
                            <button 
                              onClick={() => toggleTodo(todo.id)}
                              className={cn(
                                "w-5 h-5 rounded-lg border flex items-center justify-center transition-all",
                                todo.completed ? "bg-[var(--amber)] border-[var(--amber)] scale-90" : isOverdue ? "border-red-300 hover:border-red-500" : "border-[var(--parch)] hover:border-[var(--amber)]"
                              )}
                            >
                              {todo.completed && <Check className="w-3 h-3 text-white" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              {isEditing ? (
                                <input 
                                  autoFocus
                                  value={editingTodoText}
                                  onChange={(e) => setEditingTodoText(e.target.value)}
                                  onBlur={saveEditingTodo}
                                  onKeyDown={(e) => e.key === 'Enter' && saveEditingTodo()}
                                  className="w-full bg-transparent text-sm outline-none border-b border-[var(--amber)]"
                                />
                              ) : (
                                <span 
                                  onClick={() => startEditingTodo(todo)}
                                  className={cn(
                                    "text-sm transition-all block break-words cursor-text",
                                    todo.completed ? "text-[var(--ink4)] line-through" : isOverdue ? "text-red-700 font-medium" : "text-[var(--ink2)]"
                                  )}
                                >
                                  {todo.text}
                                </span>
                              )}
                              {isOverdue && <span className="text-[9px] font-mono text-red-500 uppercase tracking-wider">Overdue from {formattedTodoDate}</span>}
                            </div>
                            <button 
                              onClick={() => deleteTodo(todo.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </motion.div>
                        )})}
                    </AnimatePresence>
                    {((todoList || []).filter(t => t.date === todoDate || (!t.completed && t.date < todoDate)).length === 0) && (
                      <div className="h-full flex flex-col items-center justify-center text-center py-10 border-2 border-dashed border-[var(--parch)] rounded-3xl">
                        <Target className="w-8 h-8 text-[var(--parch)] mb-2" />
                        <p className="text-xs text-[var(--ink4)] italic">What's the plan for {todoDate === new Date().toISOString().split('T')[0] ? "today" : new Date(todoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}?</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-6">
                    <div className="relative">
                      <input 
                        type="text"
                        value={newTodoText}
                        onChange={(e) => setNewTodoText(e.target.value)}
                        placeholder={`Add a new goal for ${todoDate === new Date().toISOString().split('T')[0] ? "today" : new Date(todoDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}...`}
                        className="w-full bg-[var(--cream2)] border border-[var(--parch)] rounded-2xl px-5 py-3 text-sm outline-none focus:border-[var(--amber)] focus:ring-4 focus:ring-[var(--amber-lt)] transition-all pr-12"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTodo();
                          }
                        }}
                      />
                      <button
                        onClick={addTodo}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-[var(--amber)] text-white rounded-xl shadow-sm hover:opacity-80 transition-opacity"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>

                {/* Exam Countdowns (Stacked in Sidebar) */}
                <div className="space-y-4">
                  {(profile.exams || []).map((exam, idx) => {
                    // Parse date as local midnight to avoid timezone issues
                    const examDate = new Date(exam.date + "T00:00:00");
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const diffTime = examDate.getTime() - today.getTime();
                    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    return (
                      <motion.div 
                        key={exam.id ? `exam-${exam.id}-${idx}` : `exam-${idx}`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ scale: 1.02 }}
                        className={cn(
                          "bg-[var(--cream)] border border-[var(--parch)] rounded-3xl p-6 shadow-[var(--sh-sm)] relative overflow-hidden group transition-all",
                          days <= 7 && "border-red-500/30 bg-red-500/5 dark:bg-red-500/10"
                        )}
                      >
                        <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: `var(--${exam.color})` }} />
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Calendar className="w-3 h-3 text-[var(--ink3)]" />
                              <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink3)]">{exam.name}</span>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className={cn(
                                "text-4xl font-mono font-bold tracking-tighter",
                                days === 0 ? "text-[var(--amber)]" : (days < 0 ? "text-[var(--done)]" : (days <= 7 ? "text-red-500" : "text-[var(--ink)]"))
                              )}>
                                {days > 0 ? days : (days === 0 ? "🎯" : "✅")}
                              </span>
                              <span className="text-xs font-mono text-[var(--ink3)] uppercase">
                                {days > 0 ? "days" : (days === 0 ? "Today" : "Passed")}
                              </span>
                            </div>
                          </div>
                          <button 
                            onClick={() => setProfile(p => ({ ...p, exams: (p.exams || []).filter(e => e.id !== exam.id) }))}
                            className="p-1.5 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {days > 0 && (
                          <div className="mt-4 h-1 bg-[var(--cream3)] rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-1000"
                              style={{ 
                                width: `${Math.max(0, Math.min(100, (days / 365) * 100))}%`,
                                backgroundColor: `var(--${exam.color})`
                              }}
                            />
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                  {profile.exams.length === 0 && (
                    <button 
                      onClick={() => setIsDrawerOpen(true)}
                      className="w-full py-6 border-2 border-dashed border-[var(--parch)] rounded-3xl text-[var(--ink4)] hover:text-[var(--amber)] hover:border-[var(--amber)] transition-all flex flex-col items-center gap-2 group"
                    >
                      <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-mono uppercase tracking-widest">Add Exam Date</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Main Content (Tabs & Detailed Views) */}
      <main ref={mainContentRef} className="max-w-[1320px] mx-auto px-6 md:px-8 mt-6 pb-24 md:pb-0">
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--ink3)]" />
          <input
            type="text"
            placeholder="Search chapters across all subjects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--cream2)] border border-[var(--parch)] rounded-2xl pl-12 pr-4 py-3 outline-none focus:border-[var(--amber)] transition-all"
          />
        </div>

        {searchQuery.trim() ? (
          <div className="space-y-4">
            <h3 className="font-serif text-xl font-medium mb-4">Search Results</h3>
            {SUBJ_KEYS.flatMap(subj => 
              (appState.data[subj]?.groups || []).flatMap(g => 
                (g.chapters || []).filter(ch => ch.name.toLowerCase().includes(searchQuery.toLowerCase()) || ch.notes?.some(n => n.text.toLowerCase().includes(searchQuery.toLowerCase()))).map(ch => ({ subj, g, ch }))
              )
            ).map(({ subj, g, ch }, idx) => (
              <div key={`${subj}-${ch.id}-search-${idx}`} className="p-4 bg-[var(--cream)] border border-[var(--parch)] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink4)]">{SUBJ_LABELS[subj]}</span>
                    <span className="text-[10px] text-[var(--ink4)]">•</span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink4)]">{g.label}</span>
                  </div>
                  <h4 className="font-medium text-[var(--ink)]">{ch.name}</h4>
                </div>
                <div className="flex gap-2">
                  {(g.columns || []).map((col, cIdx) => (
                    <button 
                      key={`${subj}-${ch.id}-${col.id}-search-${idx}-${cIdx}`}
                      onClick={() => toggleChapterCheck(subj, ch.id, col.id)}
                      className={cn(
                        "w-8 h-8 rounded-md border-2 transition-all flex items-center justify-center",
                        ch.checks[col.id] ? "bg-[var(--done-lt)] border-[var(--done)] text-[var(--done)]" : "border-[var(--parch)] hover:border-[var(--amber)]"
                      )}
                      title={col.name}
                    >
                      {ch.checks[col.id] && <CheckCircle2 className="w-5 h-5" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {SUBJ_KEYS.flatMap(subj => 
              (appState.data[subj]?.groups || []).flatMap(g => 
                (g.chapters || []).filter(ch => ch.name.toLowerCase().includes(searchQuery.toLowerCase()) || ch.notes?.some(n => n.text.toLowerCase().includes(searchQuery.toLowerCase())))
              )
            ).length === 0 && (
              <div className="py-10 text-center border-2 border-dashed border-[var(--parch)] rounded-2xl">
                <p className="text-sm text-[var(--ink3)] italic">No chapters found matching "{searchQuery}"</p>
              </div>
            )}
          </div>
        ) : (
        <AnimatePresence mode="wait">
          {activeTab === "all" ? (
            <motion.div 
              key="all"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Recent Notes Feature */}
              <div className="mt-4">
                <div className="bg-[var(--cream)] border border-[var(--parch)] rounded-2xl p-6 shadow-[var(--sh-sm)]">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="p-2 bg-[var(--amber-lt)] rounded-lg">
                      <FileText className="w-5 h-5 text-[var(--amber)]" />
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-medium">Study Notes</h3>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink3)]">Quick access to your chapter notes</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {SUBJ_KEYS.flatMap(subj => 
                      (appState.data[subj]?.groups || []).flatMap(g => 
                        (g.chapters || []).filter(ch => ch.notes && ch.notes.length > 0).map(ch => ({ subj, ch }))
                      )
                    ).slice(0, 6).map(({ subj, ch }, idx) => (
                      <motion.div 
                        key={`${subj}-${ch.id}-recent-${idx}`}
                        whileHover={{ y: -2 }}
                        onClick={() => {
                          setSelectedChapter({ subj, ch });
                          setIsNoteModalOpen(true);
                        }}
                        className="p-4 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl hover:border-[var(--amber)] transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--ink4)]">{SUBJ_LABELS[subj]}</span>
                        </div>
                        <h4 className="font-serif text-sm font-medium mb-2 group-hover:text-[var(--amber)] transition-colors">{ch.name}</h4>
                        <div className="text-xs text-[var(--ink3)] italic line-clamp-2 leading-relaxed prose prose-sm prose-stone dark:prose-invert max-w-none">
                          <ReactMarkdown 
                            remarkPlugins={[remarkMath]} 
                            rehypePlugins={[rehypeKatex]}
                          >
                            {ch.notes[ch.notes.length - 1].text}
                          </ReactMarkdown>
                        </div>
                      </motion.div>
                    ))}
                    {SUBJ_KEYS.every(s => (appState.data[s]?.groups || []).every(g => (g.chapters || []).every(ch => !ch.notes || ch.notes.length === 0))) && (
                      <div className="col-span-full py-10 text-center border-2 border-dashed border-[var(--parch)] rounded-2xl">
                        <p className="text-sm text-[var(--ink4)] italic">No notes yet. Tell the AI Tutor to add some for you!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer Text */}
              <div className="w-full text-center py-16 px-2 flex flex-col items-center justify-center">
                <p className="font-serif text-2xl sm:text-3xl lg:text-4xl text-[var(--ink4)] opacity-40 italic leading-snug text-balance w-full max-w-4xl mx-auto">
                  "Phadlo chaiye kahi se, syllabus track karo Study Nook se"
                </p>
                <p className="text-xs font-mono text-[var(--ink4)] opacity-50 mt-6">Made with love - Sanjay &lt;3</p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 pb-4 border-b border-[var(--parch)] gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: SUBJ_COLORS[activeTab] }} />
                  <div>
                    <h2 className="font-serif text-2xl md:text-3xl font-medium">{SUBJ_LABELS[activeTab]}</h2>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)]">JEE Syllabus</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setIsEditMode(!isEditMode)}
                    className={cn(
                      "flex items-center justify-center p-2 rounded-lg transition-colors border",
                      isEditMode ? "bg-[var(--amber)] text-white border-[var(--amber)]" : "bg-[var(--cream2)] text-[var(--ink3)] border-[var(--parch)] hover:border-[var(--amber)]"
                    )}
                    title={isEditMode ? "Done Editing" : "Edit Syllabus"}
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <div className="font-mono text-base md:text-lg text-[var(--ink3)]">{getSubjStats(activeTab).pct}% complete</div>
                </div>
              </div>

              <div className="md:overflow-visible -mx-6 px-6 md:mx-0 md:px-0">
                {/* Desktop Table */}
                <table className="hidden md:table w-full border-separate border-spacing-y-1">
                  {(appState.data[activeTab as SubjectKey]?.groups || []).map((group, gIdx) => (
                    <tbody key={`${activeTab}-${group.id}-${gIdx}`}>
                      <tr>
                        <td colSpan={(group.columns || []).length + 1} className="px-4 pt-6 pb-2 font-mono text-[10px] uppercase tracking-widest text-[var(--ink4)] border-t border-[var(--parch)]">
                          {isEditMode ? (
                            <div className="flex items-center gap-2">
                              <input 
                                value={group.label}
                                onChange={(e) => updateGroupLabel(activeTab as SubjectKey, group.id, e.target.value)}
                                className="bg-transparent border-b border-dashed border-[var(--ink4)] outline-none focus:border-[var(--amber)] text-[var(--ink)]"
                              />
                              <button onClick={() => moveGroup(activeTab as SubjectKey, group.id, 'up')} className="p-1 hover:text-[var(--amber)]"><ArrowUp className="w-3 h-3" /></button>
                              <button onClick={() => moveGroup(activeTab as SubjectKey, group.id, 'down')} className="p-1 hover:text-[var(--amber)]"><ArrowDown className="w-3 h-3" /></button>
                            </div>
                          ) : (
                            group.label
                          )}
                        </td>
                      </tr>
                      <tr className="text-left">
                        <th className="px-4 py-2 font-mono text-[10px] uppercase text-[var(--ink3)]">Chapter</th>
                        {(group.columns || []).map(col => (
                          <th key={`${activeTab}-${group.id}-${col.id}`} className="px-4 py-2 text-center font-mono text-[10px] uppercase text-[var(--ink3)]">
                            {isEditMode ? (
                              <div className="flex flex-col items-center gap-1">
                                <input 
                                  value={col.name}
                                  onChange={(e) => updateColumnName(activeTab as SubjectKey, group.id, col.id, e.target.value)}
                                  className="bg-transparent border-b border-dashed border-[var(--ink4)] outline-none focus:border-[var(--amber)] text-[var(--ink)] text-center w-16"
                                />
                                <div className="flex items-center">
                                  <button onClick={() => moveColumn(activeTab as SubjectKey, group.id, col.id, 'left')} className="p-1 hover:text-[var(--amber)]"><ArrowLeft className="w-3 h-3" /></button>
                                  <button onClick={() => moveColumn(activeTab as SubjectKey, group.id, col.id, 'right')} className="p-1 hover:text-[var(--amber)]"><ArrowRight className="w-3 h-3" /></button>
                                </div>
                              </div>
                            ) : (
                              col.name
                            )}
                          </th>
                        ))}
                      </tr>
                      {(group.chapters || []).map((ch, cIdx) => (
                        <tr key={`${activeTab}-${ch.id}-${cIdx}`} className="group hover:bg-[var(--cream2)] transition-colors">
                          <td className="px-4 py-3 bg-[var(--cream)] rounded-l-xl border-y border-l border-transparent group-hover:border-[var(--parch)]">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                Object.values(ch.checks || {}).filter(Boolean).length === (group.columns || []).length ? "bg-[var(--done)]" : 
                                Object.values(ch.checks || {}).filter(Boolean).length > 0 ? "bg-[var(--gold)]" : "bg-[var(--cream3)] border border-[var(--parch)]"
                              )} />
                              <div 
                                className="flex flex-col cursor-help flex-1"
                                onClick={() => {
                                  if (!isEditMode) {
                                    setSelectedChapter({ subj: activeTab as SubjectKey, ch });
                                    setIsNoteModalOpen(true);
                                  }
                                }}
                              >
                                {isEditMode ? (
                                  <div className="flex items-center gap-2">
                                    <input 
                                      value={ch.name}
                                      onChange={(e) => updateChapterName(activeTab as SubjectKey, group.id, ch.id, e.target.value)}
                                      className="bg-transparent border-b border-dashed border-[var(--ink4)] outline-none focus:border-[var(--amber)] text-[var(--ink)] flex-1 text-sm"
                                    />
                                    <button onClick={(e) => { e.stopPropagation(); moveChapter(activeTab as SubjectKey, group.id, ch.id, 'up'); }} className="p-1 hover:text-[var(--amber)]"><ArrowUp className="w-3 h-3" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); moveChapter(activeTab as SubjectKey, group.id, ch.id, 'down'); }} className="p-1 hover:text-[var(--amber)]"><ArrowDown className="w-3 h-3" /></button>
                                  </div>
                                ) : (
                                  <>
                                    <span className="text-sm text-[var(--ink2)] group-hover:text-[var(--amber)] transition-colors">{ch.name}</span>
                                    {ch.notes && ch.notes.length > 0 && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <FileText className="w-2.5 h-2.5 text-[var(--amber)]" />
                                        <span className="text-[10px] text-[var(--amber)] italic line-clamp-1 max-w-[150px]">
                                          {ch.notes[ch.notes.length - 1].text}
                                        </span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                          {(group.columns || []).map(col => (
                            <td key={`${activeTab}-${ch.id}-${col.id}`} className="px-4 py-3 text-center bg-[var(--cream)] border-y border-transparent group-hover:border-[var(--parch)]">
                              <button 
                                type="button"
                                onClick={() => toggleChapterCheck(activeTab as SubjectKey, ch.id, col.id)}
                                className={cn(
                                  "w-8 h-8 rounded-md border-2 transition-all flex items-center justify-center mx-auto",
                                  ch.checks[col.id] ? "bg-[var(--done-lt)] border-[var(--done)] text-[var(--done)]" : "border-[var(--parch)] hover:border-[var(--amber)]"
                                )}
                              >
                                {ch.checks[col.id] && <CheckCircle2 className="w-5 h-5" />}
                              </button>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4 pb-32">
                  {(appState.data[activeTab as SubjectKey]?.groups || []).map((group, gIdx) => (
                    <div key={`${activeTab}-${group.id}-mobile-${gIdx}`} className="space-y-2">
                      <h3 className="px-2 font-mono text-[9px] uppercase tracking-widest text-[var(--ink4)] opacity-70">
                        {isEditMode ? (
                          <div className="flex items-center gap-2">
                            <input 
                              value={group.label}
                              onChange={(e) => updateGroupLabel(activeTab as SubjectKey, group.id, e.target.value)}
                              className="bg-transparent border-b border-dashed border-[var(--ink4)] outline-none focus:border-[var(--amber)] text-[var(--ink)]"
                            />
                            <button onClick={() => moveGroup(activeTab as SubjectKey, group.id, 'up')} className="p-1 hover:text-[var(--amber)]"><ArrowUp className="w-3 h-3" /></button>
                            <button onClick={() => moveGroup(activeTab as SubjectKey, group.id, 'down')} className="p-1 hover:text-[var(--amber)]"><ArrowDown className="w-3 h-3" /></button>
                          </div>
                        ) : (
                          group.label
                        )}
                      </h3>
                      <div className="grid grid-cols-1 gap-2">
                        {(group.chapters || []).map((ch, cIdx) => (
                          <div key={`${activeTab}-${ch.id}-mobile-${cIdx}`} className="bg-[var(--cream)] border border-[var(--parch)] rounded-xl p-3 shadow-sm flex flex-col gap-3">
                            <div 
                              className="flex items-center gap-2 cursor-pointer"
                              onClick={() => {
                                if (!isEditMode) {
                                  setSelectedChapter({ subj: activeTab as SubjectKey, ch });
                                  setIsNoteModalOpen(true);
                                }
                              }}
                            >
                              <div className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                Object.values(ch.checks || {}).filter(Boolean).length === (group.columns || []).length ? "bg-[var(--done)]" : 
                                Object.values(ch.checks || {}).filter(Boolean).length > 0 ? "bg-[var(--gold)]" : "bg-[var(--cream3)] border border-[var(--parch)]"
                              )} />
                              <div className="flex-1 min-w-0">
                                {isEditMode ? (
                                  <div className="flex items-center gap-2">
                                    <input 
                                      value={ch.name}
                                      onChange={(e) => updateChapterName(activeTab as SubjectKey, group.id, ch.id, e.target.value)}
                                      className="bg-transparent border-b border-dashed border-[var(--ink4)] outline-none focus:border-[var(--amber)] text-[var(--ink)] flex-1 text-sm"
                                    />
                                    <button onClick={(e) => { e.stopPropagation(); moveChapter(activeTab as SubjectKey, group.id, ch.id, 'up'); }} className="p-1 hover:text-[var(--amber)]"><ArrowUp className="w-3 h-3" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); moveChapter(activeTab as SubjectKey, group.id, ch.id, 'down'); }} className="p-1 hover:text-[var(--amber)]"><ArrowDown className="w-3 h-3" /></button>
                                  </div>
                                ) : (
                                  <>
                                    <h4 className="text-sm font-medium text-[var(--ink2)] leading-tight truncate">{ch.name}</h4>
                                    {ch.notes && ch.notes.length > 0 && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <FileText className="w-2.5 h-2.5 text-[var(--amber)]" />
                                        <span className="text-[9px] text-[var(--amber)] italic truncate">
                                          {ch.notes.length} note{ch.notes.length > 1 ? 's' : ''} added
                                        </span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              {!isEditMode && <ChevronRight className="w-3 h-3 text-[var(--ink4)]" />}
                            </div>
                            
                            <div className="flex flex-wrap gap-1.5">
                              {(group.columns || []).map(col => (
                                <button 
                                  key={`${activeTab}-${ch.id}-${col.id}-mobile`}
                                  onClick={() => toggleChapterCheck(activeTab as SubjectKey, ch.id, col.id)}
                                  className={cn(
                                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-mono border transition-all",
                                    ch.checks[col.id] 
                                      ? "bg-[var(--done-lt)] border-[var(--done)] text-[var(--done-dk)]" 
                                      : "bg-[var(--cream2)] border-[var(--parch)] text-[var(--ink3)]"
                                  )}
                                >
                                  {ch.checks[col.id] ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3 opacity-20" />}
                                  <span>{col.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--cream)] border-t border-[var(--parch)] z-[400] flex justify-around p-2 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        {(["all", "physics", "chemistry", "mathematics"] as const).map(t => (
          <button
            key={t}
            onClick={() => { setActiveTab(t); setSearchQuery(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className={cn(
              "flex flex-col items-center p-2 rounded-xl transition-all flex-1",
              activeTab === t && !searchQuery ? "text-[var(--amber)]" : "text-[var(--ink3)]"
            )}
          >
            {t === "all" ? <LayoutDashboard className="w-5 h-5" /> : SUBJ_ICONS[t]}
            <span className="text-[10px] mt-1 font-medium">{t === "all" ? "Overview" : SUBJ_LABELS[t]}</span>
          </button>
        ))}
      </div>

      {/* Floating AI Tutor FAB */}
      <button 
        onClick={() => setIsTutorOpen(!isTutorOpen)}
        className={cn(
          "fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] left-6 md:bottom-8 md:left-8 w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center shadow-2xl z-[500] transition-all transform hover:scale-110",
          isTutorOpen ? "bg-[var(--amber)] text-white" : "bg-[var(--cream)] border border-[var(--parch)] text-[var(--amber)]"
        )}
      >
        <Sparkles className={cn("w-5 h-5 md:w-6 md:h-6", isTutorOpen && "animate-pulse")} />
      </button>

      {/* Floating AI Tutor Window (FIXED & IMPROVED) */}
      <AnimatePresence>
        {isTutorOpen && (
          <motion.div 
            drag={window.innerWidth > 768}
            dragMomentum={false}
            initial={{ opacity: 0, scale: 0.9, x: 20, y: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: 20, y: 20 }}
            className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-6 md:bottom-24 md:left-8 w-[calc(100vw-3rem)] max-w-[380px] h-[550px] max-h-[calc(100vh-8rem)] bg-[var(--cream)] border border-[var(--parch)] rounded-[2rem] shadow-[var(--sh-lg)] z-[500] flex flex-col overflow-hidden"
          >
            <div className="p-5 border-b border-[var(--parch)] flex justify-between items-center bg-[var(--cream2)] cursor-move">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--amber)]" />
                <span className="font-serif font-medium">AI Tutor</span>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={startNewChat}
                  title="New Chat"
                  className="p-1.5 hover:bg-[var(--cream3)] rounded-lg transition-colors text-[var(--ink3)]"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button onClick={() => setIsTutorOpen(false)} className="p-1.5 hover:bg-[var(--cream3)] rounded-lg transition-colors">
                  <X className="w-4 h-4 text-[var(--ink3)]" />
                </button>
              </div>
            </div>

            <div className="flex border-b border-[var(--parch)] bg-[var(--cream2)]">
              <button 
                onClick={() => setTutorTab("chat")}
                className={cn(
                  "flex-1 py-2 text-[10px] font-mono uppercase tracking-widest transition-all border-b-2",
                  tutorTab === "chat" ? "border-[var(--amber)] text-[var(--amber)] bg-[var(--cream)]" : "border-transparent text-[var(--ink4)] hover:text-[var(--ink2)]"
                )}
              >
                Chat
              </button>
              <button 
                onClick={() => setTutorTab("history")}
                className={cn(
                  "flex-1 py-2 text-[10px] font-mono uppercase tracking-widest transition-all border-b-2",
                  tutorTab === "history" ? "border-[var(--amber)] text-[var(--amber)] bg-[var(--cream)]" : "border-transparent text-[var(--ink4)] hover:text-[var(--ink2)]"
                )}
              >
                History
              </button>
            </div>

            <div 
              className="flex-1 overflow-y-auto p-5 space-y-4 ai-scrollbar bg-[var(--cream)]"
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              {tutorTab === "chat" ? (
                <>
                  {chatMessages.map((msg, i) => (
                    <div key={msg.id ? `msg-${msg.id}-${i}` : `msg-${i}`} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                      {msg.image && (
                        <img src={msg.image} alt="Uploaded" className="max-w-[200px] rounded-xl mb-2 border border-[var(--parch)]" />
                      )}
                      <div className={cn(
                        "max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm relative group/msg",
                        msg.role === "user" ? "bg-[var(--amber)] text-white rounded-tr-none" : "bg-[var(--cream)] text-[var(--ink)] border border-[var(--parch)] rounded-tl-none"
                      )}>
                        {msg.role === "ai" && !msg.isTyping && (
                          <button 
                            onClick={() => handleSpeak(msg.text, i)}
                            className="absolute -top-2 -right-2 p-1.5 bg-[var(--cream)] border border-[var(--parch)] text-[var(--ink4)] hover:text-[var(--amber)] rounded-full shadow-sm transition-all z-10"
                            title="Speak message"
                          >
                            {speakingMsgIndex === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Volume2 className="w-3 h-3" />}
                          </button>
                        )}
                        <div className={cn(
                          "prose prose-sm max-w-none", 
                          msg.role === "user" 
                            ? "prose-invert" 
                            : "text-[var(--ink)] prose-p:text-[var(--ink)] prose-headings:text-[var(--ink)] prose-strong:text-[var(--ink)] prose-a:text-[var(--amber)] prose-code:text-[var(--ink)] prose-li:text-[var(--ink)] dark:text-[var(--ink)] dark:prose-p:text-[var(--ink)] dark:prose-headings:text-[var(--ink)] dark:prose-strong:text-[var(--ink)] dark:prose-invert"
                        )}>
                          {msg.isTyping ? (
                            <TypingText text={msg.text} onComplete={() => {
                              setChatMessages(prev => prev.map((m, idx) => idx === i ? { ...m, isTyping: false } : m));
                            }} />
                          ) : (
                            <ReactMarkdown 
                              remarkPlugins={[remarkMath]} 
                              rehypePlugins={[rehypeKatex]}
                            >
                              {msg.text}
                            </ReactMarkdown>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex items-center gap-2 text-[var(--ink3)] text-xs italic">
                      <Sparkles className="w-3 h-3 animate-pulse" />
                      AI is thinking...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              ) : (
                <div className="space-y-2">
                  {((profile.chatSessions || []).length === 0) ? (
                    <div className="text-center py-10">
                      <History className="w-10 h-10 text-[var(--parch)] mx-auto mb-3" />
                      <p className="text-xs text-[var(--ink4)] italic">No previous chats yet.</p>
                    </div>
                  ) : (
                    (profile.chatSessions || []).map((session, idx) => (
                      <div 
                        key={session.id ? `session-${session.id}-${idx}` : `session-${idx}`}
                        className={cn(
                          "p-4 rounded-2xl border transition-all cursor-pointer group/session",
                          currentSessionId === session.id ? "bg-[var(--amber-lt)] border-[var(--amber)]" : "bg-[var(--cream2)] border-[var(--parch)] hover:border-[var(--amber)]"
                        )}
                        onClick={() => loadChatSession(session)}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-medium truncate pr-2">{session.title}</h4>
                            <p className="text-[9px] text-[var(--ink4)] mt-1">
                              {new Date(session.timestamp).toLocaleDateString()} · {session.messages.length} messages
                            </p>
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChatSession(session.id);
                            }}
                            className="p-1.5 opacity-0 group-hover/session:opacity-100 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {tutorTab === "chat" && (
              <div 
                className="p-4 border-t border-[var(--parch)] bg-[var(--cream2)]"
                onPointerDownCapture={(e) => e.stopPropagation()}
              >
                {showAiHint && chatMessages.length <= 1 && (
                  <div className="mb-3 px-2 flex justify-between items-center bg-[var(--cream)] p-2 rounded-xl border border-[var(--parch)]">
                    <p className="text-[10px] text-[var(--ink3)] italic flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-[var(--amber)]" />
                      Try: "Mark Physics Chapter 1 as studied"
                    </p>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setShowAiHint(false);
                          localStorage.setItem("jee_hide_ai_hint", "true");
                        }}
                        className="p-1 hover:bg-[var(--cream3)] rounded-full transition-colors text-[var(--ink4)]"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
                {chatImage && (
                  <div className="relative inline-block mb-3">
                    <img src={chatImage} className="w-16 h-16 object-cover rounded-lg border border-[var(--parch)]" />
                    <button 
                      onClick={() => setChatImage(null)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label className="p-2.5 bg-[var(--cream)] border border-[var(--parch)] rounded-full text-[var(--ink3)] hover:text-[var(--amber)] cursor-pointer transition-all">
                    <ImageIcon className="w-4 h-4" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleChatImageUpload} />
                  </label>
                  <button 
                    onClick={startListening}
                    className={cn(
                      "p-2.5 border rounded-full transition-all",
                      isListening ? "bg-red-500/10 border-red-200/50 text-red-500 animate-pulse" : "bg-[var(--cream)] border-[var(--parch)] text-[var(--ink3)] hover:text-[var(--amber)]"
                    )}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                  <input 
                    className="flex-1 bg-[var(--cream)] border border-[var(--parch)] rounded-full px-4 py-2 text-sm outline-none focus:border-[var(--amber)] transition-all"
                    placeholder="Ask a doubt... (paste images here)"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                    onPaste={(e) => {
                      const items = e.clipboardData?.items;
                      if (!items) return;
                      for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf("image") !== -1) {
                          const blob = items[i].getAsFile();
                          if (blob) {
                            const reader = new FileReader();
                            reader.onloadend = () => setChatImage(reader.result as string);
                            reader.readAsDataURL(blob);
                          }
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={sendChatMessage}
                    disabled={isChatLoading || (!chatInput.trim() && !chatImage)}
                    className="p-2.5 bg-[var(--amber)] text-white rounded-full hover:bg-[var(--amber-dk)] transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Drawer */}
      <AnimatePresence>
        {isRemindersOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsRemindersOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="relative w-full max-w-md bg-[var(--cream)] rounded-3xl shadow-2xl overflow-hidden border border-[var(--parch)]"
            >
              <div className="p-6 border-b border-[var(--parch)] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[var(--amber-lt)]/20 rounded-xl">
                    <Bell className="w-5 h-5 text-[var(--amber)]" />
                  </div>
                  <h2 className="font-serif text-xl font-medium">Study Reminders</h2>
                </div>
                <button onClick={() => setIsRemindersOpen(false)} className="p-2 hover:bg-[var(--cream2)] rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
                {profile.reminders && profile.reminders.length > 0 ? (
                  (profile.reminders || []).map((reminder, idx) => (
                    <div key={reminder.id ? `reminder-${reminder.id}-${idx}` : `reminder-${idx}`} className="flex items-center justify-between p-4 bg-[var(--cream2)] rounded-2xl border border-[var(--parch)]">
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-[var(--cream)] rounded-xl shadow-sm">
                          <Clock className="w-4 h-4 text-[var(--ink3)]" />
                        </div>
                        <div>
                          <div className="font-medium text-sm text-[var(--ink)]">{reminder.subject}</div>
                          <div className="text-xs font-mono text-[var(--ink4)]">{reminder.time}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setProfile(p => ({
                              ...p,
                              reminders: p.reminders?.map(r => r.id === reminder.id ? { ...r, enabled: !r.enabled } : r)
                            }));
                          }}
                          className="p-2 text-[var(--ink3)] hover:text-[var(--amber)] transition-colors"
                        >
                          {reminder.enabled ? <ToggleRight className="w-6 h-6 text-[var(--amber)]" /> : <ToggleLeft className="w-6 h-6" />}
                        </button>
                        <button 
                          onClick={() => {
                            setProfile(p => ({
                              ...p,
                              reminders: p.reminders?.filter(r => r.id !== reminder.id) || []
                            }));
                          }}
                          className="p-2 text-[var(--ink3)] hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10">
                    <div className="w-16 h-16 bg-[var(--cream2)] rounded-full flex items-center justify-center mx-auto mb-4">
                      <Bell className="w-8 h-8 text-[var(--ink4)] opacity-20" />
                    </div>
                    <p className="text-[var(--ink3)] text-sm">No reminders set yet.</p>
                  </div>
                )}
              </div>

              <div className="p-6 bg-[var(--cream2)] border-t border-[var(--parch)]">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const subject = formData.get("subject") as string;
                    const time = formData.get("time") as string;
                    if (!subject || !time) return;

                    const newReminder: Reminder = {
                      id: Math.random().toString(36).substring(2, 11),
                      subject,
                      time,
                      enabled: true
                    };

                    setProfile(p => ({
                      ...p,
                      reminders: [...(p.reminders || []), newReminder]
                    }));
                    e.currentTarget.reset();
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <select name="subject" className="bg-[var(--cream)] border border-[var(--parch)] rounded-xl px-4 py-2 text-sm outline-none focus:border-[var(--amber)] text-[var(--ink)]">
                      <option value="Physics">Physics</option>
                      <option value="Chemistry">Chemistry</option>
                      <option value="Mathematics">Mathematics</option>
                      <option value="General Study">General Study</option>
                      <option value="Revision">Revision</option>
                      <option value="Mock Test">Mock Test</option>
                    </select>
                    <input name="time" type="time" required className="bg-[var(--cream)] border border-[var(--parch)] rounded-xl px-4 py-2 text-sm outline-none focus:border-[var(--amber)] text-[var(--ink)]" />
                  </div>
                  <button type="submit" className="w-full py-3 bg-[var(--ink)] text-white rounded-xl text-sm font-medium hover:bg-black transition-all flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" />
                    Add Reminder
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}

        {activeReminder && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative w-full max-w-sm bg-[var(--cream)] rounded-[40px] shadow-2xl p-10 text-center overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-[var(--amber)]" />
              <div className="w-24 h-24 bg-[var(--amber-lt)]/20 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
                <Bell className="w-12 h-12 text-[var(--amber)]" />
              </div>
              <h2 className="font-serif text-3xl font-medium mb-2">Study Time!</h2>
              <p className="text-[var(--ink3)] mb-8">It's time for your scheduled <span className="font-bold text-[var(--ink)]">{activeReminder.subject}</span> session.</p>
              
              <div className="space-y-3">
                <button 
                  onClick={() => {
                    setActiveReminder(null);
                  }}
                  className="w-full py-4 bg-[var(--amber)] text-white rounded-2xl font-medium hover:bg-[var(--amber-dk)] transition-all shadow-lg"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isFriendsModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-[2000]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[var(--cream)] rounded-[2.5rem] w-full max-w-2xl max-h-[85vh] shadow-[var(--sh-lg)] border border-[var(--parch)] relative overflow-hidden flex flex-col"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[var(--amber)] to-[var(--gold)]" />
              
              <div className="p-6 border-b border-[var(--parch)] flex justify-between items-center bg-[var(--cream)]/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[var(--amber-lt)]/20 rounded-xl">
                    <Users className="w-5 h-5 text-[var(--amber)]" />
                  </div>
                  <div>
                    <h2 className="font-serif text-xl font-medium">Study Circle</h2>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink4)]">Track progress with friends</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsAddFriendOpen(true)}
                    className="p-2 bg-[var(--ink)] text-white rounded-xl hover:bg-black transition-all shadow-sm"
                    title="Add Friend"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => setIsFriendsModalOpen(false)} 
                    className="p-2 hover:bg-[var(--cream2)] rounded-xl transition-all"
                  >
                    <X className="w-5 h-5 text-[var(--ink3)]" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                {/* Pending Requests */}
                {((friendRequests || []).filter(r => r.to === user?.uid && r.status === "pending").length > 0 || 
                  (friendRequests || []).filter(r => r.from === user?.uid && r.status === "pending").length > 0) && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink4)] px-1">Pending Requests</h3>
                    <div className="space-y-3">
                      {/* Incoming */}
                      {Array.from(
                        (friendRequests || [])
                          .filter(r => r.to === user?.uid && r.status === "pending")
                          .reduce((acc, req) => {
                            if (!acc.has(req.from)) acc.set(req.from, req);
                            return acc;
                          }, new Map())
                          .values()
                      ).map((req: any) => {
                        const friend = friendsData[req.from];
                        return (
                          <div key={`incoming-${req.id}`} className="bg-[var(--cream)] border border-[var(--parch)] rounded-2xl p-4 flex items-center gap-4 shadow-[var(--sh-sm)]">
                            <div className="w-10 h-10 rounded-full bg-[var(--amber-lt)]/20 flex items-center justify-center text-[var(--amber)] font-bold border border-[var(--parch)]">
                              {friend?.profile?.name?.[0] || "?"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{friend?.profile?.name || "Unknown User"}</p>
                              <p className="text-[9px] text-[var(--ink4)] font-mono">wants to connect</p>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleAcceptFriend(req.id)}
                                className="p-2 bg-[var(--done-lt)] text-[var(--done)] rounded-lg hover:bg-[var(--done)] hover:text-white transition-all"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleRejectFriend(req.id)}
                                className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Sent */}
                      {Array.from(
                        (friendRequests || [])
                          .filter(r => r.from === user?.uid && r.status === "pending")
                          .reduce((acc, req) => {
                            if (!acc.has(req.to)) acc.set(req.to, req);
                            return acc;
                          }, new Map())
                          .values()
                      ).map((req: any) => {
                        const friend = friendsData[req.to];
                        return (
                          <div key={`sent-${req.id}`} className="bg-[var(--cream2)]/50 border border-dashed border-[var(--parch)] rounded-2xl p-4 flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-[var(--ink4)]/10 flex items-center justify-center text-[var(--ink4)] font-bold border border-[var(--parch)]">
                              {friend?.profile?.name?.[0] || "?"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate text-[var(--ink3)]">{friend?.profile?.name || "Unknown User"}</p>
                              <p className="text-[9px] text-[var(--ink4)] font-mono italic">Request sent</p>
                            </div>
                            <button 
                              onClick={() => handleRejectFriend(req.id)}
                              className="p-2 text-[var(--ink4)] hover:text-red-500 transition-all"
                              title="Cancel Request"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Friends List */}
                <div className="space-y-4">
                  <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink4)] px-1">Friends</h3>
                  {((friendRequests || []).filter(r => r.status === "accepted").length === 0) ? (
                    <div className="text-center py-12 border-2 border-dashed border-[var(--parch)] rounded-2xl bg-[var(--cream2)]/30">
                      <Users className="w-8 h-8 text-[var(--ink4)] opacity-20 mx-auto mb-2" />
                      <p className="text-xs text-[var(--ink4)] italic">No friends yet. Add some to start tracking!</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Array.from(
                        (friendRequests || [])
                          .filter(r => r.status === "accepted")
                          .reduce((acc, req) => {
                            const friendId = req.from === user?.uid ? req.to : req.from;
                            if (!acc.has(friendId)) acc.set(friendId, req);
                            return acc;
                          }, new Map())
                          .values()
                      ).map((req: any) => {
                        const friendId = req.from === user?.uid ? req.to : req.from;
                        const friend = friendsData[friendId];
                        
                        const fProfile = friend?.profile || {};
                        const fTodoList = (friend?.todoList || []) as Todo[];
                        const today = new Date().toISOString().split('T')[0];
                        const todaysTasks = fTodoList.filter(t => t.date === today || (!t.completed && t.date < today));

                        return (
                          <div 
                            key={`friend-${req.id}`}
                            className="bg-[var(--cream)] border border-[var(--parch)] rounded-2xl p-4 shadow-[var(--sh-sm)] hover:border-[var(--amber)]/30 transition-all group"
                          >
                            <div className="flex items-center gap-3 mb-3">
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--amber)] to-[var(--gold)] flex items-center justify-center text-white font-serif font-bold">
                                {fProfile.name?.[0] || "?"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className="font-medium text-sm truncate group-hover:text-[var(--amber)] transition-colors">{fProfile.name || "JEE Warrior"}</h4>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveFriend(req.id, fProfile.name || "JEE Warrior");
                                    }}
                                    className="p-1.5 text-[var(--ink4)] hover:text-red-500 hover:bg-red-500/10 transition-all rounded-lg opacity-0 group-hover:opacity-100"
                                    title="Remove Friend"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                  <span className="text-[8px] font-mono uppercase text-[var(--ink4)]">Active</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[9px] font-mono text-[var(--ink4)] uppercase">Today's Tasks</span>
                                <span className="text-[9px] font-mono font-bold text-[var(--amber)]">{todaysTasks.filter(t => t.completed).length}/{todaysTasks.length}</span>
                              </div>
                              <div className="space-y-1.5">
                                {todaysTasks.length > 0 ? (
                                  todaysTasks.slice(0, 3).map((task: any, idx: number) => (
                                    <div key={task.id ? `task-${task.id}-${idx}` : `task-${idx}`} className="flex items-center gap-2">
                                      <div className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        task.completed ? "bg-[var(--done)]" : "bg-[var(--parch)]"
                                      )} />
                                      <span className={cn(
                                        "text-[10px] break-words flex-1",
                                        task.completed ? "text-[var(--ink4)] line-through" : "text-[var(--ink2)]"
                                      )}>
                                        {task.text}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-[10px] text-[var(--ink4)] italic">No tasks for today</p>
                                )}
                                {todaysTasks.length > 3 && (
                                  <p className="text-[8px] font-mono text-[var(--amber)]">+ {todaysTasks.length - 3} more tasks</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

      {/* Quota Exceeded Warning */}
      <AnimatePresence>
        {quotaExceeded && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-3rem)] max-w-md"
          >
            <div className="bg-red-500 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-red-400/50 backdrop-blur-md">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-bold">Cloud Sync Paused</div>
                <div className="text-[10px] opacity-90">Firestore free quota exceeded. Your progress is still saved locally, but cloud sync will resume tomorrow.</div>
                <button 
                  onClick={forceSync}
                  className="mt-2 text-[9px] font-bold uppercase tracking-widest bg-white/20 hover:bg-white/30 px-2 py-1 rounded-lg transition-all"
                >
                  Try Manual Sync
                </button>
              </div>
              <button 
                onClick={() => setQuotaExceeded(false)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isShareModalOpen && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShareModalOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-[var(--cream)] rounded-[2rem] p-8 w-full max-w-md shadow-2xl border border-[var(--parch)] overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-[var(--amber)] via-[var(--gold)] to-[var(--math)]" />
              
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-serif text-xl font-medium">Share Your Progress</h3>
                <button onClick={() => setIsShareModalOpen(false)} className="p-2 hover:bg-[var(--cream2)] rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* The Card to be captured */}
              <div ref={shareCardRef} className="bg-[var(--cream)] p-8 rounded-3xl border-2 border-[var(--parch)] shadow-inner mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Trophy className="w-24 h-24 text-[var(--amber)]" />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Logo className="w-8 h-8" iconClassName="w-5 h-5" />
                    <span className="font-serif text-lg font-bold">Study <span className="text-[var(--amber)]">Nook</span></span>
                  </div>

                  <div className="mb-6">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink4)] mb-1">JEE Aspirant</div>
                    <div className="text-2xl font-serif font-medium text-[var(--ink)]">{profile.name || "JEE Warrior"}</div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-[var(--cream2)] p-4 rounded-2xl border border-[var(--parch)]">
                      <div className="text-[8px] font-mono uppercase text-[var(--ink4)] mb-1">Overall Progress</div>
                      <div className="text-2xl font-mono font-bold text-[var(--amber)]">{overallPct}%</div>
                    </div>
                    <div className="bg-[var(--cream2)] p-4 rounded-2xl border border-[var(--parch)]">
                      <div className="text-[8px] font-mono uppercase text-[var(--ink4)] mb-1">Chapters Mastered</div>
                      <div className="text-2xl font-mono font-bold text-[var(--gold)]">{SUBJ_KEYS.reduce((acc, s) => acc + getSubjStats(s).done, 0)}</div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="text-[8px] font-mono uppercase text-[var(--ink4)] mb-2">Today's Tasks</div>
                    <div className="space-y-2">
                      {todoList.filter(t => t.date === todoDate || (!t.completed && t.date < todoDate)).length > 0 ? (
                        todoList.filter(t => t.date === todoDate || (!t.completed && t.date < todoDate)).map((todo, idx) => (
                          <div key={todo.id ? `todo-mini-${todo.id}-${idx}` : `todo-mini-${idx}`} className="flex items-center gap-2 text-xs text-[var(--ink2)]">
                            {todo.completed ? (
                              <CheckCircle2 className="w-3 h-3 text-[var(--done)]" />
                            ) : (
                              <Circle className="w-3 h-3 text-[var(--ink4)]" />
                            )}
                            <span className={cn("flex-1", todo.completed && "line-through opacity-60")}>{todo.text}</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs italic text-[var(--ink4)]">No tasks added for today.</div>
                      )}
                    </div>
                  </div>

                  <div className="p-4 bg-[var(--amber-lt)]/10 rounded-xl border-l-4 border-[var(--amber)] italic text-[10px] text-[var(--ink3)] leading-relaxed">
                    "{motivation.length > 100 ? motivation.substring(0, 100) + "..." : motivation}"
                  </div>

                  <div className="mt-6 pt-4 border-t border-[var(--parch)] flex justify-between items-center">
                    <div className="text-[8px] font-mono text-[var(--ink4)]">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                    <div className="text-[8px] font-mono text-[var(--amber)] font-bold uppercase tracking-widest">#JEE2026 #StudyNook</div>
                  </div>
                </div>
              </div>

              <button 
                onClick={handleShare}
                disabled={isSharing}
                className="w-full py-4 bg-[var(--amber)] text-white rounded-2xl font-serif text-lg font-medium hover:bg-[var(--amber-dk)] transition-all flex items-center justify-center gap-3 shadow-[var(--sh-md)] disabled:opacity-50"
              >
                {isSharing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                {isSharing ? "Generating..." : "Download Scorecard"}
              </button>
            </motion.div>
          </div>
        )}

        {isDrawerOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[600]"
            />
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }}
              className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-[var(--cream)] border-l border-[var(--parch)] z-[601] shadow-2xl flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
            >
              <div className="p-6 border-b border-[var(--parch)] flex justify-between items-center">
                <h2 className="font-serif text-2xl font-medium">Settings</h2>
                <button onClick={() => setIsDrawerOpen(false)} className="p-2 hover:bg-[var(--cream2)] rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex border-b border-[var(--parch)]">
                {(["profile", "columns", "chapters", "data"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setSettingsTab(t as any)}
                    className={cn(
                      "flex-1 py-3 text-xs font-mono uppercase tracking-widest transition-all border-b-2",
                      settingsTab === t ? "border-[var(--amber)] text-[var(--ink)] font-bold" : "border-transparent text-[var(--ink3)]"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-10">
                {settingsTab === "profile" && (
                  <>
                    {/* Cloud Sync Status */}
                    <section className="space-y-4">
                      <h3 className="text-xs font-mono uppercase tracking-widest text-[var(--ink4)] flex items-center gap-2">
                        <Cloud className="w-3 h-3" />
                        Cloud Sync
                      </h3>
                      <div className="p-4 bg-[var(--cream2)] rounded-2xl border border-[var(--parch)] space-y-4">
                        {user ? (
                          <>
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-[28%] bg-[var(--amber-lt)]/20 text-[var(--amber)] flex items-center justify-center border border-[var(--parch)]">
                                <Cloud className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{user.displayName}</p>
                                <p className="text-xs text-[var(--ink3)] truncate">{user.email}</p>
                              </div>
                            </div>
                            <button 
                              onClick={handleSignOut}
                              className="w-full py-2.5 text-red-500 text-xs font-bold uppercase tracking-widest border border-red-100 rounded-xl hover:bg-red-50 transition-colors"
                            >
                              Sign Out
                            </button>
                            {lastSynced && (
                              <p className="text-[10px] text-center text-[var(--ink4)]">
                                Last synced: {new Date(lastSynced).toLocaleTimeString()}
                              </p>
                            )}
                            <button 
                              onClick={forceSync}
                              className="w-full py-2.5 bg-[var(--amber)] text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-[var(--amber-dk)] transition-colors flex items-center justify-center gap-2"
                            >
                              <Cloud className="w-4 h-4" />
                              Sync Now
                            </button>
                          </>
                        ) : (
                          <div className="text-center space-y-3">
                            <p className="text-xs text-[var(--ink3)]">
                              You are currently using local storage. Sign in to backup your data.
                            </p>
                            <button 
                              onClick={handleGoogleSignIn}
                              className="w-full py-3 bg-[var(--ink)] text-[var(--cream)] rounded-xl font-bold text-xs uppercase tracking-widest hover:opacity-90 transition-opacity"
                            >
                              Sign In with Google
                            </button>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Theme */}
                    <section className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {profile.darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                          <span className="font-medium">Dark Mode</span>
                        </div>
                        <button 
                          onClick={() => setProfile(p => ({ ...p, darkMode: !p.darkMode }))}
                          className={cn(
                            "w-12 h-6 rounded-full transition-all relative",
                            profile.darkMode ? "bg-[var(--amber)]" : "bg-[var(--cream3)]"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                            profile.darkMode ? "right-1" : "left-1"
                          )} />
                        </button>
                      </div>
                    </section>

                    {/* Profile Name */}
                    <section>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)] mb-3 block">Your Name</label>
                      <div className="flex gap-2">
                        <input 
                          className="flex-1 p-3 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl outline-none focus:border-[var(--amber)]"
                          value={profile.name}
                          onChange={(e) => setProfile(p => ({ ...p, name: e.target.value }))}
                        />
                      </div>
                    </section>
                    
                    {/* Notifications */}
                    <section>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)] mb-3 block">Push Notifications</label>
                      <div className="bg-[var(--cream2)] p-4 rounded-2xl border border-[var(--parch)] flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center",
                            notificationsEnabled ? "bg-green-500/10 text-green-600" : "bg-[var(--cream3)] text-[var(--ink4)]"
                          )}>
                            <Bell className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">Study Reminders</div>
                            <div className="text-[10px] text-[var(--ink4)]">Get notified for your study sessions</div>
                          </div>
                        </div>
                        <button 
                          onClick={requestNotificationPermission}
                          className={cn(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                            notificationsEnabled ? "bg-green-500 text-white" : "bg-[var(--ink)] text-white"
                          )}
                        >
                          {notificationsEnabled ? "Enabled" : "Enable"}
                        </button>
                      </div>
                    </section>

                    {/* Add Exam */}
                    <section>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)] mb-3 block">Add Exam Countdown</label>
                      <div className="space-y-3">
                        <input id="new-exam-name" className="w-full p-3 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl outline-none" placeholder="Exam Name (e.g., JEE Main)" />
                        <input id="new-exam-date" type="date" className="w-full p-3 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl outline-none" />
                        <button 
                          onClick={() => {
                            const nameEl = document.getElementById("new-exam-name") as HTMLInputElement;
                            const dateEl = document.getElementById("new-exam-date") as HTMLInputElement;
                            if (nameEl && dateEl && nameEl.value && dateEl.value) {
                              const name = nameEl.value;
                              const date = dateEl.value;
                              setProfile(p => ({ ...p, exams: [...p.exams, { id: uid(), name, date, color: "amber" }] }));
                              nameEl.value = "";
                              dateEl.value = "";
                            }
                          }}
                          className="w-full p-3 bg-[var(--ink)] text-white rounded-xl font-medium"
                        >
                          Add Exam
                        </button>
                      </div>
                    </section>

                    {/* Add Test */}
                    <section>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)] mb-3 block">Add Upcoming Test</label>
                      <div className="space-y-3">
                        <input id="new-test-name" className="w-full p-3 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl outline-none" placeholder="Test Name (e.g., Weekly Mock)" />
                        <input id="new-test-date" type="date" className="w-full p-3 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl outline-none" />
                        <button 
                          onClick={() => {
                            const nameEl = document.getElementById("new-test-name") as HTMLInputElement;
                            const dateEl = document.getElementById("new-test-date") as HTMLInputElement;
                            if (nameEl && dateEl && nameEl.value && dateEl.value) {
                              const name = nameEl.value;
                              const date = dateEl.value;
                              setProfile(p => ({ ...p, tests: [...(p.tests || []), { id: uid(), name, date }] }));
                              nameEl.value = "";
                              dateEl.value = "";
                            }
                          }}
                          className="w-full p-3 bg-[var(--ink)] text-white rounded-xl font-medium"
                        >
                          Add Test
                        </button>
                      </div>
                    </section>
                  </>
                )}

                {settingsTab === "columns" && (
                  <div className="space-y-10">
                    <section>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)] mb-3 block">Subject-Specific Columns</label>
                      
                      <div className="flex flex-wrap gap-2 mb-6">
                        {SUBJ_KEYS.map(subj => (
                          <button 
                            key={subj}
                            onClick={() => setDrawerSubj(subj)}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-medium transition-all border shadow-sm",
                              drawerSubj === subj ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-[var(--cream2)] text-[var(--ink2)] border-[var(--parch)]"
                            )}
                          >
                            {SUBJ_LABELS[subj]}
                          </button>
                        ))}
                      </div>

                      <div className="space-y-8 mb-6">
                        {(appState.data[drawerSubj as SubjectKey]?.groups || []).map((group, gIdx) => (
                          <div key={group.id ? `group-${group.id}-${gIdx}` : `group-${gIdx}`} className="space-y-3">
                            <h4 className="font-serif font-medium text-[var(--ink)] flex items-center gap-2">
                              <div className={cn("w-2 h-2 rounded-full", appState.data[drawerSubj as SubjectKey]?.bg)} />
                              {group.label}
                            </h4>
                            <div className="space-y-2">
                              {(group.columns || []).map((col, cIdx) => (
                                <div key={col.id ? `col-${col.id}-${cIdx}` : `col-${cIdx}`} className="flex items-center gap-3 p-4 bg-[var(--cream2)] border border-[var(--parch)] rounded-2xl group/col hover:border-[var(--amber)] transition-all">
                                  <div className="flex-1">
                                    <input 
                                      className="bg-transparent font-medium text-sm outline-none w-full"
                                      value={col.name}
                                      onChange={(e) => {
                                        const newName = e.target.value;
                                        setAppState(prev => ({
                                          ...prev,
                                          data: {
                                            ...prev.data,
                                            [drawerSubj]: {
                                              ...prev.data[drawerSubj],
                                              groups: (prev.data[drawerSubj]?.groups || []).map(g => g.id === group.id ? {
                                                ...g,
                                                columns: (g.columns || []).map(c => c.id === col.id ? { ...c, name: newName } : c)
                                              } : g)
                                            }
                                          }
                                        }));
                                      }}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => {
                                        setAppState(prev => ({
                                          ...prev,
                                          data: {
                                            ...prev.data,
                                            [drawerSubj]: {
                                              ...prev.data[drawerSubj],
                                              groups: (prev.data[drawerSubj]?.groups || []).map(g => g.id === group.id ? {
                                                ...g,
                                                columns: (g.columns || []).map(c => c.id === col.id ? { ...c, countsForPct: !c.countsForPct } : c)
                                              } : g)
                                            }
                                          }
                                        }));
                                      }}
                                      className={cn(
                                        "px-2 py-1 rounded text-[9px] font-mono uppercase tracking-widest transition-all",
                                        col.countsForPct ? "bg-[var(--done-lt)] text-[var(--done)]" : "bg-[var(--parch)] text-[var(--ink4)]"
                                      )}
                                    >
                                      {col.countsForPct ? "% Active" : "% Ignored"}
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setConfirmDialog({
                                          isOpen: true,
                                          title: "Delete Column",
                                          message: `Delete column "${col.name}" for ${group.label}?`,
                                          isDestructive: true,
                                          onConfirm: () => {
                                            setAppState(prev => ({
                                              ...prev,
                                              data: {
                                                ...prev.data,
                                                [drawerSubj]: {
                                                  ...prev.data[drawerSubj],
                                                  groups: (prev.data[drawerSubj]?.groups || []).map(g => g.id === group.id ? {
                                                    ...g,
                                                    columns: (g.columns || []).filter(c => c.id !== col.id)
                                                  } : g)
                                                }
                                              }
                                            }));
                                          }
                                        });
                                      }}
                                      className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                            
                            <div className="flex gap-2">
                              <input 
                                id={`new-col-${group.id}`}
                                className="flex-1 p-3 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl outline-none text-sm focus:border-[var(--amber)] transition-all"
                                placeholder={`New column for ${group.label}...`}
                              />
                              <button 
                                onClick={() => {
                                  const nameEl = document.getElementById(`new-col-${group.id}`) as HTMLInputElement;
                                  if (nameEl && nameEl.value.trim()) {
                                    const name = nameEl.value.trim();
                                    setAppState(prev => ({
                                      ...prev,
                                      data: {
                                        ...prev.data,
                                        [drawerSubj]: {
                                          ...prev.data[drawerSubj],
                                          groups: (prev.data[drawerSubj]?.groups || []).map(g => g.id === group.id ? {
                                            ...g,
                                            columns: [...(g.columns || []), { id: uid(), name, countsForPct: true }]
                                          } : g)
                                        }
                                      }
                                    }));
                                    nameEl.value = "";
                                  }
                                }}
                                className="px-4 py-3 bg-[var(--ink)] text-white rounded-xl text-sm font-medium"
                              >
                                Add
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                )}

                {settingsTab === "chapters" && (
                  <section className="space-y-6">
                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)] mb-3 block">Subject</label>
                      <div className="flex flex-wrap gap-2 mb-6">
                        {SUBJ_KEYS.map(s => (
                          <button
                            key={s}
                            onClick={() => setDrawerSubj(s)}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-medium transition-all border shadow-sm",
                              drawerSubj === s ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-[var(--cream2)] text-[var(--ink2)] border-[var(--parch)]"
                            )}
                          >
                            {SUBJ_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)] mb-3 block">Chapters</label>
                      <div className="space-y-1 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                        {(appState.data[drawerSubj as SubjectKey]?.groups || []).flatMap(g => (g.chapters || []).map(ch => ({ ...ch, gid: g.id, gLabel: g.label }))).map((ch, i, arr) => (
                          <div key={`${drawerSubj}-${ch.id}-drawer-${i}`} className="flex items-center gap-2 p-2 bg-[var(--cream2)] border border-[var(--parch)] rounded-lg group">
                            <div className="flex flex-col gap-0.5">
                              <button 
                                onClick={() => {
                                  if (i === 0) return;
                                  setAppState(prev => {
                                    const newData = { ...prev.data };
                                    const groups = newData[drawerSubj].groups;
                                    const gIdx = groups.findIndex(g => g.id === ch.gid);
                                    const chIdx = groups[gIdx].chapters.findIndex(c => c.id === ch.id);
                                    
                                    if (chIdx > 0) {
                                      const [moved] = groups[gIdx].chapters.splice(chIdx, 1);
                                      groups[gIdx].chapters.splice(chIdx - 1, 0, moved);
                                    } else if (gIdx > 0) {
                                      const [moved] = groups[gIdx].chapters.splice(chIdx, 1);
                                      groups[gIdx - 1].chapters.push(moved);
                                    }
                                    return { ...prev, data: newData };
                                  });
                                }}
                                className="p-0.5 hover:bg-[var(--cream3)] rounded text-[var(--ink4)] disabled:opacity-20"
                                disabled={i === 0}
                              >
                                <ChevronRight className="w-3 h-3 -rotate-90" />
                              </button>
                              <button 
                                onClick={() => {
                                  if (i === arr.length - 1) return;
                                  setAppState(prev => {
                                    const newData = { ...prev.data };
                                    const groups = newData[drawerSubj].groups;
                                    const gIdx = groups.findIndex(g => g.id === ch.gid);
                                    const chIdx = groups[gIdx].chapters.findIndex(c => c.id === ch.id);
                                    
                                    if (chIdx < groups[gIdx].chapters.length - 1) {
                                      const [moved] = groups[gIdx].chapters.splice(chIdx, 1);
                                      groups[gIdx].chapters.splice(chIdx + 1, 0, moved);
                                    } else if (gIdx < groups.length - 1) {
                                      const [moved] = groups[gIdx].chapters.splice(chIdx, 1);
                                      groups[gIdx + 1].chapters.unshift(moved);
                                    }
                                    return { ...prev, data: newData };
                                  });
                                }}
                                className="p-0.5 hover:bg-[var(--cream3)] rounded text-[var(--ink4)] disabled:opacity-20"
                                disabled={i === arr.length - 1}
                              >
                                <ChevronRight className="w-3 h-3 rotate-90" />
                              </button>
                            </div>
                            <span className="flex-1 text-xs truncate">{ch.name}</span>
                            <span className="text-[8px] font-mono uppercase bg-[var(--cream3)] px-1.5 py-0.5 rounded text-[var(--ink4)]">{ch.gLabel}</span>
                            <button 
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  title: "Delete Chapter",
                                  message: `Delete chapter "${ch.name}"?`,
                                  isDestructive: true,
                                  onConfirm: () => {
                                    setAppState(prev => ({
                                      ...prev,
                                      data: {
                                        ...prev.data,
                                        [drawerSubj]: {
                                          ...prev.data[drawerSubj],
                                          groups: (prev.data[drawerSubj]?.groups || []).map(g => 
                                            g.id === ch.gid ? { ...g, chapters: (g.chapters || []).filter(c => c.id !== ch.id) } : g
                                          )
                                        }
                                      }
                                    }));
                                  }
                                });
                              }}
                              className="p-1 text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <input id="new-ch-name" className="w-full p-3 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl outline-none text-sm" placeholder="New chapter name..." />
                      <div className="flex gap-2">
                        <select id="new-ch-group" className="flex-1 p-3 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl outline-none text-sm appearance-none">
                          {(appState.data[drawerSubj as SubjectKey]?.groups || []).map((g, idx) => (
                            <option key={g.id ? `opt-${g.id}-${idx}` : `opt-${idx}`} value={g.id}>{g.label}</option>
                          ))}
                        </select>
                        <button 
                          onClick={() => {
                            const nameEl = document.getElementById("new-ch-name") as HTMLInputElement;
                            const gidEl = document.getElementById("new-ch-group") as HTMLSelectElement;
                            if (nameEl && gidEl && nameEl.value.trim()) {
                              const name = nameEl.value.trim();
                              const gid = gidEl.value;
                              setAppState(prev => ({
                                ...prev,
                                data: {
                                  ...prev.data,
                                  [drawerSubj]: {
                                    ...prev.data[drawerSubj],
                                    groups: (prev.data[drawerSubj]?.groups || []).map(g => 
                                      g.id === gid ? { ...g, chapters: [...(g.chapters || []), { id: Math.random().toString(36).substring(2, 9), name, checks: {}, notes: [] }] } : g
                                    )
                                  }
                                }
                              }));
                              nameEl.value = "";
                            }
                          }}
                          className="px-6 bg-[var(--ink)] text-white rounded-xl text-sm"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)] mb-3 block">Groups</label>
                      <div className="space-y-2">
                        {(appState.data[drawerSubj as SubjectKey]?.groups || []).map((g, idx) => (
                          <div key={g.id ? `glist-${g.id}-${idx}` : `glist-${idx}`} className="flex items-center gap-3 p-3 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl">
                            <span className="flex-1 text-sm font-medium">{g.label}</span>
                            <span className="text-[9px] font-mono text-[var(--ink4)]">{(g.chapters || []).length} ch</span>
                            <button 
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  title: "Delete Group",
                                  message: `Delete group "${g.label}" and all its chapters?`,
                                  isDestructive: true,
                                  onConfirm: () => {
                                    setAppState(prev => ({
                                      ...prev,
                                      data: {
                                        ...prev.data,
                                        [drawerSubj]: {
                                          ...prev.data[drawerSubj],
                                          groups: (prev.data[drawerSubj]?.groups || []).filter(gr => gr.id !== g.id)
                                        }
                                      }
                                    }));
                                  }
                                });
                              }}
                              className="p-1 text-red-400 hover:text-red-500"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <input id="new-grp-name" className="flex-1 p-3 bg-[var(--cream2)] border border-[var(--parch)] rounded-xl outline-none text-sm" placeholder="New group..." />
                        <button 
                          onClick={() => {
                            const labelEl = document.getElementById("new-grp-name") as HTMLInputElement;
                            if (labelEl && labelEl.value.trim()) {
                              const label = labelEl.value.trim();
                              setAppState(prev => ({
                                ...prev,
                                data: {
                                  ...prev.data,
                                  [drawerSubj]: {
                                    ...prev.data[drawerSubj],
                                    groups: [...prev.data[drawerSubj].groups, { id: Math.random().toString(36).substring(2, 9), label, chapters: [], columns: [...DEFAULT_COLUMNS] }]
                                  }
                                }
                              }));
                              labelEl.value = "";
                            }
                          }}
                          className="px-6 bg-[var(--ink)] text-white rounded-xl text-sm"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                {settingsTab === "data" && (
                  <div className="space-y-10">
                    <section>
                      <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink3)] mb-3 block">Backup & Restore</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => {
                            const data = { appState, profile, todoList, chatMessages };
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `study-nook-backup-${new Date().toISOString().slice(0, 10)}.json`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          className="flex items-center justify-center gap-2 p-3 bg-[var(--cream2)] border border-[var(--parch)] text-[var(--ink)] rounded-xl font-medium hover:bg-[var(--cream3)] transition-colors text-sm"
                        >
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                        <label className="flex items-center justify-center gap-2 p-3 bg-[var(--cream2)] border border-[var(--parch)] text-[var(--ink)] rounded-xl font-medium hover:bg-[var(--cream3)] transition-colors text-sm cursor-pointer">
                          <Upload className="w-4 h-4" />
                          Import
                          <input 
                            type="file" 
                            className="hidden" 
                            accept=".json"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                try {
                                  const data = JSON.parse(event.target?.result as string);
                                  if (data.appState) setAppState(data.appState);
                                  if (data.profile) setProfile(data.profile);
                                  if (data.todoList) setTodoList(data.todoList);
                                  if (data.chatMessages) setChatMessages(data.chatMessages);
                                  setAlertDialog({
                                    isOpen: true,
                                    title: "Import Successful",
                                    message: "Your data has been successfully imported."
                                  });
                                } catch (err) {
                                  setAlertDialog({
                                    isOpen: true,
                                    title: "Import Failed",
                                    message: "Invalid backup file."
                                  });
                                }
                              };
                              reader.readAsText(file);
                            }}
                          />
                        </label>
                      </div>
                    </section>

                    {/* Data Management */}
                    <section className="pt-6 border-t border-[var(--parch)] space-y-3">
                      <button 
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: "Reset AI Data",
                            message: "This will clear all chat history and AI sessions. This cannot be undone.",
                            isDestructive: true,
                            onConfirm: () => {
                              setChatMessages([{ id: uid(), role: "ai", text: "Hello! I'm Nova, your AI Study Coach. How can I help you conquer JEE today? ✨" }]);
                              setProfile(p => ({
                                ...p,
                                chatSessions: [],
                              }));
                              localStorage.removeItem("jee_chat_v1");
                              localStorage.removeItem("jee_custom_api_key");
                              setAlertDialog({
                                isOpen: true,
                                title: "AI Data Reset",
                                message: "All AI-related data has been cleared."
                              });
                            }
                          });
                        }}
                        className="w-full p-3 border border-orange-200 text-orange-600 rounded-xl font-medium hover:bg-orange-50 transition-colors text-sm"
                      >
                        Reset AI Data Only
                      </button>
                      <button 
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: "Reset Progress",
                            message: "Reset all checkbox progress?",
                            isDestructive: true,
                            onConfirm: () => {
                              setAppState(prev => {
                                const newData = {} as Record<string, SubjectData>;
                                Object.keys(prev.data).forEach(k => {
                                  newData[k] = {
                                    ...prev.data[k],
                                    groups: prev.data[k].groups.map(g => ({
                                      ...g,
                                      chapters: g.chapters.map(ch => ({
                                        ...ch,
                                        checks: {}
                                      }))
                                    }))
                                  };
                                });
                                return { ...prev, data: newData };
                              });
                            }
                          });
                        }}
                        className="w-full p-3 border border-orange-200 text-orange-600 rounded-xl font-medium hover:bg-orange-50 transition-colors text-sm"
                      >
                        Reset Progress Only
                      </button>
                      <button 
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: "Factory Reset",
                            message: "Factory reset everything? This cannot be undone.",
                            isDestructive: true,
                            onConfirm: () => {
                              setAppState(JSON.parse(JSON.stringify(DEFAULTS)));
                              setProfile({
                                name: "",
                                exams: [],
                                onboarded: false,
                                darkMode: false,
                                chatSessions: [],
                                reminders: [],
                                voiceEnabled: true
                              });
                              setTodoList([]);
                              setChatMessages([{ id: uid(), role: "ai", text: "Hello! I'm Nova, your AI Study Coach. How can I help you conquer JEE today? ✨" }]);
                            }
                          });
                        }}
                        className="w-full p-3 border border-red-200/50 text-red-500 rounded-xl font-medium hover:bg-red-500/10 transition-colors text-sm"
                      >
                        Factory Reset Everything
                      </button>
                    </section>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Friend Detail Modal Removed */}

      {/* Add Friend Modal */}
      <AnimatePresence>
        {isAddFriendOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-6 z-[5000]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[var(--cream)] rounded-[2.5rem] p-8 w-full max-w-md shadow-[var(--sh-lg)] border border-[var(--parch)] relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-[var(--amber)]" />
              
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="font-serif text-2xl font-medium">Add a Friend</h3>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink4)]">Expand your circle</p>
                </div>
                <button 
                  onClick={() => {
                    setIsAddFriendOpen(false);
                    setSearchResult(null);
                    setFriendIdInput("");
                  }} 
                  className="p-2 hover:bg-[var(--cream2)] rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-[var(--ink3)]" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-mono uppercase tracking-widest text-[var(--ink4)] ml-1">Friend Code</label>
                  <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={friendIdInput}
                        onChange={(e) => {
                          setFriendIdInput(e.target.value.toUpperCase());
                          setSearchResult(null);
                        }}
                        placeholder="ENTER CODE"
                        maxLength={6}
                        className="flex-1 min-w-0 bg-[var(--cream)] border border-[var(--parch)] rounded-2xl px-4 sm:px-5 py-3 sm:py-4 text-base sm:text-lg outline-none focus:border-[var(--amber)] transition-all font-mono tracking-[0.2em] sm:tracking-[0.3em] placeholder:tracking-normal placeholder:font-sans placeholder:text-xs sm:placeholder:text-sm shadow-inner"
                      />
                    <button 
                      onClick={async () => {
                        if (!friendIdInput.trim() || !user) return;
                        if (friendIdInput.trim() === profile.friendCode) {
                          setAlertDialog({ isOpen: true, title: "Wait!", message: "You cannot add yourself." });
                          return;
                        }
                        setIsSearching(true);
                        setSearchResult(null);
                        try {
                          const q = query(collection(db, "userPublic"), where("profile.friendCode", "==", friendIdInput.trim()));
                          const querySnapshot = await getDocs(q);
                          if (querySnapshot.empty) {
                            setAlertDialog({ isOpen: true, title: "Not Found", message: "No user found with this code." });
                          } else {
                            const foundUser = querySnapshot.docs[0];
                            setSearchResult({ uid: foundUser.id, ...foundUser.data() });
                          }
                        } catch (error: any) {
                          console.error(error);
                          setAlertDialog({ isOpen: true, title: "Error", message: `Failed to search for friend: ${error.message || "Unknown error"}` });
                        } finally {
                          setIsSearching(false);
                        }
                      }}
                      disabled={isSearching || friendIdInput.length < 6}
                      className="bg-[var(--ink)] text-white px-4 sm:px-6 rounded-2xl font-medium hover:bg-black transition-all disabled:opacity-50 flex items-center justify-center shadow-[var(--sh-md)] shrink-0"
                    >
                      {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </button>
                  </div>
                </div>

                {searchResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-5 bg-[var(--cream)] border border-[var(--parch)] rounded-2xl flex items-center justify-between gap-4 shadow-[var(--sh-sm)]"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-[var(--amber-lt)] flex items-center justify-center text-[var(--amber)] font-bold text-xl border border-[var(--parch)] shrink-0">
                        {searchResult.displayName?.[0] || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--ink)] truncate">{searchResult.displayName || "Anonymous"}</p>
                        <p className="text-[10px] font-mono text-[var(--ink4)] uppercase tracking-widest">Found User</p>
                      </div>
                    </div>
                    <button 
                      onClick={async () => {
                        try {
                          const existingReq = friendRequests.find(r => 
                            (r.from === user?.uid && r.to === searchResult.uid) || 
                            (r.to === user?.uid && r.from === searchResult.uid)
                          );
                          if (existingReq) {
                            setAlertDialog({ isOpen: true, title: "Already Connected", message: "Friend request already exists or you are already friends." });
                            return;
                          }

                          await addDoc(collection(db, "friendRequests"), {
                            from: user?.uid,
                            to: searchResult.uid,
                            status: "pending",
                            timestamp: Date.now()
                          });
                          setSearchResult(null);
                          setFriendIdInput("");
                          setIsAddFriendOpen(false);
                          setAlertDialog({ isOpen: true, title: "Success!", message: "Friend request sent!" });
                        } catch (error) {
                          setAlertDialog({ isOpen: true, title: "Error", message: "Failed to send request." });
                        }
                      }}
                      className="bg-[var(--amber)] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[var(--amber-dk)] transition-all shadow-[var(--sh-sm)]"
                    >
                      Add
                    </button>
                  </motion.div>
                )}

                <div className="bg-[var(--amber-lt)]/30 border border-[var(--amber)]/20 p-6 rounded-[2rem] text-center space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--amber-dk)] font-bold">Your Friend Code</p>
                  <p className="text-3xl font-mono font-black text-[var(--amber)] tracking-[0.4em] ml-[0.4em]">{profile.friendCode}</p>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(profile.friendCode || "");
                      setAlertDialog({ isOpen: true, title: "Copied!", message: "Your code is ready to share!" });
                    }}
                    className="text-[10px] font-mono uppercase tracking-widest text-[var(--ink4)] hover:text-[var(--amber)] transition-colors flex items-center gap-2 mx-auto pt-2"
                  >
                    <Share2 className="w-3 h-3" />
                    Copy to share
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Note Modal */}
      <AnimatePresence>
        {isNoteModalOpen && selectedChapter && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 z-[3000]">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-[var(--cream)] rounded-[2rem] p-8 w-full max-w-lg shadow-[var(--sh-lg)] border border-[var(--parch)] relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-[var(--amber)]" />
              
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-serif text-2xl font-medium">{selectedChapter.ch.name}</h3>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--ink4)]">Chapter Notes</p>
                </div>
                <button 
                  onClick={() => {
                    setIsNoteModalOpen(false);
                    setIsEditingNote(false);
                  }} 
                  className="p-2 hover:bg-[var(--cream2)] rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {selectedChapter.ch.notes && selectedChapter.ch.notes.length > 0 ? (
                    selectedChapter.ch.notes.map((note, idx) => (
                      <div key={note.id ? `${selectedChapter.subj}-${selectedChapter.ch.id}-note-${note.id}-${idx}` : `${selectedChapter.subj}-${selectedChapter.ch.id}-note-${idx}`} className="p-4 bg-[var(--cream2)] border border-[var(--parch)] rounded-2xl relative group/note">
                        {editingNoteId === note.id ? (
                          <div className="relative">
                            <textarea
                              value={editingNoteText}
                              onChange={(e) => setEditingNoteText(e.target.value)}
                              className="w-full p-3 bg-[var(--cream)] border border-[var(--amber)] rounded-xl min-h-[100px] outline-none text-sm resize-y font-sans leading-relaxed"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  const val = editingNoteText.trim();
                                  if (val) {
                                    const newNotes = selectedChapter.ch.notes!.map(n => n.id === note.id ? { ...n, text: val } : n);
                                    setSelectedChapter(prev => prev ? { ...prev, ch: { ...prev.ch, notes: newNotes } } : null);
                                    setAppState(prev => ({
                                      ...prev,
                                      data: {
                                        ...prev.data,
                                        [selectedChapter.subj]: {
                                          ...prev.data[selectedChapter.subj],
                                          groups: prev.data[selectedChapter.subj].groups.map(g => ({
                                            ...g,
                                            chapters: g.chapters.map(ch => ch.id === selectedChapter.ch.id ? { ...ch, notes: newNotes } : ch)
                                          }))
                                        }
                                      }
                                    }));
                                    setEditingNoteId(null);
                                  }
                                } else if (e.key === 'Escape') {
                                  setEditingNoteId(null);
                                }
                              }}
                            />
                            <div className="absolute bottom-2 right-2 flex gap-1">
                              <button onClick={() => setEditingNoteId(null)} className="p-1.5 bg-[var(--cream2)] text-[var(--ink4)] hover:text-[var(--ink2)] rounded-lg">
                                <X className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => {
                                  const val = editingNoteText.trim();
                                  if (val) {
                                    const newNotes = selectedChapter.ch.notes!.map(n => n.id === note.id ? { ...n, text: val } : n);
                                    setSelectedChapter(prev => prev ? { ...prev, ch: { ...prev.ch, notes: newNotes } } : null);
                                    setAppState(prev => ({
                                      ...prev,
                                      data: {
                                        ...prev.data,
                                        [selectedChapter.subj]: {
                                          ...prev.data[selectedChapter.subj],
                                          groups: prev.data[selectedChapter.subj].groups.map(g => ({
                                            ...g,
                                            chapters: g.chapters.map(ch => ch.id === selectedChapter.ch.id ? { ...ch, notes: newNotes } : ch)
                                          }))
                                        }
                                      }
                                    }));
                                    setEditingNoteId(null);
                                  }
                                }}
                                className="p-1.5 bg-[var(--amber)] text-white rounded-lg"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-sm leading-relaxed text-[var(--ink)] whitespace-pre-wrap">
                              <ReactMarkdown 
                                remarkPlugins={[remarkMath]} 
                                rehypePlugins={[rehypeKatex]}
                              >
                                {note.text}
                              </ReactMarkdown>
                            </div>
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/note:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setEditingNoteId(note.id || null);
                                  setEditingNoteText(note.text);
                                }}
                                className="p-1.5 bg-[var(--cream)] border border-[var(--parch)] text-[var(--ink3)] rounded-lg hover:text-[var(--amber)]"
                                title="Edit note"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => {
                                  const newNotes = (selectedChapter.ch.notes || []).filter((_, i) => i !== idx);
                                  setSelectedChapter(prev => prev ? { ...prev, ch: { ...prev.ch, notes: newNotes } } : null);
                                  setAppState(prev => ({
                                    ...prev,
                                    data: {
                                      ...prev.data,
                                      [selectedChapter.subj]: {
                                        ...prev.data[selectedChapter.subj],
                                        groups: prev.data[selectedChapter.subj].groups.map(g => ({
                                          ...g,
                                          chapters: g.chapters.map(ch => ch.id === selectedChapter.ch.id ? { ...ch, notes: newNotes } : ch)
                                        }))
                                      }
                                    }
                                  }));
                                }}
                                className="p-1.5 bg-red-500/10 text-red-400 rounded-lg hover:text-red-600"
                                title="Delete note"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center border-2 border-dashed border-[var(--parch)] rounded-2xl">
                      <p className="text-sm text-[var(--ink4)] italic">No notes for this chapter yet.</p>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <textarea 
                    id="note-input"
                    className="w-full p-4 bg-[var(--cream2)] border border-[var(--parch)] rounded-2xl min-h-[120px] outline-none focus:border-[var(--amber)] transition-all text-sm resize-y font-sans leading-relaxed pr-12"
                    placeholder="Add a new note... (Math supported: $E=mc^2$ or $$x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}$$)&#10;Shift+Enter for new line, Enter to save."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        const val = (e.target as HTMLTextAreaElement).value.trim();
                        if (val) {
                          const newNoteId = uid();
                          updateChapterNote(selectedChapter.subj, selectedChapter.ch.id, newNoteId, val);
                          setSelectedChapter(prev => prev ? { ...prev, ch: { ...prev.ch, notes: [...(prev.ch.notes || []), { id: newNoteId, text: val }] } } : null);
                          (e.target as HTMLTextAreaElement).value = "";
                        }
                      }
                    }}
                  />
                  <div className="absolute bottom-3 right-3 text-[10px] text-[var(--ink4)] font-mono">
                    Enter to save
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Dialogs */}
      <AnimatePresence>
        {confirmDialog?.isOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 z-[4000]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--cream)] rounded-2xl p-6 w-full max-w-sm shadow-xl border border-[var(--parch)]"
            >
              <h3 className="font-serif text-xl font-medium mb-2">{confirmDialog.title}</h3>
              <p className="text-[var(--ink3)] text-sm mb-6">{confirmDialog.message}</p>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setConfirmDialog(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-[var(--cream2)] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors",
                    confirmDialog.isDestructive ? "bg-red-500 hover:bg-red-600" : "bg-[var(--amber)] hover:bg-[var(--amber-dk)]"
                  )}
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {alertDialog?.isOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6 z-[9999]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[var(--cream)] rounded-2xl p-6 w-full max-w-sm shadow-xl border border-[var(--parch)]"
            >
              <h3 className="font-serif text-xl font-medium mb-2">{alertDialog.title}</h3>
              <p className="text-[var(--ink3)] text-sm mb-6">{alertDialog.message}</p>
              <div className="flex justify-end">
                <button 
                  onClick={() => setAlertDialog(null)}
                  className="px-4 py-2 bg-[var(--amber)] hover:bg-[var(--amber-dk)] text-white rounded-xl text-sm font-medium transition-colors"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
