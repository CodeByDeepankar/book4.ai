'use client';

import React from 'react';

import { voiceOptions } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { VoiceSelectorProps } from '@/types';

const VoiceSelector = ({ disabled, value, onChange, className }: VoiceSelectorProps) => {
  const selected = value ?? 'rachel';

  return (
    <div className={cn('voice-selector-options flex-col sm:flex-row', className)}>
      {Object.entries(voiceOptions).map(([voiceKey, voice]) => {
        const isSelected = selected === voiceKey;

        return (
          <button
            key={voiceKey}
            type="button"
            onClick={() => onChange(voiceKey)}
            disabled={disabled}
            className={cn(
              'voice-selector-option text-left',
              isSelected ? 'voice-selector-option-selected' : 'voice-selector-option-default',
              disabled && 'voice-selector-option-disabled'
            )}
          >
            <span className="text-lg font-semibold text-(--text-primary)">{voice.name}</span>
            <span className="text-sm text-(--text-secondary)">{voice.description}</span>
          </button>
        );
      })}
    </div>
  );
};

export default VoiceSelector;
