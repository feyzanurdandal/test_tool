import { BasePage } from './BasePage.js';

export class TodoPage extends BasePage {
  // Sayfaya özel element locator'ı
  private readonly todoInput = this.page.locator('.new-todo');

  async addNewTodo(text: string) {
    if (this.testMode === 'API') return;
    console.log(`✍️ Todo ekleniyor: "${text}"`);
    await this.todoInput.fill(text);
    await this.todoInput.press('Enter');
  }
}