import { createApiClient } from './api-client.mjs';
const client = createApiClient(import.meta.env.VITE_CODEX_API_BASE_URL || '', (...args: Parameters<typeof fetch>) => fetch(...args));
export const backendConfigured = client.configured;
export const request = client.request;
export const authUrl = client.authUrl;
