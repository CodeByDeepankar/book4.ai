import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-12 w-full rounded-lg border border-(--border-subtle) bg-white px-4 py-3 text-lg shadow-soft-sm transition-all outline-none placeholder:text-[#999] focus-visible:border-(--accent-warm) focus-visible:ring-2 focus-visible:ring-(--accent-warm)/20 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}

export { Input };
