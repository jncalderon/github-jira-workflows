const test = require("node:test");
const assert = require("node:assert/strict");
const { extractIssueKeys, eventContext, processTickets } = require("../src/jira-workflow.js");

test("detecta múltiples IDs y elimina duplicados", () => {
  assert.deepEqual(extractIssueKeys(["add DEV-12 DEV-455 DEV-12"]), ["DEV-12", "DEV-455"]);
});

test("create y push habilitan solo To Do o Rejected", () => {
  assert.deepEqual(eventContext({ ref: "feature/DEV-12-work" }, "create").requiredStatus, ["To Do", "Rejected"]);
  assert.deepEqual(eventContext({ ref: "refs/heads/fix/DEV-455", commits: [{ message: "fix DEV-455" }] }, "push").keys, ["DEV-455"]);
});

test("merge a staging requiere In Progress", () => {
  const result = eventContext({ action: "closed", pull_request: { merged: true, base: { ref: "staging" }, head: { ref: "feature/DEV-12" }, title: "DEV-455", commits: [{ message: "DEV-93" }] } }, "pull_request");
  assert.deepEqual(result.keys, ["DEV-12", "DEV-455", "DEV-93"]);
  assert.equal(result.destination, "Waiting Test");
  assert.deepEqual(result.requiredStatus, ["In Progress"]);
});

test("merge a main requiere Test Ok", () => {
  const result = eventContext({ action: "closed", pull_request: { merged: true, base: { ref: "main" }, head: { ref: "staging/DEV-12" } } }, "pull_request");
  assert.deepEqual(result.keys, ["DEV-12"]);
  assert.equal(result.destination, "Done");
  assert.deepEqual(result.requiredStatus, ["Test Ok"]);
});

test("pull request cerrado sin merge no produce transiciones", () => {
  assert.deepEqual(eventContext({ action: "closed", pull_request: { merged: false, base: { ref: "main" }, head: { ref: "feature/DEV-12" } } }, "pull_request"), { keys: [], destination: undefined, requiredStatus: undefined, targetBranch: undefined });
});

test("no intenta Done si el estado actual no es Test Ok", async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ fields: { status: { name: "To Do" } } }) };
  };
  try {
    const results = await processTickets({ keys: ["DEV-12"], destination: "Done", requiredStatus: ["Test Ok"] }, { baseUrl: "https://jira.example", user: "user", token: "token" }, { info() {} });
    assert.deepEqual(results, [{ key: "DEV-12", current: "To Do", changed: false }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});
