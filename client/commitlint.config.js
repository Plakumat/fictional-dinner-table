// Conventional Commits, with the scopes of this repository.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', ['core', 'state', 'api', 'ui', 'e2e', 'workbench', 'docs', 'tooling', 'deps']],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
    'header-max-length': [2, 'always', 100],
  },
};
