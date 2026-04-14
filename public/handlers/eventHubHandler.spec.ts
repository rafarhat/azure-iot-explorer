/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import 'jest';

// Mock electron
jest.mock('electron', () => ({
    BrowserWindow: jest.fn(),
    ipcMain: { handle: jest.fn() }
}));

// Mock @azure/event-hubs
const mockSubscribe = jest.fn().mockReturnValue({ close: jest.fn() });
const mockClose = jest.fn();
const MockEventHubConsumerClient = jest.fn().mockImplementation(() => ({
    subscribe: mockSubscribe,
    close: mockClose
}));
jest.mock('@azure/event-hubs', () => ({
    EventHubConsumerClient: MockEventHubConsumerClient,
    earliestEventPosition: {}
}));

// Mock rhea-promise Connection
const mockConnectionOpen = jest.fn().mockResolvedValue(undefined);
const mockConnectionClose = jest.fn().mockResolvedValue(undefined);
const MockConnection = jest.fn().mockImplementation(() => ({
    open: mockConnectionOpen,
    close: mockConnectionClose,
    createReceiver: jest.fn().mockResolvedValue({
        on: jest.fn((event: string, handler: (context: any) => void) => {
            // Simulate an AMQP redirect error (the normal flow for IoT Hub → EventHub conversion)
            if (event === 'receiver_error') {
                                setTimeout(() => {
                    handler({
                        receiver: {
                            error: {
                                condition: 'amqp:link:redirect',
                                info: {
                                    hostname: 'test-redirect.servicebus.windows.net',
                                    address: 'amqps://test-redirect.servicebus.windows.net:5671/test-hub/$management'
                                }
                            }
                        }
                    });
                }, 0);
            }
        })
    })
}));
jest.mock('rhea-promise', () => ({
    Connection: MockConnection,
    ReceiverEvents: { receiverError: 'receiver_error' },
    parseConnectionString: jest.fn((cs: string) => {
        const obj: any = {};
        cs.split(';').forEach((segment: string) => {
            const idx = segment.indexOf('=');
            if (idx > 0) {
                obj[segment.substring(0, idx)] = segment.substring(idx + 1);
            }
        });
        return obj;
    }),
    isAmqpError: jest.fn().mockReturnValue(true)
}));

jest.mock('@azure/core-amqp', () => ({
    ErrorNameConditionMapper: { LinkRedirectError: 'amqp:link:redirect' }
}));

import { handleStartEventHubMonitoring } from './eventHubHandler';

describe('eventHubHandler hostname validation', () => {
    const mockEvent = {} as Electron.IpcMainInvokeEvent;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('custom EventHub connection string (Path 1)', () => {
        it('rejects attacker-controlled hostname', async () => {
            await expect(handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                customEventHubConnectionString: 'Endpoint=sb://attacker-controlled-host.com;SharedAccessKeyName=test;SharedAccessKey=dGVzdA==;EntityPath=test'
            })).rejects.toThrow('Invalid EventHub hostname');

            expect(MockEventHubConsumerClient).not.toHaveBeenCalled();
        });

        it('rejects IP address hostname', async () => {
            await expect(handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                customEventHubConnectionString: 'Endpoint=sb://169.254.169.254;SharedAccessKeyName=test;SharedAccessKey=dGVzdA=='
            })).rejects.toThrow('Invalid EventHub hostname');

            expect(MockEventHubConsumerClient).not.toHaveBeenCalled();
        });

        it('rejects localhost hostname', async () => {
            await expect(handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                customEventHubConnectionString: 'Endpoint=sb://localhost;SharedAccessKeyName=test;SharedAccessKey=dGVzdA=='
            })).rejects.toThrow('Invalid EventHub hostname');

            expect(MockEventHubConsumerClient).not.toHaveBeenCalled();
        });

        it('accepts valid Event Hubs hostname', async () => {
            await handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                customEventHubConnectionString: 'Endpoint=sb://mynamespace.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=dGVzdA==;EntityPath=myhub'
            });

            expect(MockEventHubConsumerClient).toHaveBeenCalledWith(
                '$Default',
                'Endpoint=sb://mynamespace.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=dGVzdA==;EntityPath=myhub'
            );
        });

        it('accepts valid Private Link Event Hubs hostname', async () => {
            await handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                customEventHubConnectionString: 'Endpoint=sb://mynamespace.privatelink.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=dGVzdA==;EntityPath=myhub'
            });

            expect(MockEventHubConsumerClient).toHaveBeenCalled();
        });

        it('rejects connection string without Endpoint', async () => {
            await expect(handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                customEventHubConnectionString: 'SharedAccessKeyName=test;SharedAccessKey=dGVzdA=='
            })).rejects.toThrow('unable to extract');

            expect(MockEventHubConsumerClient).not.toHaveBeenCalled();
        });
    });

    describe('IoT Hub connection string (Path 2)', () => {
        it('rejects attacker-controlled IoT Hub hostname', async () => {
            await expect(handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                hubConnectionString: 'HostName=evil.com;SharedAccessKeyName=test;SharedAccessKey=dGVzdA=='
            })).rejects.toThrow('Invalid IoT Hub hostname');

            expect(MockConnection).not.toHaveBeenCalled();
        });

        it('rejects IP address as IoT Hub hostname', async () => {
            await expect(handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                hubConnectionString: 'HostName=192.168.1.1;SharedAccessKeyName=test;SharedAccessKey=dGVzdA=='
            })).rejects.toThrow('Invalid IoT Hub hostname');

            expect(MockConnection).not.toHaveBeenCalled();
        });

        it('accepts valid IoT Hub hostname and creates AMQP connection', async () => {
            await handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                hubConnectionString: 'HostName=myhub.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=dGVzdA=='
            });

            expect(MockConnection).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: 'myhub.azure-devices.net',
                    hostname: 'myhub.azure-devices.net',
                    port: 5671
                })
            );
            expect(mockConnectionOpen).toHaveBeenCalled();
        });

        it('accepts valid Private Link IoT Hub hostname', async () => {
            await handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                hubConnectionString: 'HostName=myhub.privatelink.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=dGVzdA=='
            });

            expect(MockConnection).toHaveBeenCalledWith(
                expect.objectContaining({
                    host: 'myhub.privatelink.azure-devices.net',
                    hostname: 'myhub.privatelink.azure-devices.net'
                })
            );
        });
    });

    describe('AMQP redirect validation (Path 3 — redirect hostname)', () => {
        function mockConnectionWithRedirect(redirectHostname: string) {
            MockConnection.mockImplementationOnce(() => ({
                open: jest.fn().mockResolvedValue(undefined),
                close: jest.fn().mockResolvedValue(undefined),
                createReceiver: jest.fn().mockResolvedValue({
                    on: jest.fn((event: string, handler: (context: any) => void) => {
                        if (event === 'receiver_error') {
                            setTimeout(() => {
                                handler({
                                    receiver: {
                                        error: {
                                            condition: 'amqp:link:redirect',
                                            info: {
                                                hostname: redirectHostname,
                                                address: `amqps://${redirectHostname}:5671/test-hub/$management`
                                            }
                                        }
                                    }
                                });
                            }, 0);
                        }
                    })
                })
            }));
        }

        it('rejects attacker-controlled AMQP redirect hostname', async () => {
            mockConnectionWithRedirect('attacker.com');

            await expect(handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                hubConnectionString: 'HostName=myhub.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=dGVzdA=='
            })).rejects.toThrow('Invalid EventHub redirect hostname');
        });

        it('rejects cloud metadata endpoint in AMQP redirect', async () => {
            mockConnectionWithRedirect('169.254.169.254');

            await expect(handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                hubConnectionString: 'HostName=myhub.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=dGVzdA=='
            })).rejects.toThrow('Invalid EventHub redirect hostname');
        });

        it('rejects private IP in AMQP redirect', async () => {
            mockConnectionWithRedirect('192.168.1.1');

            await expect(handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                hubConnectionString: 'HostName=myhub.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=dGVzdA=='
            })).rejects.toThrow('Invalid EventHub redirect hostname');
        });

        it('rejects domain-spoofing in AMQP redirect', async () => {
            mockConnectionWithRedirect('evil.servicebus.windows.net.attacker.com');

            await expect(handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                hubConnectionString: 'HostName=myhub.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=dGVzdA=='
            })).rejects.toThrow('Invalid EventHub redirect hostname');
        });

        it('accepts valid servicebus redirect hostname', async () => {
            mockConnectionWithRedirect('test-redirect.servicebus.windows.net');

            await handleStartEventHubMonitoring(mockEvent, {
                deviceId: 'device1',
                consumerGroup: '$Default',
                hubConnectionString: 'HostName=myhub.azure-devices.net;SharedAccessKeyName=iothubowner;SharedAccessKey=dGVzdA=='
            });

            expect(MockEventHubConsumerClient).toHaveBeenCalled();
        });
    });
});
