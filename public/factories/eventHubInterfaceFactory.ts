/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { ipcRenderer } from 'electron';
import { MESSAGE_CHANNELS } from '../constants';
import { EventHubInterface } from '../interfaces/eventHubInterface';
import { EventHubMonitorParams, EventHubMessage, IpcResult } from '../types/ipcTypes';
import { invokeInMainWorld } from '../utils/invokeHelper';

// Store callbacks for message listeners
const messageCallbacks = new Map<(messages: EventHubMessage[]) => void, (event: Electron.IpcRendererEvent, messages: EventHubMessage[]) => void>();

export const generateEventHubInterface = (): EventHubInterface => {
    return {
        startMonitoring: async (params: EventHubMonitorParams): Promise<IpcResult<void>> => {
            return invokeInMainWorld<IpcResult<void>>(MESSAGE_CHANNELS.EVENTHUB_MONITOR_START, params);
        },

        stopMonitoring: async (): Promise<IpcResult<void>> => {
            return invokeInMainWorld<IpcResult<void>>(MESSAGE_CHANNELS.EVENTHUB_MONITOR_STOP);
        },

        onMessages: (callback: (messages: EventHubMessage[]) => void): void => {
            // Wrap callback to handle IPC event signature
            const wrappedCallback = (_event: Electron.IpcRendererEvent, messages: EventHubMessage[]) => {
                callback(messages);
            };
            messageCallbacks.set(callback, wrappedCallback);
            ipcRenderer.on(MESSAGE_CHANNELS.EVENTHUB_MESSAGES, wrappedCallback);
        },

        removeMessagesListener: (callback: (messages: EventHubMessage[]) => void): void => {
            const wrappedCallback = messageCallbacks.get(callback);
            if (wrappedCallback) {
                ipcRenderer.removeListener(MESSAGE_CHANNELS.EVENTHUB_MESSAGES, wrappedCallback);
                messageCallbacks.delete(callback);
            }
        }
    };
};
