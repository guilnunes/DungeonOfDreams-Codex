import { createApiClient } from './api-client.mjs';
const client = createApiClient(window.location.protocol === 'https:' ? window.location.origin : '', (...args: Parameters<typeof fetch>) => fetch(...args));
export const backendConfigured = client.configured;
export const request = client.request;
export const authUrl = client.authUrl;
