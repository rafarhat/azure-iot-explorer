/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import fetch, { Response } from 'node-fetch';
import {
    IpcResult,
    IpcErrorCode,
    DataPlaneRequest,
    DataPlaneResponse,
    successResult,
    errorResult
} from '../types/ipcTypes';

const DEVICE_STATUS_HEADER = 'x-ms-command-statuscode';

// Validation regex patterns
const HOST_REGEX = /^[a-zA-Z0-9\-\/_.]+\.azure-devices\.net$/;
const PATH_REGEX = /^[a-zA-Z0-9\-\/_]+$/;
const QUERY_STRING_REGEX = /^[a-zA-Z0-9=&_%-?]+$/;

/**
 * IPC Handler: Data plane request to Azure IoT Hub
 */
export const handleDataPlaneRequest = async (
    _event: Electron.IpcMainInvokeEvent,
    request: DataPlaneRequest
): Promise<IpcResult<DataPlaneResponse>> => {
    try {
        // Validate required fields
        if (!request) {
            return errorResult(
                IpcErrorCode.INVALID_INPUT,
                'Request body is required',
                false
            );
        }

        if (!request.hostName || !request.path || !request.httpMethod || !request.sharedAccessSignature) {
            return errorResult(
                IpcErrorCode.INVALID_INPUT,
                'hostName, path, httpMethod, and sharedAccessSignature are required',
                false
            );
        }

        // Validate host name
        if (!HOST_REGEX.test(request.hostName)) {
            return errorResult(
                IpcErrorCode.INVALID_HOST,
                'Invalid host name. Must be a valid Azure IoT Hub hostname.',
                false
            );
        }

        // Validate path
        if (!PATH_REGEX.test(request.path)) {
            return errorResult(
                IpcErrorCode.INVALID_PATH,
                'Invalid path. Path contains invalid characters.',
                false
            );
        }

        // Build query string
        const apiVersion = request.apiVersion || '2020-05-31-preview';
        const queryString = request.queryString
            ? `?${request.queryString}&api-version=${apiVersion}`
            : `?api-version=${apiVersion}`;

        // Validate query string
        if (!QUERY_STRING_REGEX.test(queryString)) {
            return errorResult(
                IpcErrorCode.INVALID_QUERY,
                'Invalid query string. Query string contains invalid characters.',
                false
            );
        }

        // Build request URL and headers
        const url = `https://${request.hostName}/${encodeURIComponent(request.path)}${queryString}`;
        const headers: Record<string, string> = {
            'Accept': 'application/json',
            'Authorization': request.sharedAccessSignature,
            'Content-Type': 'application/json',
            ...request.headers
        };

        // Make the request
        const response = await fetch(url, {
            method: request.httpMethod.toUpperCase(),
            headers,
            body: request.body
        });

        // Process response
        return processDataPlaneResponse(response);
    } catch (error) {
        // Network or other errors
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return errorResult(
                IpcErrorCode.HUB_UNREACHABLE,
                `Unable to reach IoT Hub: ${error.message}`,
                true
            );
        }

        return errorResult(
            IpcErrorCode.INTERNAL_ERROR,
            error.message || 'Unknown error occurred',
            true
        );
    }
};

/**
 * Process the data plane response from Azure IoT Hub
 */
// tslint:disable-next-line:cyclomatic-complexity
const processDataPlaneResponse = async (response: Response): Promise<IpcResult<DataPlaneResponse>> => {
    try {
        if (!response) {
            return errorResult(
                IpcErrorCode.HUB_UNREACHABLE,
                'Failed to get any response from IoT Hub service.',
                true
            );
        }

        // Extract headers for response
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        // Handle device command status code header (special case for direct methods)
        const deviceStatusCode = response.headers.get(DEVICE_STATUS_HEADER);
        if (deviceStatusCode) {
            let deviceResponseBody: unknown;
            try {
                deviceResponseBody = await response.json();
            } catch {
                return errorResult(
                    IpcErrorCode.INTERNAL_ERROR,
                    'Failed to parse response from device. The response is expected to be a JSON document up to 128 KB.',
                    false
                );
            }

            const statusCode = parseInt(deviceStatusCode, 10);
            return successResult({
                body: deviceResponseBody,
                azureStatusCode: statusCode,
                headers: responseHeaders
            });
        }

        // Handle 204 No Content
        if (response.status === 204) {
            return successResult({
                body: null,
                azureStatusCode: 204,
                headers: responseHeaders
            });
        }

        // Handle success responses (2xx)
        if (response.status >= 200 && response.status < 300) {
            let body: unknown;
            try {
                body = await response.json();
            } catch {
                body = null;
            }

            return successResult({
                body,
                azureStatusCode: response.status,
                headers: responseHeaders
            });
        }

        // Handle error responses
        let errorBody: unknown;
        try {
            errorBody = await response.json();
        } catch {
            errorBody = null;
        }

        // Map HTTP status codes to IPC error codes
        if (response.status === 401 || response.status === 403) {
            return errorResult(
                IpcErrorCode.UNAUTHORIZED,
                (errorBody as any)?.Message || 'Authentication failed',
                false,
                { azureStatusCode: response.status, body: errorBody }
            );
        }

        if (response.status === 404) {
            return errorResult(
                IpcErrorCode.DEVICE_NOT_FOUND,
                (errorBody as any)?.Message || 'Resource not found',
                false,
                { azureStatusCode: response.status, body: errorBody }
            );
        }

        if (response.status === 429) {
            return errorResult(
                IpcErrorCode.RATE_LIMITED,
                (errorBody as any)?.Message || 'Rate limit exceeded',
                true,
                { azureStatusCode: response.status, body: errorBody }
            );
        }

        // Generic error
        return errorResult(
            IpcErrorCode.INTERNAL_ERROR,
            (errorBody as any)?.Message || `Request failed with status ${response.status}`,
            response.status >= 500, // Server errors are retryable
            { azureStatusCode: response.status, body: errorBody }
        );
    } catch (error) {
        return errorResult(
            IpcErrorCode.INTERNAL_ERROR,
            error.message || 'Failed to process response',
            true
        );
    }
};
