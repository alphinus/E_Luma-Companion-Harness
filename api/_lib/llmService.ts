
import { UserProfile, IdeationData, NormalizedIdea, VoiceExtraction, PersonData } from '../types';

export type ProviderType = 'gemini' | 'openai' | 'groq' | 'none';

export interface LlmResponse<T> {
  data: T;
  provider: ProviderType;
}

export const llmService = {
  async normalize(data: IdeationData, user: UserProfile, instruction: string): Promise<LlmResponse<NormalizedIdea>> {
    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'normalize', data, userEmail: user.email, instruction })
    });
    if (!response.ok) {
      const errRes = await response.json().catch(() => ({}));
      throw new Error(errRes.error || "Normalization failed");
    }
    const result = await response.json();
    const provider = result._provider || 'gemini';
    delete result._provider;
    return { data: result, provider };
  },

  async processAudio(audioBase64: string, mimeType: string, user: UserProfile, instruction: string): Promise<LlmResponse<VoiceExtraction>> {
    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'processAudio', audioBase64, mimeType, instruction })
    });

    if (!response.ok) {
      const statusText = response.statusText;
      const status = response.status;
      let errorDetail = "";
      try {
        const errJson = await response.json();
        errorDetail = errJson.error || "";
      } catch (e) {
        // Not JSON - probably a Vercel HTML error page
        errorDetail = await response.text().then(t => t.substring(0, 100)).catch(() => "N/A");
      }
      throw new Error(`Server Error ${status} (${statusText}): ${errorDetail}`);
    }

    const result = await response.json();
    const provider = result._provider || 'gemini';
    delete result._provider;
    return { data: result, provider };
  },

  async generateFromPerson(personData: PersonData, instruction: string): Promise<LlmResponse<Partial<IdeationData>>> {
    const response = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generateIdea', personData, instruction })
    });
    if (!response.ok) {
      const errRes = await response.json().catch(() => ({}));
      throw new Error(errRes.error || "Generation failed");
    }
    const result = await response.json();
    const provider = result._provider || 'gemini';
    delete result._provider;
    return { data: result, provider };
  }
};
