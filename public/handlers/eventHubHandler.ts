/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { BrowserWindow } from 'electron';
import { EventHubConsumerClient, Subscription, ReceivedEventData, earliestEventPosition } from '@azure/event-hubs';
import * as crypto from 'crypto';
import { Buffer } from 'buffer';
import { AmqpError, Connection, ReceiverEvents, parseConnectionString } from 'rhea-promise';
import * as rheaPromise from 'rhea-promise';
import { ErrorNameConditionMapper as AMQPError } from '@azure/core-amqp';
import { MESSAGE_CHANNELS } from '../constants';
import {
    IpcResult,
    IpcErrorCode,
    EventHubMonitorParams,
    EventHubMessage,
    successResult,
    errorResult
} from '../types/ipcTypes';

const IOTHUB_CONNECTION_DEVICE_ID = 'iothub-connection-device-id';
const IOTHUB_CONNECTION_MODULE_ID = 'iothub-connection-module-id';
const MESSAGE_SEND_INTERVAL_MS = 800;

// Module state
let client: EventHubConsumerClient | null = null;
let subscription: Subscription | null = null;
let timerId: NodeJS.Timer | null = null;
let messages: EventHubMessage[] = [];
let currentWindow: BrowserWindow | null = null;

/**
 * Type guard for AmqpError
 */
function isAmqpError(err: unknown): err is AmqpError {
    return rheaPromise.isAmqpError(err);
}

/**
 * Generate SAS token for Event Hub connection
 */
function generateSasToken(
    resourceUri: string,
    signingKey: string,
    policyName: string,
    expiresInMins: number
): string {
    const encodedUri = encodeURIComponent(resourceUri);
    const expiresInSeconds = Math.ceil(Date.now() / 1000 + expiresInMins * 60);
    const toSign = encodedUri + '\n' + expiresInSeconds;

    const hmac = crypto.createHmac('sha256', Buffer.from(signingKey, 'base64'));
    hmac.update(toSign);
    const base64UriEncoded = encodeURIComponent(hmac.digest('base64'));

    return `SharedAccessSignature sr=${encodedUri}&sig=${base64UriEncoded}&se=${expiresInSeconds}&skn=${policyName}`;
}

/**
 * Convert IoT Hub connection string to Event Hubs connection string
 */
async function convertIotHubToEventHubsConnectionString(connectionString: string): Promise<string> {
    const { HostName, SharedAccessKeyName, SharedAccessKey } = parseConnectionString<{
        HostName: string;
        SharedAccessKeyName: string;
        SharedAccessKey: string;
    }>(connectionString);

    if (!HostName || !SharedAccessKey || !SharedAccessKeyName) {
        throw new Error('Invalid IoT Hub connection string.');
    }

    const [iotHubName] = HostName.split('.');
    if (!iotHubName) {
        throw new Error('Unable to extract the IoT Hub name from the connection string.');
    }

    const token = generateSasToken(
        `${HostName}/messages/events`,
        SharedAccessKey,
        SharedAccessKeyName,
        5
    );

    const connection = new Connection({
        transport: 'tls',
        host: HostName,
        hostname: HostName,
        username: `${SharedAccessKeyName}@sas.root.${iotHubName}`,
        port: 5671,
        reconnect: false,
        password: token
    });
    await connection.open();

    const receiver = await connection.createReceiver({
        source: { address: `amqps://${HostName}/messages/events/$management` },
    });

    return new Promise((resolve, reject) => {
        receiver.on(ReceiverEvents.receiverError, (context) => {
            const error = context.receiver && context.receiver.error;
            if (isAmqpError(error) && error.condition === AMQPError.LinkRedirectError && error.info) {
                const hostname = error.info.hostname;
                const iotAddress = error.info.address;
                const regex = /:\d+\/(.*)\/\$management/i;
                const regexResults = regex.exec(iotAddress);
                if (!hostname || !regexResults) {
                    reject(error);
                } else {
                    const eventHubName = regexResults[1];
                    resolve(
                        `Endpoint=sb://${hostname}/;EntityPath=${eventHubName};SharedAccessKeyName=${SharedAccessKeyName};SharedAccessKey=${SharedAccessKey}`
                    );
                }
            } else {
                reject(error);
            }
            connection.close().catch(() => { /* ignore */ });
        });
    });
}

/**
 * Handle incoming Event Hub messages
 */
const handleMessages = (events: ReceivedEventData[], params: EventHubMonitorParams): void => {
    events.forEach(event => {
        if (event?.systemProperties?.[IOTHUB_CONNECTION_DEVICE_ID] === params.deviceId) {
            if (!params.moduleId || event?.systemProperties?.[IOTHUB_CONNECTION_MODULE_ID] === params.moduleId) {
                const message: EventHubMessage = {
                    body: event.body,
                    enqueuedTime: event.enqueuedTimeUtc.toString(),
                    properties: event.properties as Record<string, unknown>,
                    sequenceNumber: event.sequenceNumber,
                    systemProperties: event.systemProperties as Record<string, string>
                };

                // Deduplicate by sequence number
                if (!messages.find(item => item.sequenceNumber === message.sequenceNumber)) {
                    messages.push(message);
                }
            }
        }
    });
};

/**
 * Send accumulated messages to renderer via IPC
 */
const sendMessagesToRenderer = (): void => {
    if (currentWindow && !currentWindow.isDestroyed() && messages.length > 0) {
        currentWindow.webContents.send(MESSAGE_CHANNELS.EVENTHUB_MESSAGES, messages);
        messages = [];
    }
};

/**
 * IPC Handler: Start Event Hub monitoring
 */
export const handleEventHubMonitorStart = async (
    event: Electron.IpcMainInvokeEvent,
    params: EventHubMonitorParams
): Promise<IpcResult<void>> => {
    try {
        // Validate input
        if (!params) {
            return errorResult(
                IpcErrorCode.INVALID_INPUT,
                'Monitor parameters are required',
                false
            );
        }

        if (!params.deviceId) {
            return errorResult(
                IpcErrorCode.INVALID_INPUT,
                'Device ID is required',
                false
            );
        }

        if (!params.consumerGroup) {
            return errorResult(
                IpcErrorCode.INVALID_INPUT,
                'Consumer group is required',
                false
            );
        }

        if (!params.hubConnectionString && !params.customEventHubConnectionString) {
            return errorResult(
                IpcErrorCode.INVALID_INPUT,
                'Either hubConnectionString or customEventHubConnectionString is required',
                false
            );
        }

        // Check if already monitoring
        if (client) {
            return errorResult(
                IpcErrorCode.ALREADY_MONITORING,
                'Event Hub monitoring is already active. Stop it first.',
                false
            );
        }

        // Get the browser window for sending messages
        currentWindow = BrowserWindow.fromWebContents(event.sender);

        // Create Event Hub client
        if (params.customEventHubConnectionString) {
            client = new EventHubConsumerClient(params.consumerGroup, params.customEventHubConnectionString);
        } else {
            const eventHubConnectionString = await convertIotHubToEventHubsConnectionString(params.hubConnectionString!);
            client = new EventHubConsumerClient(params.consumerGroup, eventHubConnectionString);
        }

        // Subscribe to events
        subscription = client.subscribe(
            {
                processEvents: async (events) => {
                    handleMessages(events, params);
                },
                processError: async (err) => {
                    // tslint:disable-next-line: no-console
                    console.error('Event Hub error:', err);
                }
            },
            { startPosition: earliestEventPosition }
        );

        // Start timer to send messages periodically
        timerId = setInterval(sendMessagesToRenderer, MESSAGE_SEND_INTERVAL_MS);

        return successResult(undefined);
    } catch (error) {
        // Cleanup on error
        await cleanupEventHub();

        return errorResult(
            IpcErrorCode.CONNECTION_FAILED,
            error.message || 'Failed to start Event Hub monitoring',
            true
        );
    }
};

/**
 * IPC Handler: Stop Event Hub monitoring
 */
export const handleEventHubMonitorStop = async (
    _event: Electron.IpcMainInvokeEvent
): Promise<IpcResult<void>> => {
    try {
        if (!client) {
            return errorResult(
                IpcErrorCode.NOT_MONITORING,
                'Event Hub monitoring is not active',
                false
            );
        }

        // Send any remaining messages
        if (messages.length > 0) {
            sendMessagesToRenderer();
        }

        await cleanupEventHub();

        return successResult(undefined);
    } catch (error) {
        return errorResult(
            IpcErrorCode.INTERNAL_ERROR,
            error.message || 'Failed to stop Event Hub monitoring',
            false
        );
    }
};

/**
 * Cleanup Event Hub resources
 */
const cleanupEventHub = async (): Promise<void> => {
    if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }

    if (subscription) {
        await subscription.close();
        subscription = null;
    }

    if (client) {
        await client.close();
        client = null;
    }

    messages = [];
    currentWindow = null;
};
