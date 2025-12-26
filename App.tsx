import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UserProfile, IdeationData, WizardStep, NormalizedIdea, PromptPreset, VoiceExtraction } from './types';
import { llmService } from './services/llmService';
import { saveToGoogleDrive, uploadImageToDrive, downloadCsvLocally, listIdeationFiles, getFileContent } from './services/googleDriveService';

// Bausteine für den Brain Architect
const ARCHITECT_BLOCKS = {
  roles: [
    { id: 'coach', label: 'Startup Coach', icon: '👨‍🏫', snippet: 'Du agierst als erfahrener Startup Coach.' },
    { id: 'investor', label: 'Kritischer Investor', icon: '💰', snippet: 'Du agierst als skeptischer Venture Capital Investor, der nur auf Zahlen und Skalierbarkeit achtet.' },
    { id: 'architect', label: 'Tech Architekt', icon: '🏗️', snippet: 'Du agierst als leitender Software-Architekt mit Fokus auf System-Design.' },
    { id: 'designer', label: 'UX Visionär', icon: '🎨', snippet: 'Du agierst als preisgekrönter Produktdesigner mit Fokus auf Nutzerführung.' }
  ],
  tones: [
    { id: 'brutal', label: 'Brutal Ehrlich', icon: '💀', snippet: 'Dein Ton ist direkt, ungeschönt und fast schon schmerzhaft ehrlich.' },
    { id: 'hype', label: 'Hype-Train', icon: '🔥', snippet: 'Dein Ton ist extrem enthusiastisch, motivierend und disruptiv.' },
    { id: 'minimal', label: 'Minimalistisch', icon: '📏', snippet: 'Dein Ton ist extrem sachlich, kurz angebunden und fokussiert auf das Wesentliche.' }
  ],
  focus: [
    { id: 'profit', label: 'Profitabilität', icon: '📈', snippet: 'Dein Hauptfokus liegt auf Monetarisierung und Business-Model-Innovation.' },
    { id: 'ux', label: 'User Experience', icon: '👤', snippet: 'Dein Hauptfokus liegt auf der Lösung eines echten Nutzerproblems.' },
    { id: 'tech', label: 'Deep Tech', icon: '🤖', snippet: 'Dein Hauptfokus liegt auf technologischer Differenzierung und Machbarkeit.' }
  ],
  methods: [
    { id: 'cut', label: 'Radikales Kürzen', icon: '✂️', snippet: 'Wende die 80/20 Regel an und streiche 80% der Features.' },
    { id: 'expand', label: 'Moonshot Thinking', icon: '🌙', snippet: 'Denke die Idee 10x größer als sie aktuell ist.' },
    { id: 'risk', label: 'Risk-First', icon: '🛡️', snippet: 'Analysiere zuerst alles, was schiefgehen könnte.' }
  ]
};

const PRESETS: PromptPreset[] = [
  { 
    id: 'normal', 
    name: 'Normaler Modus', 
    description: 'Ausgewogene, professionelle und klare Dokumentation.', 
    instructionModifier: 'Du bist ein Experte für professionelle Dokumentation. Konzentriere dich auf Klarheit, technische Genauigkeit und Standard-Business-Terminologie. Bewahre einen neutralen Ton.', 
    icon: '📄' 
  },
  { 
    id: 'yolo', 
    name: 'YOLO Modus', 
    description: 'Hohe Energie, disruptiv und minimaler Widerstand.', 
    instructionModifier: 'Du bist ein High-Speed Innovations-Agent. Ignoriere kleinere Einschränkungen. Nutze mutige, disruptive Sprache. Priorisiere Begeisterung und Vision vor Sicherheit und Dokumentation. Ship fast!', 
    icon: '🚀' 
  },
  { 
    id: 'mvp', 
    name: 'MVP Fokus', 
    description: 'Radikale Feature-Kürzung, um den Kern zu finden.', 
    instructionModifier: 'Du bist ein minimalistischer Produkt-Architekt. Dein Ziel ist es, das absolut minimale lebensfähige Produkt (MVP) zu finden. Sei rücksichtslos. Streiche jedes Feature, das nicht essentiell für den Kern-Loop ist.', 
    icon: '✂️' 
  }
];

// Helper for Aistudio key management - removed explicit interface Window augmentation to fix TS merge errors
// as aistudio is assumed to be provided by the environment's global types.

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [step, setStep] = useState<WizardStep>(WizardStep.DASHBOARD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [normalizedResult, setNormalizedResult] = useState<NormalizedIdea | null>(null);
  const [savedIdeations, setSavedIdeations] = useState<any[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  
  const [selectedPreset, setSelectedPreset] = useState<string>('normal');
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Brain Architect State
  const [architectConfig, setArchitectConfig] = useState({
    role: 'coach',
    tone: 'hype',
    focus: 'ux',
    method: 'cut'
  });

  const customPrompt = useMemo(() => {
    const r = ARCHITECT_BLOCKS.roles.find(b => b.id === architectConfig.role)?.snippet || '';
    const t = ARCHITECT_BLOCKS.tones.find(b => b.id === architectConfig.tone)?.snippet || '';
    const f = ARCHITECT_BLOCKS.focus.find(b => b.id === architectConfig.focus)?.snippet || '';
    const m = ARCHITECT_BLOCKS.methods.find(b => b.id === architectConfig.method)?.snippet || '';
    return `${r} ${t} ${f} ${m}`;
  }, [architectConfig]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceQuestions, setVoiceQuestions] = useState<string[]>([]);
  const [voiceClarificationAnswers, setVoiceClarificationAnswers] = useState<Record<number, string>>({});

  const [processingStatus, setProcessingStatus] = useState<{ step: string; progress: number }>({ step: '', progress: 0 });
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [formData, setFormData] = useState<IdeationData>({
    projectName: '', problemStatement: '', targetUser: '', solutionSummary: '',
    constraints: '', differentiation: '', risks: '', nextAction: '', tags: '', images: []
  });

  const users: UserProfile[] = [
    {
      email: 'eluma0001@gmail.com', name: 'Mario', 
      picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mario',
      accessToken: 'dummy-token-mario',
      baseInstruction: 'Du bist Mario. Du bist ein strukturierter, strategischer Projektmanager, der Skalierbarkeit und saubere Daten priorisiert.',
      preferredProvider: 'google'
    },
    {
      email: 'eluma0002@gmail.com', name: 'Elvis', 
      picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Elvis',
      accessToken: 'dummy-token-elvis',
      baseInstruction: 'Du bist Elvis. Du bist ein hochenergetischer, kreativer Disruptor. Du priorisierst Innovation und Einzigartigkeit.',
      preferredProvider: 'openai'
    }
  ];

  // API Key Status Check
  useEffect(() => {
    const checkApiKey = async () => {
      // @ts-ignore - aistudio is assumed global from context
      if (window.aistudio) {
        // @ts-ignore - aistudio is assumed global from context
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkApiKey();
    const interval = setInterval(checkApiKey, 2000); // Poll status
    return () => clearInterval(interval);
  }, []);

  const handleKeySetup = async () => {
    // @ts-ignore - aistudio is assumed global from context
    if (window.aistudio) {
      // @ts-ignore - aistudio is assumed global from context
      await window.aistudio.openSelectKey();
      setHasApiKey(true); // Assume success per instructions
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processVoiceNote(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setError("Mikrofon-Zugriff verweigert.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const processVoiceNote = async (blob: Blob) => {
    if (!user) return;
    setLoading(true);
    setStep(WizardStep.PROCESSING);
    setProcessingStatus({ step: 'Bereite Sprachdatei vor...', progress: 15 });
    
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        setProcessingStatus({ step: 'Analysiere Vision mit Gemini...', progress: 45 });
        const base64Audio = (reader.result as string).split(',')[1];
        const instruction = `${user.baseInstruction} \n ${isCustomMode ? customPrompt : PRESETS.find(p=>p.id === selectedPreset)?.instructionModifier}`;
        
        const result = await llmService.processAudio(base64Audio, blob.type, user, instruction);
        setProcessingStatus({ step: 'Struktur wird extrahiert...', progress: 85 });
        
        setFormData(prev => ({
          ...prev,
          projectName: result.extracted_data.projectName || prev.projectName,
          problemStatement: result.extracted_data.problemStatement || prev.problemStatement,
          targetUser: result.extracted_data.targetUser || prev.targetUser,
          solutionSummary: result.extracted_data.solutionSummary || prev.solutionSummary,
          constraints: result.extracted_data.constraints || prev.constraints,
          differentiation: result.extracted_data.differentiation || prev.differentiation,
          risks: result.extracted_data.risks || prev.risks,
          nextAction: result.extracted_data.nextAction || prev.nextAction,
          tags: result.extracted_data.tags || prev.tags,
        }));

        setProcessingStatus({ step: 'Analyse abgeschlossen!', progress: 100 });

        if (result.questions && result.questions.length > 0) {
          setVoiceQuestions(result.questions);
          setStep(WizardStep.VOICE_CLARIFICATION);
        } else {
          setStep(WizardStep.REVIEW);
        }
        setLoading(false);
      };
    } catch (err: any) {
      setError("Audio-Extraktion fehlgeschlagen.");
      setStep(WizardStep.DASHBOARD);
      setLoading(false);
    }
  };

  const fetchArchive = async () => {
    if (!user?.accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const files = await listIdeationFiles(user.accessToken);
      const ideations = [];
      for (const file of files.slice(0, 10)) {
        const content = await getFileContent(file.id, user.accessToken);
        const lines = content.split('\n');
        if (lines.length > 1) {
          const headers = lines[0].split(',');
          const values = lines[1].split(',').map(v => v.replace(/^"|"$/g, ''));
          const entry: any = {};
          headers.forEach((h, i) => entry[h] = values[i]);
          ideations.push({ ...entry, fileName: file.name, fileId: file.id });
        }
      }
      setSavedIdeations(ideations);
      setStep(WizardStep.PREVIEW_ALL);
    } catch (err: any) {
      setError("Fehler beim Laden des Archivs.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (selectedUser: UserProfile) => {
    setUser(selectedUser);
    setError(null);
    setStep(WizardStep.DASHBOARD);
  };

  const startIdeation = () => {
    setError(null);
    setStep(WizardStep.CONTEXT);
  };

  const updateField = (field: keyof IdeationData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const captureImage = () => {
    if (videoRef.current && canvasRef.current && formData.images.length < 5) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const context = canvas.getContext('2d');
      canvas.width = 1024;
      canvas.height = (video.videoHeight / video.videoWidth) * 1024;
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        updateField('images', [...formData.images, canvas.toDataURL('image/jpeg', 0.8)]);
      }
    }
  };

  const processIdeation = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setUploadErrors([]);
    setStep(WizardStep.PROCESSING);
    setProcessingStatus({ step: 'Normalisiere Texte mit KI...', progress: 10 });
    
    try {
      const preset = PRESETS.find(p => p.id === selectedPreset);
      const instruction = `${user.baseInstruction} \n ${isCustomMode ? customPrompt : preset?.instructionModifier}`;
      
      const mergedData = { ...formData };
      if (voiceQuestions.length > 0) {
        mergedData.solutionSummary += ` \n[Klärung]: ${Object.values(voiceClarificationAnswers).join('; ')}`;
      }

      const normalized = await llmService.normalize(mergedData, user, instruction);
      setProcessingStatus({ step: 'Texte normalisiert. Starte Bild-Upload...', progress: 30 });
      
      const imageUrls: string[] = [];
      const currentUploadErrors: string[] = [];
      if (user.accessToken) {
        for (let i = 0; i < formData.images.length; i++) {
          setProcessingStatus({ 
            step: `Lade Bild ${i + 1} von ${formData.images.length} hoch...`, 
            progress: 30 + ((i + 1) / formData.images.length) * 50 
          });
          try {
            const url = await uploadImageToDrive(formData.images[i], `IMG_${normalized.project_name}_${i+1}.jpg`, user.accessToken);
            imageUrls.push(url);
          } catch (imgErr: any) {
             currentUploadErrors.push(`Bild ${i+1}: ${imgErr.message || 'Fehler'}`);
             imageUrls.push("Upload fehlgeschlagen");
          }
        }
      }
      setUploadErrors(currentUploadErrors);

      setProcessingStatus({ step: 'Erstelle CSV-Datenblatt...', progress: 90 });
      const finalIdea: NormalizedIdea = {
        ...normalized,
        image_url_1: imageUrls[0] || "", image_url_2: imageUrls[1] || "", 
        image_url_3: imageUrls[2] || "", image_url_4: imageUrls[3] || "", image_url_5: imageUrls[4] || "",
      };

      setNormalizedResult(finalIdea);
      if (user.accessToken) {
        setProcessingStatus({ step: 'Synchronisiere mit Drive...', progress: 95 });
        await saveToGoogleDrive(finalIdea, user.accessToken);
      }
      setProcessingStatus({ step: 'Fertig!', progress: 100 });
      setStep(WizardStep.SUCCESS);
    } catch (err: any) {
      setError(`Verarbeitung fehlgeschlagen: ${err.message}`);
      setStep(WizardStep.REVIEW);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case WizardStep.DASHBOARD:
        const currentPresetData = PRESETS.find(p => p.id === selectedPreset);
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* API Status Alert */}
            {!hasApiKey && user?.preferredProvider === 'google' && (
              <div className="bg-amber-50 border-2 border-amber-200 p-6 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-500">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                  </div>
                  <div>
                    <h4 className="font-black text-amber-900 text-sm">API-Key erforderlich</h4>
                    <p className="text-[10px] text-amber-700 font-medium">Um Gemini zu nutzen, muss ein gültiger API-Key ausgewählt werden.</p>
                  </div>
                </div>
                <button onClick={handleKeySetup} className="px-6 py-3 bg-amber-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-100">
                  Key jetzt konfigurieren
                </button>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border-2 border-red-200 p-4 rounded-2xl flex items-center gap-3 text-red-700 text-sm font-bold animate-in slide-in-from-top-4 duration-300">
                 <svg className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                 <span>{error}</span>
              </div>
            )}

            {/* Provider Settings Card */}
            <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">API & Gehirn</h2>
                  <p className="text-slate-400 text-sm font-medium">Konfiguriere deinen persönlichen Provider.</p>
                </div>
                <div className="flex gap-2">
                   <button 
                    onClick={() => setUser(p => p ? {...p, preferredProvider: 'google'} : null)}
                    className={`p-3 rounded-2xl border-2 transition-all ${user?.preferredProvider === 'google' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-100 text-slate-400'}`}
                   >
                     <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.29 14.71L12 18l-1.29-1.29L7.41 13.41 8.83 12l2.17 2.17 4.17-4.17 1.41 1.41-5.3 5.3z"/></svg>
                   </button>
                   <button 
                    onClick={() => setUser(p => p ? {...p, preferredProvider: 'openai'} : null)}
                    className={`p-3 rounded-2xl border-2 transition-all ${user?.preferredProvider === 'openai' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-100 text-slate-400'}`}
                   >
                     <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.11 0-2 .89-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>
                   </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                {PRESETS.map((p) => (
                  <button 
                    key={p.id}
                    onClick={() => { setSelectedPreset(p.id); setIsCustomMode(false); }}
                    className={`flex flex-col items-start p-5 rounded-3xl border-2 transition-all text-left group relative overflow-hidden ${
                      selectedPreset === p.id && !isCustomMode ? 'border-indigo-500 bg-indigo-50/50 ring-4 ring-indigo-100' : 'border-slate-100 hover:border-slate-200 bg-slate-50/30'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-2xl p-2 rounded-2xl transition-all ${selectedPreset === p.id && !isCustomMode ? 'bg-indigo-600 shadow-lg shadow-indigo-200 text-white' : 'bg-white group-hover:scale-110'}`}>{p.icon}</span>
                      <span className="font-black text-slate-900 text-sm tracking-tight">{p.name}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-bold uppercase tracking-widest">{p.description}</p>
                  </button>
                ))}
                <button 
                  onClick={() => setIsCustomMode(true)}
                  className={`flex flex-col items-start p-5 rounded-3xl border-2 transition-all text-left group relative ${
                    isCustomMode ? 'border-purple-500 bg-purple-50 ring-4 ring-purple-100' : 'border-slate-100 hover:border-slate-200 bg-slate-50/30'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-2xl p-2 rounded-2xl transition-all ${isCustomMode ? 'bg-purple-600 shadow-lg shadow-purple-200 text-white' : 'bg-white group-hover:scale-110'}`}>🧠</span>
                    <span className="font-black text-slate-900 text-sm tracking-tight">Architect Mode</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-bold uppercase tracking-widest">Bau dein eigenes Team.</p>
                </button>
              </div>

              {isCustomMode && (
                <div className="mb-10 p-8 bg-slate-50 rounded-[2.5rem] border-2 border-purple-100 animate-in zoom-in-95 duration-500">
                  <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                    <span className="p-2 bg-purple-600 rounded-xl text-white text-xs">BUILD</span>
                    Brain Architect
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expertise</label>
                      <div className="flex flex-wrap gap-2">
                        {ARCHITECT_BLOCKS.roles.map(b => (
                          <button key={b.id} onClick={() => setArchitectConfig(p=>({...p, role: b.id}))} className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${architectConfig.role === b.id ? 'bg-purple-600 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            <span>{b.icon}</span> {b.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tonalität</label>
                      <div className="flex flex-wrap gap-2">
                        {ARCHITECT_BLOCKS.tones.map(b => (
                          <button key={b.id} onClick={() => setArchitectConfig(p=>({...p, tone: b.id}))} className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${architectConfig.tone === b.id ? 'bg-purple-600 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            <span>{b.icon}</span> {b.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fokus</label>
                      <div className="flex flex-wrap gap-2">
                        {ARCHITECT_BLOCKS.focus.map(b => (
                          <button key={b.id} onClick={() => setArchitectConfig(p=>({...p, focus: b.id}))} className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${architectConfig.focus === b.id ? 'bg-purple-600 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            <span>{b.icon}</span> {b.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Strategie</label>
                      <div className="flex flex-wrap gap-2">
                        {ARCHITECT_BLOCKS.methods.map(b => (
                          <button key={b.id} onClick={() => setArchitectConfig(p=>({...p, method: b.id}))} className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${architectConfig.method === b.id ? 'bg-purple-600 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            <span>{b.icon}</span> {b.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 p-6 bg-slate-900 rounded-[2rem] shadow-2xl relative overflow-hidden group">
                    <h4 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                      AI Logic Synthesizer ({user?.preferredProvider})
                    </h4>
                    <p className="text-purple-100 text-xs font-mono leading-relaxed">
                      {customPrompt}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={startIdeation}
                  disabled={!hasApiKey && user?.preferredProvider === 'google'}
                  className="flex-1 py-5 bg-indigo-600 text-white rounded-3xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                >
                  Assistent starten <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
                <button 
                  onClick={() => { setError(null); setStep(WizardStep.VOICE_RECORDING); }}
                  disabled={!hasApiKey && user?.preferredProvider === 'google'}
                  className="flex-1 py-5 bg-slate-900 text-white rounded-3xl font-black text-lg hover:bg-slate-800 transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                >
                  Spracheingabe <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between px-4">
               <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Quick Actions</h3>
               <button onClick={fetchArchive} className="text-xs font-black text-indigo-600 uppercase tracking-widest hover:underline flex items-center gap-2">
                 Archiv ansehen <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
               </button>
            </div>
          </div>
        );
      case WizardStep.PREVIEW_ALL:
        return (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-slate-100">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight">Vorschau</h2>
                  <p className="text-slate-400 font-medium">Synchronisierte Einträge aus Google Drive (Read-Only)</p>
                </div>
                <button onClick={() => setStep(WizardStep.DASHBOARD)} className="p-3 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              
              <div className="max-h-[60vh] overflow-y-auto pr-4 space-y-4 custom-scrollbar">
                {savedIdeations.length === 0 && !loading ? (
                  <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Keine Einträge gefunden</p>
                  </div>
                ) : (
                  savedIdeations.map((item, idx) => (
                    <div key={idx} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-1">Projekt</span>
                          <h4 className="text-xl font-black text-slate-900">{item.project_name}</h4>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest block mb-1">Status / Priorität</span>
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${item.priority === 'P0' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>{item.priority}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Problem</span>
                          <p className="text-sm text-slate-600 leading-relaxed">{item.problem_statement}</p>
                        </div>
                        <div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Lösung</span>
                          <p className="text-sm text-slate-600 leading-relaxed">{item.solution_summary}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      case WizardStep.VOICE_RECORDING:
        return (
          <WizardCard 
            title="Gesprochene Vision" 
            description="Nimm eine Sprachnotiz auf." 
            onNext={stopRecording} 
            onBack={() => setStep(WizardStep.DASHBOARD)}
            nextLabel={isRecording ? "Stopp & Verarbeiten" : "Verarbeiten"}
            disabled={!isRecording && recordingTime === 0}
          >
            <div className="flex flex-col items-center py-10">
              <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-50 animate-pulse ring-8 ring-red-100' : 'bg-slate-100'}`}>
                <button 
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 scale-110 shadow-2xl' : 'bg-slate-900 hover:bg-slate-800'}`}
                >
                  {isRecording ? <div className="w-8 h-8 bg-white rounded-sm"></div> : <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z" /><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM6 10a4 4 0 018 0v4a4 4 0 11-8 0v-4z" /></svg>}
                </button>
              </div>
              <div className="mt-8 text-center">
                <p className="text-2xl font-black text-slate-900 tabular-nums">{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</p>
              </div>
            </div>
          </WizardCard>
        );
      case WizardStep.VOICE_CLARIFICATION:
        return (
          <WizardCard title="Klärung" description="Der Assistent hat Rückfragen." onNext={() => setStep(WizardStep.REVIEW)} onBack={() => setStep(WizardStep.VOICE_RECORDING)} nextLabel="Zur Übersicht">
            <div className="space-y-6">
              {voiceQuestions.map((q, i) => (
                <div key={i} className="animate-in slide-in-from-left-4 duration-500">
                  <label className="text-xs font-black text-indigo-600 uppercase tracking-widest block mb-3">{q}</label>
                  <textarea className="w-full p-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]" value={voiceClarificationAnswers[i] || ''} onChange={(e) => setVoiceClarificationAnswers(prev => ({ ...prev, [i]: e.target.value }))} />
                </div>
              ))}
            </div>
          </WizardCard>
        );
      case WizardStep.CONTEXT:
        return (
          <WizardCard title="Projekt-Identität" description="Wie lautet der Name?" onNext={() => setStep(WizardStep.PROBLEM)} onBack={() => setStep(WizardStep.DASHBOARD)} disabled={!formData.projectName}>
            <input type="text" placeholder="Projektname" className="w-full p-4 border border-slate-200 rounded-xl outline-none text-xl focus:ring-2 focus:ring-indigo-500" value={formData.projectName} onChange={e => updateField('projectName', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.PROBLEM:
        return (
          <WizardCard title="Das Problem" description="Warum braucht die Welt das?" onNext={() => setStep(WizardStep.AUDIENCE)} onBack={() => setStep(WizardStep.CONTEXT)} disabled={!formData.problemStatement}>
            <textarea rows={4} placeholder="Beschreibe den Schmerz..." className="w-full p-4 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.problemStatement} onChange={e => updateField('problemStatement', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.AUDIENCE:
        return (
          <WizardCard title="Zielgruppe" description="Wer sind die Begünstigten?" onNext={() => setStep(WizardStep.SOLUTION)} onBack={() => setStep(WizardStep.PROBLEM)} disabled={!formData.targetUser}>
            <input type="text" placeholder="Zielgruppe" className="w-full p-4 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.targetUser} onChange={e => updateField('targetUser', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.SOLUTION:
        return (
          <WizardCard title="Die Lösung" description="Wie genau löst du das Problem?" onNext={() => setStep(WizardStep.VISUALS)} onBack={() => setStep(WizardStep.AUDIENCE)} disabled={!formData.solutionSummary}>
            <textarea rows={4} placeholder="Deine Innovation..." className="w-full p-4 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.solutionSummary} onChange={e => updateField('solutionSummary', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.VISUALS:
        return (
          <WizardCard title="Visueller Beleg" description="Bilder erfassen." onNext={() => { if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); setStep(WizardStep.CONSTRAINTS); }} onBack={() => setStep(WizardStep.SOLUTION)}>
             <div className="space-y-6">
               <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden group">
                 <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                 {!videoRef.current?.srcObject && (
                   <button onClick={async () => {
                     try {
                       const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                       if (videoRef.current) videoRef.current.srcObject = stream;
                       setError(null);
                     } catch (err) {
                       setError("Kamera-Zugriff verweigert.");
                     }
                   }} className="absolute inset-0 m-auto w-40 h-12 bg-white text-slate-900 rounded-full font-bold shadow-2xl">Kamera aktivieren</button>
                 )}
                 {formData.images.length < 5 && videoRef.current?.srcObject && <button onClick={captureImage} className="absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-16 bg-white border-4 border-slate-200 rounded-full flex items-center justify-center active:scale-90 transition-transform"><div className="w-12 h-12 bg-red-500 rounded-full" /></button>}
               </div>
               <div className="grid grid-cols-5 gap-2">
                 {formData.images.map((img, i) => <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200"><img src={img} className="w-full h-full object-cover" alt="" /></div>)}
               </div>
               <canvas ref={canvasRef} className="hidden" />
             </div>
          </WizardCard>
        );
      case WizardStep.CONSTRAINTS:
        return (
          <WizardCard title="Einschränkungen" description="Was begrenzt uns?" onNext={() => setStep(WizardStep.DIFFERENTIATION)} onBack={() => setStep(WizardStep.VISUALS)}>
            <textarea rows={3} placeholder="Budget, Tech..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.constraints} onChange={e => updateField('constraints', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.DIFFERENTIATION:
        return (
          <WizardCard title="Differenzierung" description="Warum du?" onNext={() => setStep(WizardStep.RISKS)} onBack={() => setStep(WizardStep.CONSTRAINTS)}>
            <textarea rows={3} placeholder="Dein Burggraben..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.differentiation} onChange={e => updateField('differentiation', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.RISKS:
        return (
          <WizardCard title="Risiken" description="Was gefährdet uns?" onNext={() => setStep(WizardStep.NEXT_ACTION)} onBack={() => setStep(WizardStep.DIFFERENTIATION)}>
            <textarea rows={3} placeholder="Risikofaktoren..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.risks} onChange={e => updateField('risks', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.NEXT_ACTION:
        return (
          <WizardCard title="Nächste Aktion" description="Was ist zu tun?" onNext={() => setStep(WizardStep.REVIEW)} onBack={() => setStep(WizardStep.RISKS)}>
            <input type="text" placeholder="Aktion..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.nextAction} onChange={e => updateField('nextAction', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.REVIEW:
        return (
          <WizardCard title="Review" description="Launch bereit?" onNext={processIdeation} onBack={() => setStep(WizardStep.NEXT_ACTION)} nextLabel="Verarbeiten">
             <div className="grid grid-cols-2 gap-4 max-h-[40vh] overflow-y-auto pr-2 text-sm">
               <ReviewItem label="Projekt" value={formData.projectName} />
               <ReviewItem label="Gehirn" value={isCustomMode ? "Architect" : PRESETS.find(p=>p.id === selectedPreset)?.name || ""} />
               <ReviewItem label="Problem" value={formData.problemStatement} />
               <ReviewItem label="Zielgruppe" value={formData.targetUser} />
               <ReviewItem label="Provider" value={user?.preferredProvider || 'N/A'} />
             </div>
          </WizardCard>
        );
      case WizardStep.PROCESSING:
        return (
          <div className="bg-white p-12 rounded-3xl shadow-xl text-center border border-indigo-100 max-w-lg mx-auto animate-in zoom-in-95 duration-500">
            <div className="relative w-32 h-32 mx-auto mb-10">
              <svg className="w-full h-full rotate-[-90deg]">
                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="364.4" strokeDashoffset={364.4 - (364.4 * processingStatus.progress) / 100} className="text-indigo-600 transition-all duration-500 ease-out" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center"><span className="text-2xl font-black text-slate-900">{Math.round(processingStatus.progress)}%</span></div>
            </div>
            <h2 className="text-2xl font-bold mb-4 text-slate-900">KI arbeitet...</h2>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-6"><p className="text-indigo-600 font-black text-xs uppercase tracking-widest animate-pulse">{processingStatus.step}</p></div>
          </div>
        );
      case WizardStep.SUCCESS:
        return (
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl border border-green-100 max-w-3xl mx-auto text-center">
             <div className="h-24 w-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl"><svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg></div>
             <h2 className="text-4xl font-black text-slate-900 mb-4 tracking-tight">Idee synchronisiert</h2>
             <div className="flex flex-col sm:flex-row gap-4 justify-center">
               <button onClick={() => downloadCsvLocally(normalizedResult!)} className="px-10 py-5 bg-white border-2 border-slate-200 text-slate-700 rounded-3xl font-black hover:bg-slate-50 transition-all uppercase tracking-widest text-xs">Lokales CSV</button>
               <button onClick={() => { setFormData({ projectName: '', problemStatement: '', targetUser: '', solutionSummary: '', constraints: '', differentiation: '', risks: '', nextAction: '', tags: '', images: [] }); setStep(WizardStep.DASHBOARD); }} className="px-12 py-5 bg-slate-900 text-white rounded-3xl font-black hover:bg-slate-800 transition-all shadow-xl uppercase tracking-widest text-xs">Home</button>
             </div>
          </div>
        );
      default: return null;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-xl w-full bg-white rounded-[3rem] shadow-2xl p-16 text-center border border-slate-100 relative overflow-hidden">
          <div className="w-24 h-24 bg-indigo-600 rounded-[2rem] mx-auto flex items-center justify-center mb-10 shadow-2xl rotate-3"><svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
          <h1 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">Ideation Companion</h1>
          <p className="text-slate-400 mb-12 text-lg font-medium">Ready to build? Select your persona.</p>
          <div className="grid grid-cols-2 gap-6">
            {users.map((u) => (
              <button key={u.email} onClick={() => handleLogin(u)} className="group flex flex-col items-center p-8 bg-white border-2 border-slate-100 rounded-[2.5rem] hover:border-indigo-500 hover:shadow-2xl transition-all active:scale-95">
                <img src={u.picture} alt={u.name} className="w-20 h-20 rounded-full mb-4 group-hover:scale-110 transition-transform border-4 border-slate-50 shadow-md" />
                <h3 className="text-xl font-black text-slate-900">{u.name}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{u.preferredProvider}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-inter">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 py-5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
          <span className="text-xl font-black text-slate-900 tracking-tight uppercase">Companion</span>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-4 py-1.5 rounded-full border flex items-center gap-2 ${hasApiKey ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
             <span className={`w-2 h-2 rounded-full ${hasApiKey ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></span>
             <span className="text-[9px] font-black uppercase tracking-[0.2em]">{user.preferredProvider.toUpperCase()} {hasApiKey ? 'ACTIVE' : 'KEY MISSING'}</span>
          </div>
          <div className="flex items-center gap-3 pl-4 border-l border-slate-100">
            <button onClick={handleKeySetup} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors" title="API Key verwalten"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
            <img src={user.picture} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />
            <button onClick={() => setUser(null)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7" /></svg></button>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-12">{renderStep()}</main>
      <footer className="py-10 text-center border-t border-slate-100"><p className="text-slate-300 text-[10px] font-black tracking-[0.4em] uppercase">ELUMA • MULTI-PROVIDER SYSTEM • v1.7</p></footer>
    </div>
  );
};

const WizardCard: React.FC<{ title: string; description: string; children: React.ReactNode; onNext: () => void; onBack?: () => void; disabled?: boolean; nextLabel?: string; }> = ({ title, description, children, onNext, onBack, disabled, nextLabel = "Weiter" }) => (
  <div className="bg-white p-10 sm:p-16 rounded-[3rem] shadow-2xl border border-slate-100 animate-in fade-in slide-in-from-bottom-12 duration-700 relative overflow-hidden">
    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>
    <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">{title}</h2>
    <p className="text-slate-400 mb-12 text-lg font-medium">{description}</p>
    <div className="mb-12 min-h-[160px]">{children}</div>
    <div className="flex items-center justify-between pt-10 border-t border-slate-50">
      {onBack ? <button onClick={onBack} className="px-8 py-4 text-slate-400 font-black hover:text-slate-900 transition-colors uppercase tracking-[0.2em] text-[10px]">Zurück</button> : <div />}
      <button onClick={onNext} disabled={disabled} className={`px-12 py-5 rounded-3xl font-black text-white transition-all flex items-center gap-4 shadow-2xl uppercase tracking-[0.2em] text-[10px] ${disabled ? 'bg-slate-200 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.05] active:scale-95'}`}>
        {nextLabel}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
      </button>
    </div>
  </div>
);

const ReviewItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border-b border-slate-50 pb-5">
    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-1">{label}</span>
    <p className="text-slate-800 line-clamp-2 font-bold leading-tight">{value || <span className="text-slate-200 italic font-medium">Leer</span>}</p>
  </div>
);

export default App;