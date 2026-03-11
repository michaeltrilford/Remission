# Remission

Thin-slice CLI for generating discovery hypotheses with OpenRouter's NVIDIA Nemotron model.

## Setup

Add your OpenRouter key to `.env`:

```env
OPENROUTER_API_KEY=your_key_here
```

You can also pass a key at runtime if another user wants to use their own credentials.

## Usage

```bash
npm run start
```

This opens a clean entry flow where you choose:

- `Propose paths`
- `Inspect evidence`
- a starter cancer topic
- or `Custom topic...`
- arrow keys to move
- `Enter` to select

It also includes the official NCI cancer type directory as a reference:

- [NCI Cancer Types](https://www.cancer.gov/types)

Direct commands still work:

```bash
npm run propose -- "KRAS lung cancer"
```

Default UX:

- generates 10 candidate paths
- grounds them with public evidence from `PubMed` and `Open Targets`
- shows a readable ranked list
- lets you pick a path with arrow keys
- shows rationale, mechanism, and next test

Or:

```bash
npm run propose -- "KRAS lung cancer" --api-key "your_key_here"
```

For raw JSON output:

```bash
npm run propose -- "KRAS lung cancer" --json
```

To inspect the public evidence pack without calling the model:

```bash
npm run evidence -- "KRAS lung cancer"
```
