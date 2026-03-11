# Remission PRD

## 1. Product Overview

**Product name:** Remission

**Goal:** Build an AI-driven simulation platform that combines human creativity with autonomous agent execution to rapidly explore tumor mutations, growth behavior, diet or host-variable interventions, and potential cure pathways.

Remission starts as a CLI-first product for fast iteration and realtime simulation orchestration. A GUI follows once the core simulation loop, agent workflow, and collaboration patterns are stable.

## 2. Problem Statement

Cancer hypothesis generation and testing is slow, fragmented, and constrained by limited human bandwidth. Researchers and operators can generate creative intervention ideas, but they need a system that can:

- rapidly surface promising mutation or intervention hypotheses,
- autonomously run and rerun simulations,
- compare changes in growth rate, mutation behavior, and response patterns,
- keep a human in the loop for novel variable changes, and
- compress the cycle time from idea to simulated insight.

## 3. Vision

Create a human-agent copilot for cancer simulation research where:

- humans propose or curate bold hypotheses,
- agents execute structured simulation workflows at speed,
- both collaborate on iterative intervention design,
- and the system continuously ranks what looks most promising.

## 4. Product Principles

- Human creativity stays central; the agent accelerates execution, not replaces judgment.
- Hypothesis exploration should feel fast, lightweight, and iterative.
- Every simulation run must be traceable, comparable, and reproducible.
- The first product must optimize for speed of learning, not polished presentation.
- Collaboration cadence matters: regular human review should produce better next-round experiments.

## 5. Target Users

- Founder/operator driving rapid exploratory cancer simulation work
- Research collaborators contributing intervention ideas and review
- Technical users comfortable working in a CLI environment
- Future research teams needing a visual interface and experiment history

## 6. Core User Story

As a researcher/operator, I want to swipe through candidate tumor mutations or hypotheses, let an agent automatically run the relevant simulations, adjust diet and host variables based on emerging results, and quickly rerun experiments so I can identify promising cure directions faster.

## 7. MVP Scope

### In Scope

- CLI application for managing hypothesis intake, simulation runs, and result review
- Tinder-style review flow for 10 candidate hypotheses or mutations at a time
- Agent-driven simulation setup and execution
- Support for changing tumor, diet, and host variables between runs
- Realtime or near-realtime simulation feedback in the CLI
- Run comparison focused on growth, speed, and pattern shifts
- Lightweight collaboration notes for hourly review with you and Gork

### Out of Scope

- Full GUI in v1
- Multi-tenant team administration
- Deep lab-grade wet-lab integration in MVP
- Clinical decision support claims
- Production-scale security/compliance beyond what is needed for an early research tool

## 8. Primary Workflow

### Step 1: Hypothesis Intake

The system presents 10 candidate hypotheses, mutations, or intervention directions in a swipeable review flow.

User actions:

- swipe right to keep and queue for testing,
- swipe left to discard,
- request regeneration or refinement of a hypothesis,
- annotate why a hypothesis is interesting or weak.

### Step 2: Agent-Orchestrated Simulation

For selected hypotheses, the agent:

- configures simulation parameters,
- chooses the relevant model or sim template,
- runs the simulation,
- captures metrics and artifacts,
- summarizes notable growth or mutation behavior changes.

### Step 3: Human-in-the-Loop Tuning

The human can modify:

- diet variables,
- host/environment variables,
- tumor stressors,
- mutation assumptions,
- simulation duration or fidelity settings.

The user then reruns the simulation with updated parameters.

### Step 4: Comparison and Ranking

The system compares runs and answers:

- Did tumor growth slow down?
- Did mutation behavior change?
- Did intervention response improve or worsen?
- Which combinations deserve another round?

### Step 5: Collaboration Bounce

At least hourly, the system supports review with you and Gork for:

- unconventional intervention ideas,
- aggressive hypothesis reframing,
- fast prioritization of the next run set.

## 9. Functional Requirements

### Hypothesis Review

- Present 10 hypotheses per batch
- Support keep, reject, annotate, regenerate
- Record decision history
- Show source prompt or rationale for each hypothesis

### Simulation Orchestration

- Start simulations from the CLI
- Support multiple run configurations
- Persist run metadata, parameters, and results
- Allow cancel, rerun, and branch-from-previous-run behavior
- Surface run status in realtime

### Variable Editing

- Allow structured edits to tumor parameters
- Allow structured edits to diet and host variables
- Preserve parameter diffs across runs
- Allow templated intervention presets

### Results Analysis

- Report growth-rate deltas
- Report mutation or pattern changes
- Rank promising runs
- Generate short agent summaries with evidence references to run outputs

### Collaboration

- Capture notes from hourly reviews
- Tag runs with collaborator comments
- Maintain a simple timeline of idea -> run -> result -> next action

## 10. Non-Functional Requirements

- CLI-first UX optimized for speed
- Reproducible simulation runs
- Clear audit trail for every parameter change
- Modular architecture so the GUI can reuse the backend later
- Extensible model/provider layer for future simulation engines

## 11. Technical Direction

### v1 Architecture

- Local or remote CLI agent runner
- Simulation orchestration layer
- Experiment state store
- Results ranking and summarization layer
- Promptable hypothesis generation layer

### Planned Platform Evolution

- v1: CLI-first realtime simulation workflow
- v1.5: richer experiment history, replay, and comparison views
- v2: GUI for browsing hypotheses, run trees, and parameter deltas

### NVIDIA Direction

You noted that the product will use NVIDIA technology, but the exact stack was not specified. For now, this PRD assumes NVIDIA-backed simulation and accelerated compute support may be used in one or more of these areas:

- model inference,
- simulation acceleration,
- agent infrastructure,
- scientific computing workflows.

This needs to be pinned down before technical planning. Open questions are listed below.

## 12. Success Metrics

### Product Metrics

- Time from hypothesis selection to completed simulation
- Number of hypotheses evaluated per day
- Number of reruns per promising branch
- Percentage of runs with meaningful growth or pattern deltas

### User Metrics

- Time spent from idea to next actionable experiment
- Percentage of kept hypotheses that advance to rerun
- Collaboration cadence adherence for hourly reviews

## 13. Risks

- Scientific validity depends on simulation quality and model assumptions
- Swipe-based interaction can oversimplify complex biological tradeoffs
- Agent summaries may overstate weak signals without strict evidence binding
- Realtime simulation expectations may exceed available compute
- NVIDIA stack decisions could materially change architecture

## 14. Open Questions

- Which NVIDIA products are in scope: BioNeMo, NIM, CUDA, Omniverse, DGX Cloud, or another stack?
- What simulation engine or biological model will be used first?
- Are hypotheses generated purely by LLMs, human input, or both?
- What exact tumor metrics define a promising result?
- Should the hourly bounce with Gork be a built-in scheduled workflow or just a logging surface in v1?
- Is this single-user only in MVP?
- What data persistence layer should be the source of truth for experiment history?

## 15. v2 Ideas

- GUI with run trees, diff views, and mutation heatmaps
- Shared review sessions for multiple collaborators
- Automated recommendation engine for next-best intervention sets
- Scenario presets for specific tumor classes
- Voice or chat interface for rapid intervention edits
- Scheduled autonomous experiment batches between review sessions
- Confidence scoring tied to repeatability across runs
- Integration with external literature or structured research datasets

## 16. Suggested MVP Release Definition

MVP is successful when a user can:

- review 10 candidate hypotheses in a CLI swipe flow,
- select promising items,
- launch simulations automatically through the agent,
- modify diet and host variables,
- compare run outcomes,
- and log the next round of ideas after a collaboration review.

## 17. Immediate Next Steps

- Confirm the NVIDIA stack choice
- Define the first simulation model and expected inputs/outputs
- Decide CLI command structure and run lifecycle
- Define the experiment data model
- Specify hypothesis schema and ranking criteria
