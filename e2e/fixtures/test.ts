import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, ElectronApplication, Page } from 'playwright';
import { test as base, expect } from '@playwright/test';
import { AzureCli, DeviceSimulator } from './azureCli';
import { E2EEnvironment, loadE2EEnvironment, redactSecrets } from './environment';

interface DeviceRegistry {
    create(deviceId: string): Promise<void>;
    track(deviceId: string): void;
}

interface E2EWorkerFixtures {
    azureCli: AzureCli;
    environment: E2EEnvironment;
}

interface E2EFixtures {
    app: ElectronApplication;
    deviceRegistry: DeviceRegistry;
    page: Page;
    simulators: {
        start(options: Parameters<AzureCli['startSimulator']>[0]): Promise<DeviceSimulator>;
    };
}

export const test = base.extend<E2EFixtures, E2EWorkerFixtures>({
    environment: [async ({}, use) => {
        const environment = loadE2EEnvironment();
        await use(environment);
    }, { scope: 'worker' }],

    azureCli: [async ({ environment }, use) => {
        const azureCli = new AzureCli(environment);
        await azureCli.preflight();
        await use(azureCli);
    }, { scope: 'worker' }],

    app: async ({ environment }, use, testInfo) => {
        const profileRoot = await mkdir(path.join(tmpdir(), 'azure-iot-explorer-e2e'), { recursive: true })
            .then(() => mkdtemp(path.join(tmpdir(), 'azure-iot-explorer-e2e', 'profile-')));
        const appPath = path.resolve(__dirname, '..', '..');
        const logs: string[] = [];
        const electronApp = await electron.launch({
            args: [
                `--user-data-dir=${profileRoot}`,
                appPath,
            ],
            env: {
                ...process.env,
                NODE_ENV: 'production',
            },
            timeout: 60_000,
        });

        const childProcess = electronApp.process();
        childProcess.stdout?.on('data', chunk => logs.push(chunk.toString()));
        childProcess.stderr?.on('data', chunk => logs.push(chunk.toString()));

        try {
            await use(electronApp);
        } finally {
            if (testInfo.status !== testInfo.expectedStatus && logs.length > 0) {
                await testInfo.attach('electron-main.log', {
                    body: Buffer.from(redactSecrets(logs.join(''), environment)),
                    contentType: 'text/plain',
                });
            }
            await electronApp.close().catch(() => undefined);
            await rm(profileRoot, { force: true, recursive: true });
        }
    },

    page: async ({ app, environment }, use, testInfo) => {
        const page = await app.firstWindow();
        const rendererErrors: string[] = [];
        const pageErrors: string[] = [];

        page.on('console', message => {
            if (message.type() === 'error') {
                rendererErrors.push(message.text());
            }
        });
        page.on('pageerror', error => pageErrors.push(error.stack || error.message));
        await page.waitForLoadState('domcontentloaded');

        await use(page);

        if (testInfo.status !== testInfo.expectedStatus || pageErrors.length > 0) {
            const safeLogs = redactSecrets([...rendererErrors, ...pageErrors].join('\n'), environment);
            if (safeLogs) {
                await testInfo.attach('electron-renderer.log', {
                    body: Buffer.from(safeLogs),
                    contentType: 'text/plain',
                });
            }

            const connectionFieldVisible = await page.getByLabel('Connection string', { exact: true }).isVisible().catch(() => false);
            if (!connectionFieldVisible) {
                await testInfo.attach('failure.png', {
                    body: await page.screenshot(),
                    contentType: 'image/png',
                });
            }
        }

        expect(pageErrors, `Unexpected renderer page errors:\n${pageErrors.join('\n')}`).toEqual([]);
    },

    deviceRegistry: async ({ azureCli }, use) => {
        const trackedDevices = new Set<string>();
        const registry: DeviceRegistry = {
            create: async deviceId => {
                trackedDevices.add(deviceId);
                await azureCli.createDevice(deviceId);
            },
            track: deviceId => trackedDevices.add(deviceId),
        };

        try {
            await use(registry);
        } finally {
            const cleanupErrors: Error[] = [];
            for (const deviceId of trackedDevices) {
                try {
                    await azureCli.deleteDevice(deviceId);
                } catch (error) {
                    cleanupErrors.push(error as Error);
                }
            }
            if (cleanupErrors.length > 0) {
                throw new AggregateError(cleanupErrors, 'Failed to clean up one or more E2E devices.');
            }
        }
    },

    simulators: async ({ azureCli }, use, testInfo) => {
        const running = new Set<DeviceSimulator>();
        await use({
            start: async options => {
                const simulator = await azureCli.startSimulator(options);
                running.add(simulator);
                return simulator;
            },
        });

        const cleanupErrors: Error[] = [];
        for (const simulator of running) {
            try {
                if (testInfo.status !== testInfo.expectedStatus && simulator.diagnostics) {
                    await testInfo.attach('azure-cli-simulator.log', {
                        body: Buffer.from(simulator.diagnostics),
                        contentType: 'text/plain',
                    });
                }
            } catch (error) {
                cleanupErrors.push(error as Error);
            }
            try {
                await simulator.stop();
            } catch (error) {
                cleanupErrors.push(error as Error);
            }
        }
        if (cleanupErrors.length > 0) {
            throw new AggregateError(cleanupErrors, 'Failed to clean up one or more Azure CLI device simulators.');
        }
    },
});

export { expect };
