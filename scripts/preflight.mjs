const required = [
  "DATABASE_URL",
  "SPACE_SSO_SECRET",
  "INTEGRATION_ENCRYPTION_KEY",
  "API_KEY_HASH_SECRET",
  "TRACKING_SIGNING_SECRET",
  "IDENTITY_HASHING_SECRET",
  "LOYALTY_CODE_HASHING_SECRET",
  "PERSONALIZATION_HASHING_SECRET",
  "SECURITY_HASH_PEPPER",
  "CRON_SECRET",
  "NEXT_PUBLIC_APP_URL",
];

const errors = [];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) errors.push(`Missing required variables: ${missing.join(", ")}`);

const independentSecrets = [
  "SPACE_SSO_SECRET",
  "API_KEY_HASH_SECRET",
  "TRACKING_SIGNING_SECRET",
  "IDENTITY_HASHING_SECRET",
  "LOYALTY_CODE_HASHING_SECRET",
  "PERSONALIZATION_HASHING_SECRET",
  "SECURITY_HASH_PEPPER",
  "CRON_SECRET",
];
for (const name of independentSecrets) {
  if (process.env[name] && process.env[name].length < 32) {
    errors.push(`${name} must be at least 32 characters`);
  }
}

const configuredSecrets = independentSecrets
  .filter((name) => process.env[name])
  .map((name) => [name, process.env[name]]);
for (let i = 0; i < configuredSecrets.length; i += 1) {
  for (let j = i + 1; j < configuredSecrets.length; j += 1) {
    const [leftName, leftValue] = configuredSecrets[i];
    const [rightName, rightValue] = configuredSecrets[j];
    if (leftValue === rightValue) {
      errors.push(`${leftName} and ${rightName} must use independent values`);
    }
  }
}

if (process.env.INTEGRATION_ENCRYPTION_KEY) {
  try {
    const decoded = Buffer.from(process.env.INTEGRATION_ENCRYPTION_KEY, "base64");
    if (decoded.length !== 32) errors.push("INTEGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes");
  } catch {
    errors.push("INTEGRATION_ENCRYPTION_KEY must be valid base64");
  }
}

const requireTogether = (triggerNames, requiredNames, label) => {
  if (!triggerNames.some((name) => Boolean(process.env[name]))) return;
  const absent = requiredNames.filter((name) => !process.env[name]);
  if (absent.length) errors.push(`${label} requires: ${absent.join(", ")}`);
};

requireTogether(
  ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_FROM"],
  ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_FROM"],
  "Resend email",
);
requireTogether(
  ["QSTASH_TOKEN", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"],
  ["QSTASH_TOKEN", "QSTASH_CURRENT_SIGNING_KEY", "QSTASH_NEXT_SIGNING_KEY"],
  "QStash scheduling",
);
requireTogether(
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI"],
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "SPACE_API_SECRET"],
  "Google authentication",
);

for (const name of [
  "NEXT_PUBLIC_APP_URL",
  "BRAIN_URL",
  "SPACE_LOGIN_URL",
  "SPACE_REGISTER_URL",
  "SPACE_VERIFY_TOKEN_URL",
  "SPACE_GOOGLE_OAUTH_URL",
  "GOOGLE_REDIRECT_URI",
]) {
  const value = process.env[name];
  if (!value) continue;
  try {
    const url = new URL(value);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      errors.push(`${name} must use HTTPS in production`);
    }
  } catch {
    errors.push(`${name} must be a valid URL`);
  }
}

if (errors.length) {
  console.error(errors.map((error) => `ERROR: ${error}`).join("\n"));
  process.exit(1);
}
console.log("Production configuration preflight passed.");
