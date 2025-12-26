
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { UserProfile, IdeationData, WizardStep, NormalizedIdea, PromptPreset, VoiceExtraction, PersonData } from './types';
import { llmService } from './services/llmService';
import { saveToGoogleDrive, uploadImageToDrive, downloadCsvLocally, listIdeationFiles, getFileContent } from './services/googleDriveService';

const MOCK_USERS: UserProfile[] = [
  {
    email: 'eluma0001@gmail.com', name: 'Mario', 
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mario',
    baseInstruction: 'Du bist Mario. Ein strukturierter Projektmanager, der Skalierbarkeit und Daten-Präzision liebt.',
    preferredProvider: 'google'
  },
  {
    email: 'eluma0002@gmail.com', name: 'Elvis', 
    picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Elvis',
    baseInstruction: 'Du bist Elvis. Ein kreativer Rebell, der den Status Quo bricht und radikale Innovation sucht.',
    preferredProvider: 'google'
  }
];

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

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [step, setStep] = useState<WizardStep>(WizardStep.DASHBOARD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [normalizedResult, setNormalizedResult] = useState<NormalizedIdea | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  
  const [selectedPreset, setSelectedPreset] = useState<string>('normal');
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [isPersonMode, setIsPersonMode] = useState(false);

  const [architectConfig, setArchitectConfig] = useState({ role: 'coach', tone: 'hype', focus: 'ux', method: 'cut' });

  const systemInstruction = useMemo(() => {
    let base = isCustomMode ? 
      `${ARCHITECT_BLOCKS.roles.find(r=>r.id === architectConfig.role)?.snippet} ${ARCHITECT_BLOCKS.tones.find(t=>t.id === architectConfig.tone)?.snippet} ${ARCHITECT_BLOCKS.focus.find(f=>f.id === architectConfig.focus)?.snippet} ${ARCHITECT_BLOCKS.methods.find(m=>m.id === architectConfig.method)?.snippet}` 
      : (PRESETS.find(p=>p.id === selectedPreset)?.instructionModifier || '');
    return `${user?.baseInstruction || ''} ${base}`;
  }, [architectConfig, isCustomMode, selectedPreset, user]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processingStatus, setProcessingStatus] = useState({ step: '', progress: 0 });
  
  const [formData, setFormData] = useState<IdeationData>({
    projectName: '', problemStatement: '', targetUser: '', solutionSummary: '',
    constraints: '', differentiation: '', risks: '', nextAction: '', tags: '', images: [], audioTranscript: ''
  });

  const [personData, setPersonData] = useState<PersonData>({
    name: '', expertise: '', passions: '', challenges: '', lifestyle: '', manualExtension: ''
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const handleLogin = (u: UserProfile) => {
    setUser(u);
  };

  useEffect(() => {
    const checkKey = async () => {
      // @ts-ignore
      if (window.aistudio) setHasApiKey(await window.aistudio.hasSelectedApiKey());
    };
    checkKey();
    const inv = setInterval(checkKey, 2000);
    return () => clearInterval(inv);
  }, []);

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
    setProcessingStatus({ step: 'KI analysiert Audio & erstellt Transkript...', progress: 20 });
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await llmService.processAudio(base64, blob.type, user, systemInstruction);
        
        // Store the transcript for traceability
        const transcript = res.transcript || "";

        if (isPersonMode && res.extracted_person) {
          setPersonData(p => ({ ...p, ...res.extracted_person }));
          // Note: for person mode we could also store transcript if needed, 
          // but usually it leads to idea synthesis.
          setStep(WizardStep.PERSON_PROFILE);
        } else if (!isPersonMode && res.extracted_data) {
          setFormData(f => ({ ...f, ...res.extracted_data, audioTranscript: transcript }));
          setStep(WizardStep.REVIEW);
        } else if (transcript) {
           // If only transcript was found
           setFormData(f => ({ ...f, audioTranscript: transcript }));
           setStep(WizardStep.REVIEW);
        }
        setLoading(false);
      };
    } catch (err) { 
      setError("Verarbeitung fehlgeschlagen."); 
      setStep(WizardStep.DASHBOARD); 
      setLoading(false); 
    }
  };

  const generateIdea = async () => {
    setLoading(true);
    setStep(WizardStep.PROCESSING);
    setProcessingStatus({ step: 'Idee wird synthetisiert...', progress: 40 });
    try {
      const idea = await llmService.generateFromPerson(personData, systemInstruction);
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
                    <select className="w-full text-xs font-bold p-2 rounded-xl bg-slate-50" value={architectConfig.role} onChange={e=>setArchitectConfig(p=>({...p, role: e.target.value}))}>
                      {ARCHITECT_BLOCKS.roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Ton</span>
                    <select className="w-full text-xs font-bold p-2 rounded-xl bg-slate-50" value={architectConfig.tone} onChange={e=>setArchitectConfig(p=>({...p, tone: e.target.value}))}>
                      {ARCHITECT_BLOCKS.tones.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Fokus</span>
                    <select className="w-full text-xs font-bold p-2 rounded-xl bg-slate-50" value={architectConfig.focus} onChange={e=>setArchitectConfig(p=>({...p, focus: e.target.value}))}>
                      {ARCHITECT_BLOCKS.focus.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Methode</span>
                    <select className="w-full text-xs font-bold p-2 rounded-xl bg-slate-50" value={architectConfig.method} onChange={e=>setArchitectConfig(p=>({...p, method: e.target.value}))}>
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
                  {isPersonMode ? 'Personen-Wizard' : 'Ideation starten'} <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 5l7 7m0 0l-7 7m7-7H3"/></svg>
                </button>
                <button onClick={() => setStep(WizardStep.VOICE_RECORDING)} className="flex-1 py-5 bg-slate-900 text-white rounded-3xl font-black shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                  Sprachnotiz <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
                </button>
              </div>
            </div>
          </div>
        );

      case WizardStep.PERSON_PROFILE:
        return (
          <WizardCard title="Personen-Profil" description="Wer ist das Ziel deiner App?" onNext={() => setStep(WizardStep.PERSON_CHALLENGES)} onBack={() => setStep(WizardStep.DASHBOARD)}>
            <div className="space-y-6">
              <input type="text" placeholder="Name oder Rolle" className="w-full p-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none" value={personData.name} onChange={e => setPersonData(p=>({...p, name: e.target.value}))} />
              <input type="text" placeholder="Hauptexpertise" className="w-full p-4 border border-slate-200 rounded-2xl" value={personData.expertise} onChange={e => setPersonData(p=>({...p, expertise: e.target.value}))} />
              <input type="text" placeholder="Leidenschaften" className="w-full p-4 border border-slate-200 rounded-2xl" value={personData.passions} onChange={e => setPersonData(p=>({...p, passions: e.target.value}))} />
            </div>
          </WizardCard>
        );

      case WizardStep.PERSON_CHALLENGES:
        return (
          <WizardCard title="Lebenswelt" description="Schmerzpunkte & Wünsche." onNext={generateIdea} onBack={() => setStep(WizardStep.PERSON_PROFILE)} nextLabel="Idee generieren ✨">
            <div className="space-y-6">
              <textarea rows={3} placeholder="Größte Herausforderungen..." className="w-full p-4 border border-slate-200 rounded-2xl" value={personData.challenges} onChange={e => setPersonData(p=>({...p, challenges: e.target.value}))} />
              <textarea rows={3} placeholder="Lebensstil & Alltag..." className="w-full p-4 border border-slate-200 rounded-2xl" value={personData.lifestyle} onChange={e => setPersonData(p=>({...p, lifestyle: e.target.value}))} />
              <textarea rows={2} placeholder="Manuelle Zusatz-Infos (Hintergrund)..." className="w-full p-4 border-2 border-dashed border-slate-200 rounded-2xl" value={personData.manualExtension} onChange={e => setPersonData(p=>({...p, manualExtension: e.target.value}))} />
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
            <input type="text" placeholder="Name..." className="w-full p-4 border border-slate-200 rounded-xl outline-none text-xl focus:ring-2 focus:ring-indigo-500" value={formData.projectName} onChange={e => setFormData(f => ({...f, projectName: e.target.value}))} />
          </WizardCard>
        );
      case WizardStep.PROBLEM:
        return (
          <WizardCard title="Das Problem" description="Welchen Schmerz lösen wir?" onNext={() => setStep(WizardStep.AUDIENCE)} onBack={() => setStep(WizardStep.CONTEXT)} disabled={!formData.problemStatement}>
            <textarea rows={4} placeholder="Beschreibe das Problem..." className="w-full p-4 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={formData.problemStatement} onChange={e => setFormData(f => ({...f, problemStatement: e.target.value}))} />
          </WizardCard>
        );
      case WizardStep.AUDIENCE:
        return (
          <WizardCard title="Zielgruppe" description="Wer braucht das?" onNext={() => setStep(WizardStep.SOLUTION)} onBack={() => setStep(WizardStep.PROBLEM)} disabled={!formData.targetUser}>
            <input type="text" placeholder="Zielgruppe..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.targetUser} onChange={e => setFormData(f => ({...f, targetUser: e.target.value}))} />
          </WizardCard>
        );
      case WizardStep.SOLUTION:
        return (
          <WizardCard title="Die Lösung" description="Wie sieht die Antwort aus?" onNext={() => setStep(WizardStep.REVIEW)} onBack={() => setStep(WizardStep.AUDIENCE)} disabled={!formData.solutionSummary}>
            <textarea rows={4} placeholder="Lösungsansatz..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.solutionSummary} onChange={e => setFormData(f => ({...f, solutionSummary: e.target.value}))} />
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
               <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24"><path d="M12 4V2m0 20v-2m8-8h2M2 12h2" stroke="currentColor" strokeWidth="3"/></svg>
             </div>
             <h2 className="text-2xl font-black text-slate-900 mb-2">KI-Processing...</h2>
             <p className="text-indigo-600 font-bold uppercase tracking-widest text-[10px]">{processingStatus.step}</p>
          </div>
        );

      case WizardStep.REVIEW:
        return (
          <WizardCard title="Review" description="Launch bereit?" onNext={async () => {
             setStep(WizardStep.PROCESSING);
             const res = await llmService.normalize(formData, user!, systemInstruction);
             setNormalizedResult(res);
             setStep(WizardStep.SUCCESS);
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
             </div>
          </WizardCard>
        );

      case WizardStep.SUCCESS:
        return (
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center border-4 border-green-50">
             <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full mx-auto mb-8 flex items-center justify-center text-5xl">✓</div>
             <h2 className="text-4xl font-black text-slate-900 mb-8">Synchronisiert</h2>
             <div className="flex gap-4">
                <button onClick={() => downloadCsvLocally(normalizedResult!)} className="flex-1 py-5 bg-slate-100 rounded-3xl font-black uppercase text-[10px] tracking-widest">CSV Export</button>
                <button onClick={() => setStep(WizardStep.DASHBOARD)} className="flex-1 py-5 bg-slate-900 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest">Home</button>
             </div>
          </div>
        );
      
      default: return null;
    }
  };

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-xl w-full bg-white rounded-[3rem] shadow-2xl p-16 text-center animate-in zoom-in-95 duration-500">
        <h1 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">Ideation Companion</h1>
        <p className="text-slate-400 mb-12 font-medium">Wer bist du heute?</p>
        <div className="grid grid-cols-2 gap-8">
          {MOCK_USERS.map(u => (
            <button key={u.email} onClick={() => handleLogin(u)} className="group flex flex-col items-center p-8 border-2 border-slate-50 rounded-[2.5rem] hover:border-indigo-600 hover:shadow-2xl transition-all active:scale-95">
              <img src={u.picture} className="w-24 h-24 rounded-full mb-4 border-4 border-white shadow-md group-hover:scale-110 transition-transform" />
              <div className="font-black text-xl text-slate-900">{u.name}</div>
              <div className="text-[10px] font-black text-slate-300 uppercase mt-2 tracking-widest">{u.name === 'Mario' ? 'Strategie' : 'Disruption'}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-inter">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 py-5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black shadow-lg">C</div>
          <span className="text-xl font-black text-slate-900 uppercase tracking-tight">Companion</span>
        </div>
        <div className="flex items-center gap-4">
           <button 
             onClick={handleKeySetup}
             className={`px-4 py-2 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest transition-all ${hasApiKey ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100 animate-pulse'}`}
           >
             {hasApiKey ? 'API: Ready' : 'Key Setzen'}
           </button>
           <div className="h-8 w-[1px] bg-slate-100 mx-2"></div>
           <img src={user.picture} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" />
           <button onClick={() => setUser(null)} className="text-slate-300 hover:text-red-500 transition-colors"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7"/></svg></button>
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
