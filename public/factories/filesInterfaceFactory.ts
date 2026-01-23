/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { MESSAGE_CHANNELS } from '../constants';
import { FilesInterface } from '../interfaces/filesInterface';
import { IpcResult } from '../types/ipcTypes';
import { invokeInMainWorld } from '../utils/invokeHelper';

export const generateFilesInterface = (): FilesInterface => {
    return {
        readFile: async (path: string, fileName: string): Promise<IpcResult<object | null>> => {
            return invokeInMainWorld<IpcResult<object | null>>(MESSAGE_CHANNELS.FILE_READ, path, fileName);
        },

        readFileNaive: async (path: string, fileName: string): Promise<IpcResult<object>> => {
            return invokeInMainWorld<IpcResult<object>>(MESSAGE_CHANNELS.FILE_READ_NAIVE, path, fileName);
        },

        listDirectories: async (path: string): Promise<IpcResult<string[]>> => {
            return invokeInMainWorld<IpcResult<string[]>>(MESSAGE_CHANNELS.DIRECTORIES_LIST, path);
        }
    };
};
