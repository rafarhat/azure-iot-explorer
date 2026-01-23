/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/

/**
 * Standard IPC response wrapper for all IPC handlers
 */
export interface IpcResult<T> {
    success: boolean;
    data?: T;
    error?: IpcError;
}

/**
 * Structured error information for IPC responses
 */
export interface IpcError {
    code: IpcErrorCode;
    message: string;
    details?: unknown;
    retryable: boolean;
}

/**
 * Error codes for IPC operations
 */
export enum IpcErrorCode {
    // General errors
    INVALID_INPUT = 'INVALID_INPUT',
    INTERNAL_ERROR = 'INTERNAL_ERROR',

    // Data plane errors
    DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
    UNAUTHORIZED = 'UNAUTHORIZED',
    HUB_UNREACHABLE = 'HUB_UNREACHABLE',
    RATE_LIMITED = 'RATE_LIMITED',
    INVALID_HOST = 'INVALID_HOST',
    INVALID_PATH = 'INVALID_PATH',
    INVALID_QUERY = 'INVALID_QUERY',

    // File system errors
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
    INVALID_JSON = 'INVALID_JSON',
    PATH_OUTSIDE_ROOT = 'PATH_OUTSIDE_ROOT',

    // Event Hub errors
    CONNECTION_FAILED = 'CONNECTION_FAILED',
    ALREADY_MONITORING = 'ALREADY_MONITORING',
    NOT_MONITORING = 'NOT_MONITORING',
}

/**
 * Data plane request parameters
 */
export interface DataPlaneRequest {
    apiVersion: string;
    body?: string;
    headers?: Record<string, string>;
    hostName: string;
    httpMethod: string;
    path: string;
    sharedAccessSignature: string;
    queryString?: string;
}

/**
 * Data plane response from Azure IoT Hub
 */
export interface DataPlaneResponse {
    body: unknown;
    azureStatusCode?: number;
    headers?: Record<string, string>;
}

/**
 * Event Hub monitoring parameters
 */
export interface EventHubMonitorParams {
    deviceId: string;
    moduleId?: string;
    hubConnectionString?: string;
    customEventHubConnectionString?: string;
    consumerGroup: string;
}

/**
 * Event Hub message structure
 */
export interface EventHubMessage {
    body: unknown;
    enqueuedTime: string;
    sequenceNumber: number;
    properties?: Record<string, unknown>;
    systemProperties?: Record<string, string>;
}

/**
 * Helper function to create a success result
 */
export const successResult = <T>(data: T): IpcResult<T> => ({
    success: true,
    data
});

/**
 * Helper function to create an error result
 */
export const errorResult = <T>(
    code: IpcErrorCode,
    message: string,
    retryable: boolean = false,
    details?: unknown
): IpcResult<T> => ({
    success: false,
    error: {
        code,
        message,
        retryable,
        details
    }
});
