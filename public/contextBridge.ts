/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { contextBridge } from 'electron';
import { generateSettingsInterface } from './factories/settingsInterfaceFactory';
import { generateAuthenticationInterface } from './factories/authenticationInterfaceFactory';
import { generateDataPlaneInterface } from './factories/dataPlaneInterfaceFactory';
import { generateEventHubInterface } from './factories/eventHubInterfaceFactory';
import { generateFilesInterface } from './factories/filesInterfaceFactory';
import { API_INTERFACES } from './constants';

contextBridge.exposeInMainWorld(API_INTERFACES.SETTINGS, generateSettingsInterface());
contextBridge.exposeInMainWorld(API_INTERFACES.AUTHENTICATION, generateAuthenticationInterface());
contextBridge.exposeInMainWorld(API_INTERFACES.DATAPLANE, generateDataPlaneInterface());
contextBridge.exposeInMainWorld(API_INTERFACES.EVENTHUB, generateEventHubInterface());
contextBridge.exposeInMainWorld(API_INTERFACES.FILES, generateFilesInterface());
