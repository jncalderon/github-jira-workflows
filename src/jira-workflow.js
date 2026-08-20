// Jira keys normally follow the PROJECT-123 format. The global flag allows
// multiple keys to be found in one branch name, commit message, or PR field.
const DEFAULT_ID_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/gi;

/**
 * Extract unique Jira issue keys from a list of text values.
 *
 * A new RegExp instance is created for every value so that a global regular
 * expression never carries its lastIndex state from one value to the next.
 */
function extractIssueKeys(values, pattern = DEFAULT_ID_PATTERN) {
  const keys = new Set();

  for (const value of values || []) {
    if (!value) continue;

    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const matcher = new RegExp(pattern.source, flags);

    for (const match of value.matchAll(matcher)) {
      keys.add(match[1].toUpperCase());
    }
  }

  return [...keys];
}

/**
 * Convert a GitHub event payload into the transition rule it may trigger.
 *
 * This function only selects a destination and the exact statuses that are
 * allowed to move. It intentionally does not find intermediate Jira paths.
 */
function eventContext(payload, eventName, stagingBranch = "staging", mainBranch = "main") {
  const texts = [];
  const branches = [];
  let targetBranch;

  if (eventName === "create") {
    // The create event exposes the created branch in payload.ref.
    branches.push(payload.ref);
  } else if (eventName === "push") {
    // Push payloads use refs/heads/<branch>; issue keys may also be in commits.
    branches.push(payload.ref?.replace(/^refs\/heads\//, ""));
    for (const commit of payload.commits || []) texts.push(commit.message);
    texts.push(payload.head_commit?.message);
  } else if (eventName === "pull_request" && payload.action === "closed" && payload.pull_request?.merged) {
    // A closed PR is relevant only when GitHub confirms that it was merged.
    targetBranch = payload.pull_request.base?.ref;
    branches.push(payload.pull_request.head?.ref);
    texts.push(payload.pull_request.title, payload.pull_request.body, payload.pull_request.merge_commit_sha);

    // The reusable workflow enriches this array with all PR commit messages
    // and associated branch names before calling eventContext.
    for (const commit of payload.pull_request.commits || []) texts.push(commit.message);
  }

  const keys = extractIssueKeys([...branches, ...texts]);
  let destination;
  let requiredStatus;

  // Branch creation and commits can start or restart work, but only from one
  // of the two explicitly supported starting statuses.
  if (eventName === "create" || eventName === "push") {
    destination = "In Progress";
    requiredStatus = ["To Do", "Rejected"];
  } else if (targetBranch === stagingBranch) {
    // A staging merge advances only issues that are already In Progress.
    destination = "Waiting Test";
    requiredStatus = ["In Progress"];
  } else if (targetBranch === mainBranch) {
    // Done requires the manual approval represented by the exact Test Ok status.
    destination = "Done";
    requiredStatus = ["Test Ok"];
  }

  return { keys, destination, requiredStatus, targetBranch };
}

/**
 * Make an authenticated Jira REST API request.
 */
async function jiraRequest(baseUrl, auth, path, options = {}) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${auth}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Jira API ${response.status} at ${path}: ${await response.text()}`);
  }

  return response.status === 204 ? null : response.json();
}

/**
 * Apply the selected rule independently to every detected Jira issue.
 *
 * The current status is checked before the transitions endpoint is called.
 * Issues in any other status are logged and left untouched.
 */
async function processTickets({ keys, destination, requiredStatus }, config, log = console) {
  if (!destination || !keys.length) return [];

  const auth = Buffer.from(`${config.user}:${config.token}`).toString("base64");
  const results = [];

  for (const key of keys) {
    const issue = await jiraRequest(
      config.baseUrl,
      auth,
      `/rest/api/3/issue/${encodeURIComponent(key)}?fields=status`
    );
    const current = issue.fields?.status?.name;

    // This exact comparison is the safety boundary for every automatic change.
    if (!requiredStatus.includes(current)) {
      log.info(`${key}: current status "${current}" does not match [${requiredStatus.join(", ")}]; no change.`);
      results.push({ key, current, changed: false });
      continue;
    }

    const transitions = await jiraRequest(
      config.baseUrl,
      auth,
      `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`
    );
    const transition = transitions.transitions?.find((item) => item.to?.name === destination);

    if (!transition) {
      throw new Error(`${key}: no Jira transition to "${destination}" from "${current}".`);
    }

    await jiraRequest(
      config.baseUrl,
      auth,
      `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transition: { id: transition.id } })
      }
    );

    log.info(`${key}: ${current} -> ${destination}`);
    results.push({ key, current, destination, changed: true });
  }

  return results;
}

module.exports = { extractIssueKeys, eventContext, processTickets };
