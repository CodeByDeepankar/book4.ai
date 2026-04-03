'use client';

import React, { type ChangeEvent, type DragEvent, useRef } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ImageUp, Upload, X, type LucideIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';

import LoadingOverlay from '@/components/LoadingOverlay';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ACCEPTED_IMAGE_TYPES, DEFAULT_VOICE, voiceOptions } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { UploadSchema, type UploadFormValues } from '@/lib/zod';

type VoiceKey = keyof typeof voiceOptions;

const VOICE_GROUPS: Array<{ label: string; voices: VoiceKey[] }> = [
  { label: 'Male Voices', voices: ['dave', 'daniel', 'chris'] },
  { label: 'Female Voices', voices: ['rachel', 'sarah'] },
];

type UploadDropzoneProps = {
  accept: string;
  disabled?: boolean;
  file?: File;
  hint: string;
  icon: LucideIcon;
  placeholder: string;
  onBlur: () => void;
  onFileChange: (file?: File) => void;
};

function UploadDropzone({
  accept,
  disabled,
  file,
  hint,
  icon: Icon,
  placeholder,
  onBlur,
  onFileChange,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    onFileChange(selected);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (disabled) {
      return;
    }

    const droppedFile = event.dataTransfer.files?.[0];

    if (!droppedFile) {
      return;
    }

    onFileChange(droppedFile);
    onBlur();
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleRemove = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    onFileChange(undefined);

    if (inputRef.current) {
      inputRef.current.value = '';
    }

    onBlur();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={openPicker}
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={cn(
        'upload-dropzone border-2 border-dashed border-[rgba(33,42,59,0.2)]',
        file && 'upload-dropzone-uploaded',
        disabled && 'cursor-not-allowed opacity-60'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onBlur={onBlur}
        onChange={handleInputChange}
      />

      {file ? (
        <div className="flex items-center gap-2 px-4 max-w-full">
          <p className="upload-dropzone-text truncate max-w-125">{file.name}</p>
          <button
            type="button"
            onClick={handleRemove}
            className="upload-dropzone-remove shrink-0"
            aria-label="Remove selected file"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <>
          <Icon className="upload-dropzone-icon" />
          <p className="upload-dropzone-text">{placeholder}</p>
        </>
      )}

      <p className="upload-dropzone-hint">{hint}</p>
    </div>
  );
}

function UploadForm() {
  const form = useForm<UploadFormValues>({
    resolver: zodResolver(UploadSchema),
    defaultValues: {
      pdfFile: undefined,
      coverImage: undefined,
      title: '',
      author: '',
      voice: DEFAULT_VOICE,
    },
  });

  const onSubmit = async (values: UploadFormValues) => {
    void values;

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1200);
    });
  };

  const isSubmitting = form.formState.isSubmitting;

  return (
    <>
      {isSubmitting ? <LoadingOverlay /> : null}

      <div className="new-book-wrapper">
        <p className="text-sm text-[#6f665c]">5 of 10 books used (Upgrade)</p>

        <Form {...form}>
          <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="pdfFile"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="form-label">Book PDF File</FormLabel>
                  <FormControl>
                    <UploadDropzone
                      accept="application/pdf"
                      disabled={isSubmitting}
                      file={field.value}
                      icon={Upload}
                      placeholder="Click to upload PDF"
                      hint="PDF file (max 50MB)"
                      onBlur={field.onBlur}
                      onFileChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="coverImage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="form-label">Cover Image (Optional)</FormLabel>
                  <FormControl>
                    <UploadDropzone
                      accept={ACCEPTED_IMAGE_TYPES.join(',')}
                      disabled={isSubmitting}
                      file={field.value}
                      icon={ImageUp}
                      placeholder="Click to upload cover image"
                      hint="Leave empty to auto-generate from PDF"
                      onBlur={field.onBlur}
                      onFileChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="form-label">Title</FormLabel>
                  <FormControl>
                    <input
                      {...field}
                      type="text"
                      className="form-input"
                      placeholder="ex: Rich Dad Poor Dad"
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="author"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="form-label">Author Name</FormLabel>
                  <FormControl>
                    <input
                      {...field}
                      type="text"
                      className="form-input"
                      placeholder="ex: Robert Kiyosaki"
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="voice"
              render={({ field }) => (
                <FormItem className="space-y-4">
                  <FormLabel className="form-label">Choose Assistant Voice</FormLabel>
                  <FormControl>
                    <div className="space-y-4">
                      {VOICE_GROUPS.map((group) => (
                        <div key={group.label} className="space-y-2">
                          <p className="text-sm text-[#6f665c]">{group.label}</p>

                          <div className="voice-selector-options flex-col sm:flex-row">
                            {group.voices.map((voiceKey) => {
                              const voice = voiceOptions[voiceKey];
                              const isSelected = field.value === voiceKey;

                              return (
                                <label
                                  key={voiceKey}
                                  className={cn(
                                    'voice-selector-option',
                                    isSelected
                                      ? 'voice-selector-option-selected'
                                      : 'voice-selector-option-default',
                                    isSubmitting && 'voice-selector-option-disabled'
                                  )}
                                >
                                  <input
                                    type="radio"
                                    className="sr-only"
                                    name={field.name}
                                    value={voiceKey}
                                    checked={isSelected}
                                    disabled={isSubmitting}
                                    onBlur={field.onBlur}
                                    onChange={() => field.onChange(voiceKey)}
                                  />

                                  <span
                                    className={cn(
                                      'size-4 rounded-full border border-[#8B7355] flex items-center justify-center shrink-0',
                                      isSelected && 'border-[#663820]'
                                    )}
                                    aria-hidden="true"
                                  >
                                    {isSelected ? (
                                      <span className="size-2 rounded-full bg-[#663820]" />
                                    ) : null}
                                  </span>

                                  <span className="text-left">
                                    <span className="block text-base font-semibold text-black">
                                      {voice.name}
                                    </span>
                                    <span className="block text-xs text-[#6f665c]">
                                      {voice.description}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <button type="submit" className="form-btn" disabled={isSubmitting}>
              Begin Synthesis
            </button>
          </form>
        </Form>
      </div>
    </>
  );
}

export default UploadForm;