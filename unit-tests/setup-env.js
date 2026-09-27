// Birim testlerde env.js'in fail-fast kontrolünden geçmek için sahte değerler
process.env.JWT_SECRET ||= 'test-secret-for-unit-tests-only';
process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.DPU_BASE_URL ||= 'http://127.0.0.1:9';
process.env.DPU_API_KEY ||= 'x';
process.env.DPU_PROJECT_CODE ||= 'x';
process.env.DPU_USER_EMAIL ||= 'x@x';
process.env.DPU_USER_PASSWORD ||= 'x';
