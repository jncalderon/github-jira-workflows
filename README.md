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

# The reusable workflow reads pull request commits and associated branches.
permissions:
  contents: read
  pull-requests: read

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
      discord-webhook-url: ${{ secrets.DISCORD_WEBHOOK_URL }}
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

## Discord notifications

After a Jira transition succeeds, the reusable workflow sends a notification to the Discord webhook configured in the consumer repository. The webhook URL must be stored as the `DISCORD_WEBHOOK_URL` secret and passed to the reusable workflow as `discord-webhook-url`.

The messages are sent only for these transitions. Each Discord message uses the Jira issue subject as its title:

```text
{KEY} - {subject del tiquete}
```

For example: `DEV-12 - Add user management`.

- `In Progress` -> `Waiting Test`: `Hola equipo {KEY} se esta instalando en \`staging\`, en unos 10 minutos la instalación estará completada`
- `Test Ok` -> `Done`: `Hola equipo {KEY} se esta instalando en \`production\`, en unos 10 minutos la instalación estará completada`

`{KEY}` is replaced with the Jira issue key, for example `DEV-12`. No Discord message is sent for ignored tickets or for `To Do`/`Rejected` -> `In Progress`.

## Jira configuration

Configure these secrets in the consumer repository:

- `JIRA_BASE_URL`: Jira base URL, for example `https://your-company.atlassian.net`.
- `JIRA_USER`: Jira user email or API account.
- `JIRA_API_TOKEN`: API token with permission to read issues and execute transitions.
- `DISCORD_WEBHOOK_URL`: Discord webhook URL used for deployment notifications.

Jira status names must match the configured names exactly, including capitalization and spaces.

The reusable workflow explicitly checks out `jncalderon/github-jira-workflows` because GitHub Actions checks out the caller repository by default. This is required for the central workflow to load `src/jira-workflow.js`.
