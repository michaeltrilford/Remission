# Remission

Remission is a discovery telescope for cancer research.

It consolidates public biomedical source material into model-generated research directions for exploration and review.

Remission is a research-support tool. It is not a diagnostic system, treatment recommendation engine, or clinical decision tool.

## Positioning

- CLI-first research instrument
- discovery-oriented, not diagnostic
- designed for public-source and BYO data workflows
- built to help users explore, inspect, and compare possible research directions
- grounded in source material, not positioned as medical advice or validated conclusions

## Quick Start

Set up a local `.env` file in the repo root:

```env
# Local secrets only. Do not commit.
OPENROUTER_API_KEY=sk-...
REMISSION_REVIEW_APP_URL=https://remission-sigma.vercel.app
# Optional. Enables NZ Legislation source retrieval.
NZ_LEGISLATION_API_KEY=nzlapi-...
```

Never commit `.env` to GitHub. Keep API keys local only.

Then launch:

```bash
npm run start
```

## Notes

- supports local `.env` usage by default
- also supports passing a user-provided API key at runtime
- includes a guided terminal experience for topic selection and path exploration
- optionally adds Ministry of Health legislation search results when `NZ_LEGISLATION_API_KEY` is set

## Source Material

Remission is intended to work with public or research-accessible biomedical sources that are appropriate for review and research workflows.

Suggested sources:

- [PubMed](https://pubmed.ncbi.nlm.nih.gov/about/)
- [Open Targets](https://platform.opentargets.org/)
- [Reactome](https://reactome.org/)
- [ClinicalTrials.gov](https://clinicaltrials.gov/data-api/about-api)
- [cBioPortal](https://www.cbioportal.org/)
- [GDC / TCGA](https://portal.gdc.cancer.gov/)
- [DepMap](https://depmap.org/portal/)
- [Human Protein Atlas](https://www.proteinatlas.org/humanproteome/cancer)

Use only source material whose terms, licensing, and access conditions fit your intended use.

## Safe Framing

Preferred description:

`Remission consolidates public biomedical source material into model-generated research directions to support cancer research exploration.`

Avoid stronger claims such as:

- finding cures
- making treatment recommendations
- validating hypotheses
- diagnosing disease
- producing clinical guidance

## Reference

- [NCI Cancer Types](https://www.cancer.gov/types)
