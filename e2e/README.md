# End-to-end tests

The Playwright end-to-end tests launch the compiled Electron application against a real Azure IoT Hub. They are intended for manual use and are not part of CI.

Use a dedicated non-production IoT Hub. The tests create and delete device identities whose IDs start with `e2e-`, and clean up test-owned module identities before their parent devices.

## Prerequisites

1. Install dependencies with `npm ci --legacy-peer-deps`.
1. Set the test hub connection string and acknowledge that it is non-production:

```powershell
$env:E2E_IOTHUB_CONNECTION_STRING="<test-hub-connection-string>"
$env:E2E_AZURE_SUBSCRIPTION_ID="<test-hub-subscription-id>"
$env:E2E_CONFIRM_NON_PRODUCTION="true"
```

Device and module provisioning, verification, queries, and cleanup use the `azure-iothub` SDK with `E2E_IOTHUB_CONNECTION_STRING`; those workflows do not require an Azure CLI login. Telemetry and direct-method simulator workflows, plus built-in Event Hub connection-string retrieval, additionally require:

1. Install the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli).
1. Sign in with `az login` using an identity that can retrieve IoT Hub keys (`Microsoft.Devices/IotHubs/listkeys/action`) on the test hub.
1. Install the IoT extension with `az extension add --name azure-iot`.

## Run the tests

Build the application and run all workflows:

```powershell
npm run test:e2e
```

After the application has already been built, run all tests or a selected workflow:

```powershell
npm run test:e2e:run
npm run test:e2e:run -- --grep "device twin"
```

The suite runs serially with a separate Electron profile per test. Numbered spec filenames group the report from smoke and connection checks through device, module, telemetry, and messaging workflows; tests remain isolated and must not depend on that order. The suite automatically removes every device it tracks, including after test failures.

The default suite covers connection persistence and validation, device discovery and bulk deletion, identity status and key rotation, device and module twins, telemetry lifecycle and enqueue-time retrieval, the custom connection-string path for the built-in Event Hub, cloud-to-device queue acceptance, direct-method success and failure paths, theme persistence, notifications, breadcrumbs, and model-repository persistence. Azure AD, cloud-to-device reception, IoT Plug and Play simulation, IoT Edge, and externally provisioned Event Hub workflows are excluded until deterministic test harnesses are available.

## Clean up test devices

To remove stale test devices left by an interrupted process:

```powershell
npm run test:e2e:cleanup
```

The cleanup command uses the IoT Hub SDK and deletes only device IDs beginning with `e2e-`; it does not require Azure CLI. Playwright traces, videos, automatic screenshots, and automatic accessibility snapshots are disabled because connection setup and identity pages contain secrets. Failure screenshots are captured only after the connection-string editor has closed.
