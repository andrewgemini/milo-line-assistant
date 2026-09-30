import { describe, expect, it } from "vitest";
import { GITHUB_CRON_AUDIENCE, GITHUB_CRON_REF, GITHUB_CRON_REPOSITORY, GITHUB_CRON_WORKFLOW_REF, trustedGitHubCronClaims } from "./githubCronAuth";

describe("GitHub Actions cron identity policy", () => {
  const valid = {
    iss: "https://token.actions.githubusercontent.com",
    aud: GITHUB_CRON_AUDIENCE,
    repository: GITHUB_CRON_REPOSITORY,
    ref: GITHUB_CRON_REF,
    workflow_ref: GITHUB_CRON_WORKFLOW_REF,
    event_name: "schedule",
  };

  it("accepts the scheduler workflow on main", () => {
    expect(trustedGitHubCronClaims(valid)).toBe(true);
    expect(trustedGitHubCronClaims({ ...valid, event_name: "workflow_dispatch" })).toBe(true);
  });

  it("rejects another repository", () => {
    expect(trustedGitHubCronClaims({ ...valid, repository: "someone/fork" })).toBe(false);
  });

  it("rejects another branch", () => {
    expect(trustedGitHubCronClaims({ ...valid, ref: "refs/heads/dev" })).toBe(false);
  });

  it("rejects another workflow", () => {
    expect(trustedGitHubCronClaims({ ...valid, workflow_ref: `${GITHUB_CRON_REPOSITORY}/.github/workflows/other.yml@${GITHUB_CRON_REF}` })).toBe(false);
  });

  it("rejects non-scheduled pull request identities", () => {
    expect(trustedGitHubCronClaims({ ...valid, event_name: "pull_request" })).toBe(false);
  });
});
