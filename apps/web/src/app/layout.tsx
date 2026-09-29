import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Placeholder metadata; per-locale metadata arrives with next-intl in P1-12 and SEO in P1-23.
export const metadata: Metadata = {
  title: 'Vorchain',
  description: 'Materialengpässe erkennen, die Ihr ERP nicht zeigt.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Browser extensions (Grammarly, password managers, dark-mode tools) add attributes to <html> and
  // <body> before hydration. suppressHydrationWarning only covers these two elements' own
  // attributes, so real mismatches in the page content still surface.
  return (
    <html lang="de" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
