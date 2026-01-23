/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { getConnectionInfoFromConnectionString, generateSasToken } from '../shared/utils';
import { getDataPlaneInterface } from '../shared/interfaceUtils';
import { AUTHENTICATION_METHOD_PREFERENCE, CONNECTION_STRING_NAME_LIST, CONNECTION_STRING_THROUGH_AAD } from '../../constants/browserStorage';
import { getActiveConnectionString } from '../../shared/utils/hubConnectionStringHelper';
import { AuthenticationMethodPreference } from '../../authentication/state';
import { DataPlaneRequest as IpcDataPlaneRequest, IpcResult, DataPlaneResponse, IpcErrorCode } from '../../../../public/types/ipcTypes';

// Re-export for backward compatibility
export type DataPlaneRequest = IpcDataPlaneRequest;

/**
 * Make a data plane request via IPC
 */
export const request = async (_endpoint: string, parameters: DataPlaneRequest): Promise<IpcResult<DataPlaneResponse>> => {
    const dataPlaneInterface = getDataPlaneInterface();
    return dataPlaneInterface.request(parameters);
};

export const getConnectionStringHelper = async () => {
    const authSelection = await localStorage.getItem(AUTHENTICATION_METHOD_PREFERENCE);
    if (authSelection === AuthenticationMethodPreference.ConnectionString) {
        return getActiveConnectionString(await localStorage.getItem(CONNECTION_STRING_NAME_LIST));
    }
    else {
        return localStorage.getItem(CONNECTION_STRING_THROUGH_AAD);
    }
};

export const dataPlaneConnectionHelper = async () => {
    const connectionString = await getConnectionStringHelper();
    const connectionInfo = getConnectionInfoFromConnectionString(connectionString);
    if (!(connectionInfo && connectionInfo.hostName)) {
        return;
    }

    const sasToken = generateSasToken({
        key: connectionInfo.sharedAccessKey,
        keyName: connectionInfo.sharedAccessKeyName,
        resourceUri: connectionInfo.hostName
    });

    return {
        connectionInfo,
        connectionString,
        sasToken,
    };
};

/**
 * Process IPC data plane response
 */
// tslint:disable-next-line:cyclomatic-complexity
export const dataPlaneResponseHelper = async <T = any>(result: IpcResult<DataPlaneResponse>): Promise<{ body: T; headers?: Record<string, string> } | undefined> => { // tslint:disable-line:no-any
    // Handle IPC error
    if (!result.success) {
        const error = result.error!;

        // Map IPC error codes to appropriate errors
        switch (error.code) {
            case IpcErrorCode.UNAUTHORIZED:
                throw new Error(error.message || 'Authentication failed');
            case IpcErrorCode.DEVICE_NOT_FOUND:
                throw new Error(error.message || 'Resource not found');
            case IpcErrorCode.HUB_UNREACHABLE:
                throw new Error(error.message || 'Unable to reach IoT Hub');
            case IpcErrorCode.RATE_LIMITED:
                throw new Error(error.message || 'Rate limit exceeded');
            case IpcErrorCode.INVALID_HOST:
            case IpcErrorCode.INVALID_PATH:
            case IpcErrorCode.INVALID_QUERY:
            case IpcErrorCode.INVALID_INPUT:
                throw new Error(error.message || 'Invalid request');
            default:
                throw new Error(error.message || 'Unknown error occurred');
        }
    }

    const response = result.data!;

    // Success with no content case (204)
    if (response.azureStatusCode === 204) {
        return;
    }

    // Success case (2xx)
    if (response.azureStatusCode && response.azureStatusCode >= 200 && response.azureStatusCode < 300) {
        return { body: response.body as T, headers: response.headers };
    }

    // Error case with message in body
    const body = response.body as any; // tslint:disable-line:no-any
    if (body) {
        if (body.Message || body.ExceptionMessage) {
            throw new Error(body.Message || body.ExceptionMessage);
        }
        if (body.message) {
            throw new Error(body.message);
        }
    }

    throw new Error(response.azureStatusCode?.toString() || 'Unknown error');
};
