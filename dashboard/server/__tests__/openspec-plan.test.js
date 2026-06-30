const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TEST_PLANS_DIR = path.join(os.tmpdir(), `openspec-plan-test-${Date.now()}`);
process.env.CODECORTEX_PLANS_DIR = TEST_PLANS_DIR;

const {
  parseTasks,
  parseTasksFromFileContent,
  toSlug,
  makeSlug,
  detectPlanLocation,
  generateOpenSpecChange,
} = require("../lib/openspec-plan");

describe("parseTasks", () => {
  it("returns single task for prose (no number)", () => {
    assert.deepEqual(parseTasks("Fix the login bug"), ["Fix the login bug"]);
  });

  it("splits period-numbered list", () => {
    assert.deepEqual(
      parseTasks("1. Create route\n2. Add test\n3. Update docs"),
      ["Create route", "Add test", "Update docs"]
    );
  });

  it("splits paren-numbered list", () => {
    assert.deepEqual(
      parseTasks("1) Step one\n2) Step two"),
      ["Step one", "Step two"]
    );
  });

  it("returns single task when only one numbered item (strips number)", () => {
    assert.deepEqual(parseTasks("1. Only task"), ["Only task"]);
  });
});

describe("parseTasksFromFileContent", () => {
  it("parses v1 header format", () => {
    const content = "# Plan: my-plan\n\n- [ ] Task one\n- [x] Task two\n";
    assert.deepEqual(parseTasksFromFileContent(content), [
      { done: false, text: "Task one" },
      { done: true, text: "Task two" },
    ]);
  });

  it("ignores non-checkbox lines", () => {
    const content = "## Why\n\nSome prose.\n\n- [ ] Real task\n";
    assert.deepEqual(parseTasksFromFileContent(content), [
      { done: false, text: "Real task" },
    ]);
  });

  it("returns empty for empty file", () => {
    assert.deepEqual(parseTasksFromFileContent(""), []);
  });
});

describe("toSlug", () => {
  it("lowercases and hyphenates", () => {
    assert.equal(toSlug("Fix Auth Bug"), "fix-auth-bug");
  });

  it("strips special chars", () => {
    assert.equal(toSlug("Add OAuth2 (Google)"), "add-oauth2-google");
  });

  it("truncates at 40 chars", () => {
    assert.ok(toSlug("a".repeat(50)).length <= 40);
  });
});

describe("makeSlug", () => {
  it("includes date, prefix, sessionId prefix, and 4-char hash", () => {
    const slug = makeSlug("abcdefghijklmnop");
    assert.match(slug, /^\d{4}-\d{2}-\d{2}-codecortex-abcdefgh-[a-z0-9]{4}$/);
  });

  it("produces different slugs for different sessionIds with same prefix", () => {
    const s1 = makeSlug("aaaaaaaa-1111");
    const s2 = makeSlug("aaaaaaaa-2222");
    assert.notEqual(s1, s2);
  });
});

describe("detectPlanLocation", () => {
  it("returns standalone when cwd has no openspec/", () => {
    const result = detectPlanLocation("/no/openspec/here", "sess-abc12345");
    assert.equal(result.type, "standalone");
    assert.equal(result.changeDir, path.join(TEST_PLANS_DIR, "sess-abc12345"));
  });

  it("returns openspec when cwd has openspec/ directory", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openspec-detect-test-"));
    try {
      fs.mkdirSync(path.join(tmp, "openspec"));
      const result = detectPlanLocation(tmp, "sess-abc12345");
      assert.equal(result.type, "openspec");
      assert.ok(result.changeDir.includes(path.join(tmp, "openspec", "changes")));
      assert.ok(result.changeDir.includes("codecortex-sess-abc"));
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});

describe("generateOpenSpecChange", () => {
  it("creates .openspec.yaml, proposal.md, and tasks.md with v1-compat header", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openspec-gen-test-"));
    try {
      generateOpenSpecChange(tmp, "sess-test-123", "Fix auth bug", [
        "Update middleware",
        "Add test",
      ]);

      const yaml = fs.readFileSync(path.join(tmp, ".openspec.yaml"), "utf8");
      assert.ok(yaml.includes("schema: spec-driven"));
      assert.ok(yaml.includes("sess-test-123"));

      const proposal = fs.readFileSync(path.join(tmp, "proposal.md"), "utf8");
      assert.ok(proposal.includes("## Why"));
      assert.ok(proposal.includes("Fix auth bug"));
      assert.ok(proposal.includes("- Update middleware"));

      const tasks = fs.readFileSync(path.join(tmp, "tasks.md"), "utf8");
      assert.ok(tasks.startsWith("# Plan:"), "tasks.md must use v1 header format");
      assert.ok(tasks.includes("- [ ] Update middleware"));
      assert.ok(tasks.includes("- [ ] Add test"));
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });

  it("creates nested changeDir if it does not exist", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openspec-mkdir-test-"));
    try {
      const nested = path.join(tmp, "a", "b", "c");
      generateOpenSpecChange(nested, "sess-xyz", "Do thing", ["task one"]);
      assert.ok(fs.existsSync(path.join(nested, "tasks.md")));
    } finally {
      fs.rmSync(tmp, { recursive: true });
    }
  });
});
