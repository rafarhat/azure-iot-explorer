/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
export const PLATFORMS = {
    MAC: 'darwin'
};

export const MESSAGE_CHANNELS = {
    AUTHENTICATION_GET_PROFILE_TOKEN: 'authentication_get_profile_token',
    AUTHENTICATION_LOGIN: 'authentication_login',
    AUTHENTICATION_LOGOUT: 'authentication_logout',
    SETTING_HIGH_CONTRAST: 'setting_highContrast',

    // Data Plane IPC channels
    DATAPLANE_REQUEST: 'dataplane_request',

    // Event Hub IPC channels
    EVENTHUB_MONITOR_START: 'eventhub_monitor_start',
    EVENTHUB_MONITOR_STOP: 'eventhub_monitor_stop',
    EVENTHUB_MESSAGES: 'eventhub_messages',

    // File System IPC channels
    FILE_READ: 'file_read',
    FILE_READ_NAIVE: 'file_read_naive',
    DIRECTORIES_LIST: 'directories_list',
};

export const API_INTERFACES = {
    AUTHENTICATION: 'api_authentication',
    DATAPLANE: 'api_dataplane',
    DEVICE: 'api_device',
    EVENTHUB: 'api_eventhub',
    FILES: 'api_files',
    SETTINGS: 'api_settings'
};
