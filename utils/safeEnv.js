// Tarayıcı ve test süreçlerine verilecek ortam: gizli anahtarlar ayıklanır.
// Chromium güvenilmeyen sitelerde çalıştığı için bir tarayıcı açığı durumunda
// JWT_SECRET, ENCRYPTION_KEY, DPU ve AI anahtarları süreç ortamından okunamamalıdır.
const SECRET_NAME = /(SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|ENCRYPTION|CREDENTIAL|^DPU_|^JWT_)/i;
const KEEP = /^(PLAYWRIGHT_|XDG_|CHROME_PATH$|HEADLESS$|DOCKER_ENV$|ALLOWED_TEST_PORTS$|ENFORCE_NAV_ALLOWLIST$|RUN_LIVE_FRAME_)/i;

export function safeChildEnv(base = process.env, extra = {}) {
    const env = {};
    for (const [key, value] of Object.entries(base)) {
        if (value === undefined) continue;
        if (SECRET_NAME.test(key) && !KEEP.test(key)) continue;
        env[key] = value;
    }
    return { ...env, ...extra };
}
