import googleServices from '../../google-services.json';

type GoogleServicesConfig = {
    client?: Array<{
        oauth_client?: Array<{
            client_type?: number;
            client_id?: string;
        }>;
    }>;
};

const resolveGoogleWebClientId = (): string | null => {
    const envId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    if (envId && envId.length > 0) return envId;

    const config = googleServices as GoogleServicesConfig | undefined;
    const clients = config?.client ?? [];
    for (const client of clients) {
        const oauthClients = client?.oauth_client ?? [];
        for (const oauthClient of oauthClients) {
            if (oauthClient?.client_type === 3 && typeof oauthClient.client_id === 'string') {
                return oauthClient.client_id;
            }
        }
    }

    return null;
};

export const googleWebClientId = resolveGoogleWebClientId();
