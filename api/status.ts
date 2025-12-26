
import { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
    const gemini = !!process.env.GEMINI_API_KEY;
    const openai = !!process.env.OPENAI_API_KEY;

    let status = 'none';
    if (gemini && openai) status = 'both';
    else if (gemini) status = 'gemini';
    else if (openai) status = 'openai';

    res.status(200).json({
        gemini,
        openai,
        status
    });
}
