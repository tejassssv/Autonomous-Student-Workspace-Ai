"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { marked } from "marked";
import "./page.css";

/* ============================================================
   TYPES
   ============================================================ */
type ProcessingState = "idle" | "processing" | "success" | "error";
type NotePreference = "short" | "precise" | "long";
type ActiveTab = "notes" | "quiz" | "flashcards" | "flowcharts" | "tutor" | "mindmap";
type HomeMode = "upload" | "search";
type ThemeType = "light" | "dark" | "midnight" | "ocean" | "forest" | "sunset";
type FontSize = "sm" | "md" | "lg";
type PomodoroMode = "work" | "break";
type FlashcardConfidence = "again" | "hard" | "good" | "easy";

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

interface Flowchart { title: string; mermaid: string; }

interface ResultData {
  notes: string;
  hasProject: boolean;
  projectSummary?: string;
  projectDeadline?: string;
  tips?: string[];
  quiz: QuizQuestion[];
  flowcharts?: Flowchart[];
  sourceTopic?: string;
  imageUrl?: string;
  readingTime?: number;
  keyTerms?: string[];
}

interface HistoryItem {
  id: string;
  fileName: string;
  date: string;
  noteType: NotePreference;
  data: ResultData;
  bestScore?: number;
}

interface Flashcard { front: string; back: string; confidence?: FlashcardConfidence; }
interface TutorMessage { role: "user" | "tutor"; content: string; timestamp: Date; }
interface PomodoroTask { id: string; text: string; completed: boolean; }

/* ============================================================
   CONSTANTS
   ============================================================ */
const HISTORY_KEY     = "sw_history_v2";
const THEME_KEY       = "sw_theme";
const FONTSIZE_KEY    = "sw_fontsize";
const STREAK_KEY      = "sw_streak";
const LAST_STUDY_KEY  = "sw_last_study";

const THEMES: { key: ThemeType; label: string; emoji: string }[] = [
  { key: "light",    label: "Dawn",     emoji: "☀️" },
  { key: "dark",     label: "Dusk",     emoji: "🌙" },
  { key: "midnight", label: "OLED",     emoji: "⭐" },
  { key: "ocean",    label: "Ocean",    emoji: "🌊" },
  { key: "forest",   label: "Forest",   emoji: "🌿" },
  { key: "sunset",   label: "Sunset",   emoji: "🌅" },
];

const LANGUAGES = [
  { code: "hindi",      label: "Hindi",      flag: "🇮🇳" },
  { code: "marathi",    label: "Marathi",    flag: "🇮🇳" },
  { code: "tamil",      label: "Tamil",      flag: "🇮🇳" },
  { code: "telugu",     label: "Telugu",     flag: "🇮🇳" },
  { code: "bengali",    label: "Bengali",    flag: "🇧🇩" },
  { code: "gujarati",   label: "Gujarati",   flag: "🇮🇳" },
  { code: "kannada",    label: "Kannada",    flag: "🇮🇳" },
  { code: "french",     label: "French",     flag: "🇫🇷" },
  { code: "spanish",    label: "Spanish",    flag: "🇪🇸" },
  { code: "german",     label: "German",     flag: "🇩🇪" },
  { code: "arabic",     label: "Arabic",     flag: "🇸🇦" },
  { code: "japanese",   label: "Japanese",   flag: "🇯🇵" },
  { code: "chinese",    label: "Chinese",    flag: "🇨🇳" },
  { code: "portuguese", label: "Portuguese", flag: "🇵🇹" },
];

const SUGGESTED_TOPICS: { icon: string; category: string; topics: string[] }[] = [
  { icon: "💻", category: "Computer Science", topics: ["Binary Search Trees", "React Hooks", "Dynamic Programming", "REST APIs", "Machine Learning Basics", "System Design"] },
  { icon: "🔬", category: "Science",          topics: ["Photosynthesis", "Newton's Laws", "DNA Replication", "Thermodynamics", "Quantum Mechanics", "Cell Biology"] },
  { icon: "📐", category: "Mathematics",      topics: ["Calculus Derivatives", "Linear Algebra", "Probability Theory", "Fourier Transform", "Number Theory", "Statistics"] },
  { icon: "📜", category: "History",          topics: ["World War II", "Industrial Revolution", "Cold War", "Renaissance", "French Revolution", "Ancient Rome"] },
  { icon: "💰", category: "Economics",        topics: ["Supply & Demand", "GDP & Inflation", "Keynesian Economics", "Game Theory", "Market Structures", "Cryptocurrency"] },
  { icon: "🧠", category: "Psychology",       topics: ["Cognitive Biases", "Memory Formation", "Maslow's Hierarchy", "Classical Conditioning", "Growth Mindset"] },
];

/* ============================================================
   HELPERS
   ============================================================ */
function highlightText(html: string, query: string): string {
  if (!query.trim()) return html;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp(`(${escaped})`, "gi"), '<mark class="search-highlight">$1</mark>');
}

function buildFlashcards(quiz: QuizQuestion[]): Flashcard[] {
  return quiz.map(q => ({
    front: q.question,
    back: `✓ ${q.options[q.correctAnswer]}\n\n${q.explanation}`,
  }));
}

function calcReadingTime(text: string): number {
  return Math.max(1, Math.ceil(text.split(/\s+/).length / 200));
}

function getTodayStr() {
  return new Date().toISOString().split("T")[0];
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export default function Home() {
  /* — Core — */
  const [file, setFile]                         = useState<File | null>(null);
  const [status, setStatus]                     = useState<ProcessingState>("idle");
  const [result, setResult]                     = useState<ResultData | null>(null);
  const [errorMsg, setErrorMsg]                 = useState("");
  const [currentFileName, setCurrentFileName]   = useState("");
  const [homeMode, setHomeMode]                 = useState<HomeMode>("search");
  const [searchQuery, setSearchQuery]           = useState("");
  const [noteType, setNoteType]                 = useState<NotePreference>("precise");
  const [activeTab, setActiveTab]               = useState<ActiveTab>("notes");
  const fileInputRef                            = useRef<HTMLInputElement>(null);

  /* — UI Preferences — */
  const [theme, setTheme]                 = useState<ThemeType>("light");
  const [fontSize, setFontSize]           = useState<FontSize>("md");
  const [sidebarOpen, setSidebarOpen]     = useState(true);
  const [showSettings, setShowSettings]   = useState(false);

  /* — Gamification — */
  const [streak, setStreak]   = useState(0);
  const [xp, setXp]           = useState(0);

  /* — Quiz — */
  const [userAnswers, setUserAnswers]           = useState<Record<number, number>>({});
  const [isQuizSubmitted, setIsQuizSubmitted]   = useState(false);
  const [score, setScore]                       = useState(0);
  const [expandedExp, setExpandedExp]           = useState<number | null>(null);
  const [copied, setCopied]                     = useState(false);
  const [quizTimer, setQuizTimer]               = useState(0);
  const [quizTimerRunning, setQuizTimerRunning] = useState(false);
  const quizTimerRef                            = useRef<NodeJS.Timeout | null>(null);

  /* — Flashcards — */
  const [flashcards, setFlashcards]     = useState<Flashcard[]>([]);
  const [cardIndex, setCardIndex]       = useState(0);
  const [cardFlipped, setCardFlipped]   = useState(false);
  const [cardsDue, setCardsDue]         = useState<number[]>([]);

  /* — Notes search & annotations — */
  const [notesSearch, setNotesSearch]   = useState("");
  const [bookmarked, setBookmarked]     = useState(false);

  /* — History — */
  const [history, setHistory] = useState<HistoryItem[]>([]);

  /* — Voice Narration — */
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [isPaused, setIsPaused]       = useState(false);
  const [speechRate, setSpeechRate]   = useState(1.0);

  /* — Voice Search — */
  const [isListening, setIsListening] = useState(false);

  /* — AI Tutor — */
  const [tutorMessages, setTutorMessages]       = useState<TutorMessage[]>([]);
  const [tutorInput, setTutorInput]             = useState("");
  const [isTutorTyping, setIsTutorTyping]       = useState(false);
  const [isTutorSpeaking, setIsTutorSpeaking]   = useState(false);
  const [isTutorListening, setIsTutorListening] = useState(false);
  const tutorScrollRef                          = useRef<HTMLDivElement>(null);

  /* — Translation — */
  const [showTranslator, setShowTranslator]         = useState(false);
  const [selectedLang, setSelectedLang]             = useState("");
  const [isTranslating, setIsTranslating]           = useState(false);
  const [translatedNotes, setTranslatedNotes]       = useState<string | null>(null);
  const [translatedQuiz, setTranslatedQuiz]         = useState<QuizQuestion[] | null>(null);
  const [translationError, setTranslationError]     = useState("");
  const [currentTranslLang, setCurrentTranslLang]   = useState("");

  /* — Pomodoro — */
  const [showPomodoro, setShowPomodoro]               = useState(false);
  const [pomodoroMode, setPomodoroMode]               = useState<PomodoroMode>("work");
  const [workDurationMins, setWorkDurationMins]       = useState(25);
  const [breakDurationMins, setBreakDurationMins]     = useState(5);
  const [pomodoroTime, setPomodoroTime]               = useState(25 * 60);
  const [pomodoroRunning, setPomodoroRunning]         = useState(false);
  const [pomodoroSessions, setPomodoroSessions]       = useState(0);
  const [pomodoroTasks, setPomodoroTasks]             = useState<PomodoroTask[]>([]);
  const [newTaskText, setNewTaskText]                 = useState("");
  const [activeSound, setActiveSound]                 = useState<string>("none");
  const audioRef                                      = useRef<HTMLAudioElement | null>(null);
  const pomodoroRef                                   = useRef<NodeJS.Timeout | null>(null);

  /* — Flowcharts — */
  const flowchartRefs       = useRef<(HTMLDivElement | null)[]>([]);
  const [flowchartRendered, setFlowchartRendered] = useState(false);

  /* — PDF Export — */
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  /* ================================================================
     EFFECTS
     ================================================================ */

  /* Load persisted state */
  useEffect(() => {
    try {
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) setHistory(JSON.parse(h));
      const t = localStorage.getItem(THEME_KEY) as ThemeType;
      if (t) setTheme(t);
      const f = localStorage.getItem(FONTSIZE_KEY) as FontSize;
      if (f) setFontSize(f);
      const s = localStorage.getItem(STREAK_KEY);
      if (s) setStreak(parseInt(s, 10));
    } catch {}
    audioRef.current = new Audio();
    audioRef.current.loop = true;
  }, []);

  /* Theme & font-size on <html> */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.setAttribute("data-fontsize", fontSize);
    localStorage.setItem(FONTSIZE_KEY, fontSize);
  }, [fontSize]);

  /* Pomodoro timer */
  useEffect(() => {
    if (pomodoroRunning) {
      pomodoroRef.current = setInterval(() => {
        setPomodoroTime(t => {
          if (t <= 1) {
            clearInterval(pomodoroRef.current!);
            setPomodoroRunning(false);
            beep();
            if (pomodoroMode === "work") {
              setPomodoroSessions(s => s + 1);
              setXp(x => x + 10);
              setPomodoroMode("break");
              return breakDurationMins * 60;
            } else {
              setPomodoroMode("work");
              return workDurationMins * 60;
            }
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (pomodoroRef.current) clearInterval(pomodoroRef.current); };
  }, [pomodoroRunning, pomodoroMode, workDurationMins, breakDurationMins]);

  /* Ambient sound */
  useEffect(() => {
    if (!audioRef.current) return;
    if (activeSound === "none") { audioRef.current.pause(); return; }
    const urls: Record<string, string> = {
      rain: "https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=heavy-rain-nature-sounds-8186.mp3",
      lofi: "https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
      cafe: "https://cdn.pixabay.com/download/audio/2022/10/30/audio_f3dcbb809c.mp3?filename=cafe-ambience-4752.mp3",
      nature: "https://cdn.pixabay.com/download/audio/2022/03/10/audio_2dda45fa53.mp3?filename=bird-singing-in-nature-6735.mp3",
    };
    if (urls[activeSound]) {
      audioRef.current.src = urls[activeSound];
      audioRef.current.play().catch(() => {});
    }
  }, [activeSound]);

  /* Quiz timer */
  useEffect(() => {
    if (quizTimerRunning) {
      quizTimerRef.current = setInterval(() => setQuizTimer(t => t + 1), 1000);
    }
    return () => { if (quizTimerRef.current) clearInterval(quizTimerRef.current); };
  }, [quizTimerRunning]);

  /* Render mermaid flowcharts */
  useEffect(() => {
    if (activeTab === "flowcharts" && result?.flowcharts?.length && !flowchartRendered) {
      import("mermaid").then(m => {
        const mermaid = m.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            primaryColor: "#ede9fe",
            primaryTextColor: "#4f46e5",
            primaryBorderColor: "#6366f1",
            lineColor: "#6366f1",
            secondaryColor: "#ccfbf1",
            fontFamily: "Inter, sans-serif",
            fontSize: "13px",
          },
        });
        result.flowcharts!.forEach(async (chart, i) => {
          const el = flowchartRefs.current[i];
          if (!el) return;
          try {
            el.innerHTML = "";
            const { svg } = await mermaid.render(`mc-${i}-${Date.now()}`, chart.mermaid);
            el.innerHTML = svg;
            setFlowchartRendered(true);
          } catch {
            el.innerHTML = `<pre class="mermaid-error">Could not render chart.</pre>`;
          }
        });
      });
    }
  }, [activeTab, result, flowchartRendered]);

  useEffect(() => { setFlowchartRendered(false); }, [result]);

  /* Auto-scroll tutor chat */
  useEffect(() => {
    tutorScrollRef.current?.scrollTo({ top: tutorScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [tutorMessages, isTutorTyping]);

  /* Build flashcards when result changes */
  useEffect(() => {
    if (result) {
      const fc = buildFlashcards(translatedQuiz || result.quiz);
      setFlashcards(fc);
      setCardsDue(fc.map((_, i) => i));
    }
  }, [result, translatedQuiz]);

  /* Study streak */
  useEffect(() => {
    if (status === "success") {
      const today = getTodayStr();
      const lastStudy = localStorage.getItem(LAST_STUDY_KEY);
      if (lastStudy !== today) {
        localStorage.setItem(LAST_STUDY_KEY, today);
        setStreak(s => {
          const ns = s + 1;
          localStorage.setItem(STREAK_KEY, String(ns));
          return ns;
        });
        setXp(x => x + 25);
      }
    }
  }, [status]);

  /* ================================================================
     UTILITIES
     ================================================================ */
  const beep = () => {
    try {
      const ctx = new window.AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start(); osc.stop(ctx.currentTime + 0.8);
    } catch {}
  };

  const saveToHistory = useCallback((fileName: string, nt: NotePreference, data: ResultData) => {
    const item: HistoryItem = {
      id: Date.now().toString(),
      fileName,
      date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      noteType: nt,
      data,
    };
    setHistory(prev => {
      const updated = [item, ...prev].slice(0, 20);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const loadFromHistory = (item: HistoryItem) => {
    stopNarration();
    setResult(item.data); setCurrentFileName(item.fileName);
    setNoteType(item.noteType); setStatus("success"); setActiveTab("notes");
    setFile(null); setIsQuizSubmitted(false); setUserAnswers({}); setExpandedExp(null);
    setTranslatedNotes(null); setTranslatedQuiz(null); setShowTranslator(false);
    setCardIndex(0); setCardFlipped(false); setNotesSearch(""); setTutorMessages([]);
    setQuizTimer(0); setQuizTimerRunning(false);
  };

  const deleteFromHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => {
      const updated = prev.filter(i => i.id !== id);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const reset = (soft = false) => {
    if (!soft) { stopNarration(); setFile(null); setStatus("idle"); }
    setResult(null); setErrorMsg(""); setIsQuizSubmitted(false); setUserAnswers({});
    setExpandedExp(null); setCurrentFileName(""); setTranslatedNotes(null);
    setTranslatedQuiz(null); setShowTranslator(false); setSelectedLang("");
    setCurrentTranslLang(""); setCardIndex(0); setCardFlipped(false);
    setNotesSearch(""); setTutorMessages([]); setBookmarked(false);
    setQuizTimer(0); setQuizTimerRunning(false);
  };

  /* ================================================================
     FILE HANDLING
     ================================================================ */
  const handleFileChange  = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files?.[0]) setFile(e.target.files[0]); };
  const handleDrop        = (e: React.DragEvent) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]); };

  /* ================================================================
     PROCESS DOCUMENT
     ================================================================ */
  const handleProcess = async () => {
    if (!file) return;
    stopNarration(); reset(true);
    setCurrentFileName(file.name); setStatus("processing");
    const fd = new FormData();
    fd.append("file", file); fd.append("noteType", noteType);
    try {
      const res = await fetch("/api/generate", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data: ResultData = await res.json();
      data.readingTime = calcReadingTime(data.notes);
      setResult(data); setStatus("success"); setActiveTab("notes");
      saveToHistory(file.name, noteType, data);
      setXp(x => x + 50);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process document.");
      setStatus("error");
    }
  };

  /* ================================================================
     AI TOPIC SEARCH
     ================================================================ */
  const handleSearch = async (queryToUse: string = searchQuery) => {
    if (!queryToUse.trim()) return;
    stopNarration(); reset(true);
    setCurrentFileName(`🔍 ${queryToUse}`); setStatus("processing");
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: queryToUse, noteType }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: ResultData = await res.json();
      data.readingTime = calcReadingTime(data.notes);
      setResult(data); setStatus("success"); setActiveTab("notes");
      saveToHistory(`🔍 ${queryToUse}`, noteType, data);
      setXp(x => x + 50);
    } catch (err: any) {
      setErrorMsg(err.message || "Search failed. Please try again.");
      setStatus("error");
    }
  };

  /* ================================================================
     VOICE SEARCH
     ================================================================ */
  const toggleVoiceSearch = () => {
    if (isListening) { setIsListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Speech Recognition requires Chrome or Edge."); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true; rec.lang = "en-US";
    rec.onstart = () => setIsListening(true);
    rec.onresult = (e: any) => {
      let fin = "", inter = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (inter += e.results[i][0].transcript));
      }
      setSearchQuery(fin || inter);
      if (fin) handleSearch(fin);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend   = () => setIsListening(false);
    rec.start();
  };

  /* ================================================================
     TUTOR VOICE INPUT
     ================================================================ */
  const toggleTutorVoice = () => {
    if (isTutorListening) { setIsTutorListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert("Speech Recognition requires Chrome or Edge."); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = true; rec.lang = "en-US";
    rec.onstart = () => setIsTutorListening(true);
    rec.onresult = (e: any) => {
      let fin = "", inter = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (inter += e.results[i][0].transcript));
      }
      setTutorInput(fin || inter);
    };
    rec.onerror = () => setIsTutorListening(false);
    rec.onend   = () => setIsTutorListening(false);
    rec.start();
  };

  /* ================================================================
     TRANSLATION
     ================================================================ */
  const handleTranslate = async () => {
    if (!result || !selectedLang) return;
    setIsTranslating(true); setTranslationError("");
    try {
      const [nr, qr] = await Promise.all([
        fetch("/api/translate", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ content: result.notes, targetLanguage: selectedLang, type: "notes" }) }),
        fetch("/api/translate", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ content: JSON.stringify(result.quiz), targetLanguage: selectedLang, type: "quiz" }) }),
      ]);
      if (!nr.ok || !qr.ok) throw new Error("Translation failed.");
      const nd = await nr.json(); const qd = await qr.json();
      setTranslatedNotes(nd.translated); setTranslatedQuiz(qd.translated);
      setCurrentTranslLang(LANGUAGES.find(l => l.code === selectedLang)?.label || selectedLang);
      setShowTranslator(false);
      setIsQuizSubmitted(false); setUserAnswers({}); setExpandedExp(null);
      setCardIndex(0); setCardFlipped(false);
    } catch (err: any) { setTranslationError(err.message); }
    finally { setIsTranslating(false); }
  };

  const clearTranslation = () => {
    setTranslatedNotes(null); setTranslatedQuiz(null);
    setCurrentTranslLang(""); setSelectedLang("");
    setIsQuizSubmitted(false); setUserAnswers({}); setExpandedExp(null);
    setCardIndex(0); setCardFlipped(false);
  };

  /* ================================================================
     EXPORT — Markdown + Print/PDF
     ================================================================ */
  const handleExport = () => {
    if (!result) return;
    const notes = translatedNotes || result.notes;
    const quiz  = translatedQuiz  || result.quiz;
    let c = `# ${result.sourceTopic || currentFileName}\n\n`;
    if (result.hasProject) c += `## 🚀 Project\n**Deadline:** ${result.projectDeadline || "N/A"}\n${result.projectSummary}\n\n---\n\n`;
    if (result.tips?.length) { c += `## 💡 Study Tips\n`; result.tips.forEach(t => c += `- ${t}\n`); c += `\n---\n\n`; }
    c += `## 📝 Notes\n\n${notes}\n\n---\n\n## 🎯 Quiz\n\n`;
    quiz.forEach((q, i) => { c += `### ${i+1}. ${q.question}\n`; q.options.forEach((o, j) => c += `- [${j===q.correctAnswer?"x":" "}] ${o}\n`); c += `\n**Explanation:** ${q.explanation}\n\n`; });
    const blob = new Blob([c], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `StudyAI_${(result.sourceTopic || "notes").replace(/\s+/g,"_")}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    window.print();
  };

  /* ================================================================
     NOTES
     ================================================================ */
  const copyNotes = () => {
    if (!result) return;
    navigator.clipboard.writeText(translatedNotes || result.notes);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const renderNotes = () => {
    const raw = marked(translatedNotes || result!.notes) as string;
    return { __html: highlightText(raw, notesSearch) };
  };

  /* ================================================================
     TUTOR
     ================================================================ */
  const handleTutorSubmit = async () => {
    if (!tutorInput.trim() || !result) return;
    const newMsg: TutorMessage = { role: "user", content: tutorInput, timestamp: new Date() };
    setTutorMessages(p => [...p, newMsg]);
    setTutorInput(""); setIsTutorTyping(true);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: result.sourceTopic || result.notes.substring(0, 600),
          message: newMsg.content,
          history: tutorMessages,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTutorMessages(p => [...p, { role: "tutor", content: data.reply, timestamp: new Date() }]);
        speakTutorResponse(data.reply);
        setXp(x => x + 5);
      }
    } catch {}
    finally { setIsTutorTyping(false); }
  };

  const speakTutorResponse = (text: string) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = speechRate;
    u.onstart  = () => setIsTutorSpeaking(true);
    u.onend    = () => setIsTutorSpeaking(false);
    u.onerror  = () => setIsTutorSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  /* ================================================================
     QUIZ
     ================================================================ */
  const handleAnswerSelect = (qIdx: number, oIdx: number) => {
    if (isQuizSubmitted) return;
    setUserAnswers(p => ({ ...p, [qIdx]: oIdx }));
    setExpandedExp(null);
    if (!quizTimerRunning && Object.keys(userAnswers).length === 0) setQuizTimerRunning(true);
  };

  const submitQuiz = () => {
    if (!result) return;
    const q = translatedQuiz || result.quiz;
    let s = 0; q.forEach((item, i) => { if (userAnswers[i] === item.correctAnswer) s++; });
    setScore(s); setIsQuizSubmitted(true); setQuizTimerRunning(false);
    const earned = s * 10; setXp(x => x + earned);
    // Update best score in history
    const pct = Math.round((s / q.length) * 100);
    setHistory(prev => {
      const updated = prev.map(h => 
        h.fileName === currentFileName && (!h.bestScore || pct > h.bestScore)
          ? { ...h, bestScore: pct } : h
      );
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  /* ================================================================
     FLASHCARD CONFIDENCE
     ================================================================ */
  const rateCard = (rating: FlashcardConfidence) => {
    setFlashcards(prev => prev.map((c, i) => i === cardIndex ? { ...c, confidence: rating } : c));
    if (rating === "again") {
      // Keep in due pile
    } else {
      setCardsDue(prev => prev.filter(i => i !== cardIndex));
    }
    const next = cardIndex < flashcards.length - 1 ? cardIndex + 1 : 0;
    setCardIndex(next); setCardFlipped(false);
    if (rating === "easy" || rating === "good") setXp(x => x + 2);
  };

  /* ================================================================
     NARRATION
     ================================================================ */
  const startNarration = () => {
    if (!result) return;
    if (isPaused && window.speechSynthesis.paused) { window.speechSynthesis.resume(); setIsPaused(false); return; }
    window.speechSynthesis.cancel();
    const plain = (translatedNotes || result.notes).replace(/#{1,6}\s/g,"").replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1").replace(/`(.*?)`/g,"$1").replace(/^[-*]\s/gm,"").replace(/\n\n/g,". ");
    const u = new SpeechSynthesisUtterance(plain);
    u.rate  = speechRate;
    u.onstart = () => setIsSpeaking(true);
    u.onend   = () => { setIsSpeaking(false); setIsPaused(false); };
    u.onerror = () => { setIsSpeaking(false); setIsPaused(false); };
    window.speechSynthesis.speak(u);
    setIsSpeaking(true); setIsPaused(false);
  };
  const pauseNarration = () => { window.speechSynthesis.pause(); setIsPaused(true); };
  const stopNarration  = () => { window.speechSynthesis.cancel(); setIsSpeaking(false); setIsPaused(false); };

  /* ================================================================
     POMODORO
     ================================================================ */
  const resetPomodoro = () => {
    if (pomodoroRef.current) clearInterval(pomodoroRef.current);
    setPomodoroRunning(false);
    setPomodoroTime(pomodoroMode === "work" ? workDurationMins * 60 : breakDurationMins * 60);
  };
  const switchPomodoroMode = (m: PomodoroMode) => {
    resetPomodoro(); setPomodoroMode(m);
    setPomodoroTime(m === "work" ? workDurationMins * 60 : breakDurationMins * 60);
  };
  const formatTime  = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const totalTime   = pomodoroMode === "work" ? workDurationMins * 60 : breakDurationMins * 60;
  const progressPct = ((totalTime - pomodoroTime) / totalTime) * 100;

  /* ================================================================
     COMPUTED VALUES
     ================================================================ */
  const activeQuiz   = translatedQuiz || result?.quiz || [];
  const xpLevel      = Math.floor(xp / 100) + 1;
  const xpProgress   = (xp % 100);

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="app-shell">

      {/* ===== SIDEBAR ===== */}
      <aside className={`sidebar ${sidebarOpen ? "open" : "collapsed"}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-orb">🧠</div>
            {sidebarOpen && <span className="logo-text">StudyAI<span className="logo-pro">Pro</span></span>}
          </div>
          <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(p => !p)}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        {sidebarOpen && (
          <>
            {/* XP / Level Bar */}
            <div className="xp-bar-container">
              <div className="xp-bar-header">
                <span className="xp-level">Lv. {xpLevel}</span>
                <span className="xp-count">{xp} XP</span>
              </div>
              <div className="xp-bar-track">
                <div className="xp-bar-fill" style={{ width: `${xpProgress}%` }} />
              </div>
              <div className="xp-bar-footer">
                <span>🔥 {streak} day streak</span>
                <span>{100 - xpProgress} XP to next level</span>
              </div>
            </div>

            <button className="new-session-btn" onClick={() => reset()}>
              <span>✚</span> New Session
            </button>

            {/* Quick Settings */}
            <div className="sidebar-settings-section">
              <div className="sidebar-section-title">Appearance</div>
              <div className="theme-grid">
                {THEMES.map(t => (
                  <button
                    key={t.key}
                    className={`theme-card ${theme === t.key ? "active" : ""}`}
                    onClick={() => setTheme(t.key)}
                    title={t.label}
                  >
                    <span>{t.emoji}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
              <div className="font-row">
                <span>Text Size</span>
                <div className="font-btns">
                  {(["sm", "md", "lg"] as FontSize[]).map(s => (
                    <button key={s} className={`font-btn ${s} ${fontSize === s ? "active" : ""}`} onClick={() => setFontSize(s)}>A</button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pomodoro Quick-Launch */}
            <button className={`pomodoro-sidebar-btn ${showPomodoro ? "active" : ""}`} onClick={() => setShowPomodoro(p => !p)}>
              <span>⏱</span>
              <span>Focus Timer {pomodoroRunning ? `— ${formatTime(pomodoroTime)}` : ""}</span>
            </button>

            {/* History */}
            <div className="sidebar-section-title" style={{ marginTop: "1rem" }}>Recent Sessions</div>
            {history.length === 0 ? (
              <div className="sidebar-empty">
                <span>📂</span>
                <p>No sessions yet.<br/>Start studying!</p>
              </div>
            ) : (
              <ul className="history-list">
                {history.map(item => (
                  <li key={item.id} className="history-item" onClick={() => loadFromHistory(item)}>
                    <div className="history-item-icon">
                      {item.fileName.startsWith("🔍") ? "🔍" : "📄"}
                    </div>
                    <div className="history-item-info">
                      <span className="history-item-name">{item.fileName.replace(/\.[^/.]+$/, "").replace("🔍 ", "")}</span>
                      <span className="history-item-meta">
                        {item.date} · {item.noteType}
                        {item.bestScore !== undefined && <span className="history-score">🏆 {item.bestScore}%</span>}
                      </span>
                    </div>
                    <button className="history-delete-btn" onClick={e => deleteFromHistory(item.id, e)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="main-content">

        {/* Top Bar */}
        <header className="top-bar">
          <div className="top-bar-left">
            {status === "success" && currentFileName ? (
              <div className="top-bar-file-info">
                <span className="top-bar-icon">📄</span>
                <div>
                  <div className="top-bar-filename">{currentFileName.replace(/\.[^/.]+$/, "").replace("🔍 ", "")}</div>
                  {result?.readingTime && <div className="top-bar-meta">~{result.readingTime} min read · {result.quiz?.length} Q&As</div>}
                </div>
              </div>
            ) : (
              <div className="top-bar-title">AI Student Workspace</div>
            )}
          </div>
          {status === "success" && result && (
            <div className="top-bar-actions">
              {currentTranslLang && (
                <div className="translation-badge">🌐 {currentTranslLang} <button onClick={clearTranslation}>✕</button></div>
              )}
              <button className="action-pill" onClick={() => setShowTranslator(p => !p)}>🌐 Translate</button>
              <button className="action-pill" onClick={handleExport}>📥 Export</button>
              <button className="action-pill" onClick={handlePrintPdf}>🖨 Print</button>
              <button className="action-pill danger" onClick={() => reset()}>✚ New</button>
            </div>
          )}
        </header>

        {/* Translator Panel */}
        {showTranslator && (
          <div className="translator-panel animate-slide-down">
            <div className="translator-inner">
              <h4>🌐 Translate Everything</h4>
              <p>Translate notes & quiz to your preferred language instantly.</p>
              <div className="lang-grid">
                {LANGUAGES.map(l => (
                  <button key={l.code} className={`lang-btn ${selectedLang === l.code ? "active" : ""}`} onClick={() => setSelectedLang(l.code)}>
                    <span className="lang-flag">{l.flag}</span><span>{l.label}</span>
                  </button>
                ))}
              </div>
              {translationError && <p className="translation-error">⚠️ {translationError}</p>}
              <div className="translator-actions">
                <button className="btn btn-primary" onClick={handleTranslate} disabled={!selectedLang || isTranslating}>
                  {isTranslating ? <><span className="btn-spinner"/> Translating...</> : "✓ Apply Translation"}
                </button>
                {currentTranslLang && <button className="btn btn-secondary" onClick={clearTranslation}>✕ Reset to English</button>}
                <button className="btn btn-secondary" onClick={() => setShowTranslator(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="content-area">

          {/* ===== IDLE / HOME ===== */}
          {status === "idle" && (
            <div className="home-wrapper animate-fade-in">
              {/* Background Bubbles */}
              {[...Array(8)].map((_, i) => (
                <div key={i} className="floating-bubble" style={{
                  width:  `${40 + (i * 23) % 80}px`,
                  height: `${40 + (i * 23) % 80}px`,
                  left:   `${(i * 137) % 100}%`,
                  bottom: "-100px",
                  animationDuration: `${12 + (i * 3) % 10}s`,
                  animationDelay:    `${(i * 2.1) % 8}s`,
                }} />
              ))}

              <div className="hero-section">
                <div className="hero-badge">✨ AI-Powered Learning · Free Forever</div>
                <h1 className="hero-title">
                  Your <span className="gradient-text">Personal AI</span><br/>Study Companion
                </h1>
                <p className="hero-subtitle">
                  Upload any document or speak a topic — get interactive notes, quizzes, flashcards, 1-on-1 tutor sessions, and more. <strong>No limits.</strong>
                </p>

                {/* Feature Pills */}
                <div className="feature-pills">
                  {[
                    "📝 Smart Notes","🎯 Explained Quiz","🧑‍🏫 AI Tutor",
                    "🔀 Flowcharts","🎙 Voice Search","🌐 14 Languages",
                    "⏱ Pomodoro","🃏 Flashcards","🔥 Study Streaks",
                  ].map(f => <span key={f} className="feature-pill">{f}</span>)}
                </div>

                {/* Mode Toggle */}
                <div className="home-mode-toggle">
                  <button className={`mode-tab ${homeMode === "search" ? "active" : ""}`} onClick={() => setHomeMode("search")}>
                    🔍 AI Topic Search
                  </button>
                  <button className={`mode-tab ${homeMode === "upload" ? "active" : ""}`} onClick={() => setHomeMode("upload")}>
                    📤 Upload Document
                  </button>
                </div>

                {/* Note Type */}
                <div className="settings-panel">
                  <h3>📐 Note Style</h3>
                  <div className="preferences-group">
                    {(["short","precise","long"] as NotePreference[]).map(p => (
                      <button key={p} className={`pref-btn ${noteType === p ? "active" : ""}`} onClick={() => setNoteType(p)}>
                        <span className="pref-icon">{p==="short"?"⚡":p==="precise"?"🎯":"📚"}</span>
                        <span className="pref-label">{p==="short"?"Short & Crisp":p==="precise"?"Precise":"Comprehensive"}</span>
                        <span className="pref-desc">{p==="short"?"Bullet points only":p==="precise"?"Balanced & structured":"Full deep-dive"}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search Mode */}
                {homeMode === "search" && (
                  <div className="search-section">
                    <div className={`search-input-group ${isListening ? "listening" : ""}`}>
                      <span className="search-icon">🔍</span>
                      <input
                        type="text"
                        className="search-input"
                        placeholder={isListening ? "🎤 Listening... speak now" : "Enter any topic, e.g. 'Quantum Mechanics'..."}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleSearch()}
                        autoFocus
                      />
                      <button className={`mic-btn ${isListening ? "listening" : ""}`} onClick={toggleVoiceSearch} title="Voice Search">🎙</button>
                      {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")}>✕</button>}
                    </div>
                    {searchQuery.trim() && (
                      <button className="btn btn-primary generate-btn pulse-glow" onClick={() => handleSearch()}>
                        🚀 Generate Study Material
                      </button>
                    )}
                    <div className="suggested-topics">
                      <div className="suggested-title">💡 Explore Topics</div>
                      {SUGGESTED_TOPICS.map(cat => (
                        <div key={cat.category} className="topic-category">
                          <div className="topic-category-label">{cat.icon} {cat.category}</div>
                          <div className="topic-chips">
                            {cat.topics.map(t => (
                              <button key={t} className="topic-chip" onClick={() => { setSearchQuery(t); handleSearch(t); }}>
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload Mode */}
                {homeMode === "upload" && (
                  <>
                    <div className={`upload-zone ${file ? "has-file" : ""}`} onDragOver={e => e.preventDefault()} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.doc,.docx,.ppt,.pptx,.txt" hidden />
                      {file ? (
                        <div className="file-info">
                          <span className="icon">{file.name.endsWith(".pdf")?"📄":file.name.match(/docx?$/)?"📝":"📊"}</span>
                          <span className="filename">{file.name}</span>
                          <span className="filesize">{(file.size/1024/1024).toFixed(2)} MB</span>
                        </div>
                      ) : (
                        <div className="upload-prompt">
                          <span className="upload-icon-animated">☁️</span>
                          <h3>Drop your document here</h3>
                          <p>or click to browse files</p>
                          <div className="supported-formats">
                            <span>PDF</span><span>DOCX</span><span>PPTX</span><span>TXT</span>
                          </div>
                        </div>
                      )}
                    </div>
                    {file && (
                      <button className="btn btn-primary generate-btn pulse-glow" onClick={handleProcess}>
                        ✨ Generate Study Material
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ===== PROCESSING ===== */}
          {status === "processing" && (
            <div className="processing-section animate-fade-in">
              <div className="processing-orb">
                <div className="orb-ring r1" /><div className="orb-ring r2" /><div className="orb-ring r3" />
                <span className="orb-icon">🧠</span>
              </div>
              <h2>Building your study guide...</h2>
              <p>Generating <strong>{noteType}</strong> notes with quiz, flashcards & flowcharts</p>
              <div className="processing-steps">
                {["📖 Reading document","🧠 Generating notes","🎯 Crafting quiz","🔀 Building flowcharts","🖼️ Fetching visuals"].map((s, i) => (
                  <div key={s} className="proc-step" style={{ animationDelay: `${i * 0.4}s` }}>{s}</div>
                ))}
              </div>
            </div>
          )}

          {/* ===== ERROR ===== */}
          {status === "error" && (
            <div className="error-section animate-fade-in">
              <div className="error-orb">⚠️</div>
              <h2>Something went wrong</h2>
              <div className="error-msg-box">{errorMsg}</div>
              <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={() => file ? handleProcess() : handleSearch()}>🔁 Retry</button>
                <button className="btn btn-secondary" onClick={() => reset()}>← Go Back</button>
              </div>
            </div>
          )}

          {/* ===== SUCCESS ===== */}
          {status === "success" && result && (
            <div className="results-section animate-fade-in">

              {/* Key Terms */}
              {result.keyTerms && result.keyTerms.length > 0 && (
                <div className="key-terms-strip">
                  <span className="key-terms-label">🔑 Key Terms:</span>
                  {result.keyTerms.map(t => <span key={t} className="key-term">{t}</span>)}
                </div>
              )}

              {/* Info Cards */}
              {(result.hasProject || (result.tips && result.tips.length > 0)) && (
                <div className="info-cards">
                  {result.hasProject && (
                    <div className="project-card animate-slide-in">
                      <div className="card-header">
                        <h3>🚀 Project Detected</h3>
                        {result.projectDeadline && <span className="deadline-badge">🗓️ {result.projectDeadline}</span>}
                      </div>
                      <p className="card-content">{result.projectSummary}</p>
                    </div>
                  )}
                  {result.tips && result.tips.length > 0 && (
                    <div className="tips-card animate-slide-in">
                      <div className="card-header"><h3>💡 AI Study Tips</h3></div>
                      <ul className="tips-list card-content">
                        {result.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Tabs */}
              <div className="results-tabs">
                {(["notes","tutor","quiz","flashcards","flowcharts"] as ActiveTab[]).map(tab => {
                  if (tab === "flowcharts" && (!result.flowcharts || !result.flowcharts.length)) return null;
                  return (
                    <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                      {tab==="notes"?"📝 Notes":tab==="tutor"?"🧑‍🏫 Tutor":tab==="quiz"?"🎯 Quiz":tab==="flashcards"?"🃏 Cards":"🔀 Flowcharts"}
                      {tab==="quiz" && isQuizSubmitted && <span className="tab-badge score">{score}/{activeQuiz.length}</span>}
                      {tab==="flashcards" && <span className="tab-badge">{flashcards.length}</span>}
                    </button>
                  );
                })}
              </div>

              {/* ── NOTES TAB ── */}
              {activeTab === "notes" && (
                <div className="notes-panel glass-panel animate-fade-in">
                  {result.imageUrl && (
                    <div className="topic-image-header">
                      <img src={result.imageUrl} alt={result.sourceTopic} />
                      <div className="topic-image-overlay">
                        <h2>{result.sourceTopic}</h2>
                      </div>
                    </div>
                  )}
                  <div className="notes-header-container">
                    <div className="notes-header-left">
                      <h3>📝 Study Notes</h3>
                      <span className="notes-badge">{noteType}</span>
                      {currentTranslLang && <span className="lang-active-badge">🌐 {currentTranslLang}</span>}
                      {result.readingTime && <span className="reading-time-badge">⏱ {result.readingTime} min</span>}
                    </div>
                    <div className="notes-header-actions">
                      <div className="notes-search-wrap">
                        <input className="notes-search-input" placeholder="🔍 Search notes..." value={notesSearch} onChange={e => setNotesSearch(e.target.value)} />
                        {notesSearch && <button className="notes-search-clear" onClick={() => setNotesSearch("")}>✕</button>}
                      </div>
                      <div className="speech-rate-group">
                        <button className="speed-btn" onClick={() => setSpeechRate(r => Math.max(0.5, r - 0.25))} title="Slower">🐢</button>
                        <span className="speed-label">{speechRate}x</span>
                        <button className="speed-btn" onClick={() => setSpeechRate(r => Math.min(2.0, r + 0.25))} title="Faster">🐇</button>
                      </div>
                      {!isSpeaking && !isPaused && <button className="btn-icon" onClick={startNarration}>🎙 Listen</button>}
                      {isSpeaking && !isPaused && <button className="btn-icon active" onClick={pauseNarration}>⏸ Pause</button>}
                      {isPaused && <button className="btn-icon active" onClick={startNarration}>▶ Resume</button>}
                      {(isSpeaking || isPaused) && <button className="btn-icon" onClick={stopNarration}>⏹ Stop</button>}
                      <button className={`btn-icon ${copied ? "copied" : ""}`} onClick={copyNotes}>{copied ? "✅ Copied!" : "📋 Copy"}</button>
                      <button className={`btn-icon ${bookmarked ? "active" : ""}`} onClick={() => setBookmarked(p => !p)}>
                        {bookmarked ? "🔖 Saved" : "🔖 Save"}
                      </button>
                    </div>
                  </div>
                  {isSpeaking && (
                    <div className="narration-bar">
                      <div className="narration-waves"><span/><span/><span/><span/><span/></div>
                      <span>{isPaused ? "Paused" : "Reading aloud..."}</span>
                    </div>
                  )}
                  <div className="markdown-content" dangerouslySetInnerHTML={renderNotes()} />
                  <div className="notes-footer">
                    <button className="notes-footer-btn" onClick={() => setActiveTab("quiz")}>Take Quiz →</button>
                    <button className="notes-footer-btn secondary" onClick={() => setActiveTab("tutor")}>Ask AI Tutor →</button>
                  </div>
                </div>
              )}

              {/* ── AI TUTOR TAB ── */}
              {activeTab === "tutor" && (
                <div className="tutor-panel glass-panel animate-fade-in">
                  <div className="tutor-header">
                    <div className="tutor-avatar">
                      <div className="tutor-avatar-icon">🧑‍🏫</div>
                      <div className="tutor-avatar-info">
                        <h3>StudyAI Tutor</h3>
                        <p className={isTutorSpeaking ? "tutor-status speaking" : "tutor-status"}>
                          {isTutorSpeaking ? "🔊 Speaking..." : isTutorTyping ? "✍️ Thinking..." : "Ready to help you learn!"}
                        </p>
                      </div>
                    </div>
                    {isTutorSpeaking && (
                      <div className="tutor-visualizer speaking">
                        <span/><span/><span/><span/><span/>
                      </div>
                    )}
                  </div>

                  <div className="tutor-chat-area" ref={tutorScrollRef}>
                    {tutorMessages.length === 0 && (
                      <div className="tutor-welcome">
                        <div className="chat-msg tutor">
                          Hi! I'm your AI Tutor. I've studied <strong>{result.sourceTopic || "this document"}</strong> thoroughly. Ask me anything — I'll explain concepts, quiz you, or give examples! 💡
                        </div>
                        <div className="tutor-quick-questions">
                          {[
                            "Explain this in simple terms",
                            "What are the most important points?",
                            "Give me a real-world example",
                            "Quiz me on this topic",
                          ].map(q => (
                            <button key={q} className="quick-q-btn" onClick={() => { setTutorInput(q); }}>
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {tutorMessages.map((msg, i) => (
                      <div key={i} className={`chat-msg ${msg.role}`}>
                        <div className="chat-msg-content">{msg.content}</div>
                        <div className="chat-msg-time">{msg.timestamp.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"})}</div>
                      </div>
                    ))}
                    {isTutorTyping && (
                      <div className="chat-msg tutor typing">
                        <span/><span/><span/>
                      </div>
                    )}
                  </div>

                  <div className="tutor-input-area">
                    <textarea
                      placeholder="Type or speak your question..."
                      value={tutorInput}
                      onChange={e => setTutorInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTutorSubmit(); }}}
                      rows={1}
                    />
                    <button className={`mic-btn ${isTutorListening ? "listening" : ""}`} onClick={toggleTutorVoice} title="Voice Input">🎙</button>
                    <button className="tutor-send-btn" onClick={handleTutorSubmit} disabled={!tutorInput.trim() || isTutorTyping}>➤</button>
                  </div>
                </div>
              )}

              {/* ── QUIZ TAB ── */}
              {activeTab === "quiz" && (
                <div className="quiz-panel glass-panel animate-fade-in">
                  <div className="quiz-header-container">
                    <div className="quiz-header-left">
                      <h3>🎯 Quiz</h3>
                      {currentTranslLang && <span className="lang-active-badge">🌐 {currentTranslLang}</span>}
                    </div>
                    <div className="quiz-header-right">
                      <div className="quiz-timer-display">
                        ⏱ {formatTime(quizTimer)}
                      </div>
                      {isQuizSubmitted && (
                        <div className={`score-badge ${score/activeQuiz.length >= 0.7 ? "score-good" : "score-bad"}`}>
                          {score >= activeQuiz.length * 0.7 ? "🏆" : "📖"} {score}/{activeQuiz.length} · {Math.round(score/activeQuiz.length*100)}%
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="quiz-list">
                    {activeQuiz.map((q, idx) => {
                      const isCorrect = isQuizSubmitted && userAnswers[idx] === q.correctAnswer;
                      return (
                        <div key={idx} className={`quiz-item ${isQuizSubmitted ? "submitted" : ""}`}>
                          <h4><span className="q-number">{idx + 1}</span>{q.question}</h4>
                          <div className="options-grid">
                            {q.options.map((opt, oIdx) => {
                              let cls = "option-btn ";
                              if (userAnswers[idx] === oIdx) cls += "selected ";
                              if (isQuizSubmitted) {
                                if (oIdx === q.correctAnswer) cls += "correct-answer ";
                                else if (userAnswers[idx] === oIdx) cls += "wrong-answer ";
                                cls += "disabled ";
                              }
                              return (
                                <button key={oIdx} className={cls} onClick={() => handleAnswerSelect(idx, oIdx)} disabled={isQuizSubmitted}>
                                  <span className="option-letter">{String.fromCharCode(65 + oIdx)}</span>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                          {isQuizSubmitted && (
                            <div className={`explanation-container ${isCorrect ? "explanation-correct" : "explanation-wrong"}`}>
                              <button className="explanation-toggle" onClick={() => setExpandedExp(expandedExp === idx ? null : idx)}>
                                <span>{isCorrect ? "✅ Correct!" : "❌ Incorrect"}</span>
                                {!isCorrect && <span className="correct-hint">✓ {q.options[q.correctAnswer]}</span>}
                                <span className="see-exp">{expandedExp === idx ? "▲ Hide" : "▼ Explain"}</span>
                              </button>
                              {expandedExp === idx && (
                                <div className="explanation-body animate-fade-in">
                                  {!isCorrect && <div className="correct-answer-hint">✓ Correct: <strong>{q.options[q.correctAnswer]}</strong></div>}
                                  <p>{q.explanation}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!isQuizSubmitted && Object.keys(userAnswers).length === activeQuiz.length && activeQuiz.length > 0 && (
                    <div className="quiz-submit-container">
                      <button className="btn btn-primary generate-btn pulse-glow" onClick={submitQuiz}>Submit Answers 🎯</button>
                    </div>
                  )}
                  {!isQuizSubmitted && Object.keys(userAnswers).length < activeQuiz.length && (
                    <div className="quiz-progress-hint">
                      <span>{Object.keys(userAnswers).length}/{activeQuiz.length} answered</span>
                      <div className="quiz-progress-bar">
                        <div className="quiz-progress-fill" style={{ width: `${Object.keys(userAnswers).length/activeQuiz.length*100}%` }} />
                      </div>
                    </div>
                  )}
                  {isQuizSubmitted && (
                    <div className="quiz-result-summary">
                      <div className="quiz-result-stats">
                        <div className="quiz-stat"><span className="stat-val">{score}/{activeQuiz.length}</span><span className="stat-lbl">Score</span></div>
                        <div className="quiz-stat"><span className="stat-val">{formatTime(quizTimer)}</span><span className="stat-lbl">Time</span></div>
                        <div className="quiz-stat"><span className="stat-val">+{score*10} XP</span><span className="stat-lbl">Earned</span></div>
                        <div className="quiz-stat"><span className="stat-val">{Math.round(score/activeQuiz.length*100)}%</span><span className="stat-lbl">Accuracy</span></div>
                      </div>
                      {score === activeQuiz.length && <p className="result-message perfect">🎉 Perfect Score! You're a genius!</p>}
                      {score >= activeQuiz.length*0.7 && score < activeQuiz.length && <p className="result-message good">🏆 Great job! Keep it up!</p>}
                      {score < activeQuiz.length*0.7 && <p className="result-message low">📖 Review the explanations and try again!</p>}
                      <div className="quiz-result-actions">
                        <button className="btn btn-secondary" onClick={() => { setIsQuizSubmitted(false); setUserAnswers({}); setExpandedExp(null); setQuizTimer(0); }}>🔁 Retry</button>
                        <button className="btn btn-secondary" onClick={() => { setActiveTab("flashcards"); setCardIndex(0); setCardFlipped(false); }}>🃏 Study Flashcards</button>
                        <button className="btn btn-secondary" onClick={() => setActiveTab("tutor")}>🧑‍🏫 Ask Tutor</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── FLASHCARDS TAB ── */}
              {activeTab === "flashcards" && (
                <div className="flashcards-section animate-fade-in">
                  <div className="flashcards-header glass-panel">
                    <h3>🃏 Smart Flashcards</h3>
                    <p>Click to flip · Rate your confidence · Cards will repeat based on your rating</p>
                    <div className="flashcard-progress-bar">
                      <div className="flashcard-progress-fill" style={{ width: `${((cardIndex + 1)/flashcards.length)*100}%` }} />
                    </div>
                    <div className="flashcard-counter">{cardIndex + 1} / {flashcards.length}</div>
                  </div>

                  <div className="flashcard-stage">
                    <div className={`flashcard ${cardFlipped ? "flipped" : ""}`} onClick={() => setCardFlipped(p => !p)}>
                      <div className="flashcard-inner">
                        <div className="flashcard-front">
                          <div className="flashcard-label">QUESTION</div>
                          <div className="flashcard-text">{flashcards[cardIndex]?.front}</div>
                          <div className="flashcard-hint">Tap to reveal answer</div>
                        </div>
                        <div className="flashcard-back">
                          <div className="flashcard-label">ANSWER</div>
                          <div className="flashcard-text">{flashcards[cardIndex]?.back}</div>
                          <div className="flashcard-hint">Tap to see question</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {cardFlipped && (
                    <div className="confidence-buttons animate-fade-in">
                      <span className="confidence-label">How well did you know this?</span>
                      <div className="confidence-row">
                        <button className="conf-btn again"   onClick={() => rateCard("again")}>🔴 Again</button>
                        <button className="conf-btn hard"    onClick={() => rateCard("hard")}>🟡 Hard</button>
                        <button className="conf-btn good"    onClick={() => rateCard("good")}>🟢 Good</button>
                        <button className="conf-btn easy"    onClick={() => rateCard("easy")}>🔵 Easy</button>
                      </div>
                    </div>
                  )}

                  {!cardFlipped && (
                    <div className="flashcard-controls">
                      <button className="flashcard-nav-btn" onClick={() => { setCardIndex(p => Math.max(0, p-1)); setCardFlipped(false); }} disabled={cardIndex === 0}>← Prev</button>
                      <button className="flashcard-flip-btn" onClick={() => setCardFlipped(p => !p)}>🔄 Flip Card</button>
                      <button className="flashcard-nav-btn" onClick={() => { setCardIndex(p => Math.min(flashcards.length-1, p+1)); setCardFlipped(false); }} disabled={cardIndex === flashcards.length-1}>Next →</button>
                    </div>
                  )}

                  <div className="flashcard-dots">
                    {flashcards.map((c, i) => (
                      <button key={i}
                        className={`flashcard-dot ${i===cardIndex?"active":""} ${c.confidence==="easy"?"dot-easy":c.confidence==="good"?"dot-good":c.confidence==="hard"?"dot-hard":c.confidence==="again"?"dot-again":""}`}
                        onClick={() => { setCardIndex(i); setCardFlipped(false); }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── FLOWCHARTS TAB ── */}
              {activeTab === "flowcharts" && result.flowcharts && (
                <div className="flowcharts-section animate-fade-in">
                  <div className="flowcharts-intro">
                    <h3>🔀 Visual Flowcharts</h3>
                    <p>AI-generated diagrams showing key processes and algorithms from your material.</p>
                  </div>
                  <div className="flowcharts-grid">
                    {result.flowcharts.map((chart, i) => (
                      <div key={i} className="flowchart-card glass-panel animate-fade-in">
                        <div className="flowchart-card-header">
                          <span className="flowchart-icon">🔀</span>
                          <h4>{chart.title}</h4>
                        </div>
                        <div className="flowchart-render" ref={el => { flowchartRefs.current[i] = el; }}>
                          <div className="flowchart-loading"><div className="spinner" style={{ width:40,height:40 }}/><span>Rendering...</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ===== POMODORO FLOATING WIDGET ===== */}
      {showPomodoro && (
        <div className={`pomodoro-widget ${pomodoroMode==="work"?"work-mode":"break-mode"}`}>
          <div className="pomodoro-header">
            <span className="pomodoro-title">⏱ Focus Timer</span>
            <button className="pomodoro-close" onClick={() => { setShowPomodoro(false); if (pomodoroRunning) { clearInterval(pomodoroRef.current!); setPomodoroRunning(false); } }}>✕</button>
          </div>
          <div className="pomodoro-mode-toggle">
            <button className={`pomodoro-mode-btn ${pomodoroMode==="work"?"active":""}`} onClick={() => switchPomodoroMode("work")}>🎯 Work</button>
            <button className={`pomodoro-mode-btn ${pomodoroMode==="break"?"active":""}`} onClick={() => switchPomodoroMode("break")}>☕ Break</button>
          </div>
          {!pomodoroRunning && (
            <div className="pomodoro-dur-row">
              <div className="pomodoro-dur-group">
                <label>Work (min)</label>
                <input type="number" value={workDurationMins} min={1} max={120} onChange={e => setWorkDurationMins(Number(e.target.value))} />
              </div>
              <div className="pomodoro-dur-group">
                <label>Break (min)</label>
                <input type="number" value={breakDurationMins} min={1} max={30} onChange={e => setBreakDurationMins(Number(e.target.value))} />
              </div>
            </div>
          )}
          <div className={`pomodoro-time ${pomodoroMode==="work"?"work-color":"break-color"}`}>{formatTime(pomodoroTime)}</div>
          <div className="pomodoro-progress"><div className={`pomodoro-progress-fill ${pomodoroMode}`} style={{ width:`${progressPct}%` }}/></div>
          <div className="pomodoro-controls">
            <button className="pomodoro-btn start" onClick={() => setPomodoroRunning(p => !p)}>{pomodoroRunning ? "⏸ Pause" : "▶ Start"}</button>
            <button className="pomodoro-btn reset" onClick={resetPomodoro}>↺ Reset</button>
          </div>
          <div className="pomodoro-sounds">
            {[{id:"none",label:"🔇 Off"},{id:"rain",label:"🌧 Rain"},{id:"lofi",label:"🎧 Lo-Fi"},{id:"cafe",label:"☕ Cafe"},{id:"nature",label:"🌿 Nature"}].map(s => (
              <button key={s.id} className={`pomodoro-sound-btn ${activeSound===s.id?"active":""}`} onClick={() => setActiveSound(s.id)}>{s.label}</button>
            ))}
          </div>
          <div className="pomodoro-task-section">
            <div className="pomodoro-task-input">
              <input type="text" placeholder="Add focus task..." value={newTaskText} onChange={e=>setNewTaskText(e.target.value)}
                onKeyDown={e => { if(e.key==="Enter" && newTaskText.trim()) { setPomodoroTasks(p=>[...p,{id:Date.now().toString(),text:newTaskText.trim(),completed:false}]); setNewTaskText(""); }}} />
              <button onClick={() => { if(newTaskText.trim()) { setPomodoroTasks(p=>[...p,{id:Date.now().toString(),text:newTaskText.trim(),completed:false}]); setNewTaskText(""); }}}>+</button>
            </div>
            <div className="pomodoro-task-list">
              {pomodoroTasks.map(t => (
                <div key={t.id} className={`pomodoro-task-item ${t.completed?"completed":""}`}>
                  <input type="checkbox" className="pomodoro-task-checkbox" checked={t.completed} onChange={() => setPomodoroTasks(p=>p.map(pt=>pt.id===t.id?{...pt,completed:!pt.completed}:pt))} />
                  <span>{t.text}</span>
                  <button className="task-delete" onClick={() => setPomodoroTasks(p=>p.filter(pt=>pt.id!==t.id))}>✕</button>
                </div>
              ))}
            </div>
          </div>
          <div className="pomodoro-sessions">🍅 {pomodoroSessions} sessions · +{pomodoroSessions*10} XP</div>
        </div>
      )}
    </div>
  );
}
