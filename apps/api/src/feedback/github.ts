import { config } from "../config";

/** GitHub issues need a token and an `owner/name` repository. */
export function githubConfigured(): boolean {
  return Boolean(config.GITHUB_TOKEN && config.GITHUB_REPOSITORY);
}
