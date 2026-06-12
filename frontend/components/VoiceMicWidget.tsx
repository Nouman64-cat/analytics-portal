"use client";

import React from 'react';
import { useVoiceContext } from 'react-voice-action-router';
import { Mic, MicOff, Loader2 } from 'lucide-react';

export default function VoiceMicWidget() {
  const { isListening, isProcessing, startListening, stopListening, error } = useVoiceContext();

  return (
    <div className="fixed bottom-24 right-6 z-50 flex flex-col items-end gap-2">
      {error && (
        <div className="bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/20 max-w-[200px] text-right">
          {error}
        </div>
      )}
      <button
        onClick={isListening ? stopListening : startListening}
        className={`relative flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all duration-300 ${
          isListening
            ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/30'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30 dark:bg-indigo-500 dark:hover:bg-indigo-600'
        }`}
        title={isListening ? "Stop listening" : "Start listening"}
      >
        {isListening && (
          <span className="absolute w-full h-full rounded-full animate-ping bg-rose-400 opacity-50"></span>
        )}
        
        {isProcessing ? (
          <Loader2 className="w-6 h-6 animate-spin relative z-10" />
        ) : isListening ? (
          <Mic className="w-6 h-6 relative z-10" />
        ) : (
          <MicOff className="w-6 h-6 relative z-10" />
        )}
      </button>
    </div>
  );
}
