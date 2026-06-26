import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage.js';
import { BASE_URL } from '../config/constants.js';

export class DpuPage extends BasePage {
// DPÜ Kurumsal Arayüz Locator Tanımlamaları
readonly logo: Locator;
readonly duyurularTab: Locator;
readonly haberlerTab: Locator;
readonly aramaButonu: Locator;
readonly aramaInput: Locator;

constructor(page: Page) {
    super(page);

    // Kurumsal Playwright Best Practices (getByRole ve getByText öncelikli)
    this.logo = page.getByRole('link', { name: 'Kütahya Dumlupınar Üniversitesi' }).first();
    this.duyurularTab = page.getByRole('link', { name: 'Duyurular' }).first();
    this.haberlerTab = page.getByRole('link', { name: 'Haberler' }).first();
    this.aramaButonu = page.locator('.search-button, #search-btn, .fa-search').first(); // Sitedeki arama ikonu
    this.aramaInput = page.getByPlaceholder('Ara...', { exact: false });
}

async gotoMainPage() {
    await this.navigateTo(BASE_URL);
    await this.waitUntilLoaded();
}

async clickDuyurular() {
    await this.safeClick(this.duyurularTab);
}

async clickHaberler() {
    await this.safeClick(this.haberlerTab);
}

async kurumsalAramaYap(kelime: string) {
    if (this.isApiMode()) return;
    // Eğer arama kutusu gizliyse önce ikona tıklatıyoruz
    if (await this.aramaButonu.isVisible()) {
        await this.safeClick(this.aramaButonu);
    }
    await this.aramaInput.waitFor({ state: 'visible', timeout: 3000 });
    await this.aramaInput.fill(kelime);
    await this.page.keyboard.press('Enter');
}
}