
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UserProfile, IdeationData, WizardStep, NormalizedIdea, PromptPreset, VoiceExtraction, PersonData } from './types';
import { llmService, ProviderType } from './services/llmService';
import { saveToGoogleDrive, uploadImageToDrive, downloadCsvLocally, listIdeationFiles, getFileContent } from './services/googleDriveService';


const GOOGLE_CLIENT_ID = "1089918924198-0nnc8nuradga903ifa0vbn3c2usuan4p.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

// Allowed users for this app
const ALLOWED_USERS = ["eluma0001@gmail.com", "eluma0002@gmail.com"];

// User avatars (custom profile pictures)
const USER_AVATARS: Record<string, string> = {
  'eluma0001@gmail.com': '/avatars/eluma0001.png',
};

// Generate UUID for each entry
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const ARCHITECT_BLOCKS = {
  roles: [
    { id: 'coach', label: 'Startup Coach', icon: '👨‍🏫', snippet: 'Du agierst als erfahrener Startup Coach.' },
    { id: 'investor', label: 'Kritischer Investor', icon: '💰', snippet: 'Du agierst als skeptischer Venture Capital Investor.' },
    { id: 'architect', label: 'Tech Architekt', icon: '🏗️', snippet: 'Du agierst als leitender Software-Architekt.' },
    { id: 'designer', label: 'UX Visionär', icon: '🎨', snippet: 'Du agierst als preisgekrönter Produktdesigner.' }
  ],
  tones: [
    { id: 'brutal', label: 'Brutal Ehrlich', icon: '💀', snippet: 'Dein Ton ist direkt und ungeschönt.' },
    { id: 'hype', label: 'Hype-Train', icon: '🔥', snippet: 'Dein Ton ist extrem enthusiastisch.' },
    { id: 'minimal', label: 'Minimalistisch', icon: '📏', snippet: 'Dein Ton ist sachlich und kurz.' }
  ],
  focus: [
    { id: 'profit', label: 'Profitabilität', icon: '📈', snippet: 'Fokus auf Monetarisierung.' },
    { id: 'ux', label: 'User Experience', icon: '👤', snippet: 'Fokus auf echte Nutzerprobleme.' },
    { id: 'tech', label: 'Deep Tech', icon: '🤖', snippet: 'Fokus auf technologische Machbarkeit.' }
  ],
  methods: [
    { id: 'cut', label: 'Radikales Kürzen', icon: '✂️', snippet: 'Wende die 80/20 Regel an.' },
    { id: 'expand', label: 'Moonshot Thinking', icon: '🌙', snippet: 'Denke 10x größer.' },
    { id: 'risk', label: 'Risk-First', icon: '🛡️', snippet: 'Analysiere Risiken zuerst.' }
  ]
};

const PRESETS: PromptPreset[] = [
  { id: 'normal', name: 'Klarheit', description: 'Strukturiert & Präzise.', instructionModifier: 'Fokus auf Business-Struktur.', icon: '📄' },
  { id: 'yolo', name: 'Speed', description: 'Disruptiv & Schnell.', instructionModifier: 'Fokus auf schnellen Marktstart.', icon: '🚀' },
  { id: 'mvp', name: 'Minimalist', description: 'Radikale Reduktion.', instructionModifier: 'Fokus auf den kleinsten Kern.', icon: '✂️' }
];

// Photo Upload Grid Component with Camera/Gallery Choice
const PhotoUploadGrid: React.FC<{
  images: string[];
  onImagesChange: (images: string[]) => void;
}> = ({ images, onImagesChange }) => {
  const cameraInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const galleryInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [showChoiceModal, setShowChoiceModal] = useState<number | null>(null);

  const handleSlotClick = (index: number) => {
    // If slot already has an image, don't show modal
    if (images[index]) return;
    setShowChoiceModal(index);
  };

  const handleCameraClick = () => {
    if (showChoiceModal !== null) {
      cameraInputRefs.current[showChoiceModal]?.click();
      setShowChoiceModal(null);
    }
  };

  const handleGalleryClick = () => {
    if (showChoiceModal !== null) {
      galleryInputRefs.current[showChoiceModal]?.click();
      setShowChoiceModal(null);
    }
  };

  const handleFileChange = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const newImages = [...images];
      while (newImages.length < 5) newImages.push('');
      newImages[index] = reader.result as string;
      onImagesChange(newImages);
    };
    reader.readAsDataURL(file);
    // Reset the input so the same file can be selected again if needed
    event.target.value = '';
  };

  const handleRemove = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newImages = [...images];
    newImages[index] = '';
    onImagesChange(newImages);
  };

  return (
    <>
      {/* Photo Source Choice Modal */}
      {showChoiceModal !== null && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200"
          onClick={() => setShowChoiceModal(null)}
        >
          <div
            className="bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4 animate-in zoom-in-95 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-black text-slate-900 mb-2 text-center">Foto hinzufügen</h3>
            <p className="text-slate-400 text-sm mb-6 text-center">Wähle eine Quelle</p>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleCameraClick}
                className="flex items-center gap-4 p-4 bg-indigo-50 hover:bg-indigo-100 rounded-2xl transition-all active:scale-95 border-2 border-indigo-200"
              >
                <div className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center text-2xl">📷</div>
                <div className="text-left">
                  <span className="font-black text-slate-900 block">Kamera</span>
                  <span className="text-xs text-slate-400">Neues Foto aufnehmen</span>
                </div>
              </button>

              <button
                onClick={handleGalleryClick}
                className="flex items-center gap-4 p-4 bg-purple-50 hover:bg-purple-100 rounded-2xl transition-all active:scale-95 border-2 border-purple-200"
              >
                <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-2xl">📁</div>
                <div className="text-left">
                  <span className="font-black text-slate-900 block">Galerie</span>
                  <span className="text-xs text-slate-400">Bestehendes Bild wählen</span>
                </div>
              </button>
            </div>

            <button
              onClick={() => setShowChoiceModal(null)}
              className="w-full mt-4 py-3 text-slate-400 font-bold text-sm hover:text-slate-600 transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Photo Grid */}
      <div className="grid grid-cols-5 gap-3 mt-6">
        {[0, 1, 2, 3, 4].map((index) => (
          <div
            key={index}
            onClick={() => handleSlotClick(index)}
            className="relative aspect-square border-2 border-dashed border-red-400 rounded-xl flex items-center justify-center cursor-pointer hover:border-red-600 hover:bg-red-50 transition-all overflow-hidden group"
          >
            {/* Hidden Camera Input */}
            <input
              ref={(el) => { cameraInputRefs.current[index] = el; }}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFileChange(index, e)}
            />
            {/* Hidden Gallery Input (no capture) */}
            <input
              ref={(el) => { galleryInputRefs.current[index] = el; }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(index, e)}
            />

            {images[index] ? (
              <>
                <img src={images[index]} alt={`Foto ${index + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={(e) => handleRemove(index, e)}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </>
            ) : (
              <span className="text-red-500 font-black text-sm">Foto</span>
            )}
          </div>
        ))}
      </div>
    </>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [step, setStep] = useState<WizardStep>(WizardStep.DASHBOARD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [normalizedResult, setNormalizedResult] = useState<NormalizedIdea | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [lastProvider, setLastProvider] = useState<ProviderType | null>(null);
  const [serverStatus, setServerStatus] = useState<{ gemini: boolean; openai: boolean; groq: boolean } | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const [selectedPreset, setSelectedPreset] = useState<string>('normal');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [isPersonMode, setIsPersonMode] = useState(false);

  const [architectConfig, setArchitectConfig] = useState({ role: 'coach', tone: 'hype', focus: 'ux', method: 'cut' });

  const systemInstruction = useMemo(() => {
    let base = isCustomMode ?
      `${ARCHITECT_BLOCKS.roles.find(r => r.id === architectConfig.role)?.snippet} ${ARCHITECT_BLOCKS.tones.find(t => t.id === architectConfig.tone)?.snippet} ${ARCHITECT_BLOCKS.focus.find(f => f.id === architectConfig.focus)?.snippet} ${ARCHITECT_BLOCKS.methods.find(m => m.id === architectConfig.method)?.snippet}`
      : (PRESETS.find(p => p.id === selectedPreset)?.instructionModifier || '');
    return `${user?.baseInstruction || ''} ${base}`;
  }, [architectConfig, isCustomMode, selectedPreset, user]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processingStatus, setProcessingStatus] = useState({ step: '', progress: 0 });

  const initialFormData: IdeationData = {
    projectName: '', problemStatement: '', targetUser: '', solutionSummary: '',
    constraints: '', differentiation: '', risks: '', nextAction: '', tags: '', images: [], audioTranscript: ''
  };

  const [formData, setFormData] = useState<IdeationData>(initialFormData);

  const [personData, setPersonData] = useState<PersonData>({
    name: '', expertise: '', passions: '', challenges: '', lifestyle: '', manualExtension: ''
  });

  // Reset form for new ideation
  const resetForNewIdeation = () => {
    setFormData(initialFormData);
    setNormalizedResult(null);
    setProcessingStatus({ step: '', progress: 0 });
    setDebugLog([]);
    setError(null);
    setRecordingTime(0);
    audioChunksRef.current = [];
    console.log("[App] Form reset for new ideation");
  };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);


  const tokenClientRef = useRef<any>(null);

  useEffect(() => {
    if (step === WizardStep.PROCESSING) {
      setDebugLog(["🚀 Prozess gestartet (HARDCODED TEST)..."]);
      const t1 = setTimeout(() => setDebugLog(p => [...p, "📡 Verbinde mit Vercel Serverless Function..."]), 1000);
      const t2 = setTimeout(() => setDebugLog(p => [...p, "⏳ Sende Daten an Backend-Proxy..."]), 2500);
      const t3 = setTimeout(() => setDebugLog(p => [...p, "🚀 KI-Modell (Groq/Whisper-v3) HARDCODED wird angefragt..."]), 5000);
      const t4 = setTimeout(() => setDebugLog(p => [...p, "⚠️ Dauert länger - OpenAI Fallback aktiv?"]), 10000);
      const t5 = setTimeout(() => setDebugLog(p => [...p, "🐢 Server arbeitet noch..."]), 20000);
      const t6 = setTimeout(() => setDebugLog(p => [...p, "❌ Timeout möglich."]), 45000);

      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); clearTimeout(t5); clearTimeout(t6); };
    } else {
      setDebugLog([]);
    }
  }, [step]);

  useEffect(() => {
    // Initialize Google Identity Services with proper error handling
    const initGsi = () => {
      try {
        // @ts-ignore
        if (window.google && window.google.accounts) {
          // @ts-ignore
          tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: async (response: any) => {
              try {
                if (response.error !== undefined) {
                  console.error("OAuth Error:", response);
                  setError("Login fehlgeschlagen: " + response.error);
                  return;
                }

                // Fetch user info
                const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                  headers: { Authorization: `Bearer ${response.access_token}` }
                });
                const info = await userInfoRes.json();

                // Validate user is in allowed list
                if (!ALLOWED_USERS.includes(info.email)) {
                  setError(`Zugriff verweigert: ${info.email} ist nicht autorisiert. Nur eluma0001@gmail.com und eluma0002@gmail.com sind erlaubt.`);
                  setSelectedEmail(null);
                  return;
                }

                setUser({
                  email: info.email,
                  name: info.name,
                  picture: info.picture,
                  accessToken: response.access_token,
                  baseInstruction: 'Du bist ein strukturierter Projektmanager.',
                  preferredProvider: 'google'
                });
              } catch (err) {
                console.error("User info fetch error:", err);
                setError("Benutzerdaten konnten nicht geladen werden.");
              }
            },
          });
        } else {
          console.log("Google Identity Services not yet loaded, will retry...");
        }
      } catch (err) {
        console.error("GSI Init Error:", err);
      }
    };

    // Retry GSI init a few times in case script loads late
    initGsi();
    const retryTimer = setTimeout(initGsi, 1000);
    const retryTimer2 = setTimeout(initGsi, 2500);

    // Check server status (Vercel)
    const checkServerStatus = async () => {
      try {
        const res = await fetch('/api/status');
        const status = await res.json();
        setServerStatus(status);
        console.log("Server Status:", status);
      } catch (err) {
        console.warn("Could not check server status", err);
      }
    };

    // Check for AI Studio key (only in that environment)
    const checkKey = async () => {
      checkServerStatus(); // Check server keys too
      try {
        // @ts-ignore
        if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
          // @ts-ignore
          setHasApiKey(await window.aistudio.hasSelectedApiKey());
        } else {
          // Not in AI Studio environment - that's fine, we use backend proxy
          setHasApiKey(true);
        }
      } catch (err) {
        console.log("Not in AI Studio environment");
        setHasApiKey(true);
      }
    };
    checkKey();

    return () => {
      clearTimeout(retryTimer);
      clearTimeout(retryTimer2);
    };
  }, []);

  const handleAuthClick = (email?: string) => {
    if (tokenClientRef.current) {
      const options: any = { prompt: 'consent' };
      if (email) {
        options.hint = email;
      }
      tokenClientRef.current.requestAccessToken(options);
    } else {
      setError("Google Auth not initialized. Please refresh.");
    }
  };

  // Cleanup on unmount or navigate
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [step]);

  const handleKeySetup = async () => {
    // @ts-ignore
    if (window.aistudio) { await window.aistudio.openSelectKey(); setHasApiKey(true); }
  };

  const stopRecordingManually = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processAudio(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => setRecordingTime(p => p + 1), 1000);
    } catch (err) {
      setError("Mikrofon-Zugriff verweigert.");
      setIsRecording(false);
    }
  };

  const processAudio = async (blob: Blob) => {
    if (!user) return;
    setLoading(true);
    setStep(WizardStep.PROCESSING);
    setProcessingStatus({ step: 'KI analysiert Audio (Groq/Whisper-v3)...', progress: 20 });
    setDebugLog(p => [...p, "🎙️ Audio-Blob erhalten, starte Konvertierung..."]);

    try {
      // 1. Convert Blob to Base64 via Promise
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(new Error("Fehler beim Lesen der Audio-Datei"));
      });
      setDebugLog(p => [...p, `✅ Base64 Konvertierung (Länge: ${base64.length})`]);

      // 2. Call LLM Service
      setDebugLog(p => [...p, "📡 Sende Anfrage an Backend (Groq primär)..."]);
      const { data: res, provider } = await llmService.processAudio(base64, blob.type, user, systemInstruction);
      setLastProvider(provider);
      setDebugLog(p => [...p, `✨ Antwort erhalten von: ${provider.toUpperCase()}`]);

      // 3. Process Result
      const transcript = res.transcript || "";
      setDebugLog(p => [...p, `📝 Transkript: "${transcript.substring(0, 50)}..."`]);

      if (isPersonMode && res.extracted_person) {
        setDebugLog(p => [...p, "👤 Personen-Daten erkannt, wechsle Screen..."]);
        setPersonData(p => ({ ...p, ...res.extracted_person }));
        setStep(WizardStep.PERSON_PROFILE);
      } else if (!isPersonMode && res.extracted_data) {
        setDebugLog(p => [...p, "💡 App-Idee erkannt, wechsle zum Review..."]);
        setFormData(f => ({ ...f, ...res.extracted_data, audioTranscript: transcript }));
        setStep(WizardStep.REVIEW);
      } else if (transcript) {
        setDebugLog(p => [...p, "📝 Nur Transkript erhalten, öffne Review..."]);
        setFormData(f => ({ ...f, audioTranscript: transcript }));
        setStep(WizardStep.REVIEW);
      } else {
        setDebugLog(p => [...p, "⚠️ Keine Daten im Antwort-Objekt gefunden."]);
        throw new Error("KI lieferte leeres Ergebnis");
      }
    } catch (err: any) {
      console.error("Audio Processing error:", err);
      const errorMsg = err.message || "Unbekannter KI- oder Netzwerkfehler";
      setDebugLog(p => [...p, `❌ FEHLER: ${errorMsg}`]);
      setError("Verarbeitung fehlgeschlagen: " + errorMsg);
      // Wait 4 seconds so the user can read the error in the log before it jumps back
      setTimeout(() => setStep(WizardStep.DASHBOARD), 4000);
    } finally {
      setLoading(false);
    }
  };

  const generateIdea = async () => {
    setLoading(true);
    setStep(WizardStep.PROCESSING);
    setProcessingStatus({ step: 'Idee wird synthetisiert...', progress: 40 });
    try {
      const { data: idea, provider } = await llmService.generateFromPerson(personData, systemInstruction);
      setLastProvider(provider);
      setFormData(f => ({ ...f, ...idea }));
      setStep(WizardStep.PERSON_SYNTHESIS);
    } catch (err) { setError("Generierung fehlgeschlagen."); setStep(WizardStep.PERSON_CHALLENGES); }
    setLoading(false);
  };

  const renderStep = () => {
    switch (step) {
      case WizardStep.DASHBOARD:
        return (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex bg-white p-2 rounded-[2rem] shadow-sm border border-slate-100">
              <button
                onClick={() => setIsPersonMode(false)}
                className={`flex-1 py-4 px-6 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all ${!isPersonMode ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                Standard Idee
              </button>
              <button
                onClick={() => setIsPersonMode(true)}
                className={`flex-1 py-4 px-6 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all ${isPersonMode ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
              >
                Person-App Bauen
              </button>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">AI Gehirn</h3>
                <button onClick={() => setIsCustomMode(!isCustomMode)} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">
                  {isCustomMode ? 'Zu Presets' : 'Experten-Modus'}
                </button>
              </div>

              {!isCustomMode ? (
                <div className="grid grid-cols-3 gap-4 mb-8">
                  {PRESETS.map(p => (
                    <button key={p.id} onClick={() => setSelectedPreset(p.id)} className={`flex flex-col items-center p-4 rounded-3xl border-2 transition-all ${selectedPreset === p.id ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-slate-50'}`}>
                      <span className="text-2xl mb-1">{p.icon}</span>
                      <span className="text-[10px] font-black uppercase text-slate-900">{p.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Expertise</span>
                    <select className="w-full text-xs font-bold p-2 rounded-xl bg-slate-50" value={architectConfig.role} onChange={e => setArchitectConfig(p => ({ ...p, role: e.target.value }))}>
                      {ARCHITECT_BLOCKS.roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Ton</span>
                    <select className="w-full text-xs font-bold p-2 rounded-xl bg-slate-50" value={architectConfig.tone} onChange={e => setArchitectConfig(p => ({ ...p, tone: e.target.value }))}>
                      {ARCHITECT_BLOCKS.tones.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Fokus</span>
                    <select className="w-full text-xs font-bold p-2 rounded-xl bg-slate-50" value={architectConfig.focus} onChange={e => setArchitectConfig(p => ({ ...p, focus: e.target.value }))}>
                      {ARCHITECT_BLOCKS.focus.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Methode</span>
                    <select className="w-full text-xs font-bold p-2 rounded-xl bg-slate-50" value={architectConfig.method} onChange={e => setArchitectConfig(p => ({ ...p, method: e.target.value }))}>
                      {ARCHITECT_BLOCKS.methods.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => setStep(isPersonMode ? WizardStep.PERSON_PROFILE : WizardStep.CONTEXT)}
                  className={`flex-1 py-5 rounded-3xl font-black text-white shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all ${isPersonMode ? 'bg-purple-600' : 'bg-indigo-600'}`}
                >
                  {isPersonMode ? 'Personen-Wizard' : 'Ideation starten'} <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
                <button onClick={() => setStep(WizardStep.VOICE_RECORDING)} className="flex-1 py-5 bg-slate-900 text-white rounded-3xl font-black shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                  Sprachnotiz <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                </button>
              </div>
            </div>
          </div>
        );

      case WizardStep.PERSON_PROFILE:
        return (
          <WizardCard title="Personen-Profil" description="Wer ist das Ziel deiner App?" onNext={() => setStep(WizardStep.PERSON_CHALLENGES)} onBack={() => setStep(WizardStep.DASHBOARD)}>
            <div className="space-y-6">
              <input type="text" placeholder="Name oder Rolle" className="w-full p-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none" value={personData.name} onChange={e => setPersonData(p => ({ ...p, name: e.target.value }))} />
              <input type="text" placeholder="Hauptexpertise" className="w-full p-4 border border-slate-200 rounded-2xl" value={personData.expertise} onChange={e => setPersonData(p => ({ ...p, expertise: e.target.value }))} />
              <input type="text" placeholder="Leidenschaften" className="w-full p-4 border border-slate-200 rounded-2xl" value={personData.passions} onChange={e => setPersonData(p => ({ ...p, passions: e.target.value }))} />
            </div>
          </WizardCard>
        );

      case WizardStep.PERSON_CHALLENGES:
        return (
          <WizardCard title="Lebenswelt" description="Schmerzpunkte & Wünsche." onNext={generateIdea} onBack={() => setStep(WizardStep.PERSON_PROFILE)} nextLabel="Idee generieren ✨">
            <div className="space-y-6">
              <textarea rows={3} placeholder="Größte Herausforderungen..." className="w-full p-4 border border-slate-200 rounded-2xl" value={personData.challenges} onChange={e => setPersonData(p => ({ ...p, challenges: e.target.value }))} />
              <textarea rows={3} placeholder="Lebensstil & Alltag..." className="w-full p-4 border border-slate-200 rounded-2xl" value={personData.lifestyle} onChange={e => setPersonData(p => ({ ...p, lifestyle: e.target.value }))} />
              <textarea rows={2} placeholder="Manuelle Zusatz-Infos (Hintergrund)..." className="w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl" value={personData.manualExtension} onChange={e => setPersonData(p => ({ ...p, manualExtension: e.target.value }))} />
            </div>
          </WizardCard>
        );

      case WizardStep.PERSON_SYNTHESIS:
        return (
          <div className="animate-in zoom-in-95 duration-500">
            <div className="bg-white p-12 rounded-[3rem] shadow-2xl border-4 border-purple-50">
              <h2 className="text-3xl font-black text-slate-900 mb-2">Synthetisierte App-Idee</h2>
              <p className="text-purple-600 text-[10px] font-black uppercase tracking-widest mb-10">Generiert für: {personData.name}</p>

              <div className="space-y-8 bg-slate-50 p-8 rounded-[2rem]">
                <ReviewItem label="Projektname" value={formData.projectName} />
                <ReviewItem label="Problem" value={formData.problemStatement} />
                <ReviewItem label="Die Lösung" value={formData.solutionSummary} />
              </div>

              <div className="mt-12 flex gap-4">
                <button onClick={() => setStep(WizardStep.REVIEW)} className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase tracking-widest text-[10px]">Strukturieren</button>
                <button onClick={() => setStep(WizardStep.DASHBOARD)} className="px-8 py-5 border-2 border-slate-100 text-slate-400 rounded-3xl font-black uppercase tracking-widest text-[10px]">Verwerfen</button>
              </div>
            </div>
          </div>
        );

      case WizardStep.CONTEXT:
        return (
          <WizardCard title="Projektname" description="Wie heißt die Vision?" onNext={() => setStep(WizardStep.PROBLEM)} onBack={() => setStep(WizardStep.DASHBOARD)} disabled={!formData.projectName}>
            <input type="text" placeholder="Name..." className="w-full p-4 border border-slate-200 rounded-xl outline-none text-xl focus:ring-2 focus:ring-indigo-500" value={formData.projectName} onChange={e => setFormData(f => ({ ...f, projectName: e.target.value }))} />
            <PhotoUploadGrid
              images={formData.images}
              onImagesChange={(imgs) => setFormData(f => ({ ...f, images: imgs }))}
            />
          </WizardCard>
        );
      case WizardStep.PROBLEM:
        return (
          <WizardCard title="Das Problem" description="Welchen Schmerz lösen wir?" onNext={() => setStep(WizardStep.AUDIENCE)} onBack={() => setStep(WizardStep.CONTEXT)} disabled={!formData.problemStatement}>
            <textarea rows={4} placeholder="Beschreibe das Problem..." className="w-full p-4 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.problemStatement} onChange={e => setFormData(f => ({ ...f, problemStatement: e.target.value }))} />
          </WizardCard>
        );
      case WizardStep.AUDIENCE:
        return (
          <WizardCard title="Zielgruppe" description="Wer braucht das?" onNext={() => setStep(WizardStep.SOLUTION)} onBack={() => setStep(WizardStep.PROBLEM)} disabled={!formData.targetUser}>
            <input type="text" placeholder="Zielgruppe..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.targetUser} onChange={e => setFormData(f => ({ ...f, targetUser: e.target.value }))} />
          </WizardCard>
        );
      case WizardStep.SOLUTION:
        return (
          <WizardCard title="Die Lösung" description="Wie sieht die Antwort aus?" onNext={() => setStep(WizardStep.REVIEW)} onBack={() => setStep(WizardStep.AUDIENCE)} disabled={!formData.solutionSummary}>
            <textarea rows={4} placeholder="Lösungsansatz..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.solutionSummary} onChange={e => setFormData(f => ({ ...f, solutionSummary: e.target.value }))} />
          </WizardCard>
        );

      case WizardStep.VOICE_RECORDING:
        return (
          <WizardCard title="Sprachaufzeichnung" description="Erzähle mir alles." onNext={stopRecordingManually} onBack={() => setStep(WizardStep.DASHBOARD)} nextLabel={isRecording ? "Stop" : "Aufnehmen"}>
            <div className="flex flex-col items-center py-10">
              <button onClick={isRecording ? stopRecordingManually : startRecording} className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 animate-pulse scale-110 shadow-2xl' : 'bg-slate-900 shadow-xl'}`}>
                {isRecording ? <div className="w-8 h-8 bg-white rounded-sm"></div> : <span className="text-3xl text-white">🎙️</span>}
              </button>
              <div className="mt-8 text-2xl font-black tabular-nums">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</div>
            </div>
          </WizardCard>
        );

      case WizardStep.PROCESSING:
        return (
          <div className="bg-white p-16 rounded-[3rem] shadow-2xl text-center max-w-lg mx-auto border-4 border-indigo-50">
            <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] mx-auto mb-8 flex items-center justify-center animate-spin">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24"><path d="M12 4V2m0 20v-2m8-8h2M2 12h2" stroke="currentColor" strokeWidth="3" /></svg>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">KI-Processing...</h2>
            <p className="text-indigo-600 font-bold uppercase tracking-widest text-[10px] mb-6">{processingStatus.step}</p>
            <div className="bg-slate-900 text-green-400 font-mono text-[10px] p-4 rounded-xl text-left h-32 overflow-y-auto border-t-2 border-indigo-500 shadow-inner">
              {debugLog.map((l, i) => <div key={i}>{l}</div>)}
              <div className="animate-pulse">_</div>
            </div>
          </div>
        );

      case WizardStep.REVIEW:
        return (
          <WizardCard title="Review" description="Launch bereit?" onNext={async () => {
            setStep(WizardStep.PROCESSING);
            setDebugLog(["🚀 Workflow gestartet..."]);

            try {
              // Step 1: Try AI normalization (with fallback)
              let normalizedData: any = null;
              let usedProvider: ProviderType = 'none';

              setProcessingStatus({ step: 'KI-Normalisierung...', progress: 20 });
              setDebugLog(p => [...p, "📡 Rufe KI-Normalisierung auf..."]);

              try {
                const { data: res, provider } = await llmService.normalize(formData, user!, systemInstruction);
                normalizedData = res;
                usedProvider = provider;
                setDebugLog(p => [...p, `✅ KI-Normalisierung via ${provider.toUpperCase()}`]);
              } catch (normErr: any) {
                console.warn("Normalize failed, using raw data:", normErr.message);
                setDebugLog(p => [...p, `⚠️ KI fehlgeschlagen: ${normErr.message}`, "📝 Verwende Rohdaten als Fallback..."]);
                // Fallback: use raw formData
                normalizedData = {
                  project_name: formData.projectName,
                  problem_statement: formData.problemStatement,
                  target_user: formData.targetUser,
                  solution_summary: formData.solutionSummary,
                  constraints: formData.constraints,
                  differentiation: formData.differentiation,
                  risks: formData.risks,
                  next_action: formData.nextAction,
                  tags: formData.tags,
                  audio_transcript: formData.audioTranscript,
                  status: 'raw',
                  priority: 'medium',
                  source: 'manual',
                  version: '1.0',
                  created_at: new Date().toISOString(),
                };
                usedProvider = 'none';
              }

              setLastProvider(usedProvider);

              // Step 2: Generate session UUID FIRST (for linking all files)
              const sessionUUID = generateUUID();
              const sessionUUID8 = sessionUUID.substring(0, 8);
              const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
              const authorPrefix = user?.email?.replace('@gmail.com', '').toUpperCase() || 'UNKNOWN';
              const projectSlug = formData.projectName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '').substring(0, 30);

              setDebugLog(p => [...p, `🔗 Session: ${sessionUUID8} | Projekt: ${projectSlug}`]);

              // Step 3: Upload images with progress and proper naming
              let imageUrls: string[] = [];
              const imagesToUpload = formData.images.filter(img => img && img.length > 0);
              const totalImages = imagesToUpload.length;

              if (totalImages > 0 && user?.accessToken) {
                setDebugLog(p => [...p, `📷 Lade ${totalImages} Bild(er) hoch...`]);

                for (let i = 0; i < formData.images.length; i++) {
                  const img = formData.images[i];
                  if (img) {
                    const uploadedCount = imageUrls.length + 1;
                    const percent = Math.round((uploadedCount / totalImages) * 100);
                    setProcessingStatus({ step: `Bild ${uploadedCount}/${totalImages} hochladen... ${percent}%`, progress: 40 + (uploadedCount / totalImages) * 30 });
                    setDebugLog(p => [...p, `📤 Bild ${uploadedCount}/${totalImages} (${percent}%)...`]);

                    try {
                      // New naming format: {YYYYMMDD}_{AUTHOR}_{PROJECT}_{UUID8}_foto{N}.jpg
                      const imageFileName = `${dateStr}_${authorPrefix}_${projectSlug}_${sessionUUID8}_foto${i + 1}.jpg`;
                      const url = await uploadImageToDrive(img, imageFileName, user.accessToken, user.email);
                      imageUrls.push(url);
                      setDebugLog(p => [...p, `✅ Bild ${uploadedCount} hochgeladen`]);
                    } catch (imgErr: any) {
                      console.error(`Image ${i + 1} upload failed:`, imgErr);
                      setDebugLog(p => [...p, `❌ Bild ${uploadedCount} fehlgeschlagen: ${imgErr.message}`]);
                    }
                  }
                }
              }

              // Step 4: Merge and create final result with UUIDs
              const entryUUID = generateUUID();
              const finalResult = {
                ...normalizedData,
                idea_id: entryUUID,
                session_uuid: sessionUUID, // Already generated above - links project <-> photos
                created_by_email: user?.email || '',
                image_url_1: imageUrls[0] || '',
                image_url_2: imageUrls[1] || '',
                image_url_3: imageUrls[2] || '',
                image_url_4: imageUrls[3] || '',
                image_url_5: imageUrls[4] || '',
              };

              console.log("Final Result with UUID:", finalResult);
              setNormalizedResult(finalResult);
              setDebugLog(p => [...p, `🔑 Entry: ${entryUUID.substring(0, 8)}...`]);

              // Step 5: Save to Google Drive with improved filename
              if (user?.accessToken) {
                setProcessingStatus({ step: 'Speichere CSV in Google Drive...', progress: 90 });
                // CSV filename: {YYYYMMDD}_{AUTHOR}_{PROJECT}_{UUID8}.csv
                const csvFileName = `${dateStr}_${authorPrefix}_${projectSlug}_${sessionUUID8}.csv`;
                setDebugLog(p => [...p, `💾 Speichere: ${csvFileName}`]);

                try {
                  await saveToGoogleDrive(finalResult, user.accessToken, user.email, csvFileName);
                  setDebugLog(p => [...p, "✅ Google Drive Sync erfolgreich!"]);
                } catch (driveErr: any) {
                  console.error("Drive save failed:", driveErr);
                  setDebugLog(p => [...p, `❌ Drive-Fehler: ${driveErr.message}`]);
                  throw driveErr;
                }
              } else {
                setDebugLog(p => [...p, "⚠️ Kein Access Token - Drive-Sync übersprungen"]);
              }

              setProcessingStatus({ step: 'Abgeschlossen!', progress: 100 });
              setDebugLog(p => [...p, "🎉 Workflow abgeschlossen!"]);

              // Brief delay to show success state
              await new Promise(resolve => setTimeout(resolve, 500));
              setStep(WizardStep.SUCCESS);

            } catch (err: any) {
              console.error("Save flow error:", err);
              setDebugLog(p => [...p, `❌ KRITISCHER FEHLER: ${err.message}`]);
              setError("Fehler: " + err.message);
              // Wait 3 seconds so user can read error before going back
              setTimeout(() => setStep(WizardStep.REVIEW), 3000);
            }
          }} onBack={() => setStep(WizardStep.DASHBOARD)} nextLabel="Abschließen">
            <div className="space-y-4">
              <ReviewItem label="Projekt" value={formData.projectName} />
              <ReviewItem label="Problem" value={formData.problemStatement} />
              <ReviewItem label="Lösung" value={formData.solutionSummary} />
              {formData.audioTranscript && (
                <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Transkript-Auszug</span>
                  <p className="text-xs text-slate-500 italic line-clamp-3">"{formData.audioTranscript}"</p>
                </div>
              )}
              <PhotoUploadGrid
                images={formData.images}
                onImagesChange={(imgs) => setFormData(f => ({ ...f, images: imgs }))}
              />
            </div>
          </WizardCard>
        );

      case WizardStep.SUCCESS:
        return (
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center border-4 border-green-50">
            <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full mx-auto mb-8 flex items-center justify-center text-5xl">✓</div>
            <h2 className="text-4xl font-black text-slate-900 mb-8">Synchronisiert</h2>
            <div className="flex flex-col gap-3">
              <div className="flex gap-4">
                <button onClick={() => downloadCsvLocally(normalizedResult!)} className="flex-1 py-5 bg-slate-100 rounded-3xl font-black uppercase text-[10px] tracking-widest">CSV Export</button>
                <button onClick={() => { resetForNewIdeation(); setStep(WizardStep.DASHBOARD); }} className="flex-1 py-5 bg-slate-900 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest">Home</button>
              </div>
              <button
                onClick={() => { resetForNewIdeation(); setStep(WizardStep.CONTEXT); }}
                className="w-full py-5 bg-indigo-600 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-colors"
              >
                ✨ Neue Idee erfassen
              </button>
            </div>
          </div>
        );

      default: return null;
    }
  };

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-xl w-full bg-white rounded-[3rem] shadow-2xl p-16 text-center animate-in zoom-in-95 duration-500 relative">
        <div className="absolute top-8 right-8 flex gap-2">
          {serverStatus && (
            <>
              <div className={`px-2 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${serverStatus.gemini ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-400 border-slate-100 opacity-50'}`}>
                <span>✨</span> {serverStatus.gemini ? 'Gemini' : 'N/A'}
              </div>
              <div className={`px-2 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${serverStatus.openai ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100 opacity-50'}`}>
                <span>🤖</span> {serverStatus.openai ? 'OpenAI' : 'N/A'}
              </div>
            </>
          )}
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Ideation Companion</h1>
        <p className="text-slate-400 mb-12 font-medium">Production Cloud Access</p>

        <div className="flex flex-col items-center gap-6">
          <div className="w-32 h-32 bg-indigo-50 rounded-full flex items-center justify-center text-5xl shadow-inner">👤</div>

          <p className="text-slate-500 font-medium text-sm mb-2">Wähle dein Konto:</p>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <button
              onClick={() => handleAuthClick("eluma0001@gmail.com")}
              className="group flex items-center gap-4 px-6 py-4 bg-white border-2 border-indigo-200 rounded-2xl hover:border-indigo-600 hover:shadow-xl transition-all active:scale-95 shadow-md w-full"
            >
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-xl">1️⃣</div>
              <div className="text-left">
                <span className="font-black text-slate-900 block">eluma0001</span>
                <span className="text-xs text-slate-400">@gmail.com</span>
              </div>
              <svg className="w-6 h-6 ml-auto text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </button>

            <button
              onClick={() => handleAuthClick("eluma0002@gmail.com")}
              className="group flex items-center gap-4 px-6 py-4 bg-white border-2 border-purple-200 rounded-2xl hover:border-purple-600 hover:shadow-xl transition-all active:scale-95 shadow-md w-full"
            >
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-xl">2️⃣</div>
              <div className="text-left">
                <span className="font-black text-slate-900 block">eluma0002</span>
                <span className="text-xs text-slate-400">@gmail.com</span>
              </div>
              <svg className="w-6 h-6 ml-auto text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium max-w-sm">
              {error}
            </div>
          )}

          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-4">Nur autorisierte E_Luma Accounts</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-inter">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 py-5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="E_Luma" className="w-10 h-10 object-contain" />
          <span className="text-xl font-black text-slate-900 uppercase tracking-tight">Companion</span>
        </div>
        <div className="flex items-center gap-4">
          {lastProvider && (
            <div className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${lastProvider === 'gemini'
              ? 'bg-blue-50 text-blue-700 border border-blue-100'
              : lastProvider === 'openai'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-slate-50 text-slate-500 border border-slate-100'
              }`}>
              {lastProvider === 'gemini' && '✨'}
              {lastProvider === 'openai' && '🤖'}
              {lastProvider === 'groq' && '🚀'}
              {lastProvider === 'gemini' ? 'Gemini' : lastProvider === 'openai' ? 'OpenAI' : lastProvider === 'groq' ? 'Groq' : 'N/A'}
            </div>
          )}
          <div className="flex gap-2 text-[10px]">
            {serverStatus && (
              <>
                <div className={`px-2 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${serverStatus.groq ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-slate-50 text-slate-400 border-slate-100 opacity-50'}`}>
                  <span>🚀</span> {serverStatus.groq ? 'Groq' : 'N/A'}
                </div>
                <div className={`px-2 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${serverStatus.openai ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100 opacity-50'}`}>
                  <span>🤖</span> {serverStatus.openai ? 'OpenAI' : 'N/A'}
                </div>
                <div className={`px-2 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest flex items-center gap-1 ${serverStatus.gemini ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-slate-50 text-slate-400 border-slate-100 opacity-50'}`}>
                  <span>✨</span> {serverStatus.gemini ? 'Gemini' : 'N/A'}
                </div>
              </>
            )}
          </div>
          <div className="h-8 w-[1px] bg-slate-100 mx-2"></div>
          <img
            src={USER_AVATARS[user.email] || user.picture}
            alt={user.email}
            className="w-10 h-10 rounded-full border-2 border-white shadow-sm object-cover"
          />
          <button onClick={() => setUser(null)} className="text-slate-300 hover:text-red-500 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg></button>
        </div>
      </header>
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12">{renderStep()}</main>
      <footer className="py-10 text-center border-t border-slate-100">
        <p className="text-slate-300 text-[9px] font-black tracking-[0.5em] uppercase">ELUMA • BRAIN ARCHITECT v1.9</p>
      </footer>
    </div>
  );
};

const WizardCard: React.FC<{ title: string; description: string; children: React.ReactNode; onNext: () => void; onBack?: () => void; disabled?: boolean; nextLabel?: string; }> = ({ title, description, children, onNext, onBack, disabled, nextLabel = "Weiter" }) => (
  <div className="bg-white p-12 sm:p-16 rounded-[3rem] shadow-2xl border border-slate-100 animate-in slide-in-from-bottom-8 duration-700 relative overflow-hidden">
    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>
    <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">{title}</h2>
    <p className="text-slate-400 mb-12 text-lg font-medium">{description}</p>
    <div className="mb-12 min-h-[160px]">{children}</div>
    <div className="flex items-center justify-between pt-10 border-t border-slate-50">
      {onBack && <button onClick={onBack} className="px-8 py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-900 transition-colors">Zurück</button>}
      <button onClick={onNext} disabled={disabled} className={`px-12 py-5 rounded-3xl font-black text-white transition-all uppercase tracking-widest text-[10px] ${disabled ? 'bg-slate-200 cursor-not-allowed' : 'bg-indigo-600 hover:scale-105 shadow-xl active:scale-95'}`}>
        {nextLabel}
      </button>
    </div>
  </div>
);

const ReviewItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border-b border-slate-50 pb-5">
    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-1">{label}</span>
    <p className="text-slate-800 font-bold leading-snug">{value || 'Keine Angabe'}</p>
  </div>
);

export default App;
