const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_SUMMARY_MODEL = 'gpt-4o-mini';
const MAX_TRANSCRIPT_LENGTH = 7000;
const MAX_SUMMARY_LENGTH = 900;

const normalizeText = (value: string): string => {
    return value
        .replace(/\s+/g, ' ')
        .trim();
};

const normalizeSummary = (value: string): string => {
    return normalizeText(value).slice(0, MAX_SUMMARY_LENGTH);
};

const truncateTranscript = (transcript: string): string => {
    return normalizeText(transcript).slice(-MAX_TRANSCRIPT_LENGTH);
};

const buildFallbackSummary = (transcript: string): string => {
    const sentences = transcript
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter(Boolean);

    if (sentences.length === 0) return '';

    const summary = sentences.slice(0, 2).join(' ');
    return normalizeSummary(summary);
};

const summarizeWithOpenAI = async (transcript: string): Promise<string | null> => {
    const openAIApiKey = process.env.OPENAI_API_KEY;
    if (!openAIApiKey) return null;

    const model = process.env.VAPI_MEMORY_SUMMARY_MODEL || DEFAULT_SUMMARY_MODEL;

    try {
        const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${openAIApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                max_tokens: 180,
                messages: [
                    {
                        role: 'system',
                        content: [
                            'You summarize completed voice conversations between a listener and a book persona.',
                            'Write exactly 1-2 concise sentences.',
                            'Capture key topics discussed, listener intent (academic vs personal if clear), reactions, and major insights.',
                            'Do not mention tools, prompts, metadata, or implementation details.',
                            'Write warm natural prose that can be dropped into long-term memory context.',
                        ].join(' '),
                    },
                    {
                        role: 'user',
                        content: `Transcript:\n${transcript}`,
                    },
                ],
            }),
        });

        if (!response.ok) {
            const responseText = await response.text();
            console.error('OpenAI summary request failed:', response.status, responseText);
            return null;
        }

        const data = (await response.json()) as {
            choices?: Array<{
                message?: {
                    content?: string;
                };
            }>;
        };

        const content = data.choices?.[0]?.message?.content;
        if (!content) return null;

        const summary = normalizeSummary(content);
        return summary || null;
    } catch (error) {
        console.error('OpenAI summary generation error:', error);
        return null;
    }
};

export const summarizeConversationForMemory = async ({
    transcript,
    analysisSummary,
}: {
    transcript: string;
    analysisSummary?: string;
}): Promise<string> => {
    const normalizedAnalysisSummary = analysisSummary ? normalizeSummary(analysisSummary) : '';
    if (normalizedAnalysisSummary) {
        return normalizedAnalysisSummary;
    }

    const normalizedTranscript = truncateTranscript(transcript);
    if (!normalizedTranscript) return '';

    const llmSummary = await summarizeWithOpenAI(normalizedTranscript);
    if (llmSummary) return llmSummary;

    return buildFallbackSummary(normalizedTranscript);
};
