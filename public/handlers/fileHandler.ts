/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    IpcResult,
    IpcErrorCode,
    successResult,
    errorResult
} from '../types/ipcTypes';

// Restrict to current user's home directory only
export const SAFE_ROOT = os.homedir();

// Allowed file extensions for read operations
const ALLOWED_EXTENSIONS = ['.json'];

// Maximum directory depth to prevent deep traversal
const MAX_DIRECTORY_DEPTH = 10;

/**
 * Validate that a file has an allowed extension
 */
const checkFileExtension = (fileName: string): boolean => {
    const ext = path.extname(fileName).toLowerCase();
    return ALLOWED_EXTENSIONS.indexOf(ext) >= 0;
};

/**
 * Validate and resolve a path within SAFE_ROOT
 */
const checkPath = (filePath: string): string => {
    const normalizedInput = path.normalize(filePath);
    const resolvedPath = path.resolve(SAFE_ROOT, normalizedInput);

    let realPath: string;
    try {
        realPath = fs.realpathSync(resolvedPath);
    } catch {
        realPath = resolvedPath;
    }

    const normalizedSafeRoot = path.normalize(SAFE_ROOT);

    if (!realPath.startsWith(normalizedSafeRoot + path.sep) && realPath !== normalizedSafeRoot) {
        throw new Error('PATH_OUTSIDE_ROOT');
    }

    const relativePath = path.relative(normalizedSafeRoot, realPath);
    const depth = relativePath.split(path.sep).filter((p: string) => p && p !== '.').length;
    if (depth > MAX_DIRECTORY_DEPTH) {
        throw new Error('PATH_TOO_DEEP');
    }

    return realPath;
};

/**
 * Check if file extension is JSON
 */
const isFileExtensionJson = (fileName: string): boolean => {
    const i = fileName.lastIndexOf('.');
    return i > 0 && fileName.substr(i) === '.json';
};

/**
 * Read file content from local filesystem
 */
const readFileFromLocal = (filePath: string, fileName: string): string => {
    if (!checkFileExtension(fileName)) {
        throw new Error('INVALID_EXTENSION');
    }

    const resolvedPath = checkPath(`${filePath}/${fileName}`);
    const realFilePath = fs.realpathSync(resolvedPath);
    const normalizedSafeRoot = path.normalize(SAFE_ROOT);

    if (!realFilePath.startsWith(normalizedSafeRoot + path.sep)) {
        throw new Error('PATH_OUTSIDE_ROOT');
    }

    return fs.readFileSync(realFilePath, 'utf-8');
};

/**
 * Find a file matching the expected DTDL @id
 */
// tslint:disable-next-line:cyclomatic-complexity
const findMatchingFile = (filePath: string, fileNames: string[], expectedFileName: string): string | null => {
    const filesWithParsingError: string[] = [];

    for (const fileName of fileNames) {
        if (isFileExtensionJson(fileName)) {
            try {
                const data = readFileFromLocal(filePath, fileName);
                const parsedData = JSON.parse(data);
                if (parsedData) {
                    if (Array.isArray(parsedData)) {
                        for (const pd of parsedData) {
                            if (pd['@id']?.toString() === expectedFileName) {
                                return pd;
                            }
                        }
                    } else {
                        if (parsedData['@id']?.toString() === expectedFileName) {
                            return data;
                        }
                    }
                }
            } catch (error) {
                filesWithParsingError.push(`${fileName}: ${error.message}`);
            }
        }
    }

    if (filesWithParsingError.length > 0) {
        throw new Error(filesWithParsingError.join(', '));
    }

    return null;
};

/**
 * IPC Handler: Read file with DTDL matching
 */
export const handleFileRead = async (
    _event: Electron.IpcMainInvokeEvent,
    filePath: string,
    fileName: string
): Promise<IpcResult<object | null>> => {
    try {
        if (!filePath || !fileName) {
            return errorResult(
                IpcErrorCode.INVALID_INPUT,
                'Path and fileName are required',
                false
            );
        }

        const resolvedPath = checkPath(filePath);
        const fileNames = fs.readdirSync(resolvedPath);
        const foundContent = findMatchingFile(resolvedPath, fileNames, fileName);

        if (!foundContent) {
            return successResult(null); // No content found (equivalent to 204)
        }

        return successResult(typeof foundContent === 'string' ? JSON.parse(foundContent) : foundContent);
    } catch (error) {
        if (error.message === 'PATH_OUTSIDE_ROOT' || error.message === 'PATH_TOO_DEEP') {
            return errorResult(
                IpcErrorCode.PATH_OUTSIDE_ROOT,
                'Access denied. Path is outside allowed directory.',
                false
            );
        }

        return errorResult(
            IpcErrorCode.FILE_NOT_FOUND,
            error.message || 'Unable to find matching file',
            false
        );
    }
};

/**
 * IPC Handler: Read file directly (naive - no DTDL matching)
 */
export const handleFileReadNaive = async (
    _event: Electron.IpcMainInvokeEvent,
    filePath: string,
    fileName: string
): Promise<IpcResult<object>> => {
    try {
        if (!filePath || !fileName) {
            return errorResult(
                IpcErrorCode.INVALID_INPUT,
                'Path and fileName are required',
                false
            );
        }

        const data = readFileFromLocal(filePath, fileName);
        const parsed = JSON.parse(data); // Validate JSON format

        return successResult(parsed);
    } catch (error) {
        if (error.message === 'PATH_OUTSIDE_ROOT' || error.message === 'PATH_TOO_DEEP') {
            return errorResult(
                IpcErrorCode.PATH_OUTSIDE_ROOT,
                'Access denied. Path is outside allowed directory.',
                false
            );
        }

        if (error.message === 'INVALID_EXTENSION') {
            return errorResult(
                IpcErrorCode.INVALID_INPUT,
                'Access denied. File type not allowed.',
                false
            );
        }

        if (error instanceof SyntaxError) {
            return errorResult(
                IpcErrorCode.INVALID_JSON,
                'File content is not valid JSON',
                false
            );
        }

        return errorResult(
            IpcErrorCode.FILE_NOT_FOUND,
            error.message || 'Failed to read file',
            false
        );
    }
};

/**
 * IPC Handler: List directories
 */
export const handleDirectoriesList = async (
    _event: Electron.IpcMainInvokeEvent,
    dir: string
): Promise<IpcResult<string[]>> => {
    try {
        // Return safe root for default directory request
        if (!dir || dir === '$DEFAULT') {
            return successResult([SAFE_ROOT]);
        }

        const resolvedPath = checkPath(dir);
        const result: string[] = [];

        for (const item of fs.readdirSync(resolvedPath)) {
            try {
                const itemPath = fs.realpathSync(path.join(resolvedPath, item));

                // Ensure itemPath is still inside resolvedPath
                if (itemPath.startsWith(resolvedPath + path.sep)) {
                    const stat = fs.statSync(itemPath);
                    if (stat.isDirectory()) {
                        result.push(item);
                    }
                }
            } catch {
                // Ignore errors and continue
            }
        }

        return successResult(result);
    } catch (error) {
        if (error.message === 'PATH_OUTSIDE_ROOT' || error.message === 'PATH_TOO_DEEP') {
            return errorResult(
                IpcErrorCode.PATH_OUTSIDE_ROOT,
                'Access denied. Path is outside allowed directory.',
                false
            );
        }

        return errorResult(
            IpcErrorCode.DIRECTORY_NOT_FOUND,
            'Failed to fetch directories',
            false
        );
    }
};
