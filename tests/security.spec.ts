import { test } from '@playwright/test';
import { TodoPage } from '../pages/TodoPage.js';


const TEST_MODE = process.env.TEST_MODE || 'UI';

test('Kurumsal Modüler Güvenlik ve UI Testi', async ({ page }) => {
  test.setTimeout(120000);
  
  if (TEST_MODE === 'API') return;

  const todoPage = new TodoPage(page);

  // Sayfa nesnesi üzerinden kurumsal yönetim
  await todoPage.navigateTo('https://demo.playwright.dev/todomvc');
  await todoPage.addNewTodo('Mimariyi Page Object Model ile Kurduk!');
});