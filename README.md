# github-jira-workflows

Centralized reusable GitHub Actions workflow for strict Jira transitions.

## Reusable workflow location

The reusable workflow must be stored in the central repository at exactly:

```text
.github/workflows/jira-reusable.yml
```

Its file name is `jira-reusable.yml`, its extension is `.yml`, and its full repository-relative path is `.github/workflows/jira-reusable.yml`.

The workflow is invoked from consumer repositories. The consumer repository must define the GitHub events and call the central workflow:

```yaml
# Consumer repository path:
# .github/workflows/jira.yml
name: Jira workflow

on:
  create:
  push:
    branches: ['**']
  pull_request:
    types: [closed]

jobs:
  jira:
    if: github.event_name != 'pull_request' || github.event.pull_request.merged == true
    uses: YOUR-GITHUB-OWNER/github-jira-workflows/.github/workflows/jira-reusable.yml@main
    with:
      staging-branch: staging
      main-branch: main
    secrets:
      jira-base-url: ${{ secrets.JIRA_BASE_URL }}
      jira-user: ${{ secrets.JIRA_USER }}
      jira-api-token: ${{ secrets.JIRA_API_TOKEN }}
```

Replace `YOUR-GITHUB-OWNER` with the exact GitHub organization or personal account that owns the central `github-jira-workflows` repository. Do not keep the placeholder.

For example, if the repository URL is `https://github.com/acme-platform/github-jira-workflows`, use:

```yaml
uses: acme-platform/github-jira-workflows/.github/workflows/jira-reusable.yml@main
```

If the repository belongs to a personal account, use that account name in the same position:

```yaml
uses: your-github-username/github-jira-workflows/.github/workflows/jira-reusable.yml@main
```

The consumer workflow file should therefore be named `jira.yml`, use the `.yml` extension, and be stored at `.github/workflows/jira.yml`. The central reusable workflow remains at `.github/workflows/jira-reusable.yml`.

## Detection and transition rules

The workflow detects Jira keys such as `DEV-123` in branch names, commit messages, pull request title/body, merge metadata, and branches associated with commits included in a pull request.

Each Jira issue is queried and evaluated independently:

| Exact current status | GitHub event | Destination status |
| --- | --- | --- |
| `To Do` | Branch creation or push containing the issue key | `In Progress` |
| `Rejected` | Branch creation or push containing the issue key | `In Progress` |
| `In Progress` | Merged pull request targeting `staging` | `Waiting Test` |
| `Test Ok` | Merged pull request targeting `main` | `Done` |

Any other combination is ignored. The workflow never repairs statuses, skips steps, or searches for an alternative transition path. In particular, a merge to `main` only affects issues that are already exactly in `Test Ok`.

## Jira configuration

Configure these secrets in the consumer repository:

- `JIRA_BASE_URL`: Jira base URL, for example `https://your-company.atlassian.net`.
- `JIRA_USER`: Jira user email or API account.
- `JIRA_API_TOKEN`: API token with permission to read issues and execute transitions.

Jira status names must match the configured names exactly, including capitalization and spaces.
