# Contributing

Thanks for your interest. This is a personal projects repo, so process is light, but branch names follow one convention so history stays readable.

## Branch names

| Pattern | Use it for |
|---|---|
| `feature/<name>` | New functionality (owner) |
| `defect/<name_of_feature_where_defect_was_found>` | Bug fixes (owner) |
| `contributor/feature/<name>` | New functionality from an outside contributor |
| `contributor/defect/<name_of_feature_where_defect_was_found>` | Bug fixes from an outside contributor |

`<name>` uses letters, digits, `.`, `_`, and `-` only, with no further slashes. Examples: `contributor/feature/jeopardy-timer`, `contributor/defect/jeopardy-timer`.

## Workflow

1. Branch from `main` using one of the patterns above.
2. Keep commits focused. Subject line in the imperative mood, 72 characters or fewer, with a body that explains why.
3. Open a pull request against `main`. Describe what changed and how you tested it.
4. Never force-push to a shared branch.

Use whatever local git workflow you like (clones, worktrees, GUI). Only the branch naming and PR-to-`main` rules are expected.
