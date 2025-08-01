const baseConfig = require('../../jest.config.base');

module.exports = {
  ...baseConfig,
  displayName: 'adapters',
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/../core/src/$1',
    '^@infra/(.*)$': '<rootDir>/../infra/src/$1',
    '^@shared/(.*)$': '<rootDir>/../shared/src/$1',
  },
};