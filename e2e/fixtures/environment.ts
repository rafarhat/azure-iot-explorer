export interface E2EEnvironment {
    connectionString: string;
    hubHostName: string;
    hubName: string;
    subscriptionId: string;
}

const parseConnectionString = (connectionString: string): Map<string, string> => {
    const values = new Map<string, string>();

    for (const segment of connectionString.split(';')) {
        const separatorIndex = segment.indexOf('=');
        if (separatorIndex > 0) {
            values.set(segment.slice(0, separatorIndex).trim(), segment.slice(separatorIndex + 1).trim());
        }
    }

    return values;
};

export const loadE2EEnvironment = (): E2EEnvironment => {
    const connectionString = process.env.E2E_IOTHUB_CONNECTION_STRING?.trim();
    if (!connectionString) {
        throw new Error('E2E_IOTHUB_CONNECTION_STRING must contain a connection string for a dedicated non-production IoT Hub.');
    }

    if (process.env.E2E_CONFIRM_NON_PRODUCTION !== 'true') {
        throw new Error('Set E2E_CONFIRM_NON_PRODUCTION=true to confirm the configured IoT Hub is dedicated to testing.');
    }

    const subscriptionId = process.env.E2E_AZURE_SUBSCRIPTION_ID?.trim();
    if (!subscriptionId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subscriptionId)) {
        throw new Error('E2E_AZURE_SUBSCRIPTION_ID must contain the Azure subscription ID for the test hub.');
    }

    const values = parseConnectionString(connectionString);
    const hubHostName = values.get('HostName');
    if (!hubHostName) {
        throw new Error('E2E_IOTHUB_CONNECTION_STRING is missing HostName.');
    }

    const normalizedHostName = hubHostName.toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])?(?:\.privatelink)?\.azure-devices\.(?:net|cn|us)$/.test(normalizedHostName)) {
        throw new Error('E2E_IOTHUB_CONNECTION_STRING must target a valid Azure IoT Hub hostname.');
    }

    const hubName = normalizedHostName.split('.')[0];
    if (!hubName) {
        throw new Error('Unable to derive the IoT Hub name from E2E_IOTHUB_CONNECTION_STRING.');
    }

    return {
        connectionString,
        hubHostName: normalizedHostName,
        hubName,
        subscriptionId,
    };
};

export const redactSecrets = (value: string, environment: E2EEnvironment): string => {
    return value
        .replaceAll(environment.connectionString, '[REDACTED_IOTHUB_CONNECTION_STRING]')
        .replace(/SharedAccessKey=[^;\s]+/gi, 'SharedAccessKey=[REDACTED]');
};
