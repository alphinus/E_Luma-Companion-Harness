import React, { useState, useEffect } from 'react';
import { NormalizedIdea, TechStack, HarnessExportInput, HarnessSpec } from '../types';
import { harnessExportService, ideaToExportInput } from '../services/harnessExportService';

interface HarnessExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  idea: NormalizedIdea;
}

const TECH_OPTIONS = {
  backend: ['Node.js + Express', 'Next.js API Routes', 'FastAPI (Python)', 'Django', 'Go + Fiber', 'Custom'],
  database: ['Supabase', 'PostgreSQL', 'MongoDB', 'MySQL', 'Firebase', 'Custom'],
  frontend: ['Next.js 14', 'React + Vite', 'Vue 3', 'Svelte', 'Solid.js', 'Custom'],
  auth: ['Supabase Auth', 'Auth0', 'Clerk', 'NextAuth', 'Custom JWT', 'Custom'],
  hosting: ['Vercel', 'Railway', 'Render', 'AWS', 'Google Cloud', 'Custom'],
  payments: ['Stripe', 'LemonSqueezy', 'Paddle', 'None', 'Custom'],
  email: ['Resend', 'SendGrid', 'AWS SES', 'None', 'Custom']
};

const PROJECT_TYPES: HarnessExportInput['projectType'][] = ['SaaS', 'Tool', 'API', 'Mobile App', 'CLI', 'Library'];

export const HarnessExportModal: React.FC<HarnessExportModalProps> = ({ isOpen, onClose, idea }) => {
  const [step, setStep] = useState<'config' | 'features' | 'generating' | 'preview'>('config');
  const [techStack, setTechStack] = useState<TechStack>({
    backend: 'Node.js + Express',
    database: 'Supabase',
    frontend: 'Next.js 14',
    auth: 'Supabase Auth',
    hosting: 'Vercel',
    payments: '',
    email: ''
  });
  const [projectType, setProjectType] = useState<HarnessExportInput['projectType']>('SaaS');
  const [mainFeatures, setMainFeatures] = useState<string[]>(['']);
  const [generatedSpec, setGeneratedSpec] = useState<HarnessSpec | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useBasicMode, setUseBasicMode] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('config');
      setError(null);
      setGeneratedSpec(null);
    }
  }, [isOpen]);

  const handleTechChange = (key: keyof TechStack, value: string) => {
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

  const handleGenerate = async () => {
    const validFeatures = mainFeatures.filter(f => f.trim().length > 0);
    if (validFeatures.length < 3) {
      setError('Bitte gib mindestens 3 Hauptfeatures ein.');
      return;
    }

    setError(null);
    setStep('generating');
    setIsGenerating(true);

    try {
      const input = ideaToExportInput(idea, techStack, validFeatures, projectType);

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
      setIsGenerating(false);
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
          {/* Step: Config */}
          {step === 'config' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-2xl">🛠️</span> Tech-Stack
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {(Object.keys(TECH_OPTIONS) as (keyof typeof TECH_OPTIONS)[]).map((key) => (
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
                        {TECH_OPTIONS[key].map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                  <span className="text-2xl">📦</span> Projekt-Typ
                </h3>
                <div className="flex flex-wrap gap-2">
                  {PROJECT_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setProjectType(type)}
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
              <div>
                <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <span className="text-2xl">🎯</span> Hauptfeatures
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  Beschreibe 5-10 Hauptfeatures. Diese werden durch KI zu 40-60 detaillierten Features expandiert.
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
                  ← Zurück
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
              {/* Stats */}
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

              {/* Category breakdown */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2 text-sm">Features nach Kategorie:</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(generatedSpec.stats.byCategory).map(([cat, count]) => (
                    <span
                      key={cat}
                      className="px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-600"
                    >
                      {cat}: {count}
                    </span>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2 text-sm">Spec Preview:</h4>
                <pre className="bg-slate-900 text-slate-100 p-4 rounded-xl text-xs overflow-x-auto max-h-64 overflow-y-auto">
                  {generatedSpec.markdown.substring(0, 2000)}
                  {generatedSpec.markdown.length > 2000 && '\n\n... (truncated)'}
                </pre>
              </div>

              {/* Actions */}
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
