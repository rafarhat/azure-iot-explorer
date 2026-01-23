/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { IpcResult, EventHubMonitorParams, EventHubMessage } from '../types/ipcTypes';

export interface EventHubInterface {
    startMonitoring: (params: EventHubMonitorParams) => Promise<IpcResult<void>>;
    stopMonitoring: () => Promise<IpcResult<void>>;
    onMessages: (callback: (messages: EventHubMessage[]) => void) => void;
    removeMessagesListener: (callback: (messages: EventHubMessage[]) => void) => void;
}

// Keep legacy types for backward compatibility during migration
export interface StartEventHubMonitoringParameters {
    deviceId: string;
    moduleId: string;
    consumerGroup: string;
    customEventHubConnectionString?: string;
    hubConnectionString?: string;
}

export interface Message {
    body: any; // tslint:disable-line:no-any
    enqueuedTime: string;
    properties?: any; // tslint:disable-line:no-any
    systemProperties?: {[key: string]: string};
}
