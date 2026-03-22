module.exports = {
  testEnvironment: 'node',
  rootDir: '..',
  testMatch: ['**/tests/unit/**/*.test.ts', '**/tests/integration/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['<rootDir>/functions/node_modules/ts-jest', {
      tsconfig: '<rootDir>/functions/tsconfig.json',
      diagnostics: {
        // TS6133: 未使用変数
        // TS2307: 統合テストで functions/node_modules 外のパッケージ型解決失敗
        // TS7006: @netlify/functions 未解決時の implicit any
        // TS2353/TS2322: netlify/functions/api.ts は netlify tsconfig でビルドするため jest では型チェック対象外
        ignoreCodes: ['TS6133', 'TS2307', 'TS7006', 'TS2353', 'TS2322'],
      },
    }],
  },
  moduleNameMapper: {
    '^firebase-admin$': '<rootDir>/functions/node_modules/firebase-admin/lib/index.js',
    '^firebase-admin/firestore$': '<rootDir>/functions/node_modules/firebase-admin/lib/firestore/index.js',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
  },
  moduleDirectories: [
    'node_modules',
    '<rootDir>/functions/node_modules',
    '<rootDir>/netlify/functions/node_modules',
  ],
  coverageThreshold: {
    global: {
      lines: 75,
      branches: 70,
    },
  },
}
