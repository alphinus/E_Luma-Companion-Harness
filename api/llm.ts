
import { VercelRequest, VercelResponse } from '@vercel/node';
import { normalizeIdeation as geminiNormalize, processAudioIdeation as geminiAudio, generateIdeaFromPerson as geminiGenerate } from './_lib/geminiService.js';
import { normalizeIdeation as openaiNormalize, generateIdeaFromPerson as openaiGenerate, processAudioIdeation as openaiAudio, expandHarnessFeatures as openaiExpand } from './_lib/openaiService.js';
import { processAudioIdeation as groqAudio, generateIdeaFromPerson as groqGenerate } from './_lib/groqService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. Force JSON header immediately to prevent HTML fallback
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action, data, userEmail, instruction, audioBase64, mimeType, personData, prompt, projectName } = req.body;

    try {
        switch (action) {
            case 'normalize':
                try {
                    // Normalize: OpenAI (Primary) -> Gemini
                    const result = await openaiNormalize(data, userEmail, instruction);
                    return res.status(200).json({ ...result, _provider: 'openai' });
                } catch (err) {
                    console.warn("[Proxy] OpenAI Normalize failed, fallback to Gemini:", err);
                    const result = await geminiNormalize(data, userEmail, instruction);
                    return res.status(200).json({ ...result, _provider: 'gemini' });
                }

            case 'generateIdea':
                try {
                    // GenerateIdea: Groq (Primary) -> OpenAI -> Gemini
                    const result = await groqGenerate(personData, instruction);
                    return res.status(200).json({ ...result, _provider: 'groq' });
                } catch (err: any) {
                    console.warn("[Proxy] Groq Generate failed, fallback to OpenAI:", err);
                    try {
                        const result = await openaiGenerate(personData, instruction);
                        return res.status(200).json({ ...result, _provider: 'openai' });
                    } catch (oerr: any) {
                        const result = await geminiGenerate(personData, instruction);
                        return res.status(200).json({ ...result, _provider: 'gemini' });
                    }
                }

            case 'processAudio':
                // Log payload size for debugging
                const payloadSizeBytes = audioBase64 ? audioBase64.length : 0;
                const payloadSizeKB = Math.round(payloadSizeBytes / 1024);
                console.log(`[Proxy] processAudio called. Payload: ${payloadSizeKB}KB, MIME: ${mimeType}`);

                // Warn if payload is large (Vercel limit is ~4.5MB for request body)
                if (payloadSizeBytes > 4000000) {
                    console.warn(`[Proxy] WARNING: Payload size ${payloadSizeKB}KB may exceed Vercel limits!`);
                }

                try {
                    console.log("[Proxy] Processing Audio via Groq...");
                    const result = await groqAudio(audioBase64, mimeType, instruction);
                    console.log("[Proxy] Groq Audio SUCCESS");
                    return res.status(200).json({ ...result, _provider: 'groq' });
                } catch (err: any) {
                    console.error("[Proxy] Groq Audio failed:", err.message);
                    try {
                        console.log("[Proxy] Fallback to OpenAI Audio...");
                        const result = await openaiAudio(audioBase64, mimeType, instruction);
                        console.log("[Proxy] OpenAI Audio SUCCESS");
                        return res.status(200).json({ ...result, _provider: 'openai' });
                    } catch (oerr: any) {
                        console.error("[Proxy] OpenAI Audio failed:", oerr.message);
                        try {
                            console.log("[Proxy] Fallback to Gemini Audio...");
                            const result = await geminiAudio(audioBase64, mimeType, instruction);
                            console.log("[Proxy] Gemini Audio SUCCESS");
                            return res.status(200).json({ ...result, _provider: 'gemini' });
                        } catch (gerr: any) {
                            console.error("[Proxy] All Audio providers failed.");
                            return res.status(500).json({
                                error: `Alle KI-Dienste fehlgeschlagen. Letzter Fehler: ${gerr.message}`,
                                _provider: 'none'
                            });
                        }
                    }
                }

            case 'harnessExpand':
                console.log(`[Proxy] harnessExpand called for project: ${projectName}`);
                try {
                    const result = await openaiExpand(prompt, projectName);
                    console.log("[Proxy] OpenAI Harness Expand SUCCESS");
                    return res.status(200).json({ ...result, _provider: 'openai' });
                } catch (err: any) {
                    console.error("[Proxy] OpenAI Harness Expand failed:", err.message);
                    return res.status(500).json({
                        error: `Harness-Expansion fehlgeschlagen: ${err.message}`,
                        _provider: 'none'
                    });
                }

            default:
                return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (criticalError: any) {
        console.error("[CRITICAL PROXY ERROR]:", criticalError);
        return res.status(500).json({
            error: "Interner Server Fehler im Proxy",
            details: criticalError.message
        });
    }
}
