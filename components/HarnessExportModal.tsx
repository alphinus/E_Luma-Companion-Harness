import React, { useState, useEffect } from 'react';
import { NormalizedIdea, TechStack, HarnessExportInput, HarnessSpec } from '../types';
import { harnessExportService, ideaToExportInput } from '../services/harnessExportService';

interface HarnessExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  idea: NormalizedIdea;
  onSaveFeatures?: (features: string[], techStack: Record<string, string>, projectType: string) => void;
}

// Projekt-Typ-spezifische Tech-Stacks
const TECH_STACKS_BY_TYPE: Record<string, Record<string, string[]>> = {
  'Mobile App': {
    framework: ['React Native', 'Flutter', 'Kotlin (Android)', 'Swift (iOS)', 'Expo', 'Custom'],
    backend: ['Firebase', 'Supabase', 'AWS Amplify', 'Custom REST API', 'None (Offline-First)'],
    database: ['Firestore', 'Firebase Realtime DB', 'SQLite', 'Realm', 'None'],
    auth: ['Firebase Auth', 'Auth0', 'Supabase Auth', 'Biometric', 'Custom'],
    distribution: ['Google Play', 'App Store', 'Both', 'Internal/Enterprise'],
  },
  'SaaS': {
    backend: ['Node.js + Express', 'Next.js API Routes', 'FastAPI (Python)', 'Django', 'Go + Fiber'],
    database: ['Supabase', 'PostgreSQL', 'MongoDB', 'PlanetScale', 'MySQL'],
    frontend: ['Next.js 14', 'React + Vite', 'Vue 3', 'Svelte', 'SolidJS'],
    auth: ['Supabase Auth', 'Auth0', 'Clerk', 'NextAuth', 'Custom JWT'],
    hosting: ['Vercel', 'Railway', 'Render', 'AWS', 'Google Cloud'],
    payments: ['Stripe', 'LemonSqueezy', 'Paddle', 'None'],
  },
  'Tool': {
    backend: ['Node.js + Express', 'FastAPI (Python)', 'Go', 'None (Frontend-only)'],
    database: ['SQLite', 'PostgreSQL', 'IndexedDB', 'None'],
    frontend: ['React + Vite', 'Next.js', 'Vue 3', 'Vanilla JS'],
    auth: ['None', 'Simple Login', 'OAuth'],
    hosting: ['Vercel', 'Netlify', 'GitHub Pages', 'Self-hosted'],
  },
  'API': {
    framework: ['Express', 'FastAPI', 'NestJS', 'Django REST', 'Go Fiber', 'Hono'],
    database: ['PostgreSQL', 'MongoDB', 'Redis', 'DynamoDB', 'SQLite'],
    auth: ['JWT', 'API Keys', 'OAuth2', 'None (Internal)'],
    docs: ['OpenAPI/Swagger', 'GraphQL Playground', 'Postman Collection', 'None'],
    hosting: ['Railway', 'Render', 'AWS Lambda', 'Google Cloud Run'],
  },
  'CLI': {
    language: ['TypeScript/Node.js', 'Python', 'Go', 'Rust', 'Bash'],
    packaging: ['npm', 'pip', 'brew', 'cargo', 'Binary'],
    features: ['Interactive prompts', 'Config files', 'Plugins', 'Shell completion'],
  },
  'Library': {
    language: ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust'],
    packaging: ['npm', 'pip', 'cargo', 'go modules'],
    testing: ['Jest', 'Vitest', 'pytest', 'Go test'],
    docs: ['TypeDoc', 'Storybook', 'Docusaurus', 'README only'],
  },
};

const PROJECT_TYPES = ['SaaS', 'Tool', 'API', 'Mobile App', 'CLI', 'Library'] as const;
type ProjectType = typeof PROJECT_TYPES[number];

interface AIAnalysis {
  projectType: ProjectType;
  techStack: Record<string, string>;
  suggestedFeatures: string[];
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  needsMoreInfo: boolean;
  questions?: string[];
}

export const HarnessExportModal: React.FC<HarnessExportModalProps> = ({
  isOpen,
  onClose,
  idea,
  onSaveFeatures
}) => {
  // Steps: 'analyzing' | 'suggestion' | 'questions' | 'config' | 'features' | 'generating' | 'preview'
  const [step, setStep] = useState<string>('analyzing');
  const [projectType, setProjectType] = useState<ProjectType>('SaaS');
  const [techStack, setTechStack] = useState<Record<string, string>>({});
  const [mainFeatures, setMainFeatures] = useState<string[]>(['']);
  const [generatedSpec, setGeneratedSpec] = useState<HarnessSpec | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useBasicMode, setUseBasicMode] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [hasExistingData, setHasExistingData] = useState(false);

  // Load existing data or start AI analysis when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setGeneratedSpec(null);

      // Check for existing harness data
      if (idea.harness_features) {
        try {
          const savedFeatures = JSON.parse(idea.harness_features);
          const savedTechStack = idea.harness_tech_stack ? JSON.parse(idea.harness_tech_stack) : {};
          const savedType = (idea.harness_project_type as ProjectType) || 'SaaS';

          setMainFeatures(savedFeatures.length > 0 ? savedFeatures : ['']);
          setTechStack(savedTechStack);
          setProjectType(savedType);
          setHasExistingData(true);
          setStep('features'); // Skip directly to features
        } catch (e) {
          startAIAnalysis();
        }
      } else {
        startAIAnalysis();
      }
    }
  }, [isOpen, idea]);

  const startAIAnalysis = async () => {
    setStep('analyzing');
    setIsLoading(true);
    setHasExistingData(false);

    try {
      const response = await fetch('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyzeForHarness',
          idea: {
            project_name: idea.project_name,
            problem_statement: idea.problem_statement,
            solution_summary: idea.solution_summary,
            target_user: idea.target_user,
            constraints: idea.constraints,
            tags: idea.tags,
          }
        })
      });

      if (!response.ok) throw new Error('Analyse fehlgeschlagen');

      const result = await response.json();

      // Map API response to expected format
      const mappedAnalysis: AIAnalysis = {
        projectType: result.suggestedType || 'SaaS',
        techStack: result.suggestedTechStack || {},
        suggestedFeatures: result.suggestedFeatures || [],
        reasoning: result.typeReason || 'Basierend auf deiner Idee',
        confidence: result.inputQuality === 'strong' ? 'high' : result.inputQuality === 'medium' ? 'medium' : 'low',
        needsMoreInfo: result.inputQuality === 'weak',
        questions: result.questions,
      };

      setAiAnalysis(mappedAnalysis);

      if (mappedAnalysis.needsMoreInfo) {
        setStep('questions');
      } else {
        setProjectType(mappedAnalysis.projectType);
        setTechStack(mappedAnalysis.techStack);
        setMainFeatures(mappedAnalysis.suggestedFeatures?.length > 0 ? mappedAnalysis.suggestedFeatures : ['']);
        setStep('suggestion');
      }
    } catch (err: any) {
      console.error('AI Analysis failed:', err);
      // Fallback to manual mode
      setStep('config');
      initializeDefaultTechStack('SaaS');
    } finally {
      setIsLoading(false);
    }
  };

  const initializeDefaultTechStack = (type: ProjectType) => {
    const typeStacks = TECH_STACKS_BY_TYPE[type];
    if (typeStacks) {
      const defaults: Record<string, string> = {};
      Object.keys(typeStacks).forEach(key => {
        defaults[key] = typeStacks[key][0] || '';
      });
      setTechStack(defaults);
    }
  };

  const handleProjectTypeChange = (type: ProjectType) => {
    setProjectType(type);
    initializeDefaultTechStack(type);
  };

  const handleTechChange = (key: string, value: string) => {
    setTechStack(prev => ({ ...prev, [key]: value }));
  };

  const handleFeatureChange = (index: number, value: string) => {
    const newFeatures = [...mainFeatures];
    newFeatures[index] = value;
    setMainFeatures(newFeatures);
  };

  const addFeature = () => {
    if (mainFeatures.length < 15) {
      setMainFeatures([...mainFeatures, '']);
    }
  };

  const removeFeature = (index: number) => {
    if (mainFeatures.length > 1) {
      setMainFeatures(mainFeatures.filter((_, i) => i !== index));
    }
  };

  const acceptSuggestion = () => {
    setStep('features');
  };

  const editSuggestion = () => {
    setStep('config');
  };

  const handleGenerate = async () => {
    const validFeatures = mainFeatures.filter(f => f.trim().length > 0);
    if (validFeatures.length < 3) {
      setError('Bitte gib mindestens 3 Hauptfeatures ein.');
      return;
    }

    setError(null);
    setStep('generating');
    setIsLoading(true);

    try {
      // Save features to idea (via callback)
      if (onSaveFeatures) {
        onSaveFeatures(validFeatures, techStack, projectType);
      }

      const input: HarnessExportInput = {
        projectName: idea.project_name,
        problemStatement: idea.problem_statement,
        targetAudience: idea.target_user,
        solution: idea.solution_summary,
        constraints: idea.constraints,
        differentiation: idea.differentiation,
        risks: idea.risks,
        nextSteps: idea.next_action,
        techStack: techStack as TechStack,
        mainFeatures: validFeatures,
        projectType: projectType,
      };

      let spec: HarnessSpec;
      if (useBasicMode) {
        spec = harnessExportService.generateBasicSpec(input);
      } else {
        spec = await harnessExportService.generateSpec(input);
      }

      setGeneratedSpec(spec);
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Generierung fehlgeschlagen');
      setStep('features');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (generatedSpec) {
      harnessExportService.downloadSpec(generatedSpec, idea.project_name);
    }
  };

  const handleCopy = async () => {
    if (generatedSpec) {
      const success = await harnessExportService.copyToClipboard(generatedSpec);
      if (success) {
        alert('Spec in Zwischenablage kopiert!');
      }
    }
  };

  if (!isOpen) return null;

  const currentTechOptions = TECH_STACKS_BY_TYPE[projectType] || {};

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 animate-in fade-in duration-200 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-black">Harness Export</h2>
            <p className="text-indigo-200 text-sm">{idea.project_name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-xl transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Step: Analyzing */}
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Analysiere deine Idee...</h3>
              <p className="text-slate-400 text-sm text-center">
                KI erkennt Projekt-Typ, Tech-Stack und Features
              </p>
            </div>
          )}

          {/* Step: AI Suggestion */}
          {step === 'suggestion' && aiAnalysis && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-6 border-2 border-indigo-100">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">🤖</span>
                  <h3 className="font-bold text-slate-900">KI-Vorschlag</h3>
                  <span className={`ml-auto px-2 py-1 rounded-full text-xs font-bold ${
                    aiAnalysis.confidence === 'high' ? 'bg-green-100 text-green-700' :
                    aiAnalysis.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {aiAnalysis.confidence === 'high' ? 'Hohe Konfidenz' :
                     aiAnalysis.confidence === 'medium' ? 'Mittlere Konfidenz' : 'Niedrige Konfidenz'}
                  </span>
                </div>

                <p className="text-slate-600 text-sm mb-4 italic">"{aiAnalysis.reasoning}"</p>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">📱</span>
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase">Projekt-Typ</div>
                      <div className="font-bold text-slate-900">{aiAnalysis.projectType}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase mb-2">🛠️ Tech-Stack</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(aiAnalysis.techStack).map(([key, value]) => (
                        <span key={key} className="px-3 py-1 bg-white rounded-full text-sm border border-slate-200">
                          <span className="text-slate-500">{key}:</span> <span className="font-bold">{value}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase mb-2">🎯 Erkannte Features</div>
                    <ul className="space-y-1">
                      {aiAnalysis.suggestedFeatures.map((feature, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <span className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={acceptSuggestion}
                  className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl hover:from-green-600 hover:to-emerald-600 transition-colors"
                >
                  ✓ Übernehmen
                </button>
                <button
                  onClick={editSuggestion}
                  className="flex-1 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-colors"
                >
                  ✏️ Anpassen
                </button>
              </div>
              <button
                onClick={startAIAnalysis}
                className="w-full py-2 text-indigo-600 font-bold text-sm hover:text-indigo-700"
              >
                🔄 Neu analysieren
              </button>
            </div>
          )}

          {/* Step: Questions (for weak input) */}
          {step === 'questions' && aiAnalysis?.questions && (
            <div className="space-y-6">
              <div className="bg-yellow-50 rounded-2xl p-6 border-2 border-yellow-200">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">❓</span>
                  <h3 className="font-bold text-slate-900">Zusätzliche Infos benötigt</h3>
                </div>
                <p className="text-slate-600 text-sm mb-4">
                  Deine Idee ist noch zu vage für eine optimale Spec. Bitte beantworte kurz:
                </p>
                {/* Questions would be rendered here - for now skip to config */}
              </div>
              <button
                onClick={() => { setStep('config'); initializeDefaultTechStack('SaaS'); }}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl"
              >
                Manuell konfigurieren →
              </button>
            </div>
          )}

          {/* Step: Config (Tech Stack & Type) */}
          {step === 'config' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-2xl">📦</span> Projekt-Typ
                </h3>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => handleProjectTypeChange(type)}
                      className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                        projectType === type
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-2xl">🛠️</span> Tech-Stack für {projectType}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(currentTechOptions).map(([key, options]) => (
                    <div key={key}>
                      <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                        {key}
                      </label>
                      <select
                        value={techStack[key] || ''}
                        onChange={(e) => handleTechChange(key, e.target.value)}
                        className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:outline-none bg-white"
                      >
                        <option value="">-- Auswählen --</option>
                        {options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setStep('features')}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Weiter zu Features →
              </button>
            </div>
          )}

          {/* Step: Features */}
          {step === 'features' && (
            <div className="space-y-6">
              {hasExistingData && (
                <div className="bg-green-50 border-2 border-green-200 rounded-xl p-3 text-sm text-green-700">
                  ✓ Gespeicherte Features geladen. Du kannst sie bearbeiten oder direkt die Spec generieren.
                </div>
              )}

              <div>
                <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <span className="text-2xl">🎯</span> Hauptfeatures
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  {mainFeatures.filter(f => f.trim()).length >= 3
                    ? `${mainFeatures.filter(f => f.trim()).length} Features definiert. Bearbeite sie oder generiere die Spec.`
                    : 'Beschreibe 3-10 Hauptfeatures. Diese werden durch KI expandiert.'}
                </p>

                <div className="space-y-2">
                  {mainFeatures.map((feature, index) => (
                    <div key={index} className="flex gap-2">
                      <span className="w-8 h-10 flex items-center justify-center bg-indigo-100 text-indigo-600 font-bold rounded-lg text-sm shrink-0">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={feature}
                        onChange={(e) => handleFeatureChange(index, e.target.value)}
                        placeholder="z.B. User Registration & Login"
                        className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:border-indigo-500 focus:outline-none"
                      />
                      {mainFeatures.length > 1 && (
                        <button
                          onClick={() => removeFeature(index)}
                          className="w-10 h-10 flex items-center justify-center bg-red-100 text-red-500 rounded-xl hover:bg-red-200 transition-colors"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {mainFeatures.length < 15 && (
                  <button
                    onClick={addFeature}
                    className="mt-2 text-indigo-600 font-bold text-sm hover:text-indigo-700"
                  >
                    + Feature hinzufügen
                  </button>
                )}
              </div>

              {error && (
                <div className="p-3 bg-red-100 border border-red-300 text-red-700 rounded-xl text-sm">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="basicMode"
                  checked={useBasicMode}
                  onChange={(e) => setUseBasicMode(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="basicMode" className="text-sm text-slate-600">
                  Basic Mode (ohne KI-Expansion, schneller)
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('config')}
                  className="flex-1 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-colors"
                >
                  ← Tech-Stack
                </button>
                <button
                  onClick={handleGenerate}
                  className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-colors"
                >
                  🤖 Spec generieren
                </button>
              </div>
            </div>
          )}

          {/* Step: Generating */}
          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-20 h-20 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-6"></div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Generiere Harness Spec...</h3>
              <p className="text-slate-400 text-sm text-center">
                KI expandiert {mainFeatures.filter(f => f.trim()).length} Features zu einer vollständigen Spezifikation.
                <br />
                Dies kann 30-60 Sekunden dauern.
              </p>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && generatedSpec && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-indigo-50 rounded-2xl p-4 text-center">
                  <div className="text-3xl font-black text-indigo-600">{generatedSpec.stats.totalFeatures}</div>
                  <div className="text-xs font-bold text-indigo-400 uppercase">Features</div>
                </div>
                <div className="bg-purple-50 rounded-2xl p-4 text-center">
                  <div className="text-3xl font-black text-purple-600">~{generatedSpec.stats.estimatedTurns}</div>
                  <div className="text-xs font-bold text-purple-400 uppercase">Turns</div>
                </div>
                <div className="bg-green-50 rounded-2xl p-4 text-center">
                  <div className="text-2xl font-black text-green-600">{generatedSpec.stats.estimatedCost}</div>
                  <div className="text-xs font-bold text-green-400 uppercase">Geschätzt</div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-2 text-sm">Features nach Kategorie:</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(generatedSpec.stats.byCategory).map(([cat, count]) => (
                    <span key={cat} className="px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-600">
                      {cat}: {count}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 mb-2 text-sm">Spec Preview:</h4>
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto max-h-64 overflow-y-auto">
                  {generatedSpec.markdown.substring(0, 2000)}
                  {generatedSpec.markdown.length > 2000 && '\n\n... (truncated)'}
                </pre>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <span>💾</span> Download .md
                </button>
                <button
                  onClick={handleCopy}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <span>📋</span> Kopieren
                </button>
              </div>

              <button
                onClick={() => setStep('features')}
                className="w-full py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300 transition-colors"
              >
                ← Zurück bearbeiten
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HarnessExportModal;
