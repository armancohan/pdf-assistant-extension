# PDF Assistant Extension

A Chrome extension that summarizes academic and technical PDFs using LLM APIs. Works on arxiv, OpenReview, conference proceedings (NeurIPS, PMLR, ACL Anthology), medical paper sources (PubMed Central, journal sites), and any PDF — including local files dragged into the side panel.

## Features

- **One-click summarization** in a persistent Chrome side panel
- **Multi-provider LLM support**: Anthropic (Claude), OpenAI (GPT), Google (Gemini)
- **Works on any PDF** — arxiv, OpenReview, NeurIPS/PMLR proceedings, journal sites, PubMed Central, lab pages, or local files via drag-and-drop
- **Three output modes**:
  - **Summary** — structured overview with motivation, methodology, results, limitations
  - **Reproduction Brief** — implementation-oriented technical brief (pipelines, datasets, ablations, gotchas)
  - **Flashcards** — Anki-ready Q&A cards with paper title/year for self-contained recall
- **Editable prompts** — preview and tweak the prompt before generating
- **Follow-up questions** — ask additional questions about the paper after summarizing
- **Streaming output** — see results build up in real-time
- **Per-paper caching** — revisiting a paper shows the cached result instantly (separate cache per mode)
- **Markdown export** with smart filenames (e.g., `2025-04_AttentionIsAll_Summary.md`)
- **Anki CSV export** for flashcards
- **Copy metadata** — title, link, authors in one click
- **PDF page control** — configure how many pages to extract, with auto-detected page count
- **Math rendering** — LaTeX math via KaTeX
- **Dark/Light/Auto theme** support

## Summary Structure

Each summary includes:
- Paper title, link, authors & affiliations
- TL;DR
- Motivation, Problem Statement & Prior Work
- Key Contributions
- Methodology (implementation-level detail)
- Key Results (with tables where appropriate)
- Limitations & Future Work
- Key Takeaways
- Highly Relevant References (recent papers it builds upon)

## Supported Sources

The extension auto-detects PDFs on:
- **arxiv.org** and **alphaxiv.org**
- **openreview.net**
- **proceedings.neurips.cc**, **proceedings.mlr.press**
- **aclanthology.org**
- **Any URL ending in `.pdf`** (journal sites, PubMed Central, lab pages, etc.)
- **Local PDFs** via drag-and-drop or file picker

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/armancohan/pdf-assistant-extension.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** and select the cloned folder
5. Click the extension icon on any paper page (or open the side panel and drop a PDF)
6. Open **Settings** (gear icon) and enter your API key

## Supported Models

| Provider | Models |
|----------|--------|
| Anthropic | Claude Opus 4.6, Claude Sonnet 4.6 |
| OpenAI | GPT-5.4, GPT-4o |
| Google | Gemini 3.1 Pro, Gemini 3.1 Flash |

Each provider uses its own API key, stored separately.

## Configuration

All settings are accessible via the gear icon in the side panel:

- **LLM Provider & Model** — choose your preferred provider and model
- **API Key** — stored per-provider (switching providers preserves each key)
- **Max PDF Pages** — default pages to extract (also adjustable per-paper before summarizing)
- **Theme** — Auto (system), Light, or Dark

## Development

### File Structure

```
pdf-assistant-extension/
├── manifest.json       # Chrome Extension Manifest V3
├── background.js       # Service worker - handles icon click, opens side panel
├── sidepanel.html      # Side panel UI
├── sidepanel.css       # Styles (light + dark mode)
├── sidepanel.js        # Core logic: PDF extraction, LLM APIs, caching, export
├── icons/              # Extension icons (16/48/128px)
└── lib/
    ├── pdf.min.mjs     # PDF.js library
    └── pdf.worker.min.mjs
```

### Running Tests

```bash
npm install
npm test
```

### Architecture

- **No backend server** — calls LLM APIs directly from the extension
- **Client-side PDF extraction** — PDF.js runs in the browser
- **Chrome Side Panel API** — summary persists while you browse the paper
- **SSE streaming** — custom parser handles all three providers' streaming formats
- **Drag-and-drop ingestion** — File API path bypasses host-permission restrictions for local PDFs

## License

MIT
