'use client';

import {Loader2, Mic, MicOff, Trash2} from "lucide-react";
import useVapi from "@/hooks/useVapi";
import {IBook} from "@/types";
import Image from "next/image";
import Transcript from "./Transcript";
import {toast} from "sonner";

import {useRouter} from "next/navigation";
import {useEffect} from "react";

const VapiControls = ({ book }: { book: IBook }) => {
    const {
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
        clearError,
        limitError,
        isBillingError,
        maxDurationSeconds,
    } = useVapi(book)
    const router = useRouter();

    useEffect(() => {
        if (limitError) {
            toast.error(limitError);
            if (isBillingError) {
                router.push("/subscriptions");
            } else {
                router.push("/");
            }
            clearError();
        }
    }, [isBillingError, limitError, router, clearError]);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getStatusDisplay = () => {
        switch (status) {
            case 'connecting': return { label: 'Connecting...', color: 'vapi-status-dot-connecting' };
            case 'starting': return { label: 'Starting...', color: 'vapi-status-dot-connecting' };
            case 'listening': return { label: 'Listening', color: 'vapi-status-dot-listening' };
            case 'thinking': return { label: 'Thinking...', color: 'vapi-status-dot-thinking' };
            case 'speaking': return { label: 'Speaking', color: 'vapi-status-dot-speaking' };
            default: return { label: 'Ready', color: 'vapi-status-dot-ready' };
        }
    };

    const statusDisplay = getStatusDisplay();
    const isMicActive = isActive;
    const showMicPulse = isMicActive && (status === 'speaking' || status === 'thinking');
    const micLevelThresholds = [0.2, 0.4, 0.6, 0.8];
    const micLevelPercent = Math.round(micLevel * 100);

    const handleClearSession = async () => {
        const shouldClear = window.confirm(
            "Delete this book session history? This will remove saved chat and session data for this book.",
        );

        if (!shouldClear) return;

        const result = await clearSession();

        if (!result.success) {
            toast.error(result.error || "Failed to clear session data.");
            return;
        }

        toast.success("Session history cleared for this book.");
    };

    return (
        <>
            <div className="max-w-4xl mx-auto flex flex-col gap-8">
                {/* Header Card */}
                <div className="vapi-header-card">
                    <div className="vapi-cover-wrapper">
                        <Image
                            src={book.coverURL || "/images/book-placeholder.png"}
                            alt={book.title}
                            width={120}
                            height={180}
                            className="vapi-cover-image w-30! h-auto!"
                            priority
                        />
                        <div className="vapi-mic-wrapper relative">
                            {showMicPulse && <div className="vapi-pulse-ring" />}
                            <button
                                onClick={isMicActive ? stop : start}
                                disabled={status === 'connecting'}
                                className={`vapi-mic-btn shadow-md w-15! h-15! z-10 ${isMicActive ? 'vapi-mic-btn-active' : 'vapi-mic-btn-inactive'}`}
                                aria-pressed={isMicActive}
                                aria-label={isMicActive ? 'Stop voice session' : 'Start voice session'}
                            >
                                {isMicActive ? (
                                    <Mic className="size-7 text-[#212a3b]" />
                                ) : (
                                    <MicOff className="size-7 text-[#212a3b]" />
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 flex-1">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold font-serif text-[#212a3b] mb-1">
                                {book.title}
                            </h1>
                            <p className="text-[#3d485e] font-medium">by {book.author}</p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <div className="vapi-status-indicator">
                                <span className={`vapi-status-dot ${statusDisplay.color}`} />
                                <span className="vapi-status-text">{statusDisplay.label}</span>
                            </div>

                            <div className="vapi-status-indicator">
                                <span className="vapi-status-text">Voice: {book.persona || "Daniel"}</span>
                            </div>

                            <div className="vapi-status-indicator">
                                <span className="vapi-status-text">
                                    {formatDuration(duration)}/{formatDuration(maxDurationSeconds)}
                                </span>
                            </div>

                            <div className="vapi-status-indicator" aria-label={`Mic level ${micLevelPercent}%`}>
                                <span className="vapi-status-text">Mic</span>
                                <div className="flex items-end gap-0.5" aria-hidden="true">
                                    {micLevelThresholds.map((threshold, index) => (
                                        <span
                                            key={threshold}
                                            className={`w-1 rounded-sm transition-colors duration-150 ${index === 0 ? 'h-2' : index === 1 ? 'h-3' : index === 2 ? 'h-4' : 'h-5'} ${micLevel >= threshold ? 'bg-green-500' : 'bg-gray-300'}`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <button
                                onClick={handleClearSession}
                                disabled={isClearingSession || status === 'connecting'}
                                className="vapi-status-indicator border border-[#c9b89c] hover:bg-[#f6ead2] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                aria-label="Clear session history"
                            >
                                {isClearingSession ? (
                                    <Loader2 className="size-4 animate-spin text-[#7e4b2f]" />
                                ) : (
                                    <Trash2 className="size-4 text-[#7e4b2f]" />
                                )}
                                <span className="vapi-status-text">
                                    {isClearingSession ? 'Clearing...' : 'Clear Session'}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

            <div className="vapi-transcript-wrapper">
                <div className="transcript-container min-h-100">
                    <Transcript
                        messages={messages}
                        currentMessage={currentMessage}
                        currentUserMessage={currentUserMessage}
                    />
                </div>
            </div>
            </div>
        </>
    )
}
export default VapiControls