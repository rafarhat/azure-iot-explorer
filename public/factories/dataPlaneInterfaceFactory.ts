/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { MESSAGE_CHANNELS } from '../constants';
import { DataPlaneInterface } from '../interfaces/dataPlaneInterface';
import { DataPlaneRequest, IpcResult, DataPlaneResponse } from '../types/ipcTypes';
import { invokeInMainWorld } from '../utils/invokeHelper';

export const generateDataPlaneInterface = (): DataPlaneInterface => {
    return {
        request: async (params: DataPlaneRequest): Promise<IpcResult<DataPlaneResponse>> => {
            return invokeInMainWorld<IpcResult<DataPlaneResponse>>(MESSAGE_CHANNELS.DATAPLANE_REQUEST, params);
        }
    };
};
