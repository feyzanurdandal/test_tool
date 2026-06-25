import { Page } from '@playwright/test';

export abstract class BasePage {
  protected page: Page;
  protected testMode: string;

  constructor(page: Page) {
    this.page = page;
    this.testMode = process.env.TEST_MODE || 'UI';
  }

  async navigateTo(path: string) {
    if (this.testMode === 'API') return;
    console.log(`🌐 [${this.testMode}] Navigasyon: ${path}`);
    await this.page.goto(path);
  }
}