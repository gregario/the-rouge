/**
 * Commitlint config.
 *
 * Conventional Commits: https://www.conventionalcommits.org/
 * Rouge adopts this for commit messages so learnings-extraction and retrospective
 * phases can mine git history structurally.
 *
 * Not wired into git hooks yet. Run manually: `npx commitlint --from HEAD~10`.
 * Wire-in target: Phase 2 pre-commit quality-gate hook.
 */

module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',     // new user-visible feature
        'fix',      // bug fix
        'docs',     // documentation only
        'refactor', // code restructure, no behavior change
        'test',     // test additions or fixes
        'chore',    // build / tooling / housekeeping
        'perf',     // performance improvement
        'ci',       // CI / pipeline changes
        'plan',     // plan-doc additions (Rouge convention)
        'followup', // follow-up to a prior PR (Rouge convention)
      ],
    ],
    'subject-case': [0],        // allow any subject case — Rouge conventions vary
    'header-max-length': [2, 'always', 100],
    'body-leading-blank': [2, 'always'],
  },
};
