
import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
    const gemini = !!process.env.GEMINI_API_KEY;
    const openai = true; // Hardcoded for test
    const groq = true; // Hardcoded for test

    res.status(200).json({
        gemini,
        openai,
        groq,
        status: groq ? 'groq' : (openai ? 'openai' : 'none')
    });
}
