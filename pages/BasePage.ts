import { Page } from '@playwright/test';

export abstract class BasePage {
protected page: Page;

constructor(page: Page) {
    this.page = page;
}

protected isApiMode(): boolean {
    return process.env.TEST_MODE === 'API';
}

protected isSecurityMode(): boolean {
    return process.env.TEST_MODE === 'SECURITY';
}

protected isUiMode(): boolean {
    return process.env.TEST_MODE === 'UI' || !process.env.TEST_MODE;
}

async navigateTo(path: string = '') {
    if (this.isApiMode()) return;
    await this.page.goto(path);
}

async waitUntilLoaded() {
    if (this.isApiMode()) return;
    await this.page.waitForLoadState('networkidle');
}

async takeScreenshot(name: string) {
    if (this.isApiMode()) return;
    await this.page.screenshot({ path: `artifacts/screenshots/${name}.png`, fullPage: true });
}

async safeClick(locator: any) {
    if (this.isApiMode()) return;
    await locator.waitFor({ state: 'visible', timeout: 5000 });
    await locator.click();
}
}