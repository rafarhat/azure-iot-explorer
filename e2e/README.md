# End-to-end tests

The Playwright end-to-end tests launch the compiled Electron application against a real Azure IoT Hub. They are intended for manual use and are not part of CI.

Use a dedicated non-production IoT Hub. The tests create and delete device identities whose IDs start with `e2e-`.

## Prerequisites

1. Install dependencies with `npm ci --legacy-peer-deps`.
1. Install the [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli).
1. Sign in with `az login` using an identity that can manage device identities and retrieve IoT Hub keys (`Microsoft.Devices/IotHubs/listkeys/action`) on the test hub.
1. Install the IoT extension with `az extension add --name azure-iot`.
1. Set the test hub connection string and acknowledge that it is non-production:

```powershell
$env:E2E_IOTHUB_CONNECTION_STRING="<test-hub-connection-string>"
$env:E2E_AZURE_SUBSCRIPTION_ID="<test-hub-subscription-id>"
$env:E2E_CONFIRM_NON_PRODUCTION="true"
```

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

The suite runs serially with a separate Electron profile per test. It automatically removes every device it tracks, including after test failures.

## Clean up test devices

To remove stale test devices left by an interrupted process:

```powershell
npm run test:e2e:cleanup
```

The cleanup command deletes only device IDs beginning with `e2e-`. Playwright traces, videos, and automatic screenshots are disabled because connection setup contains a secret. Failure screenshots are captured only after the connection-string editor has closed.
