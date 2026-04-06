const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Extract the function logic for testing (same as sidepanel.js)
function extractArxivId(url) {
  const match = url.match(
    /(?:arxiv|alphaxiv)\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5}(?:v\d+)?)/
  );
  return match ? match[1] : null;
}

describe("extractArxivId", () => {
  it("parses standard abs URLs", () => {
    assert.equal(extractArxivId("https://arxiv.org/abs/2401.12345"), "2401.12345");
  });

  it("parses pdf URLs", () => {
    assert.equal(extractArxivId("https://arxiv.org/pdf/2401.12345"), "2401.12345");
  });

  it("parses html URLs", () => {
    assert.equal(extractArxivId("https://arxiv.org/html/2312.00752v1"), "2312.00752v1");
  });

  it("parses versioned IDs", () => {
    assert.equal(extractArxivId("https://arxiv.org/abs/2401.12345v2"), "2401.12345v2");
    assert.equal(extractArxivId("https://arxiv.org/abs/2401.12345v10"), "2401.12345v10");
  });

  it("parses 4-digit paper IDs", () => {
    assert.equal(extractArxivId("https://arxiv.org/abs/2401.1234"), "2401.1234");
  });

  it("parses alphaxiv.org URLs", () => {
    assert.equal(extractArxivId("https://www.alphaxiv.org/abs/2604.02268"), "2604.02268");
    assert.equal(extractArxivId("https://alphaxiv.org/abs/2401.12345v2"), "2401.12345v2");
  });

  it("returns null for non-arxiv URLs", () => {
    assert.equal(extractArxivId("https://google.com"), null);
    assert.equal(extractArxivId("https://arxiv.org/list/cs.AI/recent"), null);
    assert.equal(extractArxivId("https://arxiv.org/search/?query=test"), null);
  });

  it("returns null for empty/invalid input", () => {
    assert.equal(extractArxivId(""), null);
    assert.equal(extractArxivId("not a url"), null);
  });
});
