
import { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeIdeation as geminiNormalize, processAudioIdeation as geminiAudio, generateIdeaFromPerson as geminiGenerate } from '../services/geminiService';
import { normalizeIdeation as openaiNormalize, generateIdeaFromPerson as openaiGenerate } from '../services/openaiService';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, data, userEmail, instruction, audioBase64, mimeType, personData } = req.body;

    try {
        switch (action) {
            case 'normalize':
                try {
                    // Fail-fast: If no Gemini key, mock an error to trigger fallback immediately
                    if (!process.env.GEMINI_API_KEY) throw new Error("No Gemini API Key found");

                    // Try Gemini first
                    const result = await geminiNormalize(data, userEmail, instruction);
                    return res.status(200).json({ ...result, _provider: 'gemini' });
                } catch (err) {
                    console.warn("Gemini Normalize failed/skipped, falling back to OpenAI", err);
                    const result = await openaiNormalize(data, userEmail, instruction);
                    return res.status(200).json({ ...result, _provider: 'openai' });
                }

            case 'generateIdea':
                try {
                    if (!process.env.GEMINI_API_KEY) throw new Error("No Gemini API Key found");
                    const result = await geminiGenerate(personData, instruction);
                    return res.status(200).json({ ...result, _provider: 'gemini' });
                } catch (err) {
                    console.warn("Gemini Generate failed/skipped, falling back to OpenAI", err);
                    const result = await openaiGenerate(personData, instruction);
                    return res.status(200).json({ ...result, _provider: 'openai' });
                }

            case 'processAudio':
                try {
                    // Audio is more complex, we primarily use Gemini for its native multimodal support
                    const result = await geminiAudio(audioBase64, mimeType, instruction);
                    return res.status(200).json({ ...result, _provider: 'gemini' });
                } catch (err) {
                    console.error("Audio Processing failed (No OpenAI fallback for audio yet)", err);
                    return res.status(500).json({ error: 'Audio processing failed', _provider: 'none' });
                }

            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error: any) {
        console.error("Proxy Error:", error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
