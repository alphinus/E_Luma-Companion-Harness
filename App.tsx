
import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, IdeationData, WizardStep, NormalizedIdea, PromptPreset, VoiceExtraction } from './types';
import { normalizeIdeation, processAudioIdeation } from './services/geminiService';
import { saveToGoogleDrive, uploadImageToDrive, downloadCsvLocally, listIdeationFiles, getFileContent } from './services/googleDriveService';

const MOCKUP_DATA: Record<string, Partial<IdeationData>> = {
  ecoTrack: {
    projectName: "Eco-Track IoT",
    problemStatement: "Die städtische Müllabfuhr ist ineffizient, was zu überlaufenden Tonnen und hohen Kraftstoffkosten für Sammel-LKWs führt.",
    targetUser: "Städtische Abfallwirtschaftsabteilungen in Großstädten.",
    solutionSummary: "Ein Netzwerk von Ultraschall-Füllstandssensoren an Tonnen, die Echtzeitdaten an eine zentrale Routing-KI senden.",
    constraints: "Sensoren müssen 3 Jahre mit Batterie halten; Kosten unter 50 € pro Einheit.",
    differentiation: "Proprietärer prädiktiver Routing-Algorithmus, der die Kilometerleistung um 40% reduziert.",
    risks: "Hardware-Haltbarkeit bei extremem Wetter; Funklöcher im Netzwerk.",
    nextAction: "Pilot-Einsatz von 50 Einheiten in Berlin Mitte.",
    tags: "IoT, Nachhaltigkeit, KI, SmartCity",
    images: []
  },
  skillSwap: {
    projectName: "Skill-Swap P2P",
    problemStatement: "Expertenkurse sind zu teuer für Studenten, während lokale Experten keine einfache Möglichkeit haben, Mikro-Sessions zu monetarisieren.",
    targetUser: "Gen-Z Lerner und Hobby-Kreative.",
    solutionSummary: "Ein 'Tinder für Skills', bei dem Nutzer über Kurzvideo-Demos swipen und 15-minütige Live-Video-Beratungen buchen.",
    constraints: "Geringe Video-Latenz erforderlich; Launch nur für Mobilgeräte.",
    differentiation: "Fokus auf 15-Minuten-Intervalle statt stundenlanger Kurse.",
    risks: "Qualitätskontrolle der Tutoren; Zahlungsstreitigkeiten.",
    nextAction: "Prototyp für das Swiping-Interface bauen.",
    tags: "EdTech, Marktplatz, P2P, Video",
    images: []
  },
  chefAi: {
    projectName: "Fridge-Zero KI",
    problemStatement: "Lebensmittelverschwendung ist auf einem Allzeithoch, weil die Leute nicht wissen, was sie mit den Resten im Kühlschrank kochen sollen.",
    targetUser: "Alleinstehende Berufstätige und beschäftigte Eltern.",
    solutionSummary: "Fotobasierter Bestands-Scan + LLM-Rezeptgenerierung basierend auf Verfallsdaten.",
    constraints: "Muss mit unscharfen Fotos von Kühlschrank-Innenräumen umgehen können.",
    differentiation: "Zero-Data-Entry-Ansatz; nutzt Computer Vision statt manueller Protokollierung.",
    risks: "Rezeptsicherheit (Allergien); Genauigkeit der Bilderkennung.",
    nextAction: "Feintuning des Vision-Modells für Kühlschrankbilder.",
    tags: "VisionAI, Consumer, FoodTech, SaaS",
    images: []
  }
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
  },
  { 
    id: 'strategic', 
    name: 'Strategisch', 
    description: 'Tiefes Eintauchen in Burggräben und Markttauglichkeit.', 
    instructionModifier: 'Du bist ein Strategieberater. Konzentriere dich stark auf Wettbewerbsvorteile, Burggräben, Marktpositionierung und langfristige Skalierbarkeit.', 
    icon: '🧠' 
  }
];

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [step, setStep] = useState<WizardStep>(WizardStep.DASHBOARD);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [normalizedResult, setNormalizedResult] = useState<NormalizedIdea | null>(null);
  const [driveInfo, setDriveInfo] = useState<{ fileId: string; url?: string } | null>(null);
  const [savedIdeations, setSavedIdeations] = useState<any[]>([]);
  
  const [selectedPreset, setSelectedPreset] = useState<string>('normal');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [voiceQuestions, setVoiceQuestions] = useState<string[]>([]);
  const [voiceClarificationAnswers, setVoiceClarificationAnswers] = useState<Record<number, string>>({});

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
      baseInstruction: 'Du bist Mario. Du bist ein strukturierter, strategischer Projektmanager, der Skalierbarkeit, saubere Daten und Projektbereitschaft priorisiert. Du bist analytisch und gründlich.'
    },
    {
      email: 'eluma0002@gmail.com', name: 'Elvis', 
      picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Elvis',
      accessToken: 'dummy-token-elvis',
      baseInstruction: 'Du bist Elvis. Du bist ein hochenergetischer, kreativer Disruptor. Du priorisierst Innovation, einzigartige Blickwinkel und emotionale Resonanz. Du bist schnell und experimentierfreudig.'
    }
  ];

  const injectMockup = (key: string) => {
    const data = MOCKUP_DATA[key];
    if (data) {
      setFormData(prev => ({ ...prev, ...data }));
      setStep(WizardStep.CONTEXT);
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
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        const instruction = `${user.baseInstruction} \n ${isCustomMode ? customPrompt : PRESETS.find(p=>p.id === selectedPreset)?.instructionModifier}`;
        
        const result = await processAudioIdeation(base64Audio, blob.type, instruction);
        
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

        if (result.questions && result.questions.length > 0) {
          setVoiceQuestions(result.questions);
          setStep(WizardStep.VOICE_CLARIFICATION);
        } else {
          setStep(WizardStep.REVIEW);
        }
        setLoading(false);
      };
    } catch (err: any) {
      setError("Sprachverarbeitung fehlgeschlagen. Bitte manuell eingeben.");
      setStep(WizardStep.DASHBOARD);
      setLoading(false);
    }
  };

  const fetchArchive = async () => {
    if (!user?.accessToken) return;
    setLoading(true);
    try {
      const files = await listIdeationFiles(user.accessToken);
      const ideations = [];
      // Wir holen die Inhalte der letzten 5 Dateien für eine reichhaltigere Vorschau
      for (const file of files.slice(0, 10)) {
        const content = await getFileContent(file.id, user.accessToken);
        // Einfaches CSV-Parsing für die Vorschau
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
    } catch (err) {
      setError("Fehler beim Laden des Archivs.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (selectedUser: UserProfile) => {
    setUser(selectedUser);
    setStep(WizardStep.DASHBOARD);
  };

  const startIdeation = () => {
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
    setStep(WizardStep.PROCESSING);
    try {
      const preset = PRESETS.find(p => p.id === selectedPreset);
      const instruction = `${user.baseInstruction} \n ${isCustomMode ? customPrompt : preset?.instructionModifier}`;
      
      const mergedData = { ...formData };
      if (voiceQuestions.length > 0) {
        mergedData.solutionSummary += ` \n[Klärung]: ${Object.values(voiceClarificationAnswers).join('; ')}`;
      }

      const normalized = await normalizeIdeation(mergedData, user.email, instruction);
      
      const imageUrls: string[] = [];
      if (user.accessToken) {
        for (let i = 0; i < formData.images.length; i++) {
          const url = await uploadImageToDrive(formData.images[i], `IMG_${normalized.project_name}_${i+1}.jpg`, user.accessToken);
          imageUrls.push(url);
        }
      }

      const finalIdea: NormalizedIdea = {
        ...normalized,
        image_url_1: imageUrls[0] || "", image_url_2: imageUrls[1] || "", 
        image_url_3: imageUrls[2] || "", image_url_4: imageUrls[3] || "", image_url_5: imageUrls[4] || "",
      };

      setNormalizedResult(finalIdea);
      if (user.accessToken) {
        const result = await saveToGoogleDrive(finalIdea, user.accessToken);
        setDriveInfo({ fileId: result.fileId, url: result.webContentLink });
      }
      setStep(WizardStep.SUCCESS);
    } catch (err: any) {
      setError(err.message || 'Verarbeitung fehlgeschlagen');
      setStep(WizardStep.REVIEW);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case WizardStep.DASHBOARD:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
              <h2 className="text-3xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                <span className="text-indigo-600">0.</span> Wähle dein KI-Gehirn
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {PRESETS.map((p) => (
                  <button 
                    key={p.id}
                    onClick={() => { setSelectedPreset(p.id); setIsCustomMode(false); }}
                    className={`flex flex-col items-start p-5 rounded-2xl border-2 transition-all text-left ${
                      selectedPreset === p.id && !isCustomMode ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100' : 'border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{p.icon}</span>
                      <span className="font-bold text-slate-900">{p.name}</span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">{p.description}</p>
                  </button>
                ))}
                <button 
                  onClick={() => setIsCustomMode(true)}
                  className={`flex flex-col items-start p-5 rounded-2xl border-2 transition-all text-left ${
                    isCustomMode ? 'border-purple-500 bg-purple-50 ring-4 ring-purple-100' : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">✍️</span>
                    <span className="font-bold text-slate-900">Eigener System-Prompt</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">Überschreibe alles mit deiner eigenen Logik.</p>
                </button>
              </div>

              {isCustomMode && (
                <div className="mb-8 animate-in zoom-in-95 duration-300">
                  <label className="text-xs font-bold text-purple-600 uppercase tracking-widest block mb-2">Eigene Anweisung</label>
                  <textarea 
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Z.B.: Verhalte dich wie ein skeptischer Investor, der nur auf CAC/LTV achtet..."
                    className="w-full p-4 border-2 border-purple-200 rounded-xl focus:border-purple-500 outline-none h-32 bg-purple-50/30 text-sm"
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={startIdeation}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3"
                >
                  Assistent starten <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </button>
                <button 
                  onClick={() => setStep(WizardStep.VOICE_RECORDING)}
                  className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all shadow-xl flex items-center justify-center gap-3"
                >
                  Spracheingabe <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                </button>
              </div>
              <button 
                onClick={fetchArchive}
                className="w-full mt-4 py-3 bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
              >
                Archiv ansehen (Read-Only) <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </button>
            </div>

            <div className="bg-slate-100/50 p-8 rounded-3xl border border-slate-200">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/></svg>
                Mockup-Daten Lab
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button onClick={() => injectMockup('ecoTrack')} className="bg-white p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all text-left">
                  <div className="text-indigo-600 font-bold text-xs mb-1">IOT • NACHHALTIGKEIT</div>
                  <div className="text-slate-900 font-bold text-sm">Eco-Track Bins</div>
                </button>
                <button onClick={() => injectMockup('skillSwap')} className="bg-white p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all text-left">
                  <div className="text-orange-600 font-bold text-xs mb-1">EDTECH • P2P</div>
                  <div className="text-slate-900 font-bold text-sm">Skill-Swap Swipe</div>
                </button>
                <button onClick={() => injectMockup('chefAi')} className="bg-white p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all text-left">
                  <div className="text-green-600 font-bold text-xs mb-1">KI • CONSUMER</div>
                  <div className="text-slate-900 font-bold text-sm">Fridge-Zero KI</div>
                </button>
              </div>
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
                {savedIdeations.length === 0 ? (
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
                      <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                        <span className="text-[9px] font-bold text-slate-300 uppercase">Erstellt am: {new Date(item.created_at).toLocaleDateString('de-DE')}</span>
                        <div className="flex gap-2">
                           {item.tags?.split('|').map((t: string) => (
                             <span key={t} className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white border border-slate-200 px-2 py-0.5 rounded-md">{t}</span>
                           ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-8 pt-8 border-t border-slate-100 flex justify-center">
                <button onClick={() => setStep(WizardStep.DASHBOARD)} className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl">
                  Zurück zum Dashboard
                </button>
              </div>
            </div>
          </div>
        );
      case WizardStep.VOICE_RECORDING:
        return (
          <WizardCard 
            title="Gesprochene Vision" 
            description="Nimm eine Sprachnotiz auf. Gemini extrahiert die ELUMA-Struktur." 
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
                  {isRecording ? (
                    <div className="w-8 h-8 bg-white rounded-sm"></div>
                  ) : (
                    <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4z" /><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM6 10a4 4 0 018 0v4a4 4 0 11-8 0v-4z" /></svg>
                  )}
                </button>
              </div>
              <div className="mt-8 text-center">
                <p className="text-2xl font-black text-slate-900 tabular-nums">
                  {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                </p>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2">
                  {isRecording ? 'Audio-Aufnahme läuft...' : 'Tippen zum Brainstormen'}
                </p>
              </div>
            </div>
          </WizardCard>
        );
      case WizardStep.VOICE_CLARIFICATION:
        return (
          <WizardCard 
            title="Klärung" 
            description="Der Assistent hat ein paar Rückfragen, um die Vision zu vervollständigen." 
            onNext={() => setStep(WizardStep.REVIEW)} 
            onBack={() => setStep(WizardStep.VOICE_RECORDING)}
            nextLabel="Zur Übersicht"
          >
            <div className="space-y-6">
              {voiceQuestions.map((q, i) => (
                <div key={i} className="animate-in slide-in-from-left-4 duration-500" style={{ animationDelay: `${i * 100}ms` }}>
                  <label className="text-xs font-black text-indigo-600 uppercase tracking-widest block mb-3">{q}</label>
                  <textarea 
                    className="w-full p-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                    placeholder="Deine Antwort..."
                    value={voiceClarificationAnswers[i] || ''}
                    onChange={(e) => setVoiceClarificationAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </WizardCard>
        );
      case WizardStep.CONTEXT:
        return (
          <WizardCard title="Projekt-Identität" description="Wie lautet der Name dieser Vision?" onNext={() => setStep(WizardStep.PROBLEM)} onBack={() => setStep(WizardStep.DASHBOARD)} disabled={!formData.projectName}>
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
          <WizardCard title="Zielgruppe" description="Wer sind die primären Begünstigten?" onNext={() => setStep(WizardStep.SOLUTION)} onBack={() => setStep(WizardStep.PROBLEM)} disabled={!formData.targetUser}>
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
          <WizardCard title="Visueller Beleg" description="Bis zu 5 Bilder (Kamera unterstützt)." onNext={() => { if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); setStep(WizardStep.CONSTRAINTS); }} onBack={() => setStep(WizardStep.SOLUTION)}>
             <div className="space-y-6">
               <div className="relative aspect-video bg-slate-900 rounded-2xl overflow-hidden group">
                 <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                 {!videoRef.current?.srcObject && (
                   <button onClick={async () => {
                     const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                     if (videoRef.current) videoRef.current.srcObject = stream;
                   }} className="absolute inset-0 m-auto w-40 h-12 bg-white text-slate-900 rounded-full font-bold shadow-2xl">Kamera aktivieren</button>
                 )}
                 {formData.images.length < 5 && videoRef.current?.srcObject && (
                   <button onClick={captureImage} className="absolute bottom-6 left-1/2 -translate-x-1/2 w-16 h-16 bg-white border-4 border-slate-200 rounded-full flex items-center justify-center active:scale-90 transition-transform"><div className="w-12 h-12 bg-red-500 rounded-full" /></button>
                 )}
               </div>
               <div className="grid grid-cols-5 gap-2">
                 {formData.images.map((img, i) => (
                   <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                     <img src={img} className="w-full h-full object-cover" alt="" />
                     <button onClick={() => updateField('images', formData.images.filter((_, idx) => idx !== i))} className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 text-xs">Löschen</button>
                   </div>
                 ))}
               </div>
               <canvas ref={canvasRef} className="hidden" />
             </div>
          </WizardCard>
        );
      case WizardStep.CONSTRAINTS:
        return (
          <WizardCard title="Einschränkungen" description="Was begrenzt unseren Spielraum?" onNext={() => setStep(WizardStep.DIFFERENTIATION)} onBack={() => setStep(WizardStep.VISUALS)}>
            <textarea rows={3} placeholder="Budget, Tech, Zeit..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.constraints} onChange={e => updateField('constraints', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.DIFFERENTIATION:
        return (
          <WizardCard title="Differenzierung" description="Was ist der einzigartige Vorteil?" onNext={() => setStep(WizardStep.RISKS)} onBack={() => setStep(WizardStep.CONSTRAINTS)}>
            <textarea rows={3} placeholder="Wettbewerbsvorteil..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.differentiation} onChange={e => updateField('differentiation', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.RISKS:
        return (
          <WizardCard title="Kritische Risiken" description="Was könnte die Idee gefährden?" onNext={() => setStep(WizardStep.NEXT_ACTION)} onBack={() => setStep(WizardStep.DIFFERENTIATION)}>
            <textarea rows={3} placeholder="Risikofaktoren..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.risks} onChange={e => updateField('risks', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.NEXT_ACTION:
        return (
          <WizardCard title="Nächster Meilenstein" description="Was ist die eine nächste Aufgabe?" onNext={() => setStep(WizardStep.REVIEW)} onBack={() => setStep(WizardStep.RISKS)}>
            <input type="text" placeholder="Unmittelbare Aktion..." className="w-full p-4 border border-slate-200 rounded-xl" value={formData.nextAction} onChange={e => updateField('nextAction', e.target.value)} />
          </WizardCard>
        );
      case WizardStep.REVIEW:
        return (
          <WizardCard title="Prüfen & Launch" description="Bereit für die Synchronisation mit Drive?" onNext={processIdeation} onBack={() => setStep(WizardStep.NEXT_ACTION)} nextLabel="Mit Gemini verarbeiten">
             <div className="grid grid-cols-2 gap-4 max-h-[40vh] overflow-y-auto pr-2 text-sm">
               <ReviewItem label="Projekt" value={formData.projectName} />
               <ReviewItem label="Gehirn" value={isCustomMode ? "Eigener Prompt" : PRESETS.find(p=>p.id === selectedPreset)?.name || ""} />
               <ReviewItem label="Problem" value={formData.problemStatement} />
               <ReviewItem label="Zielgruppe" value={formData.targetUser} />
               <ReviewItem label="Bilder" value={`${formData.images.length} Fotos`} />
               <div className="col-span-2 pt-2">
                 <label className="text-[10px] font-bold text-slate-400">TAGS</label>
                 <input type="text" className="w-full p-2 border border-slate-200 rounded-lg" value={formData.tags} onChange={e => updateField('tags', e.target.value)} />
               </div>
             </div>
          </WizardCard>
        );
      case WizardStep.PROCESSING:
        return (
          <div className="bg-white p-12 rounded-3xl shadow-xl text-center border border-indigo-100 max-w-lg mx-auto">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold mb-2">Vision wird synthetisiert</h2>
            <p className="text-slate-400 text-sm">Wende {user.name}s Logik + {selectedPreset}-Modus auf deine Projektdaten an.</p>
          </div>
        );
      case WizardStep.SUCCESS:
        return (
          <div className="bg-white p-10 rounded-3xl shadow-2xl border border-green-100 max-w-3xl mx-auto">
             <div className="h-20 w-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8">
               <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>
             </div>
             <h2 className="text-4xl font-extrabold text-center text-slate-900 mb-4">Idee synchronisiert</h2>
             <p className="text-center text-slate-500 mb-10">Dein Projekt wurde normalisiert und mit dem eluma0001-Repository abgeglichen.</p>
             
             <div className="bg-slate-50 p-6 rounded-2xl mb-8 grid grid-cols-3 gap-6">
               <PreviewField label="Normalisierter Name" value={normalizedResult?.project_name} />
               <PreviewField label="Priorität" value={normalizedResult?.priority} />
               <PreviewField label="Bilder-Sync" value={formData.images.length} />
             </div>

             <div className="flex flex-col sm:flex-row gap-4 justify-center">
               <button onClick={fetchArchive} className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
                 Archiv/Vorschau laden
               </button>
               <button onClick={() => downloadCsvLocally(normalizedResult!)} className="px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl font-bold hover:bg-slate-50">
                 CSV herunterladen
               </button>
               <button onClick={() => { 
                 setFormData({ projectName: '', problemStatement: '', targetUser: '', solutionSummary: '', constraints: '', differentiation: '', risks: '', nextAction: '', tags: '', images: [] }); 
                 setVoiceQuestions([]);
                 setVoiceClarificationAnswers({});
                 setStep(WizardStep.DASHBOARD); 
               }} className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all">
                 Dashboard
               </button>
             </div>
          </div>
        );
      default: return null;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-xl w-full bg-white rounded-[2.5rem] shadow-2xl p-12 text-center border border-slate-100">
          <div className="w-24 h-24 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center mb-8 shadow-2xl rotate-3">
             <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">Ideation Companion</h1>
          <p className="text-slate-400 mb-12 text-lg">Wähle eine Persona, um zu beginnen.</p>
          <div className="grid grid-cols-2 gap-6">
            {users.map((u) => (
              <button key={u.email} onClick={() => handleLogin(u)} className="group flex flex-col items-center p-8 bg-white border-2 border-slate-100 rounded-[2rem] hover:border-indigo-500 hover:shadow-2xl transition-all">
                <img src={u.picture} alt={u.name} className="w-20 h-20 rounded-full mb-4 group-hover:scale-110 transition-transform border-4 border-slate-50" />
                <h3 className="text-xl font-black text-slate-900">{u.name}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{u.email}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <span className="text-xl font-black text-slate-900 uppercase tracking-tight hidden sm:block">Companion</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-full px-4 py-1.5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">DRIVE-SYNC: eluma0001</span>
          </div>
          <div className="flex items-center gap-3 border-l border-slate-200 pl-4 ml-2">
            <div className="text-right hidden sm:block leading-tight">
              <p className="text-xs font-black text-slate-900">{user.name}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase">{isCustomMode ? "EIGENES GEHIRN" : (PRESETS.find(p=>p.id === selectedPreset)?.name || "Normal")}</p>
            </div>
            <img src={user.picture} alt="" className="w-9 h-9 rounded-full border-2 border-white shadow-sm" />
            <button onClick={() => setUser(null)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12">
        {step > 0 && step < WizardStep.PROCESSING && step !== WizardStep.PREVIEW_ALL && (
           <div className="mb-12 flex items-center justify-between relative px-2 max-w-2xl mx-auto">
             <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200 -translate-y-1/2 -z-0"></div>
             {Array.from({ length: 10 }).map((_, i) => (
               <div key={i} className={`w-8 h-8 rounded-full z-10 flex items-center justify-center font-black text-[9px] transition-all ${step === i + 1 ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 scale-125' : step > i + 1 ? 'bg-indigo-200 text-indigo-700' : 'bg-slate-200 text-slate-400'}`}>
                 {step > i + 1 ? '✓' : i + 1}
               </div>
             ))}
           </div>
        )}
        {renderStep()}
      </main>

      <footer className="py-8 text-center border-t border-slate-100">
        <p className="text-slate-300 text-[9px] font-black tracking-[0.3em] uppercase">
          ELUMA • MULTIMEDIA CSV PIPELINE • SYSTEM v1.4
        </p>
      </footer>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
};

const WizardCard: React.FC<{ title: string; description: string; children: React.ReactNode; onNext: () => void; onBack?: () => void; disabled?: boolean; nextLabel?: string; }> = ({ title, description, children, onNext, onBack, disabled, nextLabel = "Weiter" }) => (
  <div className="bg-white p-8 sm:p-12 rounded-[2.5rem] shadow-xl border border-slate-100 animate-in fade-in slide-in-from-bottom-8 duration-500">
    <h2 className="text-4xl font-black text-slate-900 mb-2 tracking-tight">{title}</h2>
    <p className="text-slate-400 mb-12 text-lg font-medium">{description}</p>
    <div className="mb-12 min-h-[120px]">{children}</div>
    <div className="flex items-center justify-between pt-10 border-t border-slate-100">
      {onBack ? <button onClick={onBack} className="px-6 py-3 text-slate-400 font-black hover:text-slate-900 transition-colors uppercase tracking-widest text-xs">Zurück</button> : <div />}
      <button onClick={onNext} disabled={disabled} className={`px-10 py-4 rounded-2xl font-black text-white transition-all flex items-center gap-3 shadow-2xl uppercase tracking-widest text-xs ${disabled ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.02]'}`}>
        {nextLabel}
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
      </button>
    </div>
  </div>
);

const ReviewItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="border-b border-slate-100 pb-4">
    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest block mb-1">{label}</span>
    <p className="text-slate-800 line-clamp-2 font-bold leading-tight">{value || <span className="text-slate-200 italic">Nicht angegeben</span>}</p>
  </div>
);

const PreviewField: React.FC<{ label: string; value: any }> = ({ label, value }) => (
  <div className="text-center">
    <label className="text-[8px] font-black text-slate-300 uppercase block tracking-widest mb-1">{label}</label>
    <div className="text-slate-900 font-black truncate">{String(value)}</div>
  </div>
);

export default App;
