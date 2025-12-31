
export interface UserProfile {
  email: string;
  name: string;
  picture: string;
  accessToken?: string;
  baseInstruction: string;
  preferredProvider: 'google' | 'openai';
}

export interface PromptPreset {
  id: string;
  name: string;
  description: string;
  instructionModifier: string;
  icon: string;
}

export interface IdeationData {
  projectName: string;
  problemStatement: string;
  targetUser: string;
  solutionSummary: string;
  constraints: string;
  differentiation: string;
  risks: string;
  nextAction: string;
  tags: string;
  images: string[];
  audioTranscript?: string; // New field for traceability
}

export interface PersonData {
  name: string;
  expertise: string;
  passions: string;
  challenges: string;
  lifestyle: string;
  manualExtension: string;
}

export interface VoiceExtraction {
  extracted_data: Partial<IdeationData>;
  extracted_person?: Partial<PersonData>;
  transcript: string; // New field for the literal transcript
  questions: string[];
  confidence_score: number;
}

export interface NormalizedIdea {
  idea_id: string;
  session_uuid?: string;
  created_at: string;
  created_by_email: string;
  project_name: string;
  problem_statement: string;
  target_user: string;
  solution_summary: string;
  constraints: string;
  differentiation: string;
  risks: string;
  next_action: string;
  status: string;
  priority: string;
  tags: string;
  source: string;
  version: string;
  image_url_1: string;
  image_url_2: string;
  image_url_3: string;
  image_url_4: string;
  image_url_5: string;
  audio_transcript: string; // New field for the CSV export

  // Harness Export Persistence
  harness_project_type?: string;   // z.B. "Mobile App", "SaaS", etc.
  harness_tech_stack?: string;     // JSON-String mit Tech-Stack Auswahl
  harness_features?: string;       // JSON-String mit Feature-Array
}

// Represents a saved idea loaded from Google Drive
export interface SavedIdea {
  fileId: string;           // Google Drive file ID (for update/delete)
  fileName: string;         // Original filename
  createdTime: string;      // ISO timestamp from Drive
  data: NormalizedIdea;     // Parsed CSV content
  thumbnailUrl?: string;    // First image URL for preview
}

export enum WizardStep {
  DASHBOARD = 0,
  CONTEXT = 1,
  PROBLEM = 2,
  AUDIENCE = 3,
  SOLUTION = 4,
  VISUALS = 5,
  CONSTRAINTS = 6,
  DIFFERENTIATION = 7,
  RISKS = 8,
  NEXT_ACTION = 9,
  REVIEW = 10,
  PROCESSING = 11,
  SUCCESS = 12,
  VOICE_RECORDING = 13,
  VOICE_CLARIFICATION = 14,
  PREVIEW_ALL = 15,
  SETTINGS = 16,
  PERSON_PROFILE = 17,
  PERSON_CHALLENGES = 18,
  PERSON_SYNTHESIS = 19,
  MY_IDEAS = 20,
  IDEA_EDIT = 21,
  HARNESS_EXPORT = 22
}

// Harness Export Types
export interface TechStack {
  backend: string;
  database: string;
  frontend: string;
  auth: string;
  hosting: string;
  payments?: string;
  email?: string;
}

export interface HarnessFeature {
  id: string;
  title: string;
  category: 'config' | 'database' | 'service' | 'api' | 'ui' | 'integration' | 'security' | 'test' | 'worker' | 'infrastructure';
  complexity: 'simple' | 'medium' | 'complex';
  dependsOn: string[];
  acceptanceCriteria: string[];
}

export interface HarnessExportInput {
  // From existing idea
  projectName: string;
  problemStatement: string;
  targetAudience: string;
  solution: string;
  constraints: string;
  differentiation: string;
  risks: string;
  nextSteps: string;

  // New inputs from modal
  techStack: TechStack;
  mainFeatures: string[];
  projectType: 'SaaS' | 'Tool' | 'API' | 'Mobile App' | 'CLI' | 'Library';
}

export interface HarnessSpec {
  markdown: string;
  features: HarnessFeature[];
  stats: {
    totalFeatures: number;
    byCategory: Record<string, number>;
    byComplexity: Record<string, number>;
    estimatedTurns: number;
    estimatedCost: string;
  };
}
