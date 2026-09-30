/**
 * Funnel events of the demo. P1-26 connects them to cookieless analytics; until then this is only
 * the hook point. By design an event carries its name and nothing else: never file names, counts
 * or any other demo data (AGENTS.md §3, Analytics).
 */
export type DemoEvent = 'demo_completed';

export const trackDemoEvent: (event: DemoEvent) => void = () => {
  // Intentionally a no-op until P1-26 wires the analytics.
};
