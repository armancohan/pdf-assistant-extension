# ArXiv Paper Summarizer

A Chrome extension that summarizes arxiv papers using LLM APIs. Click the extension icon on any arxiv (or alphaxiv) page to get a detailed, structured summary in a side panel.

## Features

- **One-click summarization** of any arxiv paper via the side panel
- **Multi-provider LLM support**: Anthropic (Claude), OpenAI (GPT), Google (Gemini)
- **Streaming output** - see the summary build up in real-time
- **Follow-up questions** - ask additional questions about the paper after summarizing
- **Summary caching** - revisiting a paper shows the cached summary instantly
- **Markdown export** with smart filenames (e.g., `2025-AttentionIsAllYouNeed-Vaswani.md`)
- **Copy to clipboard** for quick sharing
- **PDF page control** - configure how many pages to extract, with auto-detected page count
- **Dark/Light/Auto theme** support
- **AlphaXiv support** - works on alphaxiv.org pages too

## Summary Structure

Each summary includes:
- Paper title, link, authors & affiliations
- TL;DR
- Motivation & Problem Statement
- Key Contributions
- Methodology (implementation-level detail)
- Key Results (with tables where appropriate)
- Limitations & Future Work
- Key Takeaways

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/armancohan/arxiv-mm-summarizer.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked** and select the cloned folder
5. Click the extension icon on any arxiv paper page
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

- **LLM Provider & Model** - choose your preferred provider and model
- **API Key** - stored per-provider (switching providers preserves each key)
- **Max PDF Pages** - default pages to extract (also adjustable per-paper before summarizing)
- **Theme** - Auto (system), Light, or Dark

## Development

### File Structure

```
arxiv-mm-summarizer/
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

- **No backend server** - calls LLM APIs directly from the extension
- **Client-side PDF extraction** - PDF.js runs in the browser
- **Chrome Side Panel API** - summary persists while you browse the paper
- **SSE streaming** - custom parser handles all three providers' streaming formats

## License

MIT
