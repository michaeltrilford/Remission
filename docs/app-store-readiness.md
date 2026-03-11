# Remission App Store Readiness

## Current Status

Remission is not App Store ready in its current form.

Reasons:

- the product is currently CLI-first,
- there is no native macOS or iOS application shell,
- there are no App Store assets yet,
- there is no privacy policy or App Store privacy disclosure package,
- there is no onboarding flow for non-technical users,
- and current positioning is still research-tool oriented rather than consumer-app polished.

## Positioning Draft

### Product Name

Remission

### One-Line Description

A discovery telescope for cancer research that helps users explore and rank overlooked intervention paths.

### App Store Framing

Remission is a research exploration tool, not a diagnostic or treatment application. It helps users investigate public and bring-your-own biomedical context through a guided interface designed for discovery, inspection, and branching analysis.

## Initial Metadata Draft

### App Name

Remission

### Subtitle

Discovery telescope for cancer research

### Keywords

cancer research, biomedical discovery, disease pathways, intervention explorer, hypothesis ranking, research tool

### Promotional Text

Explore overlooked cancer intervention paths through a guided discovery interface built for signal detection, branching analysis, and rapid research iteration.

### Short Description

Remission helps users explore, inspect, and rank non-obvious cancer research paths from biomedical context.

## Required Before Submission

### Product

- Build a native app shell for macOS, iOS, or both
- Replace or wrap the CLI with a polished graphical interface
- Add onboarding for first-time users
- Add save/load history and recent sessions
- Add proper error states and recovery UX

### Compliance

- Publish a privacy policy
- Define whether user data is stored, transmitted, or shared
- Define how API keys are handled
- Remove any language that implies diagnosis, treatment, or cure claims
- Review against App Store Review Guidelines

### Quality

- Reduce crashes to production-grade levels
- Improve launch time and responsiveness
- Add usage analytics if desired
- Test across supported device sizes and system versions

### Assets

- App icon
- Screenshots
- Preview video
- Marketing copy
- Support URL
- Privacy policy URL

## Suggested App Store Direction

### Best Platform First

macOS first

Reason:

- Remission already behaves like a terminal-native research instrument
- a desktop workflow matches the product’s current depth and interaction model
- macOS is a more natural bridge from CLI to App Store than iPhone first

### UI Direction

- retro scientific instrument
- disease signal scanner
- bio-research telescope console
- not generic hacker terminal styling

## Proposed First Screenshot Set

- Home screen with topic selection and discovery prompt
- Evidence scan view with public-source grounding
- Ranked path explorer with branching options
- Detailed path inspection with evidence references and projected delta view
- History or session archive view

## Risks

- Apple may scrutinize medical or health-related claims
- an LLM-driven experience without strong disclaimers can trigger review concerns
- the current CLI UX is not enough for App Store distribution
- private API key workflows must be clearly explained and safely handled

## Recommended Near-Term Path

1. Keep the current CLI as the research engine.
2. Build a thin macOS app wrapper around the discovery flow.
3. Keep the product framed as a research/discovery tool.
4. Prepare privacy, support, and product assets before submission.
