import { expect, Page } from '@playwright/test';

export class DeviceDetailsPage {
    public constructor(private readonly page: Page) {}

    public async updateTwin(deviceId: string, propertyName: string, propertyValue: string): Promise<void> {
        await this.page.getByRole('tab', { name: 'Device twin' }).click();
        const editorRegion = this.page.getByTestId('device-twin-editor');
        const editor = editorRegion.getByRole('textbox');
        await expect(editor).toBeVisible({ timeout: 60_000 });
        const updatedTwin = JSON.stringify({
            deviceId,
            properties: {
                desired: {
                    [propertyName]: propertyValue,
                },
            },
        }, null, 2);
        await this.page.getByTestId('device-twin-editor').evaluate((element, value) => {
            element.dispatchEvent(new CustomEvent('e2e:set-value', { detail: value }));
        }, updatedTwin);
        const save = this.page.getByRole('button', { name: 'Save', exact: true });
        await expect(save).toBeEnabled();
        await save.click();
        await expect(
            this.page.getByRole('status').getByText(`Successfully updated device twin on device ${deviceId}.`, { exact: true })
        ).toBeVisible({ timeout: 60_000 });
    }

    public async refreshTwin(): Promise<void> {
        await this.page.getByRole('button', { name: 'Refresh', exact: true }).click();
    }

    public async expectTwinProperty(propertyName: string, propertyValue: string): Promise<void> {
        await expect(
            this.page.getByTestId('device-twin-editor').getByText(`"${propertyName}": "${propertyValue}"`, { exact: false })
        ).toBeVisible({ timeout: 60_000 });
    }

    public async startTelemetryMonitoring(): Promise<void> {
        await this.page.getByRole('tab', { name: 'Telemetry' }).click();
        await this.page.getByRole('button', { name: 'Start', exact: true }).click();
        await expect(this.page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible({ timeout: 60_000 });
    }

    public async expectTelemetry(marker: string): Promise<void> {
        await expect(this.page.getByRole('article').filter({ hasText: marker })).toBeVisible({ timeout: 60_000 });
    }

    public async stopTelemetryMonitoring(): Promise<void> {
        await this.page.getByRole('button', { name: 'Stop', exact: true }).click();
        await expect(this.page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();
    }

    public async invokeDirectMethod(methodName: string, payload: string): Promise<void> {
        await this.page.getByRole('tab', { name: 'Direct method' }).click();
        await this.page.getByLabel('Method name').fill(methodName);
        await this.page.getByLabel('Payload', { exact: true }).fill(payload);
        await this.page.getByRole('button', { name: 'Invoke method', exact: true }).click();
    }

    public async expectDirectMethodResponse(expectedResponse: string): Promise<void> {
        const success = this.page
            .getByRole('status')
            .filter({ hasText: 'Successfully invoked method' })
            .filter({ hasText: expectedResponse })
            .last();
        await expect(success).toBeVisible({ timeout: 60_000 });
    }
}
