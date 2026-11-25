import { defineConfig } from 'vitest/config';

// Tes integrasi memakai database MySQL TERPISAH (rampung_test), tidak pernah database pengembangan.
const TEST_DB = process.env.TEST_DATABASE_URL || 'mysql://root:@127.0.0.1:3306/rampung_test';

export default defineConfig({
  test: {
    globalSetup: ['tests/globalSetup.ts'],
    env: {
      DATABASE_URL: TEST_DB,
      AUTH_THROTTLE: '1000',
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      SUPERADMIN_EMAILS: '',
      SMTP_HOST: '',
    },
    fileParallelism: false, // semua berkas berbagi satu database tes
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
