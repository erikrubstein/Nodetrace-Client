import { expect, test } from 'playwright/test'

function uniqueValue(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

test('user can build a tree and place a node on a plan', async ({ page }) => {
  const username = uniqueValue('smokeuser')
  const password = 'nodetrace-smoke-pass'
  const projectName = uniqueValue('Smoke Project')
  const nodeName = uniqueValue('Smoke Node')
  const childNodeName = uniqueValue('Nested Node')

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

  await expect(page.getByRole('button', { name: 'Locations', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Show mobile capture session' }).click()
  const mobileCaptureDialog = page.locator('.dialog--mobile-capture')
  await expect(mobileCaptureDialog).toBeVisible()
  await expect(mobileCaptureDialog.getByLabel('Mobile capture addresses')).toContainText(
    'http://127.0.0.1:4173/capture',
  )
  await expect(mobileCaptureDialog.getByLabel('Session code')).toHaveText(/\S+/)
  await mobileCaptureDialog.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Add node' }).click()
  await page.getByPlaceholder('Node name').fill(nodeName)
  await page.getByRole('button', { name: 'Create' }).click()

  await expect(page.getByText(nodeName)).toBeVisible()

  const createdNode = page.locator('.graph-node').filter({ hasText: nodeName })
  await expect(createdNode).toBeVisible()
  await createdNode.click()
  const inspectorButton = page.getByRole('button', { name: 'Inspector' })
  if (!(await inspectorButton.evaluate((button) => button.classList.contains('sidebar-rail__button--active')))) {
    await inspectorButton.click()
  }
  const inspectorNameInput = page.getByRole('textbox', { name: 'Name' })
  await expect(inspectorNameInput).toBeVisible()
  const inspectorNameLabel = inspectorNameInput.locator('xpath=ancestor::label')
  const inspectorNameLabelBox = await inspectorNameLabel.boundingBox()
  const inspectorNameInputBox = await inspectorNameInput.boundingBox()
  expect(inspectorNameLabelBox).not.toBeNull()
  expect(inspectorNameInputBox).not.toBeNull()
  await page.mouse.click(
    inspectorNameLabelBox.x + 6,
    inspectorNameLabelBox.y + Math.max(2, (inspectorNameInputBox.y - inspectorNameLabelBox.y) / 2),
  )
  await expect(inspectorNameInput).not.toBeFocused()
  await inspectorNameInput.click()
  await expect(inspectorNameInput).toBeFocused()

  await page.getByRole('button', { name: 'Add node' }).click()
  await page.getByPlaceholder('Node name').fill(childNodeName)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.locator('.graph-node').filter({ hasText: childNodeName })).toBeVisible()

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
  await page.getByLabel('Plans').selectOption('enabled')

  const workspaceView = page.getByRole('group', { name: 'Workspace view' })
  await expect(workspaceView).toBeVisible()
  await workspaceView.getByRole('button', { name: 'Plan View' }).click()
  const selectedNodePathNavigation = page.getByRole('navigation', { name: 'Selected node path' })
  await expect(selectedNodePathNavigation).toBeVisible()
  await expect(selectedNodePathNavigation).toContainText(nodeName)
  await expect(page.getByLabel('Plans')).toBeVisible()
  const emptyPlanState = page.locator('.floor-plan-empty-state')
  await expect(emptyPlanState.getByRole('heading', { name: 'Add a plan' })).toBeVisible()
  await expect(emptyPlanState).toHaveCSS('box-shadow', 'none')

  await page.getByLabel('Upload plan image').setInputFiles({
    name: 'main-floor.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP48OHDCSMjBqOUEwwMDAAzMAVbjHgdWQAAAABJRU5ErkJggg==',
      'base64',
    ),
  })

  const floorPlanStage = page.locator('.floor-plan-stage')
  await expect(floorPlanStage).toHaveCSS('box-shadow', 'none')
  await expect(floorPlanStage).toHaveCSS('outline-width', '1px')
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  const appearancePanel = page.locator('.floor-plan-appearance-panel')
  await expect.poll(() => appearancePanel.evaluate((panel) => {
    const sections = panel.querySelectorAll(':scope > .inspector__section')
    const styles = getComputedStyle(panel)
    return {
      direction: styles.flexDirection,
      display: styles.display,
      gap: Number.parseFloat(styles.gap),
      sectionGap: sections.length > 1
        ? sections[1].getBoundingClientRect().top - sections[0].getBoundingClientRect().bottom
        : 0,
    }
  })).toEqual({
    direction: 'column',
    display: 'flex',
    gap: 12,
    sectionGap: 12,
  })
  await expect(page.getByRole('combobox', { name: 'Plan', exact: true })).toHaveValue(/.+/)
  const floorPlanInk = page.getByLabel('Plan ink', { exact: true })
  const floorPlanBackground = page.getByLabel('Plan background', { exact: true })
  await expect(floorPlanInk).toHaveCount(0)
  await expect(page.getByLabel('Plan background color')).toHaveCount(0)
  await expect(page.getByLabel('Plan background cutoff')).toHaveCount(0)
  await floorPlanBackground.selectOption('transparent')
  await expect(page.locator('.floor-plan-stage > img.floor-plan-stage__image')).toHaveCount(0)
  await expect(page.locator('.floor-plan-stage__image--processed')).toHaveCount(1)
  await expect(floorPlanInk).toHaveValue('original')
  await floorPlanInk.selectOption('custom')
  const floorPlanInkColor = page.getByLabel('Plan ink color')
  await floorPlanInkColor.fill('#00ff66')
  await page.getByLabel('Plan background color').fill('#f0f0f0')
  const cutoff = page.getByLabel('Plan background cutoff')
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
  await expect(processedPlan).toHaveClass(/is-ready/)
  await expect(page.locator('.floor-plan-stage__image--fallback')).toHaveCount(0)
  await processedPlan.evaluate((canvas) => {
    window.__nodetraceFloorPlanCanvas = canvas
  })
  await floorPlanInkColor.fill('#00ee66')
  expect(await page.locator('.floor-plan-stage').evaluate((stage) => ({
    originalImageCount: stage.querySelectorAll(':scope > img.floor-plan-stage__image').length,
    processedReady: stage.querySelector('.floor-plan-stage__image--processed')?.classList.contains('is-ready'),
  }))).toEqual({
    originalImageCount: 0,
    processedReady: true,
  })
  await expect.poll(() => processedPlan.evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
    return Array.from(pixels).some((value, index) => index % 4 === 1 && value === 238)
  })).toBe(true)
  const resetInkColor = page.getByRole('button', { name: 'Reset ink color' })
  const resetBackgroundColor = page.getByRole('button', { name: 'Reset background color' })
  const resetBackgroundCutoff = page.getByRole('button', { name: 'Reset background cutoff' })
  await expect(resetInkColor).toBeEnabled()
  await resetInkColor.click()
  await expect(page.getByLabel('Plan ink color')).toHaveValue('#efefef')
  await expect(resetInkColor).toBeDisabled()
  await expect(resetBackgroundColor).toBeEnabled()
  await resetBackgroundColor.click()
  await expect(page.getByLabel('Plan background color')).toHaveValue('#ffffff')
  await expect(resetBackgroundColor).toBeDisabled()
  await expect(resetBackgroundCutoff).toBeEnabled()
  await resetBackgroundCutoff.click()
  await expect(page.getByLabel('Plan background cutoff')).toHaveValue('245')
  await expect(resetBackgroundCutoff).toBeDisabled()
  const planBrightness = page.getByRole('slider', { name: 'Plan brightness', exact: true })
  await expect(planBrightness).toHaveCount(0)
  await floorPlanInk.selectOption('theme')
  await expect(planBrightness).toBeVisible()
  await expect(planBrightness).toHaveAttribute('min', '0')
  await expect(planBrightness).toHaveAttribute('max', '100')
  await expect(planBrightness).toHaveValue('50')
  const resetBrightness = page.getByRole('button', { name: 'Reset plan brightness' })
  await expect(resetBrightness).toBeDisabled()
  await planBrightness.fill('35')
  await expect(planBrightness).toHaveValue('35')
  await expect.poll(() => processedPlan.evaluate((canvas) => getComputedStyle(canvas).opacity)).toBe('0.35')
  await expect(resetBrightness).toBeEnabled()
  await resetBrightness.click()
  await expect(planBrightness).toHaveValue('50')
  await expect(resetBrightness).toBeDisabled()
  await planBrightness.fill('35')
  await floorPlanBackground.selectOption('visible')
  await expect(floorPlanInk).toHaveCount(0)
  await expect(planBrightness).toHaveCount(0)
  await expect(page.getByLabel('Plan background color')).toHaveCount(0)
  await expect(page.getByLabel('Plan background cutoff')).toHaveCount(0)
  await expect(processedPlan).toHaveCount(0)
  await floorPlanBackground.selectOption('transparent')
  await expect(floorPlanInk).toHaveValue('theme')
  await expect(planBrightness).toHaveValue('35')
  await expect(page.locator('.floor-plan-stage > img.floor-plan-stage__image')).toHaveCount(0)
  await expect(processedPlan).toBeVisible()
  await processedPlan.evaluate((canvas) => {
    window.__nodetraceFloorPlanCanvas = canvas
  })

  await expect(floorPlanStage).toHaveClass(/is-transparent/)
  await expect.poll(async () => floorPlanStage.evaluate((stage) => {
    const styles = getComputedStyle(stage)
    return `${styles.backgroundColor}|${styles.boxShadow}`
  })).toBe('rgba(0, 0, 0, 0)|none')

  await workspaceView.getByRole('button', { name: 'Tree View' }).click()
  await createdNode.click({ button: 'right' })
  await page.getByRole('button', { name: 'Place on Plan' }).click()
  await floorPlanStage.click({ position: { x: 160, y: 120 } })
  const locationButton = page.locator('.floor-plan-marker__tree-node.is-root')
  await expect(locationButton).toBeVisible()
  await expect(locationButton).toHaveClass(/graph-node/)
  await expect(locationButton).toContainText(nodeName)
  await expect(locationButton.locator('.graph-node__visual')).toBeVisible()
  await expect(locationButton).not.toHaveAttribute('draggable', 'true')
  const locationMarker = page.locator('.floor-plan-marker-position')
  const locationNodeId = await locationButton.getAttribute('data-node-id')
  const locationBackground = locationMarker.locator(
    `[data-node-background-id="${locationNodeId}"]`,
  )
  const locationHandle = page.getByRole('button', { name: `Move ${nodeName} location` })
  await expect(locationHandle).toBeVisible()
  const readMarkerPosition = () => locationMarker.evaluate((marker) => ({
    left: marker.style.left,
    top: marker.style.top,
  }))
  const originalMarkerPosition = await readMarkerPosition()
  const locationHandleBox = await locationHandle.boundingBox()
  expect(locationHandleBox).not.toBeNull()
  await page.mouse.move(
    locationHandleBox.x + locationHandleBox.width / 2,
    locationHandleBox.y + locationHandleBox.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    locationHandleBox.x + locationHandleBox.width / 2 + 72,
    locationHandleBox.y + locationHandleBox.height / 2 + 48,
    { steps: 4 },
  )
  const liveMarkerPosition = await readMarkerPosition()
  expect(liveMarkerPosition).not.toEqual(originalMarkerPosition)
  await expect(locationMarker).toHaveCount(1)
  await page.mouse.up()
  await expect.poll(readMarkerPosition).toEqual(liveMarkerPosition)
  await expect.poll(() => locationBackground.evaluate((background) => {
    const styles = getComputedStyle(background)
    return {
      backgroundColor: styles.backgroundColor,
      height: styles.height,
      transform: styles.transform,
      width: styles.width,
      zIndex: styles.zIndex,
    }
  })).toEqual({
    backgroundColor: 'rgb(29, 29, 29)',
    height: '130px',
    transform: 'matrix(1, 0, 0, 1, -9, -9)',
    width: '130px',
    zIndex: '1',
  })
  const locationTitle = locationButton.locator('.graph-node__meta span')
  const readNodeTitleStyle = (title) => title.evaluate((element) => {
    const styles = getComputedStyle(element)
    return {
      backgroundColor: styles.backgroundColor,
      borderRadius: styles.borderRadius,
      boxShadow: styles.boxShadow,
      padding: styles.padding,
    }
  })
  const floorPlanTitleStyle = await readNodeTitleStyle(locationTitle)
  expect(floorPlanTitleStyle).toEqual({
    backgroundColor: 'rgb(29, 29, 29)',
    borderRadius: '4px',
    boxShadow: 'none',
    padding: '1px 4px',
  })
  await expect(locationButton).toHaveCSS('gap', '14px')
  await expect(floorPlanStage.getByRole('button', { name: childNodeName, exact: true })).toHaveCount(0)
  await expect(page.locator('.floor-plan-marker__tree-node.collapsed-node')).toContainText('1 Item')
  const floorPlanViewport = page.locator('.floor-plan-workspace')
  const readFloorPlanScale = () => floorPlanStage.evaluate((stage) => {
    const match = stage.style.transform.match(/scale\(([^)]+)\)/)
    return Number(match?.[1] || 1)
  })
  const initialFloorPlanScale = await readFloorPlanScale()
  const initialMarkerWidth = await locationButton.evaluate((marker) => marker.getBoundingClientRect().width)
  const resetNodeZoom = page.getByRole('button', { name: 'Reset node zoom' })
  await expect(resetNodeZoom).toBeEnabled()
  await floorPlanViewport.evaluate((viewport) => {
    viewport.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 240,
      clientY: 180,
      deltaX: -240,
      deltaY: 0,
      shiftKey: true,
    }))
  })
  await expect.poll(readFloorPlanScale).toBe(initialFloorPlanScale)
  await expect.poll(() => locationButton.evaluate((marker) => marker.getBoundingClientRect().width)).toBeGreaterThan(initialMarkerWidth)
  await expect(page.locator('.floor-plan-status')).toContainText(/\d+% · 1[1-9]\d% · 1 placed nodes/)
  await resetNodeZoom.click()
  await expect.poll(readFloorPlanScale).toBe(initialFloorPlanScale)
  await expect.poll(() => locationButton.evaluate((marker) => marker.getBoundingClientRect().width)).toBeCloseTo(initialMarkerWidth, 1)
  const floorPlanStatus = page.locator('.floor-plan-status')
  await expect(floorPlanStatus).toContainText(/\d+% · 100% · 1 placed nodes/)
  await expect(resetNodeZoom).toBeEnabled()
  await expect(floorPlanStatus).toHaveClass(/canvas-caption--right/)
  const locationAnchor = page.locator('.floor-plan-marker__anchor')
  await expect(locationAnchor).toHaveClass(/is-horizontal/)
  await expect(locationAnchor.locator('line')).toHaveAttribute('x2', '28')
  await expect(locationAnchor.locator('line')).toHaveAttribute('y2', '0')
  await expect(locationAnchor.locator('line')).toHaveCSS('stroke-width', '2px')
  const anchorLayers = locationAnchor.locator(':scope > *')
  await expect(anchorLayers.nth(0)).toHaveClass(/floor-plan-marker__anchor-background/)
  await expect(anchorLayers.nth(1)).toHaveJSProperty('tagName', 'line')
  await expect(anchorLayers.nth(2)).toHaveClass(/floor-plan-marker__anchor-dot/)
  await expect(page.locator('.floor-plan-marker__links')).toHaveCSS('z-index', '2')
  await expect(locationAnchor.locator('.floor-plan-marker__anchor-background')).toHaveCSS(
    'fill',
    'rgb(29, 29, 29)',
  )
  await expect(locationAnchor.locator('.floor-plan-marker__anchor-background')).toHaveAttribute('r', '12')
  await expect(locationAnchor.locator('.floor-plan-marker__anchor-dot')).toHaveCSS('fill', 'rgb(200, 79, 79)')
  await expect(locationAnchor.locator('.floor-plan-marker__anchor-dot')).toHaveAttribute('r', '6')
  await expect(locationButton).toHaveCSS('left', '28px')
  await expect(locationButton).toHaveCSS('top', '-56px')
  await locationButton.click({ button: 'right' })
  const nodeContextMenu = page.locator('.node-context-menu')
  await expect(nodeContextMenu).toBeVisible()
  await expect(nodeContextMenu.getByRole('button').first()).toHaveText('Add Node')
  await expect(nodeContextMenu.getByRole('button', { name: 'Add Node', exact: true })).toBeVisible()
  await expect(nodeContextMenu.getByRole('button', { name: 'Add Photo Node', exact: true })).toBeVisible()
  await expect(nodeContextMenu.getByRole('button', { name: 'Add Photo', exact: true })).toBeVisible()
  await expect(nodeContextMenu.getByRole('button', { name: 'Move Location', exact: true })).toBeVisible()
  await expect(nodeContextMenu.getByRole('button', { name: 'Show in Tree', exact: true })).toBeVisible()
  await expect(nodeContextMenu.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
  await nodeContextMenu.getByRole('button', { name: 'Expand', exact: true }).click()
  await expect(
    floorPlanStage.getByRole('button', { name: childNodeName, exact: true }),
  ).toBeVisible()
  await locationButton.click({ button: 'right' })
  await nodeContextMenu.getByRole('button', { name: 'Collapse', exact: true }).click()
  await expect(
    floorPlanStage.getByRole('button', { name: childNodeName, exact: true }),
  ).toHaveCount(0)
  await locationButton.click({ button: 'right' })
  await nodeContextMenu.getByRole('button', { name: 'Show in Tree', exact: true }).click()
  await expect(workspaceView.getByRole('button', { name: 'Tree View' })).toHaveClass(/is-active/)
  const contextTreeNode = page.locator('.canvas-stage').getByRole('button', {
    name: nodeName,
    exact: true,
  })
  const contextTreeChildNode = page.locator('.canvas-stage').getByRole('button', {
    name: childNodeName,
    exact: true,
  })
  await expect(contextTreeNode).toHaveClass(/selected/)
  await contextTreeChildNode.click({ button: 'right' })
  await nodeContextMenu.getByRole('button', { name: 'Place on Plan', exact: true }).click()
  await expect(workspaceView.getByRole('button', { name: 'Plan View' })).toHaveClass(/is-active/)
  await expect(floorPlanViewport).toHaveClass(/is-placing/)
  await workspaceView.getByRole('button', { name: 'Tree View' }).click()
  await contextTreeNode.click({ button: 'right' })
  await nodeContextMenu.getByRole('button', { name: 'Show on Plan', exact: true }).click()
  await expect(workspaceView.getByRole('button', { name: 'Plan View' })).toHaveClass(/is-active/)
  await expect(locationButton).toHaveClass(/selected/)
  await locationButton.dblclick()
  await expect(page.locator('.floor-plan-marker__links line')).toHaveCount(1)
  const nestedFloorPlanNode = floorPlanStage.getByRole('button', { name: childNodeName, exact: true })
  await expect(nestedFloorPlanNode).toBeVisible()
  await expect(nestedFloorPlanNode).toHaveClass(/graph-node/)
  await nestedFloorPlanNode.click({ button: 'right' })
  await expect(nodeContextMenu.getByRole('button').first()).toHaveText('Add Node')
  await expect(
    nodeContextMenu.getByRole('button', { name: 'Place on Plan', exact: true }),
  ).toBeVisible()
  await expect(
    nodeContextMenu.getByRole('button', { name: 'Move Location', exact: true }),
  ).toHaveCount(0)
  await nestedFloorPlanNode.click()
  await expect(selectedNodePathNavigation).toContainText(childNodeName)
  await expect(nestedFloorPlanNode).toHaveClass(/selected/)
  await expect(nestedFloorPlanNode).toHaveCSS('z-index', '20')
  await expect(locationMarker).toHaveClass(/has-selected-node/)
  await expect(locationMarker).toHaveCSS('z-index', '20')
  const nestedNodeId = await nestedFloorPlanNode.getAttribute('data-node-id')
  const nestedBackground = locationMarker.locator(
    `[data-node-background-id="${nestedNodeId}"]`,
  )
  await expect(locationBackground).toHaveCSS('width', '124px')
  await expect(nestedBackground).toHaveCSS('width', '130px')
  await locationButton.dblclick()
  await expect(nestedFloorPlanNode).toHaveCount(0)
  await expect(locationButton).toHaveClass(/selected/)
  await locationButton.dblclick()
  await expect(floorPlanStage.getByRole('button', { name: childNodeName, exact: true })).toBeVisible()
  await nestedFloorPlanNode.click()
  await expect(selectedNodePathNavigation).toContainText(childNodeName)

  await expect(appearancePanel).toBeVisible()
  await workspaceView.getByRole('button', { name: 'Tree View' }).click()
  await expect(selectedNodePathNavigation).toBeVisible()
  await expect(selectedNodePathNavigation).toContainText(nodeName)
  await expect(selectedNodePathNavigation).not.toContainText(childNodeName)
  await expect(appearancePanel).toBeVisible()
  await expect(processedPlan).toBeHidden()
  await expect(processedPlan).toHaveCount(1)
  const treeNestedNode = page.locator('.canvas-stage').getByRole('button', { name: childNodeName, exact: true })
  await expect(treeNestedNode).toBeVisible()
  const treeLocationTitle = page.locator('.canvas-stage').getByRole('button', {
    name: nodeName,
    exact: true,
  }).locator('.graph-node__meta span')
  await expect(treeLocationTitle).toBeVisible()
  expect(await readNodeTitleStyle(treeLocationTitle)).toEqual(floorPlanTitleStyle)
  await page.getByRole('button', { name: 'Tree', exact: true }).click()
  await page.getByRole('button', { name: 'Collapse All', exact: true }).click()
  await expect(treeNestedNode).toHaveCount(0)
  await page.getByRole('button', { name: 'Tree', exact: true }).click()
  await page.getByRole('button', { name: 'Expand All', exact: true }).click()
  await expect(treeNestedNode).toBeVisible()

  await workspaceView.getByRole('button', { name: 'Plan View' }).click()
  await expect(selectedNodePathNavigation).toBeVisible()
  await expect(selectedNodePathNavigation).toContainText(childNodeName)
  await expect(appearancePanel).toBeVisible()
  await expect(page.getByLabel('Search locations')).toHaveCount(0)
  await expect(processedPlan).toBeVisible()
  expect(await processedPlan.evaluate((canvas) => canvas === window.__nodetraceFloorPlanCanvas)).toBe(true)
  const floorPlanNestedNode = floorPlanStage.getByRole('button', {
    name: childNodeName,
    exact: true,
  })
  await expect(floorPlanNestedNode).toBeVisible()
  await floorPlanNestedNode.click()
  await page.getByRole('button', { name: 'Tree', exact: true }).click()
  await page.getByRole('button', { name: 'Collapse All', exact: true }).click()
  await expect(floorPlanNestedNode).toHaveCount(0)
  await expect(page.locator('.floor-plan-marker__tree-node.is-root')).toHaveClass(/selected/)
  await workspaceView.getByRole('button', { name: 'Tree View' }).click()
  await expect(treeNestedNode).toBeVisible()
  await workspaceView.getByRole('button', { name: 'Plan View' }).click()
  await page.getByRole('button', { name: 'Tree', exact: true }).click()
  await page.getByRole('button', { name: 'Expand All', exact: true }).click()
  await expect(floorPlanNestedNode).toBeVisible()

  await page.getByRole('button', { name: 'Project Settings' }).click()
  await page.getByLabel('Plans').selectOption('disabled')
  await expect(page.getByRole('group', { name: 'Workspace view' })).toHaveCount(0)
  await page.getByLabel('Plans').selectOption('enabled')
  await expect(workspaceView).toBeVisible()

  await workspaceView.getByRole('button', { name: 'Plan View' }).click()
  await expect(processedPlan).toHaveClass(/is-ready/)
  await expect(page.locator('.floor-plan-marker__tree-node.is-root')).toContainText(nodeName)
  await expect(floorPlanNestedNode).toBeVisible()
  await floorPlanNestedNode.click()
  await expect(selectedNodePathNavigation).toContainText(childNodeName)
  await page.reload()
  await expect(page.getByRole('banner').getByText(projectName)).toBeVisible()
  await expect(page.locator('.floor-plan-stage > img.floor-plan-stage__image')).toHaveCount(0)
  await expect(processedPlan).toHaveClass(/is-ready/)
  await expect(page.locator('.floor-plan-marker__tree-node.is-root')).toContainText(nodeName)
  await expect(
    floorPlanStage.getByRole('button', { name: childNodeName, exact: true }),
  ).toBeVisible()
  await expect(selectedNodePathNavigation).toContainText(childNodeName)
  await workspaceView.getByRole('button', { name: 'Tree View' }).click()
  await expect(selectedNodePathNavigation).toContainText(projectName)
  await expect(selectedNodePathNavigation).not.toContainText(childNodeName)
  await workspaceView.getByRole('button', { name: 'Plan View' }).click()
  await expect(selectedNodePathNavigation).toContainText(childNodeName)
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await expect(
    page.getByRole('slider', { name: 'Plan brightness', exact: true }),
  ).toHaveValue('35')
  await page.getByRole('button', { name: 'Project Settings' }).click()
  await page.getByLabel('Direction').selectOption('vertical')
  await expect(locationAnchor).toHaveClass(/is-vertical/)
  await expect(locationAnchor.locator('line')).toHaveAttribute('x2', '0')
  await expect(locationAnchor.locator('line')).toHaveAttribute('y2', '28')
  await expect(page.locator('.floor-plan-marker__tree-node.is-root')).toHaveCSS('left', '-56px')
  await expect(page.locator('.floor-plan-marker__tree-node.is-root')).toHaveCSS('top', '28px')

  await floorPlanNestedNode.click({ button: 'right' })
  await page.getByRole('button', { name: 'Place on Plan' }).click()
  await floorPlanStage.click({ position: { x: 360, y: 260 } })
  await expect(
    floorPlanStage.getByRole('button', { name: childNodeName, exact: true }),
  ).toHaveCount(2)

  const placedParentRoot = floorPlanStage
    .locator('.floor-plan-marker__tree-node.is-root')
    .filter({ hasText: nodeName })
  const parentPlacementMarker = placedParentRoot.locator(
    'xpath=ancestor::div[contains(@class, "floor-plan-marker-position")]',
  )
  const nestedChildOccurrence = parentPlacementMarker.getByRole('button', {
    name: childNodeName,
    exact: true,
  })
  const directChildOccurrence = floorPlanStage
    .locator('.floor-plan-marker__tree-node.is-root')
    .filter({ hasText: childNodeName })
  const directChildPlacementMarker = directChildOccurrence.locator(
    'xpath=ancestor::div[contains(@class, "floor-plan-marker-position")]',
  )

  await nestedChildOccurrence.click()
  await expect(nestedChildOccurrence).toHaveClass(/selected/)
  await expect(directChildOccurrence).not.toHaveClass(/selected/)
  await expect(parentPlacementMarker).toHaveClass(/has-selected-node/)
  await expect(directChildPlacementMarker).not.toHaveClass(/has-selected-node/)
  await expect(
    floorPlanStage.locator('.floor-plan-marker-position.has-selected-node'),
  ).toHaveCount(1)

  await directChildOccurrence.click()
  await expect(directChildOccurrence).toHaveClass(/selected/)
  await expect(nestedChildOccurrence).not.toHaveClass(/selected/)
  await expect(directChildPlacementMarker).toHaveClass(/has-selected-node/)
  await expect(parentPlacementMarker).not.toHaveClass(/has-selected-node/)

  await nestedChildOccurrence.click()
  await page.reload()
  await expect(page.getByRole('banner').getByText(projectName)).toBeVisible()
  const reloadedParentPlacementMarker = page
    .locator('.floor-plan-marker__tree-node.is-root')
    .filter({ hasText: nodeName })
    .locator('xpath=ancestor::div[contains(@class, "floor-plan-marker-position")]')
  const reloadedNestedChildOccurrence = reloadedParentPlacementMarker.getByRole('button', {
    name: childNodeName,
    exact: true,
  })
  const reloadedDirectChildOccurrence = page
    .locator('.floor-plan-marker__tree-node.is-root')
    .filter({ hasText: childNodeName })
  await expect(reloadedNestedChildOccurrence).toHaveClass(/selected/)
  await expect(reloadedDirectChildOccurrence).not.toHaveClass(/selected/)
  await expect(page.locator('svg.lucide').first()).toBeVisible()
  await expect(page.locator('i[class*="fa-"]')).toHaveCount(0)
  await expect(page.locator('link[href*="font-awesome"]')).toHaveCount(0)
})

test('mobile photo nodes can be placed on a project plan or left unplaced', async ({ page }) => {
  const username = uniqueValue('mobplan')
  const password = 'nodetrace-mobile-plan-pass'
  const projectName = uniqueValue('Mobile Plan Project')
  const planImage = {
    name: 'mobile-plan.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP48OHDCSMjBqOUEwwMDAAzMAVbjHgdWQAAAABJRU5ErkJggg==',
      'base64',
    ),
  }
  const photoImage = {
    name: 'mobile-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP48OHDCSMjBqOUEwwMDAAzMAVbjHgdWQAAAABJRU5ErkJggg==',
      'base64',
    ),
  }

  await page.goto('/')
  await page.getByRole('button', { name: 'Register' }).click()
  await page.getByRole('textbox', { name: 'Username' }).fill(username)
  await page.getByRole('textbox', { name: 'Password' }).fill(password)
  await page.getByRole('button', { name: 'Create Account' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Create Project' }).click()
  await page.getByPlaceholder('Project name').fill(projectName)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page.getByRole('banner').getByText(projectName)).toBeVisible()

  await page.getByRole('button', { name: 'Project Settings' }).click()
  await page.getByLabel('Plans').selectOption('enabled')
  await page.getByRole('group', { name: 'Workspace view' })
    .getByRole('button', { name: 'Plan View' })
    .click()
  await page.getByLabel('Upload plan image').setInputFiles(planImage)
  await expect(page.getByRole('img', { name: 'mobile-plan' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Apply Theme', exact: true }).hover()
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: 'Show mobile capture session' }).click()
  const mobileCaptureDialog = page.locator('.dialog--mobile-capture')
  const sessionId = (await mobileCaptureDialog.getByLabel('Session code').textContent()).trim()
  await mobileCaptureDialog.getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => page.evaluate(async (captureSessionId) => {
    const response = await fetch(`/api/sessions/${captureSessionId}`)
    return response.json()
  }, sessionId)).toMatchObject({
    showGrid: true,
    theme: 'light',
  })

  const mobilePage = await page.context().newPage()
  await mobilePage.setViewportSize({ width: 390, height: 844 })
  await mobilePage.goto(`/capture?session=${sessionId}`)
  await expect(mobilePage.getByText('Connected', { exact: true })).toBeVisible()
  await expect(mobilePage.locator('html')).toHaveAttribute('data-theme', 'light')

  await mobilePage.locator('.capture-native-input').setInputFiles(photoImage)
  await expect(mobilePage.getByText('Choose a location', { exact: true })).toBeVisible()
  await expect(mobilePage.getByRole('img', { name: 'mobile-plan' })).toBeVisible()
  const planFrame = mobilePage.locator('.mobile-plan-placement__frame')
  await expect(planFrame).toHaveCSS('background-image', /radial-gradient/)
  const mobilePlan = mobilePage.getByRole('button', {
    name: 'Create a new location on mobile-plan',
  })
  const mobilePlanBox = await mobilePlan.boundingBox()
  expect(mobilePlanBox).not.toBeNull()
  await mobilePlan.click({
    position: {
      x: mobilePlanBox.width * 0.75,
      y: mobilePlanBox.height * 0.25,
    },
  })
  const newLocationMarker = mobilePage.locator('.mobile-plan-placement__new-marker')
  await expect(newLocationMarker).toBeVisible()
  await expect(newLocationMarker.locator('svg.lucide-plus')).toBeVisible()
  await expect(newLocationMarker).toHaveCSS('color', 'rgb(200, 79, 79)')
  const [placementResponse] = await Promise.all([
    mobilePage.waitForResponse((response) =>
      response.request().method() === 'PUT' &&
      response.url().includes('/placements/')),
    mobilePage.getByRole('button', { name: 'Place Here' }).click(),
  ])
  const placementResponseBody = await placementResponse.text()
  expect(
    placementResponse.status(),
    placementResponseBody,
  ).toBe(200)
  await expect(mobilePage.getByText('Connected', { exact: true })).toBeVisible()
  await expect(mobilePage.locator('.capture-status').filter({ hasText: /^Placed / })).toBeVisible()
  await page.getByRole('group', { name: 'Workspace view' })
    .getByRole('button', { name: 'Tree View' })
    .click()
  await page.locator('.canvas-stage')
    .getByRole('button', { name: projectName, exact: true })
    .click()
  await expect.poll(() => page.evaluate(async (captureSessionId) => {
    const response = await fetch(`/api/sessions/${captureSessionId}`)
    return (await response.json()).selectedNodeName
  }, sessionId)).toBe(projectName)

  await mobilePage.locator('.capture-native-input').setInputFiles(photoImage)
  await expect(mobilePage.getByText('Choose a location', { exact: true })).toBeVisible()
  const selectedLocationDot = mobilePage.locator(
    '.mobile-plan-placement__existing-marker[aria-pressed="true"]',
  )
  await expect(selectedLocationDot).toHaveCount(1)
  await expect(selectedLocationDot).toHaveCSS('box-shadow', 'none')
  await expect(selectedLocationDot.locator('span')).toHaveCSS('box-shadow', 'none')
  await expect(selectedLocationDot.locator('span')).toHaveCSS('background-color', 'rgb(200, 79, 79)')
  await mobilePage.getByRole('button', { name: 'Add to Location' }).click()
  await expect(mobilePage.getByText('Connected', { exact: true })).toBeVisible()
  await expect(mobilePage.locator('.capture-status').filter({ hasText: /^Added / })).toBeVisible()

  await mobilePage.locator('.capture-native-input').setInputFiles(photoImage)
  await expect(mobilePage.getByText('Choose a location', { exact: true })).toBeVisible()
  await mobilePlan.click({
    position: {
      x: mobilePlanBox.width * 0.25,
      y: mobilePlanBox.height * 0.75,
    },
  })
  await mobilePage.getByRole('button', { name: 'Place Here' }).click()
  await expect(mobilePage.getByText('Connected', { exact: true })).toBeVisible()

  await mobilePage.locator('.capture-native-input').setInputFiles(photoImage)
  await expect(mobilePage.getByText('Choose a location', { exact: true })).toBeVisible()
  const defaultLocationDot = mobilePage.locator(
    '.mobile-plan-placement__existing-marker[aria-pressed="true"]',
  )
  const defaultLocationPosition = await defaultLocationDot.evaluate((dot) => ({
    left: Number.parseFloat(dot.style.left),
    top: Number.parseFloat(dot.style.top),
  }))
  expect(defaultLocationPosition.left).toBeCloseTo(25, 0)
  expect(defaultLocationPosition.top).toBeCloseTo(75, 0)
  const locationDots = mobilePage.locator('.mobile-plan-placement__existing-marker')
  const locationDotPositions = await locationDots.evaluateAll((dots) =>
    dots.map((dot) => Number.parseFloat(dot.style.left)))
  const firstLocationDot = locationDots.nth(
    locationDotPositions.findIndex((left) => left > 50),
  )
  await expect(firstLocationDot.locator('span')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(firstLocationDot.locator('span')).toHaveCSS('border-top-color', 'rgb(200, 79, 79)')
  await expect(firstLocationDot.locator('span')).toHaveCSS('border-top-style', 'solid')
  await firstLocationDot.click()
  await expect(firstLocationDot).toHaveAttribute('aria-pressed', 'true')
  await expect(firstLocationDot.locator('span')).toHaveCSS('background-color', 'rgb(200, 79, 79)')
  await mobilePage.getByRole('button', { name: 'Add to Location' }).click()
  await expect(mobilePage.getByText('Connected', { exact: true })).toBeVisible()

  await mobilePage.locator('.capture-native-input').setInputFiles(photoImage)
  await expect(mobilePage.getByText('Choose a location', { exact: true })).toBeVisible()
  await mobilePage.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(mobilePage.getByText('Connected', { exact: true })).toBeVisible()
  await expect(mobilePage.locator('.capture-status').filter({ hasText: /unplaced\.$/ })).toBeVisible()

  const projectTree = await page.evaluate(async (name) => {
    const projectsResponse = await fetch('/api/projects')
    const projects = await projectsResponse.json()
    const project = projects.find((candidate) => candidate.name === name)
    const treeResponse = await fetch(`/api/projects/${project.id}/tree`)
    return treeResponse.json()
  }, projectName)
  const photoNodes = projectTree.nodes.filter((node) => node.type === 'photo')
  const placements = projectTree.project.floorPlans[0].placements
  const firstPlacement = placements.find(
    (placement) => Math.abs(placement.x - 0.75) < 0.05,
  )
  const secondPlacement = placements.find(
    (placement) => Math.abs(placement.x - 0.25) < 0.05,
  )

  expect(photoNodes).toHaveLength(5)
  expect(placements).toHaveLength(2)
  expect(firstPlacement.y).toBeCloseTo(0.25, 1)
  expect(secondPlacement.y).toBeCloseTo(0.75, 1)
  expect(
    photoNodes.filter((node) => node.parent_id === firstPlacement.nodeId),
  ).toHaveLength(2)
  expect(
    photoNodes.filter((node) => node.parent_id === secondPlacement.nodeId),
  ).toHaveLength(0)
  expect(
    photoNodes.filter((node) => node.parent_id === projectTree.root.id),
  ).toHaveLength(3)

  await mobilePage.close()
})
