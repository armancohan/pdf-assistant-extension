const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const SUMMARY_MODE = "summary";
const REPRO_MODE = "reproduction";

// Same logic as sidepanel.js generateFilename
function generateFilename(paperId, markdown, mode = SUMMARY_MODE) {
  const dateMatch = paperId.match(/^(\d{2})(\d{2})/);
  const datePart = dateMatch ? `20${dateMatch[1]}-${dateMatch[2]}` : "paper";

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

  const suffix = mode === REPRO_MODE ? "ReproBrief" : "Summary";
  return `${datePart}_${titleSlug}_${suffix}.md`;
}

describe("generateFilename", () => {
  it("generates filename with year-month, title slug, and Summary suffix", () => {
    const md = "# Attention Is All You Need\n\n**Authors:** Ashish Vaswani (Google Brain), Noam Shazeer";
    assert.equal(generateFilename("1706.03762", md), "2017-06_AttentionIsAll_Summary.md");
  });

  it("uses ReproBrief suffix for reproduction mode", () => {
    const md = "# MonitorBench A Benchmark\n\n**Authors:** Jane Doe";
    assert.equal(generateFilename("2603.12345", md, REPRO_MODE), "2026-03_MonitorbenchABenchmark_ReproBrief.md");
  });

  it("handles missing title gracefully", () => {
    const md = "No markdown heading here.";
    assert.equal(generateFilename("2401.12345", md), "2024-01_Paper_Summary.md");
  });

  it("strips special characters from title", () => {
    const md = "# GPT-4: A Large-Scale Model!\n\n**Authors:** OpenAI Team";
    assert.equal(generateFilename("2303.08774", md), "2023-03_Gpt4ALargescale_Summary.md");
  });

  it("limits title slug to 3 words", () => {
    const md = "# This Is A Very Long Paper Title Indeed\n\n**Authors:** Jane Doe";
    assert.equal(generateFilename("2401.00001", md), "2024-01_ThisIsA_Summary.md");
  });

  it("includes month correctly for different months", () => {
    const md = "# Test Paper\n\n**Authors:** Alice Bob";
    assert.equal(generateFilename("2312.99999", md), "2023-12_TestPaper_Summary.md");
    assert.equal(generateFilename("2509.00001", md), "2025-09_TestPaper_Summary.md");
  });

  it("defaults to Summary mode when mode not specified", () => {
    const md = "# Some Paper\n\n**Authors:** Author Name";
    assert.equal(generateFilename("2604.02268", md), "2026-04_SomePaper_Summary.md");
  });
});
