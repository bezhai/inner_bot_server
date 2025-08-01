const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'infra',
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/../core/src/$1',
    '^@shared/(.*)$': '<rootDir>/../shared/src/$1',
  },
};