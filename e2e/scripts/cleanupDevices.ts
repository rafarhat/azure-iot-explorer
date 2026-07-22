import { AzureCli } from '../fixtures/azureCli.ts';
import { loadE2EEnvironment, redactSecrets } from '../fixtures/environment.ts';

const main = async (): Promise<void> => {
    const environment = loadE2EEnvironment();
    const azureCli = new AzureCli(environment);
    await azureCli.preflight();
    const deletedDevices = await azureCli.cleanupDevicesByPrefix('e2e-');
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
