export function createApiClient(origin: string, fetcher?: typeof fetch): {
 configured: boolean;
 authUrl(action: 'login'|'logout'): string;
 request(path: string, options?: RequestInit): Promise<any>;
};
