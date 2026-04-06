const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Simplified version of renderTable from sidepanel.js
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTable(tableBlock) {
  const rows = tableBlock.split("\n").filter((r) => r.trim());
  if (rows.length < 2) return tableBlock;

  const isSeparator = (row) => /^\|[\s\-:|]+\|$/.test(row.trim());
  const hasSeparator = isSeparator(rows[1]);

  const parseRow = (row) =>
    row.split("|").slice(1, -1).map((cell) => cell.trim());

  let html = "<table>";

  if (hasSeparator) {
    const headerCells = parseRow(rows[0]);
    html += "<thead><tr>" + headerCells.map((c) => `<th>${escapeHtml(c)}</th>`).join("") + "</tr></thead>";
    html += "<tbody>";
    for (let i = 2; i < rows.length; i++) {
      const cells = parseRow(rows[i]);
      html += "<tr>" + cells.map((c) => `<td>${escapeHtml(c)}</td>`).join("") + "</tr>";
    }
    html += "</tbody>";
  } else {
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

describe("renderTable", () => {
  it("renders a table with header separator", () => {
    const input = "| Model | Accuracy |\n| --- | --- |\n| GPT | 92.1 |\n| Claude | 94.3 |";
    const html = renderTable(input);
    assert.ok(html.includes("<thead>"));
    assert.ok(html.includes("<th>Model</th>"));
    assert.ok(html.includes("<th>Accuracy</th>"));
    assert.ok(html.includes("<td>GPT</td>"));
    assert.ok(html.includes("<td>94.3</td>"));
  });

  it("renders a table without header separator", () => {
    const input = "| A | B |\n| 1 | 2 |\n| 3 | 4 |";
    const html = renderTable(input);
    assert.ok(!html.includes("<thead>"));
    assert.ok(html.includes("<td>A</td>"));
    assert.ok(html.includes("<td>4</td>"));
  });

  it("escapes HTML in table cells", () => {
    const input = "| Col |\n| --- |\n| <script>alert(1)</script> |";
    const html = renderTable(input);
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });
});

describe("markdown inline formatting", () => {
  // Test the regex patterns used in renderMarkdown

  it("converts headers", () => {
    assert.equal("# Title".replace(/^# (.+)$/gm, "<h1>$1</h1>"), "<h1>Title</h1>");
    assert.equal("## Section".replace(/^## (.+)$/gm, "<h2>$1</h2>"), "<h2>Section</h2>");
    assert.equal("### Sub".replace(/^### (.+)$/gm, "<h3>$1</h3>"), "<h3>Sub</h3>");
  });

  it("converts bold text", () => {
    assert.equal(
      "hello **world**".replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>"),
      "hello <strong>world</strong>"
    );
  });

  it("converts italic text", () => {
    assert.equal(
      "hello *world*".replace(/\*(.+?)\*/g, "<em>$1</em>"),
      "hello <em>world</em>"
    );
  });

  it("converts inline code", () => {
    assert.equal(
      "use `foo()`".replace(/`(.+?)`/g, "<code>$1</code>"),
      "use <code>foo()</code>"
    );
  });

  it("converts markdown links", () => {
    const input = "[Click here](https://example.com)";
    const output = input.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
    assert.ok(output.includes('href="https://example.com"'));
    assert.ok(output.includes(">Click here</a>"));
  });

  it("converts bare URLs", () => {
    const input = "see https://arxiv.org/abs/1234.5678 for details";
    const output = input.replace(
      /(https?:\/\/[^\s<)"]+)/g,
      '<a href="$1" target="_blank" rel="noopener">$1</a>'
    );
    assert.ok(output.includes('href="https://arxiv.org/abs/1234.5678"'));
  });

  it("converts list items", () => {
    assert.equal(
      "- item one".replace(/^- (.+)$/gm, "<li>$1</li>"),
      "<li>item one</li>"
    );
    assert.equal(
      "1. first".replace(/^\d+\. (.+)$/gm, "<li>$1</li>"),
      "<li>first</li>"
    );
  });
});
