import * as pdfjsLib from "./lib/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./lib/pdf.worker.min.mjs";

// --- State ---
let currentUrl = "";
let currentPaperId = ""; // arxiv ID if available, otherwise a slug from URL
let currentPdfUrl = ""; // direct PDF download URL
let currentPaperLink = ""; // link to show in summary (arxiv abs page or original URL)
let isArxivPaper = false;
let summaryMarkdown = "";
let isSummarizing = false;
let extractedPaperText = ""; // cached for follow-up questions
let cachedPdfData = null; // cached PDF ArrayBuffer from detectPageCount
let lastSummarizeMode = "summary";

// --- Clipboard helper (side panels often lose focus) ---
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

// --- DOM refs ---
const $ = (id) => document.getElementById(id);
const stateInitial = $("state-initial");
const stateReady = $("state-ready");
const stateLoading = $("state-loading");
const stateError = $("state-error");
const stateSummary = $("state-summary");
const loadingStatus = $("loading-status");
const errorMessage = $("error-message");
const summaryContent = $("summary-content");
const paperId = $("paper-id");

// --- UI state management ---
function showState(state) {
  [stateInitial, stateReady, stateLoading, stateError, stateSummary].forEach(
    (el) => el.classList.add("hidden")
  );
  state.classList.remove("hidden");
}

function showError(msg) {
  errorMessage.textContent = msg;
  showState(stateError);
}

function setLoading(msg) {
  loadingStatus.textContent = msg;
  showState(stateLoading);
}

// --- ArXiv URL parsing ---
function extractArxivId(url) {
  // Matches: arxiv.org or alphaxiv.org /abs/XXXX.XXXXX, /pdf/XXXX.XXXXX
  const match = url.match(/(?:arxiv|alphaxiv)\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?)/);
  return match ? match[1] : null;
}

function getPdfUrl(arxivId) {
  return `https://export.arxiv.org/pdf/${arxivId}`;
}

// --- Generic PDF URL detection ---
function isPdfUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    // Direct .pdf link (works for any site)
    if (u.pathname.toLowerCase().endsWith(".pdf")) return true;
    // Known paper hosts that serve PDFs at specific paths
    if (u.hostname.includes("openreview.net") && u.pathname.includes("/pdf")) return true;
    if (u.hostname.includes("proceedings.neurips.cc")) return true;
    if (u.hostname.includes("proceedings.mlr.press")) return true;
    return false;
  } catch {
    return false;
  }
}

function slugFromUrl(url) {
  // Create a short, filesystem-safe ID from a URL (including query params for sites like OpenReview)
  try {
    const u = new URL(url);
    const full = (u.pathname + u.search).replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
    const slug = full.slice(-60);
    return `${u.hostname.replace(/\./g, "_")}_${slug}`;
  } catch {
    return "paper";
  }
}

// --- PDF text extraction ---
async function extractPdfText(pdfUrl, maxPages) {
  let arrayBuffer;
  if (cachedPdfData) {
    setLoading("Extracting text from PDF...");
    arrayBuffer = cachedPdfData;
  } else {
    setLoading("Downloading PDF...");
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Failed to download PDF (HTTP ${response.status})`);
    arrayBuffer = await response.arrayBuffer();
    cachedPdfData = arrayBuffer;
    setLoading("Extracting text from PDF...");
  }

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
  const totalPages = pdf.numPages;
  const pagesToRead = Math.min(totalPages, maxPages);
  const textParts = [];

  for (let i = 1; i <= pagesToRead; i++) {
    setLoading(`Extracting text... page ${i}/${pagesToRead}${pagesToRead < totalPages ? ` (of ${totalPages} total)` : ""}`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    textParts.push(pageText);
  }

  return textParts.join("\n\n");
}

// --- LLM API calls ---
const MODELS = {
  anthropic: [
    { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
  ],
  openai: [
    { id: "gpt-5.4", name: "GPT-5.4" },
    { id: "gpt-4o", name: "GPT-4o" },
  ],
  gemini: [
    { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
    { id: "gemini-3.1-flash-preview", name: "Gemini 3.1 Flash" },
  ],
};

const SUMMARY_MODE = "summary";
const REPRO_MODE = "reproduction";
const FLASHCARD_MODE = "flashcards";

function buildPrompt(arxivUrl, mode = SUMMARY_MODE) {
  if (mode === REPRO_MODE) {
    return buildReproductionPrompt(arxivUrl);
  }
  if (mode === FLASHCARD_MODE) {
    return buildFlashcardPrompt(arxivUrl);
  }
  return `You are an expert academic paper summarizer. Summarize the following paper with an extended summary with enough details that a practitioner can understand and implement it. Do not hallucinate details not present in the paper.

Structure your summary as follows:

# [Paper Title]

**Link:** ${arxivUrl}
**Authors:** [names and affiliations, as identifiable from the text]

## TL;DR
A 2-3 sentence high-level summary accessible to a broad technical audience.

## Motivation, Problem Statement, and Prior work
* What problem does this paper address? 
* Why is it important? 
* How does prior work address this issue and why it is not sufficient? 
* Where are the gaps the work is targetting to address?

## Methodology
Describe the approach, model architecture, algorithm, or framework in enough detail that a practitioner could reimplement the core ideas. Be specific about what makes it novel compared to prior work.
* First describe the general approach in a high level. 
* Describe the full pipeline in the order it is actually executed with enough detail that a practioner can reproduce.
* If applicable, discuss components of the study, main objectives or research questions, overall design, specific models studies/used, losses, sampling, decoding, retrieval, optimization, filtering, or any other key mechanisms.
* If the work is an analysis framework or evaluation benchmark discuss any design decisions and main research questions and study design and approach.
* When helpful, translate the method into pseudocode or algorithmic steps.
* Methodology should include a clear and detailed explanation so it is easy to follow and reproduce.

## Key Results
Summarize the key experimental results, datasets used, and comparisons. Include specific numbers. Where appropriate, include a small Markdown results table highlighting the most important comparisons (e.g., method vs. baselines on key metrics).

## Limitations & Future Work
What limitations do the authors acknowledge? What future directions do they suggest?

## Key Takeaways
3-5 bullet points capturing the most important things a reader should remember.

## Highly Relevant References
From the paper's references, identify up to 3 that the paper most heavily builds upon (e.g., foundational methods it extends, key baselines, or core techniques it adapts). Prefer recent references (published within the last 1-2 years). For each, provide: the title, authors, year, a one-sentence description of its relevance to this paper, and the arxiv link if available.`;
}

function buildReproductionPrompt(arxivUrl) {
  return `You are helping me understand a research paper deeply enough that I could reproduce it, without making me read the full paper.

Your task is to produce an extended, reproduction-oriented technical brief of the paper.

**Link:** ${arxivUrl}

Important goals:

* Prioritize technical clarity over brevity.
* Write for someone who knows the field but has not read the paper.
* Do not give a generic abstract-style summary.
* The summary shouldn't be too long. Aim for less than 1,500-2,000 words.
* Separate clearly between:
  1. what the paper explicitly states,
  2. what is a reasonable inference,
  3. what is missing or ambiguous.

Please organize the output into these sections:

## 1. Core idea in plain technical language

* What problem does the paper solve?
* How does pre-existing work solve that problem?
* What is the main claim or contribution?
* Why does the approach matter relative to prior work?

## 2. Problem setup

* Define the task, inputs, outputs, assumptions, and constraints.
* State the training and inference setting, of the parameters of the study.
* Clarify notation if needed.

## 3. Method explained step by step

* Describe the full pipeline in the order it is actually executed.
* Include model architecture, components, objectives, losses, sampling, decoding, retrieval, optimization, filtering, or any other key mechanisms.
* For equations, explain each term in words.
* When helpful, translate the method into pseudocode or algorithmic steps.

## 4. What I would need to reproduce it

* Datasets and splits
* Preprocessing
* Models used
* Training procedure
* Compute requirements
* Evaluation setup, datasets and baselines
* Ablations
* Any nontrivial implementation tricks or engineering details mentioned

## 5. Missing details and likely assumptions

* List details that are underspecified or omitted.
* For each one, give the most plausible assumption a reproducer might make.
* Mark these explicitly as inference, not stated fact.

## 6. Results and evidence

* What were the main empirical findings?
* Which comparisons matter most?
* What evidence actually supports the paper's claim?
* Mention important caveats, weak baselines, or possible confounds.

## 7. Failure modes and limitations

* What does the method likely struggle with?
* What limitations do the authors admit?
* What additional limitations are visible from the setup?

## 8. Minimal viable reproduction plan

* If I had limited time, compute, and engineering effort, describe the simplest version I could implement that still tests the core claim.

## 9. Questions to verify before implementation

* Give me a short list of concrete uncertainties I should resolve by checking appendix, code, supplementary material, or citations.

Style requirements:

* Be detailed.
* Prefer concrete details over broad descriptions.
* If the paper leaves something unclear, say so directly.
* DO NOT hallucinate missing numbers or settings.
* If details are absent, say "not specified in the paper" and then provide a clearly labeled best-guess assumption.

## 10. Highly Relevant References
From the paper's references, identify up to 3 that the paper most heavily builds upon (e.g., foundational methods it extends, key baselines, or core techniques it adapts). Prefer recent references (published within the last 1-2 years). For each, provide: the title, authors, year, a one-sentence description of its relevance to this paper, and the arxiv link if available.`;
}

function buildFlashcardPrompt(arxivUrl) {
  return `You are helping me create study flashcards from a research paper for future recall.

**Link:** ${arxivUrl}

Generate 10-15 high-quality flashcards that cover:

1. **Core concepts and definitions** — Any new terms, frameworks, or concepts the paper introduces or defines (e.g., "monitorability tax", "CoT monitorability"). These are especially important because they may be adopted by future papers.
2. **Key methodology** — How the approach works at a high level, what makes it novel.
3. **Important distinctions** — How this work differs from prior approaches or baselines.
4. **Key results and takeaways** — The most significant findings and their implications.
5. **Limitations and open questions** — What the method cannot do or what remains unsolved.

Rules:
- Every question MUST be self-contained — a reader seeing the card months later should know which paper it refers to. Include the paper's short title (or acronym) and year in each question. For example, instead of "What is Compression Maximization?", write "In the ACON paper (2025), what is Compression Maximization?".
- Questions should test *understanding*, not rote memorization. Ask "why" and "how" questions, not "what was the accuracy on X".
- Answers should be concise (1-3 sentences) but complete enough to stand alone.
- For novel terminology introduced by the paper, create a dedicated card for each term with its precise definition and significance.
- Include the paper title and link on the first card.

Format your output EXACTLY as follows (this format is required for Anki import):

# [Paper Title] — Flashcards

**Link:** ${arxivUrl}

Q: [question]
A: [answer]

Q: [question]
A: [answer]

(continue for all cards)

Do not number the cards. Use exactly "Q: " and "A: " prefixes. Put a blank line between each Q/A pair.`;
}

// --- SSE stream parser helper ---
// appendOffset: if provided, stream chunks are appended to summaryMarkdown starting at that position
async function readSSEStream(response, extractChunk, appendOffset = -1) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  const baseMarkdown = appendOffset >= 0 ? summaryMarkdown.slice(0, appendOffset) : "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const chunk = extractChunk(json);
        if (chunk) {
          fullText += chunk;
          if (appendOffset >= 0) {
            summaryMarkdown = baseMarkdown + fullText;
          } else {
            summaryMarkdown = fullText;
          }
          summaryContent.innerHTML = renderMarkdown(summaryMarkdown);
          summaryContent.scrollTop = summaryContent.scrollHeight;
        }
      } catch {
        // skip unparseable lines
      }
    }
  }

  return fullText;
}

async function callAnthropic(apiKey, model, paperText, arxivUrl, mode, customPrompt) {
  const prompt = customPrompt || buildPrompt(arxivUrl, mode);
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 16384,
      stream: true,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\n---\n\nHere is the full text of the paper:\n\n${paperText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic API error (${response.status})`);
  }

  showState(stateSummary);
  return readSSEStream(response, (json) => {
    if (json.type === "content_block_delta" && json.delta?.text) {
      return json.delta.text;
    }
    return null;
  });
}

async function callOpenAI(apiKey, model, paperText, arxivUrl, mode, customPrompt) {
  const prompt = customPrompt || buildPrompt(arxivUrl, mode);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      max_completion_tokens: 16384,
      stream: true,
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `Here is the full text of the paper:\n\n${paperText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI API error (${response.status})`);
  }

  showState(stateSummary);
  return readSSEStream(response, (json) => {
    return json.choices?.[0]?.delta?.content || null;
  });
}

async function callGemini(apiKey, model, paperText, arxivUrl, mode, customPrompt) {
  const prompt = customPrompt || buildPrompt(arxivUrl, mode);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${prompt}\n\n---\n\nHere is the full text of the paper:\n\n${paperText}` },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: 16384,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error (${response.status})`);
  }

  showState(stateSummary);
  return readSSEStream(response, (json) => {
    return json.candidates?.[0]?.content?.parts?.[0]?.text || null;
  });
}

async function summarize(paperText, arxivUrl, mode = SUMMARY_MODE, customPrompt = null) {
  const settings = await loadSettings();
  if (!settings.apiKey) {
    throw new Error("Please set your API key in Settings (gear icon).");
  }

  setLoading(mode === REPRO_MODE ? "Generating technical brief..." : mode === FLASHCARD_MODE ? "Generating flashcards..." : "Generating summary...");

  if (settings.provider === "anthropic") {
    return callAnthropic(settings.apiKey, settings.model, paperText, arxivUrl, mode, customPrompt);
  } else if (settings.provider === "gemini") {
    return callGemini(settings.apiKey, settings.model, paperText, arxivUrl, mode, customPrompt);
  } else {
    return callOpenAI(settings.apiKey, settings.model, paperText, arxivUrl, mode, customPrompt);
  }
}

// --- Follow-up questions ---
async function askFollowUp(question, paperText) {
  const settings = await loadSettings();
  if (!settings.apiKey) {
    throw new Error("Please set your API key in Settings (gear icon).");
  }

  const systemPrompt = `You are an expert academic paper analyst. You have already summarized this paper. The user is now asking a follow-up question. Answer based on the paper's content. Be thorough but concise. Use Markdown formatting.`;

  const userContent = `Here is the paper text:\n\n${paperText}\n\n---\n\nHere is the summary so far:\n\n${summaryMarkdown}\n\n---\n\nFollow-up question: ${question}`;

  // We'll stream the answer and append it
  const appendStart = summaryMarkdown.length;

  if (settings.provider === "anthropic") {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 16384,
        stream: true,
        messages: [{ role: "user", content: `${systemPrompt}\n\n${userContent}` }],
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic API error (${response.status})`);
    }
    return readSSEStream(response, (json) => {
      if (json.type === "content_block_delta" && json.delta?.text) return json.delta.text;
      return null;
    }, appendStart);
  } else if (settings.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:streamGenerateContent?alt=sse&key=${settings.apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
        generationConfig: { maxOutputTokens: 16384 },
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Gemini API error (${response.status})`);
    }
    return readSSEStream(response, (json) => {
      return json.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }, appendStart);
  } else {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        max_completion_tokens: 16384,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI API error (${response.status})`);
    }
    return readSSEStream(response, (json) => {
      return json.choices?.[0]?.delta?.content || null;
    }, appendStart);
  }
}

// --- Markdown to HTML renderer ---
function renderMarkdown(md) {
  // Pre-process: extract math and tables before escaping HTML
  const mathBlocks = [];

  // Display math: $$...$$ (possibly multiline)
  md = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    const placeholder = `%%MATH_${mathBlocks.length}%%`;
    mathBlocks.push({ tex: tex.trim(), display: true });
    return placeholder;
  });

  // Inline math: $...$  (not greedy, single line)
  md = md.replace(/\$([^\$\n]+?)\$/g, (_, tex) => {
    const placeholder = `%%MATH_${mathBlocks.length}%%`;
    mathBlocks.push({ tex: tex.trim(), display: false });
    return placeholder;
  });

  const tableBlocks = [];
  md = md.replace(/((?:^\|.+\|$\n?){2,})/gm, (match) => {
    const placeholder = `%%TABLE_${tableBlocks.length}%%`;
    tableBlocks.push(match.trim());
    return placeholder;
  });

  let html = md
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Markdown links [text](url) — before other inline formatting
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Headers
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold and italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code>$1</code>")
    // Blockquotes
    .replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>")
    // Unordered lists
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    // Bare URLs (not already inside an href or anchor tag)
    .replace(/(?<!href="|">)(https?:\/\/[^\s<)"]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, "</p><p>")
    // Single newlines
    .replace(/\n/g, "<br>");

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*?<\/li><br>?)+)/g, "<ul>$1</ul>");
  html = html.replace(/<br><\/ul>/g, "</ul>");
  html = html.replace(/<ul><br>/g, "<ul>");

  // Restore table blocks as HTML tables
  for (let i = 0; i < tableBlocks.length; i++) {
    const tableHtml = renderTable(tableBlocks[i]);
    html = html.replace(`%%TABLE_${i}%%`, tableHtml);
  }

  // Restore math blocks rendered with KaTeX
  for (let i = 0; i < mathBlocks.length; i++) {
    const { tex, display } = mathBlocks[i];
    let rendered;
    try {
      rendered = katex.renderToString(tex, { displayMode: display, throwOnError: false });
    } catch {
      rendered = `<code>${escapeHtml(tex)}</code>`;
    }
    html = html.replace(`%%MATH_${i}%%`, rendered);
  }

  return `<p>${html}</p>`
    .replace(/<p><\/p>/g, "")
    .replace(/<p><h/g, "<h")
    .replace(/<\/h(\d)><\/p>/g, "</h$1>")
    .replace(/<p><ul>/g, "<ul>")
    .replace(/<\/ul><\/p>/g, "</ul>")
    .replace(/<p><blockquote>/g, "<blockquote>")
    .replace(/<\/blockquote><\/p>/g, "</blockquote>")
    .replace(/<p><table/g, "<table")
    .replace(/<\/table><\/p>/g, "</table>");
}

function renderTable(tableBlock) {
  const rows = tableBlock.split("\n").filter((r) => r.trim());
  if (rows.length < 2) return tableBlock;

  // Check if second row is a separator (e.g., |---|---|)
  const isSeparator = (row) => /^\|[\s\-:|]+\|$/.test(row.trim());
  const hasSeparator = isSeparator(rows[1]);

  const parseRow = (row) =>
    row.split("|").slice(1, -1).map((cell) => cell.trim());

  let html = '<table>';

  if (hasSeparator) {
    // Header row
    const headerCells = parseRow(rows[0]);
    html += "<thead><tr>" + headerCells.map((c) => `<th>${escapeHtml(c)}</th>`).join("") + "</tr></thead>";
    // Body rows
    html += "<tbody>";
    for (let i = 2; i < rows.length; i++) {
      const cells = parseRow(rows[i]);
      html += "<tr>" + cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("") + "</tr>";
    }
    html += "</tbody>";
  } else {
    // No header separator — all body rows
    html += "<tbody>";
    for (const row of rows) {
      const cells = parseRow(row);
      html += "<tr>" + cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("") + "</tr>";
    }
    html += "</tbody>";
  }

  html += "</table>";
  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- Settings ---
const API_KEY_KEYS = {
  anthropic: "apiKey_anthropic",
  openai: "apiKey_openai",
  gemini: "apiKey_gemini",
};

async function loadSettings() {
  const keys = ["provider", "model", "maxPages", "theme", ...Object.values(API_KEY_KEYS)];
  const data = await chrome.storage.local.get(keys);
  const provider = data.provider || "anthropic";
  return {
    provider,
    apiKey: data[API_KEY_KEYS[provider]] || "",
    apiKeys: {
      anthropic: data[API_KEY_KEYS.anthropic] || "",
      openai: data[API_KEY_KEYS.openai] || "",
      gemini: data[API_KEY_KEYS.gemini] || "",
    },
    model: data.model || MODELS.anthropic[0].id,
    maxPages: data.maxPages || 10,
    theme: data.theme || "auto",
  };
}

async function saveSettings(provider, apiKeys, model, maxPages, theme) {
  await chrome.storage.local.set({
    provider,
    model,
    maxPages,
    theme,
    [API_KEY_KEYS.anthropic]: apiKeys.anthropic,
    [API_KEY_KEYS.openai]: apiKeys.openai,
    [API_KEY_KEYS.gemini]: apiKeys.gemini,
  });
}

// --- Theme ---
function applyTheme(theme) {
  if (theme === "auto") {
    document.body.removeAttribute("data-theme");
  } else {
    document.body.setAttribute("data-theme", theme);
  }
}

function populateModels(provider) {
  const modelSelect = $("model-select");
  modelSelect.innerHTML = "";
  MODELS[provider].forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    modelSelect.appendChild(opt);
  });
}

// --- Cache ---
async function getCachedSummary(paperId) {
  const key = `cache_${paperId}`;
  const data = await chrome.storage.local.get([key]);
  return data[key] || null;
}

async function setCachedSummary(paperId, markdown) {
  const key = `cache_${paperId}`;
  await chrome.storage.local.set({ [key]: { markdown, timestamp: Date.now() } });
}

// --- Smart filename ---
function generateFilename(paperId, markdown, mode = SUMMARY_MODE) {
  // Extract year and month from arxiv ID (YYMM.NNNNN -> 20YY-MM)
  const dateMatch = paperId.match(/^(\d{2})(\d{2})/);
  const datePart = dateMatch ? `20${dateMatch[1]}-${dateMatch[2]}` : "paper";

  // Extract title from first "# Title" line
  const titleMatch = markdown.match(/^# (.+)$/m);
  let titleSlug = "Paper";
  if (titleMatch) {
    titleSlug = titleMatch[1]
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
  }

  const suffix = mode === REPRO_MODE ? "ReproBrief" : mode === FLASHCARD_MODE ? "Flashcards" : "Summary";
  return `${datePart}_${titleSlug}_${suffix}.md`;
}

// --- Markdown export ---
function downloadMarkdown(markdown, filename) {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Main flow ---
async function handleSummarize(forceRefresh = false, mode = SUMMARY_MODE) {
  if (isSummarizing) return;
  isSummarizing = true;
  lastSummarizeMode = mode;

  // Use mode-specific cache key
  const cacheId = mode === REPRO_MODE ? `${currentPaperId}_repro` : mode === FLASHCARD_MODE ? `${currentPaperId}_flash` : currentPaperId;

  try {
    // Check cache first (unless forced refresh)
    if (!forceRefresh) {
      const cached = await getCachedSummary(cacheId);
      if (cached) {
        summaryMarkdown = cached.markdown;
        summaryContent.innerHTML = renderMarkdown(cached.markdown);
        showState(stateSummary);
        $("export-anki-btn").classList.toggle("hidden", mode !== FLASHCARD_MODE);
        showCacheBadge(true, cached.timestamp);
        isSummarizing = false;
        return;
      }
    }

    showCacheBadge(false);
    const maxPages = Math.max(1, parseInt($("pages-input").value, 10) || 10);
    const text = await extractPdfText(currentPdfUrl, maxPages);

    if (text.trim().length < 100) {
      throw new Error("Could not extract meaningful text from the PDF.");
    }

    // Truncate to ~100k chars to stay within context limits
    extractedPaperText = text.slice(0, 100000);

    // Use custom prompt if editor is open and has content
    const promptContainer = $("prompt-editor-container");
    const promptTextarea = $("prompt-textarea");
    let customPrompt = null;
    if (!promptContainer.classList.contains("hidden") && promptTextarea.value.trim()) {
      customPrompt = promptTextarea.value.trim();
    }

    const markdown = await summarize(extractedPaperText, currentPaperLink, mode, customPrompt);

    summaryMarkdown = markdown;
    summaryContent.innerHTML = renderMarkdown(markdown);
    showState(stateSummary);
    $("export-anki-btn").classList.toggle("hidden", mode !== FLASHCARD_MODE);

    // Cache the result
    await setCachedSummary(cacheId, markdown);
  } catch (err) {
    showError(err.message);
  } finally {
    isSummarizing = false;
  }
}

function showCacheBadge(show, timestamp) {
  const badge = $("cache-badge");
  const resummarizeBtn = $("resummarize-btn");
  if (show) {
    const date = new Date(timestamp);
    const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    badge.textContent = `Cached ${dateStr}`;
    badge.classList.remove("hidden");
    resummarizeBtn.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
    resummarizeBtn.classList.add("hidden");
  }
}

// --- Event listeners ---
$("summarize-btn").addEventListener("click", () => handleSummarize(false, SUMMARY_MODE));
$("repro-btn").addEventListener("click", () => handleSummarize(false, REPRO_MODE));
$("flashcard-btn").addEventListener("click", () => handleSummarize(false, FLASHCARD_MODE));
$("metadata-btn").addEventListener("click", () => handleCopyMetadata($("metadata-btn")));
$("retry-btn").addEventListener("click", () => handleSummarize(true));
$("resummarize-btn").addEventListener("click", () => handleSummarize(true));

// --- Prompt editor ---
let promptEditorMode = SUMMARY_MODE;

function loadPromptForMode(mode) {
  promptEditorMode = mode;
  const paperLink = currentPaperLink || "https://arxiv.org/abs/XXXX.XXXXX";
  $("prompt-textarea").value = buildPrompt(paperLink, mode);
}

$("toggle-prompt-btn").addEventListener("click", () => {
  const container = $("prompt-editor-container");
  const isHidden = container.classList.contains("hidden");
  if (isHidden) {
    loadPromptForMode(SUMMARY_MODE);
    container.classList.remove("hidden");
    $("toggle-prompt-btn").textContent = "Hide Prompt";
  } else {
    container.classList.add("hidden");
    $("toggle-prompt-btn").innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Edit Prompt`;
  }
});

$("summarize-btn").addEventListener("mouseenter", () => {
  if (!$("prompt-editor-container").classList.contains("hidden") && promptEditorMode !== SUMMARY_MODE) {
    loadPromptForMode(SUMMARY_MODE);
  }
});

$("repro-btn").addEventListener("mouseenter", () => {
  if (!$("prompt-editor-container").classList.contains("hidden") && promptEditorMode !== REPRO_MODE) {
    loadPromptForMode(REPRO_MODE);
  }
});

$("flashcard-btn").addEventListener("mouseenter", () => {
  if (!$("prompt-editor-container").classList.contains("hidden") && promptEditorMode !== FLASHCARD_MODE) {
    loadPromptForMode(FLASHCARD_MODE);
  }
});

$("reset-prompt-btn").addEventListener("click", () => {
  loadPromptForMode(promptEditorMode);
});

// --- Anki CSV export ---
function flashcardsToAnkiCSV(markdown) {
  const pairs = [];
  const regex = /^Q:\s*(.+)\nA:\s*([\s\S]*?)(?=\n\nQ:|\n*$)/gm;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const question = match[1].trim();
    const answer = match[2].trim();
    if (question && answer) pairs.push({ question, answer });
  }
  // Anki TSV format: question<tab>answer, with quotes escaped
  const lines = pairs.map(({ question, answer }) => {
    const q = `"${question.replace(/"/g, '""')}"`;
    const a = `"${answer.replace(/"/g, '""')}"`;
    return `${q}\t${a}`;
  });
  return lines.join("\n");
}

$("export-anki-btn").addEventListener("click", () => {
  const csv = flashcardsToAnkiCSV(summaryMarkdown);
  if (!csv) {
    showError("No flashcards found to export. Generate flashcards first.");
    return;
  }
  const blob = new Blob([csv], { type: "text/tab-separated-values" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const datePart = currentPaperId.match(/^(\d{2})(\d{2})/);
  const prefix = datePart ? `20${datePart[1]}-${datePart[2]}` : "paper";
  const titleMatch = summaryMarkdown.match(/^# (.+?)(?:\s*—.*)?$/m);
  let titleSlug = "Flashcards";
  if (titleMatch) {
    titleSlug = titleMatch[1]
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
  }
  a.href = url;
  a.download = `${prefix}_${titleSlug}_Anki.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

// --- Copy Metadata ---
function parseMetadataFromMarkdown(markdown) {
  const titleMatch = markdown.match(/^# (.+)$/m);
  const linkMatch = markdown.match(/\*\*Link:\*\*\s*(.+)/i);
  const authorsMatch = markdown.match(/\*\*Authors?:\*\*\s*(.+)/i);

  const title = titleMatch ? titleMatch[1].trim() : null;
  const link = linkMatch ? linkMatch[1].trim() : null;
  const authors = authorsMatch ? authorsMatch[1].trim() : null;

  return (title && link) ? `${title}\n${link}${authors ? "\n" + authors : ""}` : null;
}

async function handleCopyMetadata(triggerBtn) {
  if (isSummarizing) return;

  const btn = triggerBtn || $("metadata-btn");
  const originalHtml = btn.innerHTML;

  // Fast path: parse from existing summary
  if (summaryMarkdown) {
    const metadata = parseMetadataFromMarkdown(summaryMarkdown);
    if (metadata) {
      await copyToClipboard(metadata);
      btn.textContent = "Copied!";
      setTimeout(() => { btn.innerHTML = originalHtml; }, 1500);
      return;
    }
  }

  // Slow path: LLM extraction from PDF first page
  isSummarizing = true;
  btn.textContent = "Extracting...";
  btn.disabled = true;

  try {
    const settings = await loadSettings();
    if (!settings.apiKey) {
      throw new Error("Please set your API key in Settings (gear icon).");
    }

    let arrayBuffer;
    if (cachedPdfData) {
      arrayBuffer = cachedPdfData;
    } else {
      const response = await fetch(currentPdfUrl);
      if (!response.ok) throw new Error(`Failed to download PDF`);
      arrayBuffer = await response.arrayBuffer();
      cachedPdfData = arrayBuffer;
    }
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const firstPageText = content.items.map((item) => item.str).join(" ");

    const paperUrl = currentPaperLink;

    const metadataPrompt = `Extract the metadata from this academic paper's first page. Return ONLY the following format with no other text:

TITLE: [exact paper title]
AUTHORS: [list all authors separated by commas]
AFFILIATIONS: [list all unique affiliations separated by commas]

Be precise. Extract exactly what is written.`;

    let result;
    if (settings.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": settings.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: settings.model,
          max_tokens: 1024,
          messages: [{ role: "user", content: `${metadataPrompt}\n\n---\n\n${firstPageText}` }],
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `API error`); }
      result = (await res.json()).content[0].text;
    } else if (settings.provider === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${metadataPrompt}\n\n---\n\n${firstPageText}` }] }] }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `API error`); }
      result = (await res.json()).candidates[0].content.parts[0].text;
    } else {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({
          model: settings.model,
          max_completion_tokens: 1024,
          messages: [
            { role: "system", content: metadataPrompt },
            { role: "user", content: firstPageText },
          ],
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `API error`); }
      result = (await res.json()).choices[0].message.content;
    }

    const titleMatch = result.match(/TITLE:\s*(.+)/i);
    const authorsMatch = result.match(/AUTHORS:\s*(.+)/i);
    const affiliationsMatch = result.match(/AFFILIATIONS:\s*(.+)/i);

    const title = titleMatch ? titleMatch[1].trim() : "Unknown";
    const authors = authorsMatch ? authorsMatch[1].trim() : "";
    const affiliations = affiliationsMatch ? affiliationsMatch[1].trim() : "";

    const parts = [title, paperUrl];
    if (authors) parts.push(authors);
    if (affiliations) parts.push(affiliations);
    const metadata = parts.join("\n");

    await copyToClipboard(metadata);
    btn.textContent = "Copied!";
    setTimeout(() => { btn.innerHTML = originalHtml; btn.disabled = false; }, 2000);
  } catch (err) {
    btn.textContent = "Error";
    setTimeout(() => { btn.innerHTML = originalHtml; btn.disabled = false; }, 2000);
    showError(err.message);
  } finally {
    isSummarizing = false;
  }
}

$("export-md-btn").addEventListener("click", () => {
  const filename = generateFilename(currentPaperId, summaryMarkdown, lastSummarizeMode);
  downloadMarkdown(summaryMarkdown, filename);
});

$("copy-btn").addEventListener("click", async () => {
  await copyToClipboard(summaryMarkdown);
  const btn = $("copy-btn");
  const original = btn.innerHTML;
  btn.textContent = "Copied!";
  setTimeout(() => (btn.innerHTML = original), 1500);
});

$("copy-metadata-summary-btn").addEventListener("click", () => handleCopyMetadata($("copy-metadata-summary-btn")));

// Settings
let editingApiKeys = { anthropic: "", openai: "", gemini: "" };
let currentSettingsProvider = "anthropic";

$("settings-btn").addEventListener("click", async () => {
  const settings = await loadSettings();
  editingApiKeys = { ...settings.apiKeys };
  currentSettingsProvider = settings.provider;
  $("provider-select").value = settings.provider;
  $("api-key-input").value = editingApiKeys[settings.provider];
  populateModels(settings.provider);
  $("model-select").value = settings.model;
  $("max-pages-input").value = settings.maxPages;
  $("theme-select").value = settings.theme;
  $("settings-overlay").classList.remove("hidden");
});

$("provider-select").addEventListener("change", (e) => {
  // Save current key input to the current provider before switching
  editingApiKeys[currentSettingsProvider] = $("api-key-input").value;

  // Switch to new provider
  currentSettingsProvider = e.target.value;
  $("api-key-input").value = editingApiKeys[currentSettingsProvider];
  populateModels(currentSettingsProvider);
});

$("api-key-input").addEventListener("input", () => {
  editingApiKeys[currentSettingsProvider] = $("api-key-input").value;
});

$("save-settings-btn").addEventListener("click", async () => {
  editingApiKeys[currentSettingsProvider] = $("api-key-input").value;
  const maxPages = parseInt($("max-pages-input").value, 10) || 10;
  const theme = $("theme-select").value;
  await saveSettings(
    currentSettingsProvider,
    editingApiKeys,
    $("model-select").value,
    Math.max(1, maxPages),
    theme
  );
  applyTheme(theme);
  $("settings-overlay").classList.add("hidden");
});

$("cancel-settings-btn").addEventListener("click", () => {
  $("settings-overlay").classList.add("hidden");
});

// Follow-up questions
async function handleFollowUp() {
  const input = $("followup-input");
  const question = input.value.trim();
  if (!question || isSummarizing) return;

  isSummarizing = true;
  input.value = "";
  $("followup-btn").disabled = true;

  try {
    // Append the question as a heading to the markdown
    summaryMarkdown += `\n\n---\n\n## Q: ${question}\n\n`;
    summaryContent.innerHTML = renderMarkdown(summaryMarkdown);
    summaryContent.scrollTop = summaryContent.scrollHeight;

    // Stream the answer, appending after the question heading
    const answer = await askFollowUp(question, extractedPaperText);

    // Update cache with the extended content
    await setCachedSummary(currentPaperId, summaryMarkdown);
  } catch (err) {
    summaryMarkdown += `\n\n*Error: ${err.message}*`;
    summaryContent.innerHTML = renderMarkdown(summaryMarkdown);
  } finally {
    isSummarizing = false;
    $("followup-btn").disabled = false;
  }
}

$("followup-btn").addEventListener("click", handleFollowUp);
$("followup-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleFollowUp();
  }
});

// --- Initialize: get current tab URL ---
async function init() {
  // Apply saved theme
  const settings = await loadSettings();
  applyTheme(settings.theme);

  // Request URL from background
  chrome.runtime.sendMessage({ type: "GET_TAB_URL" }, (response) => {
    if (response?.url) {
      handleUrl(response.url);
    }
  });

  // Also listen for pushed URL updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TAB_URL") {
      handleUrl(message.url);
    }
  });
}

async function handleUrl(url) {
  currentUrl = url;
  cachedPdfData = null; // reset cache for new URL

  const arxivId = extractArxivId(url);
  if (arxivId) {
    currentPaperId = arxivId;
    currentPdfUrl = getPdfUrl(arxivId);
    currentPaperLink = `https://arxiv.org/abs/${arxivId}`;
    isArxivPaper = true;
    paperId.textContent = `arxiv:${arxivId}`;
    $("paper-pages").textContent = "";
    showState(stateReady);

    const settings = await loadSettings();
    $("pages-input").value = settings.maxPages;

    detectPageCount(currentPdfUrl);
  } else if (isPdfUrl(url)) {
    currentPaperId = slugFromUrl(url);
    currentPdfUrl = url;
    currentPaperLink = url;
    isArxivPaper = false;

    // Try to show a readable source name
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      paperId.textContent = `PDF: ${hostname}`;
    } catch {
      paperId.textContent = "PDF";
    }
    $("paper-pages").textContent = "";
    showState(stateReady);

    const settings = await loadSettings();
    $("pages-input").value = settings.maxPages;

    detectPageCount(currentPdfUrl);
  } else {
    showState(stateInitial);
  }
}

async function detectPageCount(pdfUrl) {
  try {
    const response = await fetch(pdfUrl, { method: "GET" });
    if (!response.ok) return;
    const arrayBuffer = await response.arrayBuffer();
    cachedPdfData = arrayBuffer;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) }).promise;
    const total = pdf.numPages;
    $("paper-pages").textContent = `${total} pages`;
    const input = $("pages-input");
    input.max = total;
    if (parseInt(input.value, 10) > total) {
      input.value = total;
    }
  } catch {
    // silently ignore — page count is a nice-to-have
  }
}

init();
