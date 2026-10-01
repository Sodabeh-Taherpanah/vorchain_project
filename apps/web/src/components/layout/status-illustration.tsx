import { cn } from '@vorchain/ui/lib/utils';

export type StatusIllustrationKind = 'not-found' | 'error';

/**
 * Decorative inline SVG for the 404 and error pages: the product's projection chart with its line
 * cut off ("no data here"). Colours are tokens only, so it follows light and dark mode. It carries
 * no information beyond the page text, therefore it is hidden from assistive technology.
 */
export function StatusIllustration({
  kind,
  className,
}: {
  readonly kind: StatusIllustrationKind;
  readonly className?: string;
}) {
  return (
    <svg
      viewBox="0 0 240 160"
      aria-hidden="true"
      focusable="false"
      className={cn('h-auto w-full max-w-xs', className)}
    >
      <rect x="1" y="1" width="238" height="158" rx="12" className="fill-card stroke-border" />
      <g className="stroke-border" strokeWidth="1">
        <line x1="24" y1="120" x2="216" y2="120" />
        <line x1="24" y1="80" x2="216" y2="80" strokeDasharray="3 5" />
        <line x1="24" y1="40" x2="216" y2="40" strokeDasharray="3 5" />
      </g>
      <polyline
        points="24,100 64,88 104,94 140,62"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-chart-1"
      />
      <polyline
        points="156,58 216,34"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 8"
        className="stroke-muted-foreground"
      />
      {kind === 'not-found' ? (
        <circle cx="146" cy="60" r="6" strokeWidth="3" className="fill-card stroke-foreground" />
      ) : (
        <g className="stroke-critical" strokeWidth="3" strokeLinecap="round">
          <line x1="140" y1="54" x2="152" y2="66" />
          <line x1="152" y1="54" x2="140" y2="66" />
        </g>
      )}
    </svg>
  );
}
