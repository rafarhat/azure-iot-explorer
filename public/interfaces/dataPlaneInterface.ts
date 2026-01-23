/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { IpcResult, DataPlaneRequest, DataPlaneResponse } from '../types/ipcTypes';

export interface DataPlaneInterface {
    request: (params: DataPlaneRequest) => Promise<IpcResult<DataPlaneResponse>>;
}
