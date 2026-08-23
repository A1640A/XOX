export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'web',
        'mobile',
        'e2e',
        'core',
        'shared',
        'db',
        'ui',
        'ci',
        'claude',
        'board',
        'deps',
        'docs',
      ],
    ],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
}
