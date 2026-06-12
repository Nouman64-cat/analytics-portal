"use client";

import React from 'react';
import { VoiceControlProvider, createOpenAIAdapter } from 'react-voice-action-router';

export default function VoiceAppProvider({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("NEXT_PUBLIC_OPENAI_API_KEY is not defined. Voice routing will fail.");
  }

  // We only initialize the adapter once
  const adapter = React.useMemo(() => {
    return createOpenAIAdapter({ apiKey: apiKey || "" });
  }, [apiKey]);

  return (
    <VoiceControlProvider adapter={adapter}>
      {children}
    </VoiceControlProvider>
  );
}
