
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
}

export interface VoiceExtraction {
  extracted_data: Partial<IdeationData>;
  questions: string[];
  confidence_score: number;
}

export interface NormalizedIdea {
  idea_id: string;
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
  SETTINGS = 16
}
