import { loadE2EEnvironment, redactSecrets } from '../fixtures/environment.ts';
import { IoTHubRegistry } from '../fixtures/iotHubRegistry.ts';

const main = async (): Promise<void> => {
    const environment = loadE2EEnvironment();
    const iotHubRegistry = new IoTHubRegistry(environment);
    const deletedDevices = await iotHubRegistry.cleanupDevicesByPrefix('e2e-');
    process.stdout.write(`Deleted ${deletedDevices.length} E2E device(s).\n`);
};

main().catch(error => {
    const environment = (() => {
        try {
            return loadE2EEnvironment();
        } catch {
            return undefined;
        }
    })();
    const message = error instanceof Error ? error.stack || error.message : String(error);
    process.stderr.write(`${environment ? redactSecrets(message, environment) : message}\n`);
    process.exitCode = 1;
});
