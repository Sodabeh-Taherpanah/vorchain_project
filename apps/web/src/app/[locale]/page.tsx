import { ContactCtaSection } from '@/components/sections/contact-cta-section.tsx';
import { FaqSection } from '@/components/sections/faq-section.tsx';
import { Hero } from '@/components/sections/hero.tsx';
import { HowItWorksSection } from '@/components/sections/how-it-works-section.tsx';
import { PrivacySection } from '@/components/sections/privacy-section.tsx';
import { ProblemSection } from '@/components/sections/problem-section.tsx';

/** Landing page (spec §3): static Server Components only, so `/` ships no page-specific JS. */
export default function HomePage() {
  return (
    <>
      <Hero />
      <ProblemSection />
      <HowItWorksSection />
      <PrivacySection />
      <FaqSection />
      <ContactCtaSection />
    </>
  );
}
