/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { fetchLocalFile, fetchDirectories, fetchLocalFileNaive } from './localRepoService';
import { ModelDefinitionNotFound } from '../models/modelDefinitionNotFoundError';
import { IpcErrorCode } from '../../../../public/types/ipcTypes';

describe('localRepoService', () => {
    const mockFilesInterface = (window as any).api_files;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('fetchLocalFile', () => {
        it('calls readFile with expected params', async () => {
            const mockResult = {
                success: true,
                data: { id: 'test-model' }
            };
            mockFilesInterface.readFile.mockResolvedValue(mockResult);

            const result = await fetchLocalFile('f:', 'test.json');
            expect(mockFilesInterface.readFile).toBeCalledWith('f:', 'test.json');
            expect(result).toEqual({ id: 'test-model' });
        });

        it('throws ModelDefinitionNotFound when file not found', async () => {
            const mockResult = {
                success: false,
                error: {
                    code: IpcErrorCode.FILE_NOT_FOUND,
                    message: 'File not found',
                    retryable: false
                }
            };
            mockFilesInterface.readFile.mockResolvedValue(mockResult);
            await expect(fetchLocalFile('f:', 'test.json')).rejects.toThrow(ModelDefinitionNotFound);
        });

        it('throws ModelDefinitionNotFound when data is null', async () => {
            const mockResult = {
                success: true,
                data: null
            };
            mockFilesInterface.readFile.mockResolvedValue(mockResult);
            await expect(fetchLocalFile('f:', 'test.json')).rejects.toThrow(ModelDefinitionNotFound);
        });
    });

    describe('fetchLocalFileNaive', () => {
        it('calls readFileNaive with expected params', async () => {
            const mockResult = {
                success: true,
                data: { id: 'test-model' }
            };
            mockFilesInterface.readFileNaive.mockResolvedValue(mockResult);

            const result = await fetchLocalFileNaive('f:', 'test.json');
            expect(mockFilesInterface.readFileNaive).toBeCalledWith('f:', 'test.json');
            expect(result).toEqual({ id: 'test-model' });
        });

        it('throws ModelDefinitionNotFound when request fails', async () => {
            const mockResult = {
                success: false,
                error: {
                    code: IpcErrorCode.FILE_NOT_FOUND,
                    message: 'File not found',
                    retryable: false
                }
            };
            mockFilesInterface.readFileNaive.mockResolvedValue(mockResult);
            await expect(fetchLocalFileNaive('f:', 'test.json')).rejects.toThrow(ModelDefinitionNotFound);
        });
    });

    describe('fetchDirectories', () => {
        it('calls listDirectories with expected params', async () => {
            const mockResult = {
                success: true,
                data: ['dir1', 'dir2']
            };
            mockFilesInterface.listDirectories.mockResolvedValue(mockResult);

            const result = await fetchDirectories('f:');
            expect(mockFilesInterface.listDirectories).toBeCalledWith('f:');
            expect(result).toEqual(['dir1', 'dir2']);
        });

        it('uses $DEFAULT for empty path', async () => {
            const mockResult = {
                success: true,
                data: ['/home/user']
            };
            mockFilesInterface.listDirectories.mockResolvedValue(mockResult);

            await fetchDirectories('');
            expect(mockFilesInterface.listDirectories).toBeCalledWith('$DEFAULT');
        });
    });
});
