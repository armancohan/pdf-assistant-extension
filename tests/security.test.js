const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

// Collect all tracked source files (exclude node_modules, .git, lib/)
function getSourceFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", ".claude", "lib", "icons"].includes(entry.name)) continue;
      getSourceFiles(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

// Patterns that indicate hardcoded secrets
const SECRET_PATTERNS = [
  // Anthropic API keys
  { name: "Anthropic API key", pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/ },
  // OpenAI API keys
  { name: "OpenAI API key", pattern: /sk-[a-zA-Z0-9]{20,}/ },
  // Google AI API keys (AIzaSy prefix)
  { name: "Google API key", pattern: /AIzaSy[a-zA-Z0-9_-]{30,}/ },
  // Generic "key" = "value" assignments with long alphanumeric values
  { name: "Hardcoded key assignment", pattern: /(?:api[_-]?key|apikey|secret|token)\s*[:=]\s*["'][a-zA-Z0-9_-]{20,}["']/i },
  // Bearer token in code (not as a template/variable)
  { name: "Hardcoded Bearer token", pattern: /Bearer\s+[a-zA-Z0-9_-]{20,}(?!["'}\s]*\$)/ },
];

// Files that should never be committed
const FORBIDDEN_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  "secrets.json",
  "credentials.json",
];

describe("security: no hardcoded secrets in source files", () => {
  const sourceFiles = getSourceFiles(ROOT);

  for (const file of sourceFiles) {
    const relPath = path.relative(ROOT, file);

    it(`${relPath} contains no API keys or secrets`, () => {
      const content = fs.readFileSync(file, "utf8");

      for (const { name, pattern } of SECRET_PATTERNS) {
        const match = content.match(pattern);
        if (match) {
          // Allow patterns that are clearly template/variable references
          const context = content.substring(
            Math.max(0, match.index - 30),
            Math.min(content.length, match.index + match[0].length + 30)
          );
          // Skip if it's inside a variable interpolation or assignment from a variable
          if (/\$\{|settings\.|data\.|\.apiKey|\.value|chrome\.storage/.test(context)) {
            continue;
          }
          assert.fail(
            `Found potential ${name} in ${relPath}: "${match[0].substring(0, 12)}..."`
          );
        }
      }
    });
  }
});

describe("security: no secret files in repository", () => {
  for (const filename of FORBIDDEN_FILES) {
    it(`${filename} should not exist in the repo`, () => {
      const exists = fs.existsSync(path.join(ROOT, filename));
      assert.equal(exists, false, `${filename} should not be committed to the repository`);
    });
  }
});

describe("security: .gitignore includes secret patterns", () => {
  it(".gitignore exists", () => {
    assert.ok(fs.existsSync(path.join(ROOT, ".gitignore")));
  });

  it(".gitignore blocks .env files", () => {
    const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.ok(gitignore.includes(".env"), ".gitignore should include .env");
  });

  it(".gitignore blocks credential files", () => {
    const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.ok(gitignore.includes("credentials.json"), ".gitignore should include credentials.json");
    assert.ok(gitignore.includes("secrets.json"), ".gitignore should include secrets.json");
  });

  it(".gitignore blocks key files", () => {
    const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.ok(gitignore.includes("*.key"), ".gitignore should include *.key");
    assert.ok(gitignore.includes("*.pem"), ".gitignore should include *.pem");
  });
});

describe("security: manifest permissions are minimal", () => {
  it("only requests necessary permissions", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
    const allowed = ["sidePanel", "activeTab", "storage"];
    for (const perm of manifest.permissions) {
      assert.ok(
        allowed.includes(perm),
        `Unexpected permission "${perm}" in manifest.json`
      );
    }
  });

  it("host_permissions only include expected domains", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
    const allowedDomains = [
      "arxiv.org",
      "alphaxiv.org",
      "export.arxiv.org",
      "api.anthropic.com",
      "api.openai.com",
      "generativelanguage.googleapis.com",
    ];
    for (const hostPerm of manifest.host_permissions) {
      const domain = hostPerm.replace(/^https:\/\/(?:www\.)?/, "").replace(/\/\*$/, "");
      assert.ok(
        allowedDomains.includes(domain),
        `Unexpected host permission "${hostPerm}" in manifest.json`
      );
    }
  });
});
