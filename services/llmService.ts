
import { normalizeIdeation as googleNormalize, processAudioIdeation as googleAudio, generateIdeaFromPerson as googleGenerate } from './geminiService';
import { UserProfile, IdeationData, NormalizedIdea, VoiceExtraction, PersonData } from '../types';

export const llmService = {
  async normalize(data: IdeationData, user: UserProfile, instruction: string): Promise<NormalizedIdea> {
    return googleNormalize(data, user.email, instruction);
  },

  async processAudio(audioBase64: string, mimeType: string, user: UserProfile, instruction: string): Promise<VoiceExtraction> {
    return googleAudio(audioBase64, mimeType, instruction);
  },

  async generateFromPerson(person: PersonData, instruction: string): Promise<Partial<IdeationData>> {
    return googleGenerate(person, instruction);
  }
};
