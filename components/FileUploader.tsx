'use client';

import React from 'react';
import { X } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import { BookUploadFormValues, FileUploadFieldProps } from '@/types';

type UploadFieldName = 'pdfFile' | 'coverImage';

type Props = Omit<FileUploadFieldProps<BookUploadFormValues>, 'name'> & {
  name: UploadFieldName;
};

const FileUploader = ({
  control,
  name,
  label,
  acceptTypes,
  disabled,
  icon: Icon,
  placeholder,
  hint,
}: Props) => {
  const inputId = React.useId();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selectedFile = field.value as File | undefined;

        const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
          const file = event.target.files?.[0];
          field.onChange(file ?? undefined);
        };

        const handleRemove = (event: React.MouseEvent<HTMLButtonElement>) => {
          event.preventDefault();
          event.stopPropagation();
          field.onChange(undefined);
        };

        return (
          <FormItem>
            <FormLabel className="form-label">{label}</FormLabel>
            <FormControl>
              <div
                className={cn(
                  'upload-dropzone relative border border-(--border-subtle)',
                  selectedFile && 'upload-dropzone-uploaded',
                  disabled && 'pointer-events-none opacity-60'
                )}
              >
                <label htmlFor={inputId} className="file-upload-shadow h-full w-full cursor-pointer">
                  <Icon className="upload-dropzone-icon" />
                  <p className="upload-dropzone-text">{selectedFile?.name ?? placeholder}</p>
                  <p className="upload-dropzone-hint">{hint}</p>
                  <input
                    id={inputId}
                    type="file"
                    accept={acceptTypes.join(',')}
                    disabled={disabled}
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>

                {selectedFile && !disabled && (
                  <button
                    type="button"
                    className="upload-dropzone-remove absolute top-3 right-3"
                    onClick={handleRemove}
                    aria-label={`Remove ${label}`}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

export default FileUploader;
