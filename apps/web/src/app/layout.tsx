import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Placeholder metadata; per-locale metadata arrives with next-intl in P1-12 and SEO in P1-23.
export const metadata: Metadata = {
  title: 'Vorchain',
  description: 'Materialengpässe erkennen, die Ihr ERP nicht zeigt.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
