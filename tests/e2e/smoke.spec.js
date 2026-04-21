import { expect, test } from 'playwright/test'

function uniqueValue(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

test('user can register, create a project, and add a node', async ({ page }) => {
  const username = uniqueValue('smokeuser')
  const password = 'nodetrace-smoke-pass'
  const projectName = uniqueValue('Smoke Project')
  const nodeName = uniqueValue('Smoke Node')

  await page.goto('/')

  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('textbox', { name: 'Password' }).fill(password)
  await page.getByRole('button', { name: 'Create Account' }).click()

  await expect(page.getByRole('button', { name: 'File' })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.getByRole('dialog').getByRole('button', { name: 'Create Project' }).click()
  await page.getByPlaceholder('Project name').fill(projectName)
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByRole('banner').getByText(projectName)).toBeVisible()

  await page.getByRole('button', { name: 'Add node' }).click()
  await page.getByPlaceholder('Node name').fill(nodeName)
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByText(nodeName)).toBeVisible()
})
