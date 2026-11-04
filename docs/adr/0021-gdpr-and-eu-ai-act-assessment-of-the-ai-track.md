# 0021. GDPR and EU AI Act assessment of the AI track

- Status: proposed (engineering assessment, not legal advice; a lawyer confirms before launch)
- Date: 2026-11-05
- Deciders: Sodabeh Taherpanah

## Context and problem
The AI track (ADR-0014 to 0018) sends derived facts to a model the visitor picks, and may later
store data (ADR-0019). We need a written position on risk class, transparency duties, data
transfers and DPA needs, so the privacy text and the UI say the right things.

## Assessment
| Topic | Position | Basis in the code |
|---|---|---|
| **AI Act risk class** | Not high-risk: it advises on material shortages and is not in the Annex III areas (employment, essential services, law enforcement and so on). Treated as limited risk (transparency only). Re-check if scoring of people or supplier blacklisting is ever added. | No automated decision; a person approves every draft (ADR-0017) |
| **Transparency (Art. 50)** | Duties for AI interaction and AI-generated text have applied since 2 Aug 2026; the Omnibus (Reg. (EU) 2026/1744) delayed high-risk rules, and Art. 50(2) marking only for systems already on the market. The panel is headed "AI explanation", states "AI is on" with the provider host and adds a "reading aid" disclaimer; there are no drafts in the web app. Whether we count as provider or deployer for Art. 50(2) is open for the lawyer. | `ai-explain-panel.tsx`, consent step |
| **AI literacy (Art. 4)** | Not covered in the UI yet; the consent text explains what is sent but not model limits. Follow-up below. | ADR-0018 |
| **GDPR role, Phase 1** | The visitor's browser sends facts straight to the chosen provider; Vorchain is not in the data path and processes nothing. The visitor (their company) is the controller towards the provider. | `gateway.ts`, `demo-ai.spec.ts` |
| **Personal data in the facts** | Material and supplier names are mostly company data, but a sole trader's name is personal data. Mitigated by opt-in consent (Art. 6(1)(a)), data minimisation, `maskPii` (ADR-0015), one short line per field. | `explanation-facts.ts`, T4, T17 |
| **Transfers** | A provider outside the EU needs a Chapter V basis (adequacy such as the DPF, or SCCs) on the provider's side. The consent names the host so the visitor sees it. Local and EU-hosted providers are preferred (ADR-0020). | T13 |
| **DPA (AVV) needs** | Phase 1: Hetzner and Brevo (ADR-0006, 0007). AI provider: none for Vorchain; the visitor needs their own agreement if they send business data. Phase 2: DPA with the database host and every sub-processor; records of processing (Art. 30); a DPIA is decided when stored customer data starts. | ADR-0019 |
| **Automated decisions (Art. 22)** | None: advice only, human decides | ADR-0017 |

## Decision
Keep the design as is: AI off by default, explicit consent, remote provider as a separate choice,
no storage. Add: provider hosts and the Phase 2 processors to the Datenschutzerklärung (P1-24),
a lawyer review of this table before launch, and a one-line limits note ("can be wrong") in the consent step. The note is a small follow-up task, not part of this ADR.

## Consequences
- Positive: one place that states what is claimed and where the code enforces it.
- Negative / risks: AI Act dates and role definitions were taken from law-firm summaries (checked
  2026-11-05), not the Official Journal text; verify. Names may be personal data despite the
  filters (T4 residual risk).
- Follow-ups: limits note in the AI consent step (de, en); lawyer review; Datenschutz page (P1-24); DPIA decision with ADR-0019.

## References
- Regulation (EU) 2024/1689 (AI Act), Art. 4, 50, Annex III; Regulation (EU) 2026/1744 (Digital Omnibus on AI); GDPR Art. 6, 22, 28, 30, 35, Chapter V
- ADR-0003, 0006, 0014 to 0020; `docs/architecture/threat-model.md`
