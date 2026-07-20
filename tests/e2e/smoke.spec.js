import { expect, test } from 'playwright/test'

function uniqueValue(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

test('user can build a tree and place a node on a floor plan', async ({ page }) => {
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

  const treeViewport = page.locator('.canvas-viewport')
  const treeStage = page.locator('.canvas-stage')
  const readTreeScale = () => treeStage.evaluate((stage) => {
    const match = stage.style.transform.match(/scale\(([^)]+)\)/)
    return Number(match?.[1] || 1)
  })
  const initialTreeScale = await readTreeScale()
  await treeViewport.evaluate((viewport) => {
    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 240,
      clientY: 180,
      deltaX: -100,
      deltaY: 0,
      shiftKey: true,
    }))
  })
  await expect.poll(readTreeScale).toBeGreaterThan(initialTreeScale)
  const zoomedTreeScale = await readTreeScale()
  await treeViewport.evaluate((viewport) => {
    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 240,
      clientY: 180,
      deltaX: 100,
      deltaY: 0,
      shiftKey: true,
    }))
  })
  await expect.poll(readTreeScale).toBeLessThan(zoomedTreeScale)

  await expect(page.getByRole('group', { name: 'Workspace view' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Project Settings' }).click()
  await page.getByLabel('Floor plans').selectOption('enabled')

  const workspaceView = page.getByRole('group', { name: 'Workspace view' })
  await expect(workspaceView).toBeVisible()
  await workspaceView.getByRole('button', { name: 'Floor plan view' }).click()
  await expect(page.getByRole('heading', { name: 'Add a floor plan' })).toBeVisible()

  await page.getByLabel('Upload floor plan image').setInputFiles({
    name: 'main-floor.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP48OHDCSMjBqOUEwwMDAAzMAVbjHgdWQAAAABJRU5ErkJggg==',
      'base64',
    ),
  })

  await page.getByRole('button', { name: 'Floor Plan', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Floor plan', exact: true })).toHaveValue(/.+/)
  await page.getByLabel('Floor plan ink').selectOption('custom')
  await page.getByLabel('Floor plan ink color').fill('#00ff66')
  await page.getByLabel('Floor plan background').selectOption('transparent')
  await page.getByLabel('Floor plan background color').fill('#f0f0f0')
  const cutoff = page.getByLabel('Floor plan background cutoff')
  await expect(cutoff).toHaveAttribute('min', '1')
  await expect(cutoff).toHaveAttribute('max', '255')
  await cutoff.fill('255')
  await expect(cutoff).toHaveValue('255')

  const processedPlan = page.locator('.floor-plan-stage__image--processed')
  await expect(processedPlan).toBeVisible()
  await expect.poll(async () => processedPlan.evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    let transparentPixels = 0
    let recoloredPixels = 0
    let incorrectlyColoredPixels = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) {
        transparentPixels += 1
      } else if (pixels[index] === 0 && pixels[index + 1] === 255 && pixels[index + 2] === 102) {
        recoloredPixels += 1
      } else {
        incorrectlyColoredPixels += 1
      }
    }
    return { incorrectlyColoredPixels, recoloredPixels, transparentPixels }
  })).toEqual({ incorrectlyColoredPixels: 0, recoloredPixels: 3, transparentPixels: 1 })

  const floorPlanStage = page.locator('.floor-plan-stage')
  await expect(floorPlanStage).toHaveClass(/is-transparent/)
  await expect.poll(async () => floorPlanStage.evaluate((stage) => {
    const styles = getComputedStyle(stage)
    return `${styles.backgroundColor}|${styles.boxShadow}`
  })).toBe('rgba(0, 0, 0, 0)|none')

  await page.getByRole('button', { name: 'Locations', exact: true }).click()
  await page.getByRole('button', { name: `Place ${nodeName}` }).click()
  await floorPlanStage.click({ position: { x: 160, y: 120 } })
  const locationButton = page.getByRole('button', { name: `Open location ${nodeName}` })
  await expect(locationButton).toBeVisible()
  const locationSummary = page.locator('.floor-plan-marker__summary')
  await expect(locationSummary).toBeVisible()
  await expect(locationSummary).toContainText(nodeName)
  await expect(locationSummary).toContainText('Location')
  await expect(page.locator('.floor-plan-marker__tree')).toHaveCount(0)
  const pin = page.locator('.floor-plan-marker__pin')
  await expect(pin).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(pin).toHaveCSS('color', 'rgb(200, 79, 79)')
  await expect(pin.locator('path')).toHaveCSS('fill', 'rgb(200, 79, 79)')
  await expect(pin.locator('circle')).toHaveCSS('fill', 'rgb(255, 255, 255)')
  await locationButton.click()
  await expect(page.locator('.floor-plan-marker__tree')).toBeVisible()

  await workspaceView.getByRole('button', { name: 'Tree view' }).click()
  await expect(page.locator('.graph-node').filter({ hasText: nodeName })).toBeVisible()

  await page.getByRole('button', { name: 'Project Settings' }).click()
  await page.getByLabel('Floor plans').selectOption('disabled')
  await expect(page.getByRole('group', { name: 'Workspace view' })).toHaveCount(0)
  await page.getByLabel('Floor plans').selectOption('enabled')
  await expect(workspaceView).toBeVisible()

  await workspaceView.getByRole('button', { name: 'Floor plan view' }).click()
  await expect(page.getByRole('button', { name: `Open location ${nodeName}` })).toBeVisible()
  await expect(page.locator('svg.lucide').first()).toBeVisible()
  await expect(page.locator('i[class*="fa-"]')).toHaveCount(0)
  await expect(page.locator('link[href*="font-awesome"]')).toHaveCount(0)
})
