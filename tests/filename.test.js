const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Same logic as sidepanel.js generateFilename
function generateFilename(paperId, markdown) {
  const yearMatch = paperId.match(/^(\d{2})/);
  const year = yearMatch ? `20${yearMatch[1]}` : "paper";

  const titleMatch = markdown.match(/^# (.+)$/m);
  let titleSlug = "summary";
  if (titleMatch) {
    titleSlug = titleMatch[1]
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 4)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
  }

  const authorsMatch = markdown.match(/\*\*Authors?:\*\*\s*(.+)/i);
  let firstAuthor = "";
  if (authorsMatch) {
    const authorStr = authorsMatch[1].split(/[,;]/)[0].replace(/\(.*?\)/g, "").trim();
    const nameParts = authorStr.split(/\s+/);
    firstAuthor = nameParts[nameParts.length - 1].replace(/[^a-zA-Z]/g, "");
  }

  const parts = [year, titleSlug];
  if (firstAuthor) parts.push(firstAuthor);
  return parts.join("-") + ".md";
}

describe("generateFilename", () => {
  it("generates filename with year, title slug, and author", () => {
    const md = "# Attention Is All You Need\n\n**Authors:** Ashish Vaswani (Google Brain), Noam Shazeer";
    assert.equal(generateFilename("1706.03762", md), "2017-AttentionIsAllYou-Vaswani.md");
  });

  it("handles papers with affiliations in parentheses", () => {
    const md = "# SkillO Framework\n\n**Authors:** John Smith (MIT), Jane Doe (Stanford)";
    assert.equal(generateFilename("2604.02268", md), "2026-SkilloFramework-Smith.md");
  });

  it("handles missing authors gracefully", () => {
    const md = "# Some Paper Title\n\nNo authors line here.";
    assert.equal(generateFilename("2401.12345", md), "2024-SomePaperTitle.md");
  });

  it("handles missing title gracefully", () => {
    const md = "No markdown heading here.";
    assert.equal(generateFilename("2401.12345", md), "2024-summary.md");
  });

  it("strips special characters from title", () => {
    const md = "# GPT-4: A Large-Scale Model!\n\n**Authors:** OpenAI Team";
    assert.equal(generateFilename("2303.08774", md), "2023-Gpt4ALargescaleModel-Team.md");
  });

  it("limits title slug to 4 words", () => {
    const md = "# This Is A Very Long Paper Title Indeed\n\n**Authors:** Jane Doe";
    assert.equal(generateFilename("2401.00001", md), "2024-ThisIsAVery-Doe.md");
  });
});
