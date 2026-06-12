"use client";

import React from 'react';
import { useVoiceContext } from 'react-voice-action-router';
import { Mic, MicOff, Loader2 } from 'lucide-react';

export default function VoiceMicWidget() {
  const { isListening, isProcessing, startListening, stopListening, error } = useVoiceContext();

  return (
    <div className="flex items-center gap-2">
      {error && (
        <div className="hidden md:block bg-red-500/10 text-red-500 px-3 py-1 rounded-lg text-xs font-medium border border-red-500/20 max-w-[150px] text-right truncate" title={error}>
          Error
        </div>
      )}
      <button
        onClick={isListening ? stopListening : startListening}
        className={`relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 ${
          isListening
            ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/30'
            : 'bg-indigo-50 dark:bg-white/[0.05] text-indigo-500 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-white/[0.1] border border-indigo-200 dark:border-white/10'
        }`}
        title={isListening ? "Stop listening" : "Start listening"}
      >
        {isListening && (
          <span className="absolute w-full h-full rounded-xl animate-ping bg-rose-400 opacity-50"></span>
        )}
        
        {isProcessing ? (
          <Loader2 className="w-4 h-4 animate-spin relative z-10" />
        ) : isListening ? (
          <Mic className="w-4 h-4 relative z-10" />
        ) : (
          <MicOff className="w-4 h-4 relative z-10" />
        )}
      </button>
    </div>
  );
}
