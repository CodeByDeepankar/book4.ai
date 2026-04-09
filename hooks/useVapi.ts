'use client';

// Create hooks/useVapi.ts: the core hook. Initializes Vapi SDK, manages call lifecycle (idle, connecting, starting, listening, thinking, speaking), tracks messages array + currentMessage streaming, handles duration timer with maxDuration enforcement, session tracking via server actions

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DailyCall, DailyEventObjectLocalAudioLevel } from '@daily-co/daily-js';
import Vapi from '@vapi-ai/web';
import { useAuth } from '@clerk/nextjs';

import { useSubscription } from './useSubscription';
import { ASSISTANT_ID, DEFAULT_VOICE, VOICE_SETTINGS } from '@/lib/constants';
import { getVoice } from '@/lib/utils';
import { IBook, Messages } from '@/types';
import {
    appendBookConversationMessage,
    getBookConversationHistory,
    replaceBookConversationHistory,
} from '../lib/actions/conversation.actions';
import { getBookConversationMemoryContext } from '../lib/actions/memory.actions';
import { clearBookSessionData, startVoiceSession, endVoiceSession } from '../lib/actions/session.actions';

export function useLatestRef<T>(value: T) {
    const ref = useRef(value);

    useEffect(() => {
        ref.current = value;
    }, [value]);

    return ref;
}

const VAPI_API_KEY = process.env.NEXT_PUBLIC_VAPI_API_KEY;
const TIMER_INTERVAL_MS = 1000;
const SECONDS_PER_MINUTE = 60;
const TIME_WARNING_THRESHOLD = 60; // Show warning when this many seconds remain

const VAPI_DAILY_CONFIG = {
    alwaysIncludeMicInPermissionPrompt: true as const,
};

const VAPI_DAILY_FACTORY_OPTIONS = {
    audioSource: true as const,
    startAudioOff: false,
};

const CONTEXT_MESSAGE_LIMIT = 30;
const LOCAL_HISTORY_LIMIT = 200;
const RESUME_TOPIC_MAX_LENGTH = 220;
const MEMORY_SUMMARY_LIMIT = 4;
const FIRST_CONVERSATION_MEMORY_CONTEXT = 'This is the first conversation with this listener.';

type ResumeReplayRole = 'user' | 'assistant';

interface ResumeReplayMessage {
    role: ResumeReplayRole;
    content: string;
}

const extractVapiErrorMessage = (error: unknown): string => {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message ?? '';

    if (!error || typeof error !== 'object') return '';

    const queue: unknown[] = [error];
    const visited = new Set<unknown>();
    const messageFields = ['message', 'msg', 'errorMsg', 'errorDetail', 'reason', 'detail'];

    while (queue.length > 0) {
        const candidate = queue.shift();

        if (!candidate || typeof candidate !== 'object') {
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate;
            }
            continue;
        }

        if (visited.has(candidate)) continue;
        visited.add(candidate);

        const payload = candidate as Record<string, unknown>;

        for (const key of messageFields) {
            const value = payload[key];
            if (typeof value === 'string' && value.trim()) {
                return value;
            }
        }

        const nestedFields = [
            payload.error,
            payload.cause,
            payload.data,
            payload.details,
            payload.payload,
            payload.dailyError,
            payload.originalError,
        ];

        for (const nested of nestedFields) {
            if (nested) queue.push(nested);
        }

        if (Array.isArray(payload.errors)) {
            queue.push(...payload.errors);
        }
    }

    return '';
};

const isExpectedVapiTerminationMessage = (message: string): boolean => {
    const normalized = message.toLowerCase();

    return normalized.includes('meeting has ended')
        || normalized.includes('meeting ended')
        || normalized.includes('ended due to ejection')
        || normalized.includes('ejection')
        || normalized.includes('call has ended')
        || normalized.includes('call ended')
        || normalized.includes('not in meeting')
        || normalized.includes('already left');
};

const normalizeConversationHistory = (history: Messages[]): Messages[] => {
    return (Array.isArray(history) ? history : [])
        .filter((message) => !!message && typeof message === 'object')
        .map((message) => ({ role: message.role, content: (message.content ?? '').trim() }))
        .filter((message) => !!message.content)
        .slice(-LOCAL_HISTORY_LIMIT);
};

const mergeConversationHistory = (serverHistory: Messages[], localHistory: Messages[]): Messages[] => {
    const merged = [...normalizeConversationHistory(serverHistory)];

    for (const message of normalizeConversationHistory(localHistory)) {
        const previous = merged.at(-1);

        const isImmediateDuplicate =
            !!previous
            && previous.role === message.role
            && previous.content === message.content;

        if (!isImmediateDuplicate) {
            merged.push(message);
        }
    }

    return merged.slice(-LOCAL_HISTORY_LIMIT);
};

const toResumeReplayHistory = (history: Messages[]): ResumeReplayMessage[] => {
    return normalizeConversationHistory(history)
        .filter((message): message is ResumeReplayMessage => {
            return message.role === 'user' || message.role === 'assistant';
        })
        .slice(-CONTEXT_MESSAGE_LIMIT);
};

type TranscriptRole = 'user' | 'assistant';
type TranscriptType = 'partial' | 'final';

interface VapiTranscriptMessage {
    type: 'transcript';
    role: TranscriptRole;
    transcriptType: TranscriptType;
    transcript: string;
}

const isTranscriptMessage = (value: unknown): value is VapiTranscriptMessage => {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<VapiTranscriptMessage>;

    return candidate.type === 'transcript'
        && (candidate.role === 'user' || candidate.role === 'assistant')
        && (candidate.transcriptType === 'partial' || candidate.transcriptType === 'final')
        && typeof candidate.transcript === 'string';
};

let vapi: InstanceType<typeof Vapi>;
function getVapi() {
    if (!vapi) {
        if (!VAPI_API_KEY) {
            throw new Error('NEXT_PUBLIC_VAPI_API_KEY environment variable is not set');
        }
        vapi = new Vapi(
            VAPI_API_KEY,
            undefined,
            VAPI_DAILY_CONFIG,
            VAPI_DAILY_FACTORY_OPTIONS,
        );
    }
    return vapi;
}

export type CallStatus = 'idle' | 'connecting' | 'starting' | 'listening' | 'thinking' | 'speaking';

export function useVapi(book: IBook) {
    const { userId } = useAuth();
    const { limits } = useSubscription();

    const [status, setStatus] = useState<CallStatus>('idle');
    const [messages, setMessages] = useState<Messages[]>([]);
    const [currentMessage, setCurrentMessage] = useState('');
    const [currentUserMessage, setCurrentUserMessage] = useState('');
    const [duration, setDuration] = useState(0);
    const [micLevel, setMicLevel] = useState(0);
    const [limitError, setLimitError] = useState<string | null>(null);
    const [isBillingError, setIsBillingError] = useState(false);
    const [isClearingSession, setIsClearingSession] = useState(false);

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const startTimeRef = useRef<number | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const isStoppingRef = useRef(false);
    const sessionInitializedRef = useRef(false);
    const assistantWaitsForUserRef = useRef(false);
    const pendingResumeHistoryRef = useRef<Messages[] | null>(null);
    const hasInjectedResumeContextRef = useRef(false);
    const micObserverCallRef = useRef<DailyCall | null>(null);
    const micObserverHandlerRef = useRef<((event: DailyEventObjectLocalAudioLevel) => void) | null>(null);

    // Keep refs in sync with latest values for use in callbacks
    const maxDurationSeconds = limits?.maxDurationPerSession ? limits.maxDurationPerSession * 60 : (15 * 60);
    const maxDurationRef = useLatestRef(maxDurationSeconds);
    const durationRef = useLatestRef(duration);
    const messagesRef = useLatestRef(messages);
    const voice = book.persona || DEFAULT_VOICE;

    const getConversationStorageKey = useCallback(() => {
        if (!userId || !book._id) return null;
        return `bookified:conversation:${userId}:${book._id}`;
    }, [book._id, userId]);

    const loadConversationFromLocal = useCallback((): Messages[] => {
        if (typeof window === 'undefined') return [];

        const storageKey = getConversationStorageKey();
        if (!storageKey) return [];

        try {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) return [];

            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) return [];

            return parsed
                .filter((item): item is Messages => {
                    return !!item
                        && typeof item === 'object'
                        && typeof (item as Messages).role === 'string'
                        && typeof (item as Messages).content === 'string';
                })
                .map((item) => ({ role: item.role, content: item.content.trim() }))
                .filter((item) => !!item.content)
                .slice(-LOCAL_HISTORY_LIMIT);
        } catch (error) {
            console.error('Failed to read local conversation history:', error);
            return [];
        }
    }, [getConversationStorageKey]);

    const saveConversationToLocal = useCallback((history: Messages[]) => {
        if (typeof window === 'undefined') return;

        const storageKey = getConversationStorageKey();
        if (!storageKey) return;

        try {
            window.localStorage.setItem(
                storageKey,
                JSON.stringify(history.slice(-LOCAL_HISTORY_LIMIT)),
            );
        } catch (error) {
            console.error('Failed to write local conversation history:', error);
        }
    }, [getConversationStorageKey]);

    const clearConversationFromLocal = useCallback(() => {
        if (typeof window === 'undefined') return;

        const storageKey = getConversationStorageKey();
        if (!storageKey) return;

        try {
            window.localStorage.removeItem(storageKey);
        } catch (error) {
            console.error('Failed to clear local conversation history:', error);
        }
    }, [getConversationStorageKey]);

    const syncConversationState = useCallback((history: Messages[]) => {
        const normalizedHistory = normalizeConversationHistory(history);

        messagesRef.current = normalizedHistory;
        setMessages(normalizedHistory);

        if (normalizedHistory.length === 0) {
            clearConversationFromLocal();
            return;
        }

        saveConversationToLocal(normalizedHistory);
    }, [clearConversationFromLocal, messagesRef, saveConversationToLocal]);

    const loadConversationHistory = useCallback(async () => {
        if (!userId || !book._id) {
            syncConversationState([]);
            return;
        }

        const localHistory = loadConversationFromLocal();

        const result = await getBookConversationHistory(book._id);

        if (result.success) {
            const serverHistory = normalizeConversationHistory(result.data ?? []);
            const mergedHistory = mergeConversationHistory(serverHistory, localHistory);

            syncConversationState(mergedHistory);

            if (mergedHistory.length > serverHistory.length) {
                replaceBookConversationHistory(book._id, mergedHistory).then((writeResult) => {
                    if (!writeResult.success) {
                        console.error('Failed to backfill conversation history:', writeResult.error);
                    }
                });
            }

            return;
        }

        console.error('Failed to load conversation history:', result.error);
        syncConversationState(localHistory);
    }, [book._id, loadConversationFromLocal, syncConversationState, userId]);

    const persistFinalMessage = useCallback(async (role: TranscriptRole, content: string) => {
        if (!userId || !book._id) return;

        const result = await appendBookConversationMessage(book._id, { role, content });
        if (!result.success) {
            console.error('Failed to persist conversation message:', result.error);
        }
    }, [book._id, userId]);

    const buildConversationContext = useCallback((history: Messages[]) => {
        const trimmedHistory = history
            .filter((message) => !!message.content?.trim())
            .slice(-CONTEXT_MESSAGE_LIMIT);

        if (trimmedHistory.length === 0) {
            return '';
        }

        const transcript = trimmedHistory
            .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
            .join('\n');

        return [
            'Conversation memory for this book from prior sessions:',
            transcript,
            'Continue naturally from this context and avoid re-asking already answered questions.',
        ].join('\n');
    }, []);

    const buildResumePrompt = useCallback((history: Messages[]) => {
        const normalizedHistory = normalizeConversationHistory(history);
        const lastUserMessage = [...normalizedHistory]
            .reverse()
            .find((message) => message.role === 'user');
        const lastAssistantMessage = [...normalizedHistory]
            .reverse()
            .find((message) => message.role === 'assistant');

        if (!lastUserMessage && !lastAssistantMessage) {
            return `Let's continue our conversation about ${book.title}.`;
        }

        const userSnippet = (lastUserMessage?.content ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, RESUME_TOPIC_MAX_LENGTH);

        const assistantSnippet = (lastAssistantMessage?.content ?? '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, RESUME_TOPIC_MAX_LENGTH);

        const contextFragments = [
            userSnippet ? `My latest message was: "${userSnippet}".` : '',
            assistantSnippet ? `Your latest reply was: "${assistantSnippet}".` : '',
        ].filter(Boolean);

        return [
            'Continue exactly where we left off in the previous session.',
            ...contextFragments,
            'Do not greet me, do not introduce yourself, and do not ask if we are starting fresh.',
            'Respond with the next direct continuation only.',
        ].join(' ');
    }, [book.title]);

    const injectConversationReplay = useCallback((history: Messages[]): boolean => {
        const replayHistory = toResumeReplayHistory(history);

        if (replayHistory.length === 0) return true;

        try {
            replayHistory.forEach((message) => {
                getVapi().send({
                    type: 'add-message',
                    message: {
                        role: message.role,
                        content: message.content,
                    },
                    triggerResponseEnabled: false,
                });
            });
            return true;
        } catch (error) {
            console.error('Failed to replay conversation history:', error);
            return false;
        }
    }, []);

    const injectConversationContext = useCallback((history: Messages[]): boolean => {
        const contextPrompt = buildConversationContext(history);

        if (!contextPrompt) return true;

        try {
            getVapi().send({
                type: 'add-message',
                message: {
                    role: 'system',
                    content: contextPrompt,
                },
                triggerResponseEnabled: false,
            });
            return true;
        } catch (error) {
            console.error('Failed to inject conversation context:', error);
            return false;
        }
    }, [buildConversationContext]);

    const injectResumeGuard = useCallback((): boolean => {
        try {
            getVapi().send({
                type: 'add-message',
                message: {
                    role: 'system',
                    content: `This is a resumed conversation about ${book.title}. Continue from prior context and do not restart with a first-time greeting or onboarding question.`,
                },
                triggerResponseEnabled: false,
            });
            return true;
        } catch (error) {
            console.error('Failed to inject resume guard message:', error);
            return false;
        }
    }, [book.title]);

    const injectResumePrompt = useCallback((history: Messages[]): boolean => {
        try {
            getVapi().send({
                type: 'add-message',
                message: {
                    role: 'user',
                    content: buildResumePrompt(history),
                },
                triggerResponseEnabled: true,
            });
            return true;
        } catch (error) {
            console.error('Failed to inject resume user prompt:', error);
            return false;
        }
    }, [buildResumePrompt]);

    const injectPendingResumeContext = useCallback(() => {
        const pendingHistory = pendingResumeHistoryRef.current;

        if (!pendingHistory || pendingHistory.length === 0) return;
        if (hasInjectedResumeContextRef.current) return;

        const replayInjected = injectConversationReplay(pendingHistory);
        const contextInjected = injectConversationContext(pendingHistory);
        const guardInjected = injectResumeGuard();
        const promptInjected = injectResumePrompt(pendingHistory);

        if (replayInjected && contextInjected && guardInjected && promptInjected) {
            hasInjectedResumeContextRef.current = true;
        }
    }, [injectConversationContext, injectConversationReplay, injectResumeGuard, injectResumePrompt]);

    useEffect(() => {
        setCurrentMessage('');
        setCurrentUserMessage('');
        void loadConversationHistory();
    }, [loadConversationHistory]);

    const appendFinalMessage = useCallback((role: TranscriptRole, transcriptText: string) => {
        const transcript = transcriptText.trim();
        if (!transcript) return;

        const currentHistory = messagesRef.current;
        const lastMessage = currentHistory.at(-1);

        const isImmediateDuplicate =
            !!lastMessage
            && lastMessage.role === role
            && lastMessage.content === transcript;

        if (isImmediateDuplicate) return;

        const nextHistory = [...currentHistory, { role, content: transcript }];

        messagesRef.current = nextHistory;
        setMessages(nextHistory);
        saveConversationToLocal(nextHistory);
        void persistFinalMessage(role, transcript);
    }, [messagesRef, persistFinalMessage, saveConversationToLocal]);

    const ensureMicrophonePermission = useCallback(async (): Promise<boolean> => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setLimitError('Microphone access is not supported in this browser.');
            return false;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
            return true;
        } catch (error) {
            console.error('Microphone permission error:', error);
            setLimitError('Microphone access is required. Please allow mic permission and try again.');
            return false;
        }
    }, []);

    const configureBrowserAudioFallback = useCallback(async () => {
        try {
            const dailyCall = getVapi().getDailyCallObject();

            if (!dailyCall) return;

            // Force local audio on and fall back to a universally supported processor.
            dailyCall.setLocalAudio(true);
            await dailyCall.updateInputSettings({
                audio: {
                    processor: {
                        type: 'none',
                    },
                },
            });
        } catch (error) {
            console.warn('Unable to apply browser audio fallback settings:', error);
        }
    }, []);

    const stopLocalMicObserver = useCallback(() => {
        const activeCall = micObserverCallRef.current;
        const activeHandler = micObserverHandlerRef.current;

        if (activeCall) {
            if (activeHandler) {
                activeCall.off('local-audio-level', activeHandler);
            }

            try {
                if (activeCall.isLocalAudioLevelObserverRunning()) {
                    activeCall.stopLocalAudioLevelObserver();
                }
            } catch (error) {
                console.warn('Unable to stop local mic level observer:', error);
            }
        }

        micObserverCallRef.current = null;
        micObserverHandlerRef.current = null;
        setMicLevel(0);
    }, []);

    const startLocalMicObserver = useCallback(async () => {
        const dailyCall = getVapi().getDailyCallObject();

        if (!dailyCall) return;

        if (
            micObserverCallRef.current === dailyCall
            && dailyCall.isLocalAudioLevelObserverRunning()
        ) {
            return;
        }

        stopLocalMicObserver();

        const handleLocalAudioLevel = (event: DailyEventObjectLocalAudioLevel) => {
            const rawLevel = Number.isFinite(event.audioLevel) ? event.audioLevel : 0;
            const normalizedLevel = Math.max(0, Math.min(1, rawLevel * 2.5));
            setMicLevel(normalizedLevel);
        };

        micObserverCallRef.current = dailyCall;
        micObserverHandlerRef.current = handleLocalAudioLevel;

        dailyCall.on('local-audio-level', handleLocalAudioLevel);

        try {
            await dailyCall.startLocalAudioLevelObserver(120);
        } catch (error) {
            console.warn('Unable to start local mic level observer:', error);
        }
    }, [stopLocalMicObserver]);

    const stopVapiSafely = useCallback(async (context: string) => {
        try {
            await getVapi().stop();
        } catch (error) {
            const errorMessage = extractVapiErrorMessage(error);

            if (errorMessage && isExpectedVapiTerminationMessage(errorMessage)) {
                return;
            }

            console.warn(`Failed to stop Vapi (${context}):`, error);
        }
    }, []);

    const backfillConversationFromLocalSnapshot = useCallback(() => {
        if (!userId || !book._id) return;

        const snapshot = normalizeConversationHistory(messagesRef.current);
        if (snapshot.length === 0) return;

        replaceBookConversationHistory(book._id, snapshot).then((writeResult) => {
            if (!writeResult.success) {
                console.error('Failed to backfill conversation history from local snapshot:', writeResult.error);
            }
        });
    }, [book._id, messagesRef, userId]);

    const initializeActiveCallRuntime = useCallback((assistantWaitsForUser: boolean) => {
        if (sessionInitializedRef.current) return;

        sessionInitializedRef.current = true;
        isStoppingRef.current = false;
        setStatus(assistantWaitsForUser ? 'listening' : 'starting');
        setCurrentMessage('');
        setCurrentUserMessage('');

        void configureBrowserAudioFallback();
        void startLocalMicObserver();

        startTimeRef.current = Date.now();
        setDuration(0);

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        timerRef.current = setInterval(() => {
            if (!startTimeRef.current) return;

            const newDuration = Math.floor((Date.now() - startTimeRef.current) / TIMER_INTERVAL_MS);
            setDuration(newDuration);

            if (newDuration >= maxDurationRef.current) {
                void stopVapiSafely('session limit reached');

                setLimitError(
                    `Session time limit (${Math.floor(
                        maxDurationRef.current / SECONDS_PER_MINUTE,
                    )} minutes) reached. Upgrade your plan for longer sessions.`,
                );
            }
        }, TIMER_INTERVAL_MS);
    }, [configureBrowserAudioFallback, maxDurationRef, startLocalMicObserver, stopVapiSafely]);

    const resetActiveRuntime = useCallback(() => {
        sessionInitializedRef.current = false;
        assistantWaitsForUserRef.current = false;
        setCurrentMessage('');
        setCurrentUserMessage('');
        stopLocalMicObserver();

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        startTimeRef.current = null;
    }, [stopLocalMicObserver]);

    // Set up Vapi event listeners
    useEffect(() => {
        const handlers = {
            'call-start': () => {
                initializeActiveCallRuntime(assistantWaitsForUserRef.current);
                injectPendingResumeContext();
            },

            'call-start-success': () => {
                initializeActiveCallRuntime(assistantWaitsForUserRef.current);
                injectPendingResumeContext();
            },

            'call-start-failed': (event: unknown) => {
                console.error('Vapi call failed to start:', event);
                setStatus('idle');
                resetActiveRuntime();

                if (sessionIdRef.current) {
                    endVoiceSession(sessionIdRef.current, 0).catch((err: unknown) =>
                        console.error('Failed to end voice session after start failure:', err),
                    );
                    sessionIdRef.current = null;
                }

                setLimitError('Unable to initialize voice session. Please try again.');
            },

            'call-end': () => {
                // Don't reset isStoppingRef here - delayed events may still fire
                setStatus('idle');
                backfillConversationFromLocalSnapshot();
                resetActiveRuntime();

                // End session tracking
                if (sessionIdRef.current) {
                    endVoiceSession(sessionIdRef.current, durationRef.current).catch((err: unknown) =>
                        console.error('Failed to end voice session:', err),
                    );
                    sessionIdRef.current = null;
                }
            },

            'speech-start': () => {
                if (!isStoppingRef.current) {
                    setStatus('speaking');
                }
            },
            'speech-end': () => {
                if (!isStoppingRef.current) {
                    // After AI finishes speaking, user can talk
                    setStatus('listening');
                }
            },

            message: (message: unknown) => {
                if (!isTranscriptMessage(message)) return;

                // User finished speaking → AI is thinking
                if (message.role === 'user' && message.transcriptType === 'final') {
                    if (!isStoppingRef.current) {
                        setStatus('thinking');
                    }
                    setCurrentUserMessage('');
                }

                // Partial user transcript → show real-time typing
                if (message.role === 'user' && message.transcriptType === 'partial') {
                    setCurrentUserMessage(message.transcript);
                    return;
                }

                // Partial AI transcript → show word-by-word
                if (message.role === 'assistant' && message.transcriptType === 'partial') {
                    setCurrentMessage(message.transcript);
                    return;
                }

                // Final transcript → add to messages
                if (message.transcriptType === 'final') {
                    if (message.role === 'assistant') setCurrentMessage('');
                    if (message.role === 'user') setCurrentUserMessage('');

                    appendFinalMessage(message.role, message.transcript);
                }
            },

            error: (error: unknown) => {
                const errorMessage = extractVapiErrorMessage(error).trim();
                const normalizedErrorMessage = errorMessage.toLowerCase();
                const isExpectedTermination = isExpectedVapiTerminationMessage(normalizedErrorMessage);

                if (!isStoppingRef.current) {
                    if (isExpectedTermination && errorMessage) {
                        console.info('Vapi session ended:', errorMessage);
                    } else if (errorMessage) {
                        console.error('Vapi error:', errorMessage);
                    } else {
                        console.warn('Vapi emitted an empty error payload.');
                    }
                }

                // Don't reset isStoppingRef here - delayed events may still fire
                setStatus('idle');
                resetActiveRuntime();

                // Ensure Vapi internal state is reset after Daily ejection/meeting-ended errors.
                void stopVapiSafely('error handler reset');

                backfillConversationFromLocalSnapshot();

                // End session tracking on error
                if (sessionIdRef.current) {
                    endVoiceSession(sessionIdRef.current, durationRef.current).catch((err: unknown) =>
                        console.error('Failed to end voice session on error:', err),
                    );
                    sessionIdRef.current = null;
                }

                if (isStoppingRef.current) {
                    return;
                }

                // Show user-friendly error message
                if (normalizedErrorMessage.includes('timeout') || normalizedErrorMessage.includes('silence')) {
                    setLimitError('Session ended due to inactivity. Click the mic to start again.');
                } else if (normalizedErrorMessage.includes('network') || normalizedErrorMessage.includes('connection')) {
                    setLimitError('Connection lost. Please check your internet and try again.');
                } else if (isExpectedTermination) {
                    setLimitError('Session ended by the meeting host. Click the mic to reconnect.');
                } else {
                    setLimitError('Session ended unexpectedly. Click the mic to start again.');
                }
            },
        };

        // Register all handlers
        Object.entries(handlers).forEach(([event, handler]) => {
            getVapi().on(event as keyof typeof handlers, handler as () => void);
        });

        return () => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            const finalDuration = durationRef.current;

            // End active session on unmount
            if (sessionIdRef.current) {
                void stopVapiSafely('unmount cleanup');
                endVoiceSession(sessionIdRef.current, finalDuration).catch((err: unknown) =>
                    console.error('Failed to end voice session on unmount:', err),
                );
                sessionIdRef.current = null;
            }

            resetActiveRuntime();

            // Cleanup handlers
            Object.entries(handlers).forEach(([event, handler]) => {
                getVapi().off(event as keyof typeof handlers, handler as () => void);
            });
        };
    }, [
        backfillConversationFromLocalSnapshot,
        durationRef,
        appendFinalMessage,
        injectPendingResumeContext,
        initializeActiveCallRuntime,
        resetActiveRuntime,
        stopVapiSafely,
    ]);

    const start = useCallback(async () => {
        if (!userId) {
            setLimitError('Please sign in to start a voice session.');
            return;
        }

        setLimitError(null);
        setIsBillingError(false);

        const hasMicPermission = await ensureMicrophonePermission();
        if (!hasMicPermission) {
            setStatus('idle');
            return;
        }

        sessionInitializedRef.current = false;
        assistantWaitsForUserRef.current = false;
        pendingResumeHistoryRef.current = null;
        hasInjectedResumeContextRef.current = false;
        setStatus('connecting');

        try {
            // Reset stale SDK state before creating a fresh call.
            await stopVapiSafely('start preflight reset');

            const localHistory = loadConversationFromLocal();
            const inMemoryHistory = normalizeConversationHistory(messagesRef.current);
            const localAndInMemoryHistory = mergeConversationHistory(localHistory, inMemoryHistory);
            const [historyResult, memoryResult] = await Promise.all([
                getBookConversationHistory(book._id, CONTEXT_MESSAGE_LIMIT),
                getBookConversationMemoryContext(book._id, MEMORY_SUMMARY_LIMIT),
            ]);
            const serverHistory = historyResult.success
                ? normalizeConversationHistory(historyResult.data ?? [])
                : [];
            const memoryContext = memoryResult.success
                ? memoryResult.memoryContext
                : FIRST_CONVERSATION_MEMORY_CONTEXT;
            const hasMemoryContext = memoryResult.success
                ? memoryResult.hasMemory
                : false;

            if (!memoryResult.success) {
                console.error('Failed to load conversation memory context:', memoryResult.error);
            }

            const conversationHistory = historyResult.success
                ? mergeConversationHistory(serverHistory, localAndInMemoryHistory)
                : localAndInMemoryHistory;

            if (process.env.NODE_ENV !== 'production') {
                console.info('Vapi resume history snapshot:', {
                    server: serverHistory.length,
                    local: localHistory.length,
                    inMemory: inMemoryHistory.length,
                    merged: conversationHistory.length,
                    memorySummaries: memoryResult.success ? memoryResult.summaries.length : 0,
                });
            }

            syncConversationState(conversationHistory);

            if (historyResult.success && conversationHistory.length > serverHistory.length) {
                replaceBookConversationHistory(book._id, conversationHistory).then((writeResult) => {
                    if (!writeResult.success) {
                        console.error('Failed to sync local conversation history before start:', writeResult.error);
                    }
                });
            }

            const assistantWaitsForUser = conversationHistory.length > 0 || hasMemoryContext;
            assistantWaitsForUserRef.current = assistantWaitsForUser;
            pendingResumeHistoryRef.current = assistantWaitsForUser ? conversationHistory : null;
            hasInjectedResumeContextRef.current = false;

            // Check session limits and create session record
            const result = await startVoiceSession(userId, book._id);

            if (!result.success) {
                setLimitError(result.error || 'Session limit reached. Please upgrade your plan.');
                setIsBillingError(!!result.isBillingError);
                setStatus('idle');
                return;
            }

            sessionIdRef.current = result.sessionId || null;
            // Note: Server-returned maxDurationMinutes is informational only
            // The actual limit is enforced by useLatestRef(limits.maxSessionMinutes * 60)

            const firstMessage = assistantWaitsForUser
                ? ''
                : `Hey, good to meet you. Quick question before we dive in - have you actually read ${book.title} yet, or are we starting fresh?`;

            const webCall = await getVapi().start(ASSISTANT_ID, {
                firstMessage,
                firstMessageMode: assistantWaitsForUser
                    ? 'assistant-waits-for-user'
                    : 'assistant-speaks-first',
                variableValues: {
                    title: book.title,
                    author: book.author,
                    bookId: book._id,
                    userIdentifier: userId,
                    MEMORY_CONTEXT: memoryContext,
                },
                voice: {
                    provider: '11labs' as const,
                    voiceId: getVoice(voice).id,
                    model: 'eleven_turbo_v2_5' as const,
                    stability: VOICE_SETTINGS.stability,
                    similarityBoost: VOICE_SETTINGS.similarityBoost,
                    style: VOICE_SETTINGS.style,
                    useSpeakerBoost: VOICE_SETTINGS.useSpeakerBoost,
                },
            });

            if (!webCall) {
                if (sessionIdRef.current) {
                    endVoiceSession(sessionIdRef.current, 0).catch((sessionError: unknown) => {
                        console.error('Failed to close voice session after start failure:', sessionError);
                    });
                    sessionIdRef.current = null;
                }

                setStatus('idle');
                setLimitError('Unable to connect to voice session. Please try again.');
                return;
            }

            initializeActiveCallRuntime(assistantWaitsForUser);

            injectPendingResumeContext();
        } catch (err) {
            console.error('Failed to start call:', err);

            if (sessionIdRef.current) {
                endVoiceSession(sessionIdRef.current, 0).catch((sessionError: unknown) => {
                    console.error('Failed to close voice session after exception:', sessionError);
                });
                sessionIdRef.current = null;
            }

            setStatus('idle');
            setLimitError('Failed to start voice session. Please try again.');
        }
    }, [
        book._id,
        book.title,
        book.author,
        voice,
        userId,
        ensureMicrophonePermission,
        initializeActiveCallRuntime,
        injectPendingResumeContext,
        loadConversationFromLocal,
        messagesRef,
        stopVapiSafely,
        syncConversationState,
    ]);

    const stop = useCallback(() => {
        isStoppingRef.current = true;
        stopLocalMicObserver();
        void stopVapiSafely('manual stop');
    }, [stopLocalMicObserver, stopVapiSafely]);

    const clearSession = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
        setIsClearingSession(true);

        try {
            setLimitError(null);
            setIsBillingError(false);

            const activeSessionId = sessionIdRef.current;
            sessionIdRef.current = null;

            isStoppingRef.current = true;
            await stopVapiSafely('clear session');

            resetActiveRuntime();
            setStatus('idle');
            setDuration(0);

            if (activeSessionId) {
                await endVoiceSession(activeSessionId, durationRef.current).catch((err: unknown) =>
                    console.error('Failed to end active voice session while clearing:', err),
                );
            }

            const result = await clearBookSessionData(book._id);

            if (!result.success) {
                return { success: false, error: result.error || 'Failed to clear session data.' };
            }

            syncConversationState([]);

            return { success: true };
        } catch (error) {
            console.error('Failed to clear session data:', error);
            return { success: false, error: 'Failed to clear session data.' };
        } finally {
            setIsClearingSession(false);
        }
    }, [book._id, durationRef, resetActiveRuntime, stopVapiSafely, syncConversationState]);

    const clearError = useCallback(() => {
        setLimitError(null);
        setIsBillingError(false);
    }, []);

    const isActive =
        status === 'starting' ||
        status === 'listening' ||
        status === 'thinking' ||
        status === 'speaking';

    // Calculate remaining time and warning state for UI hooks consumers
    const remainingSeconds = Math.max(0, maxDurationSeconds - duration);
    const showTimeWarning =
        isActive && remainingSeconds <= TIME_WARNING_THRESHOLD && remainingSeconds > 0;

    return {
        status,
        isActive,
        messages,
        currentMessage,
        currentUserMessage,
        duration,
        micLevel,
        start,
        stop,
        clearSession,
        isClearingSession,
        limitError,
        isBillingError,
        maxDurationSeconds,
        remainingSeconds,
        showTimeWarning,
        clearError,
    };
}

export default useVapi;