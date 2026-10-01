import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils.ts';

const markVariants = cva('shrink-0', {
  variants: { size: { sm: 'size-6', md: 'size-8', lg: 'size-10' } },
  defaultVariants: { size: 'md' },
});

const wordmarkVariants = cva('font-heading font-semibold tracking-tight', {
  variants: { size: { sm: 'text-base', md: 'text-lg', lg: 'text-xl' } },
  defaultVariants: { size: 'md' },
});

export interface LogoProps extends VariantProps<typeof markVariants> {
  /** Brand name: the visible wordmark, or the accessible name of the mark on its own. */
  readonly name: string;
  readonly variant?: 'full' | 'mark';
  readonly className?: string;
}

/**
 * Placeholder brand mark (open question Q7: replaceable): a chevron pointing ahead with the amber
 * signal dot in front of it, "seeing the shortage before the ERP does". Colours come from tokens,
 * so it follows light and dark mode.
 */
function Mark({ className, label }: { readonly className: string; readonly label?: string }) {
  const named = label !== undefined;
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      {...(named ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M8 10l7 12 7-12"
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
      <circle cx="24.5" cy="22" r="3" className="fill-signal" />
    </svg>
  );
}

/** Vorchain logo: mark plus wordmark (`full`) or the mark alone (`mark`, e.g. for small spaces). */
export function Logo({ name, variant = 'full', size, className }: LogoProps) {
  if (variant === 'mark')
    return <Mark className={cn(markVariants({ size }), className)} label={name} />;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Mark className={markVariants({ size })} />
      <span className={wordmarkVariants({ size })}>{name}</span>
    </span>
  );
}
