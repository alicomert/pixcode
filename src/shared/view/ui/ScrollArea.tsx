import * as React from 'react';

import { cn } from '../../../lib/utils';

type ScrollAreaProps = React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Classes applied to the inner scrollable element. Use this for padding
   * around content instead of putting padding on the outer wrapper —
   * otherwise the scrollbar ends up inset from the right edge because the
   * overflow-hidden outer is what gets shrunk, not the inner scroll track.
   */
  contentClassName?: string;
};

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, contentClassName, children, ...props }, ref) => (
    <div className={cn('relative overflow-hidden', className)} {...props}>
      {/*
        Inner container is the actual scroll viewport. Padding belongs here
        so the native scrollbar can sit flush against the wrapper's right
        edge while content keeps breathing room.
      */}
      <div
        ref={ref}
        className={cn(
          'h-full w-full overflow-auto rounded-[inherit]',
          contentClassName,
        )}
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
);

ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
