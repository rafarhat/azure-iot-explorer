/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { IpcResult } from '../types/ipcTypes';

export interface FilesInterface {
    readFile: (path: string, fileName: string) => Promise<IpcResult<object | null>>;
    readFileNaive: (path: string, fileName: string) => Promise<IpcResult<object>>;
    listDirectories: (path: string) => Promise<IpcResult<string[]>>;
}
