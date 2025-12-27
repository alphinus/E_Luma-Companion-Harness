
import { UserProfile, IdeationData, NormalizedIdea, VoiceExtraction, PersonData } from '../types';

export type ProviderType = 'gemini' | 'openai' | 'groq' | 'none';

export interface LlmResponse<T> {
  data: T;
  provider: ProviderType;
}

// Timeout wrapper for fetch with AbortController
const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs: number = 8000): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out (8s limit)');
    }
    throw err;
  }
};

export const llmService = {
  async normalize(data: IdeationData, user: UserProfile, instruction: string): Promise<LlmResponse<NormalizedIdea>> {
    console.log("[llmService] normalize called...");
    try {
      const response = await fetchWithTimeout('/api/llm', {
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
      console.log("[llmService] normalize SUCCESS via", provider);
      return { data: result, provider };
    } catch (err: any) {
      console.error("[llmService] normalize FAILED:", err.message);
      throw err;
    }
  },

  async processAudio(audioBase64: string, mimeType: string, user: UserProfile, instruction: string): Promise<LlmResponse<VoiceExtraction>> {
    console.log("[llmService] processAudio called...");
    try {
      const response = await fetchWithTimeout('/api/llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'processAudio', audioBase64, mimeType, instruction })
      }, 15000); // 15 second timeout for audio (longer)

      if (!response.ok) {
        const statusText = response.statusText;
        const status = response.status;
        let errorDetail = "";
        try {
          const errJson = await response.json();
          errorDetail = errJson.error || "";
        } catch (e) {
          errorDetail = await response.text().then(t => t.substring(0, 100)).catch(() => "N/A");
        }
        throw new Error(`Server Error ${status} (${statusText}): ${errorDetail}`);
      }

      const result = await response.json();
      const provider = result._provider || 'gemini';
      delete result._provider;
      console.log("[llmService] processAudio SUCCESS via", provider);
      return { data: result, provider };
    } catch (err: any) {
      console.error("[llmService] processAudio FAILED:", err.message);
      throw err;
    }
  },

  async generateFromPerson(personData: PersonData, instruction: string): Promise<LlmResponse<Partial<IdeationData>>> {
    console.log("[llmService] generateFromPerson called...");
    try {
      const response = await fetchWithTimeout('/api/llm', {
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
      console.log("[llmService] generateFromPerson SUCCESS via", provider);
      return { data: result, provider };
    } catch (err: any) {
      console.error("[llmService] generateFromPerson FAILED:", err.message);
      throw err;
    }
  }
};
