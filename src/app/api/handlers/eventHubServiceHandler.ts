/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { getEventHubInterface } from '../shared/interfaceUtils';
import { EventHubMonitorParams } from '../../../../public/types/ipcTypes';

export const startEventHubMonitoring = async (params: EventHubMonitorParams): Promise<void> => {
    const eventHubInterface = getEventHubInterface();
    const result = await eventHubInterface.startMonitoring(params);

    if (!result.success) {
        throw new Error(result.error?.message || 'Failed to start Event Hub monitoring');
    }
};

export const stopEventHubMonitoring = async (): Promise<void> => {
    const eventHubInterface = getEventHubInterface();
    const result = await eventHubInterface.stopMonitoring();

    if (!result.success) {
        // Don't throw if not monitoring - just ignore
        if (result.error?.code !== 'NOT_MONITORING') {
            throw new Error(result.error?.message || 'Failed to stop Event Hub monitoring');
        }
    }
};
