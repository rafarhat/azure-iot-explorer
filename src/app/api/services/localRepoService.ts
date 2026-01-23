/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { getFilesInterface } from '../shared/interfaceUtils';
import { ModelDefinitionNotFound } from '../models/modelDefinitionNotFoundError';
import { ModelDefinitionNotValidJsonError } from '../models/modelDefinitionNotValidJsonError';
import { IpcErrorCode } from '../../../../public/types/ipcTypes';

export const fetchLocalFile = async (path: string, fileName: string): Promise<object> => {
    const filesInterface = getFilesInterface();
    const result = await filesInterface.readFile(path, fileName);

    if (!result.success) {
        const error = result.error!;
        if (error.code === IpcErrorCode.FILE_NOT_FOUND || error.code === IpcErrorCode.INTERNAL_ERROR) {
            throw new ModelDefinitionNotFound();
        }
        if (error.code === IpcErrorCode.INVALID_JSON) {
            throw new ModelDefinitionNotValidJsonError(error.message);
        }
        throw new Error(error.message);
    }

    // null data means no content found
    if (result.data === null) {
        throw new ModelDefinitionNotFound();
    }

    return result.data;
};

export const fetchLocalFileNaive = async (path: string, fileName: string): Promise<object> => {
    const filesInterface = getFilesInterface();
    const result = await filesInterface.readFileNaive(path, fileName);

    if (!result.success) {
        throw new ModelDefinitionNotFound();
    }

    return result.data!;
};

export const fetchDirectories = async (path: string): Promise<string[]> => {
    const filesInterface = getFilesInterface();
    const result = await filesInterface.listDirectories(path || '$DEFAULT');

    if (!result.success) {
        throw new Error(result.error?.message || 'Failed to fetch directories');
    }

    return result.data!;
};
