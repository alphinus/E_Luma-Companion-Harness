
import { normalizeIdeation as googleNormalize, processAudioIdeation as googleAudio } from './geminiService';
import { UserProfile, IdeationData, NormalizedIdea, VoiceExtraction } from '../types';

/**
 * Der LLM-Provider Dienst ist der zentrale Einstiegspunkt für KI-Operationen.
 * Er bereitet die Struktur für verschiedene Backends vor (Google, OpenAI, etc.).
 */
export const llmService = {
  /**
   * Normalisiert Ideendaten basierend auf dem gewählten Provider des Benutzers.
   */
  async normalize(
    data: IdeationData,
    user: UserProfile,
    instruction: string
  ): Promise<NormalizedIdea> {
    if (user.preferredProvider === 'openai') {
      // Platzhalter für OpenAI-Logik. Im Rahmen dieser App wird jedoch die Google GenAI SDK genutzt.
      console.warn("OpenAI Provider ausgewählt. Falle zurück auf Google (Simulationsmodus).");
    }
    
    // Wir nutzen standardmäßig Gemini, bereiten aber die Übergabe der Provider-Spezifika vor.
    return googleNormalize(data, user.email, instruction);
  },

  /**
   * Verarbeitet Audio-Eingaben basierend auf dem gewählten Provider des Benutzers.
   */
  async processAudio(
    audioBase64: string,
    mimeType: string,
    user: UserProfile,
    instruction: string
  ): Promise<VoiceExtraction> {
    if (user.preferredProvider === 'openai') {
      console.warn("OpenAI Audio-Verarbeitung (Coming Soon). Nutze Gemini-Engine.");
    }
    
    return googleAudio(audioBase64, mimeType, instruction);
  }
};
