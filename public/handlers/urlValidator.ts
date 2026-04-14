/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/

// Allowed Azure IoT Hub domain suffix
const ALLOWED_DOMAIN_SUFFIX = '.azure-devices.net';

// Allowed Azure Event Hubs domain suffix
const ALLOWED_EVENTHUB_DOMAIN_SUFFIX = '.servicebus.windows.net';

// Allowlist of headers that can be passed through from client
const ALLOWED_HEADERS = new Set([
    'content-type',
    'accept',
    'if-match',
    'if-none-match',
    'x-ms-max-item-count',
    'x-ms-continuation'
]);

// Blocked headers that should never be forwarded
const BLOCKED_HEADERS = new Set([
    'host',
    'authorization',  // We set this ourselves
    'cookie',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-real-ip',
    'forwarded'
]);

/**
 * Validates hostname is *.azure-devices.net or *.privatelink.azure-devices.net
 * - No path components (no slashes)
 * - No special characters except dots and hyphens in valid positions
 * - Each label follows DNS naming rules
 * - Must end with .azure-devices.net
 */
export function validateAzureIoTHostname(hostname: string): boolean {
    if (!hostname || typeof hostname !== 'string') {
        return false;
    }

    // Normalize to lowercase for validation
    const normalizedHost = hostname.toLowerCase().trim();

    // Must end with .azure-devices.net
    if (!normalizedHost.endsWith(ALLOWED_DOMAIN_SUFFIX)) {
        return false;
    }

    // Check for path injection - no slashes, backslashes, or encoded variants
    if (/[\/\\%]/.test(normalizedHost)) {
        return false;
    }

    // Check for other dangerous characters (URLs, ports, credentials)
    if (/[@#\?\&\=\:]/.test(normalizedHost)) {
        return false;
    }

    // Split into labels and validate each
    // e.g., 'myhub.azure-devices.net' -> ['myhub', 'azure-devices', 'net']
    // e.g., 'myhub.privatelink.azure-devices.net' -> ['myhub', 'privatelink', 'azure-devices', 'net']
    const labels = normalizedHost.split('.');

    // Must have exactly 3 labels (<hubname>.azure-devices.net)
    // or exactly 4 labels (<hubname>.privatelink.azure-devices.net)
    if (labels.length !== 3 && labels.length !== 4) {
        return false;
    }

    if (labels.length === 3) {
        // Verify the domain is exactly 'azure-devices.net'
        if (labels[1] !== 'azure-devices' || labels[2] !== 'net') {
            return false;
        }
    } else {
        // 4 labels: second must be 'privatelink'
        if (labels[1] !== 'privatelink' || labels[2] !== 'azure-devices' || labels[3] !== 'net') {
            return false;
        }
    }

    // Validate hub name (first label) follows DNS naming rules:
    // - 1-63 characters
    // - Alphanumeric and hyphens only
    // - Cannot start or end with hyphen
    const hubName = labels[0];
    const labelRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

    if (hubName.length === 0 || hubName.length > 63) {
        return false;
    }

    if (!labelRegex.test(hubName)) {
        return false;
    }

    return true;
}

/**
 * Validates hostname is *.servicebus.windows.net or *.privatelink.servicebus.windows.net
 * - No path components (no slashes)
 * - No special characters except dots and hyphens in valid positions
 * - Each label follows DNS naming rules
 * - Must end with .servicebus.windows.net
 */
export function validateEventHubHostname(hostname: string): boolean {
    if (!hostname || typeof hostname !== 'string') {
        return false;
    }

    const normalizedHost = hostname.toLowerCase().trim();

    if (!normalizedHost.endsWith(ALLOWED_EVENTHUB_DOMAIN_SUFFIX)) {
        return false;
    }

    // Check for path injection
    if (/[\/\\%]/.test(normalizedHost)) {
        return false;
    }

    // Check for dangerous characters
    if (/[@#\?\&\=\:]/.test(normalizedHost)) {
        return false;
    }

    // e.g., 'mynamespace.servicebus.windows.net' -> ['mynamespace', 'servicebus', 'windows', 'net']
    // e.g., 'mynamespace.privatelink.servicebus.windows.net' -> ['mynamespace', 'privatelink', 'servicebus', 'windows', 'net']
    const labels = normalizedHost.split('.');

    if (labels.length !== 4 && labels.length !== 5) {
        return false;
    }

    if (labels.length === 4) {
        if (labels[1] !== 'servicebus' || labels[2] !== 'windows' || labels[3] !== 'net') {
            return false;
        }
    } else {
        if (labels[1] !== 'privatelink' || labels[2] !== 'servicebus' || labels[3] !== 'windows' || labels[4] !== 'net') {
            return false;
        }
    }

    const namespaceName = labels[0];
    const labelRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

    if (namespaceName.length === 0 || namespaceName.length > 63) {
        return false;
    }

    if (!labelRegex.test(namespaceName)) {
        return false;
    }

    return true;
}

/**
 * Extract hostname from an EventHub connection string of the form:
 * Endpoint=sb://<hostname>/;SharedAccessKeyName=...;SharedAccessKey=...
 */
export function extractEventHubHostname(connectionString: string): string {
    if (!connectionString || typeof connectionString !== 'string') {
        throw new Error('Invalid EventHub connection string: missing or empty');
    }
    const match = connectionString.match(/Endpoint=sb:\/\/([^/;\s]+)/i);
    if (!match || !match[1]) {
        throw new Error('Invalid EventHub connection string: unable to extract Endpoint hostname');
    }
    return match[1];
}

/**
 * Sanitize headers from client request
 * Only allows safe headers through, blocks dangerous ones
 */
export function sanitizeHeaders(headers: Record<string, unknown> | undefined): Record<string, string> {
    const sanitized: Record<string, string> = {};

    if (!headers || typeof headers !== 'object') {
        return sanitized;
    }

    for (const [key, value] of Object.entries(headers)) {
        if (typeof key !== 'string' || typeof value !== 'string') {
            continue;
        }

        const lowerKey = key.toLowerCase();

        // Skip blocked headers
        if (BLOCKED_HEADERS.has(lowerKey)) {
            continue;
        }

        // Only allow explicitly allowed headers
        if (!ALLOWED_HEADERS.has(lowerKey)) {
            continue;
        }

        // Check for CRLF injection in header value
        if (/[\r\n\0]/.test(value)) {
            continue;
        }

        // Check for excessively long header values
        if (value.length > 8192) {
            continue;
        }

        sanitized[key] = value;
    }

    return sanitized;
}

/**
 * Validate path contains only safe characters
 */
export function validatePath(path: string): boolean {
    if (!path || typeof path !== 'string') {
        return false;
    }

    // Allow alphanumeric, hyphens, underscores, and forward slashes for path segments
    // But not double slashes, dots (path traversal), or other special chars
    const pathRegex = /^[a-zA-Z0-9\-_\/]+$/;

    if (!pathRegex.test(path)) {
        return false;
    }

    // Block path traversal attempts
    if (path.includes('..') || path.includes('//')) {
        return false;
    }

    return true;
}

/**
 * Validate query string contains only safe characters
 */
export function validateQueryString(queryString: string): boolean {
    if (!queryString || typeof queryString !== 'string') {
        return true; // Empty query string is valid
    }

    // Allow standard query string characters including ? at start, and hyphen in values
    const queryRegex = /^[a-zA-Z0-9=&_%.+?\-]+$/;

    return queryRegex.test(queryString);
}
