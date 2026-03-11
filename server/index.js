import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import Database from 'better-sqlite3'
import { execFileSync } from 'node:child_process'
import { renderMobileCapturePage } from './mobileCapturePage.js'

const app = express()
const port = Number(process.env.PORT || 3001)
const host = process.env.HOST || '0.0.0.0'
const baseDir = process.cwd()
const dataDir = path.join(baseDir, 'data')
const uploadsDir = path.join(dataDir, 'uploads')
const tempDir = path.join(dataDir, 'tmp')
const dbPath = path.join(dataDir, 'photomap.db')
const distDir = path.join(baseDir, 'dist')
const projectEventClients = new Map()
const activeDesktopClients = new Map()
const CLIENT_TTL_MS = 45000

fs.mkdirSync(uploadsDir, { recursive: true })
fs.mkdirSync(tempDir, { recursive: true })
fs.mkdirSync(path.join(tempDir, 'imports'), { recursive: true })

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

const defaultProjectSettings = {
  orientation: 'horizontal',
  horizontalGap: 72,
  verticalGap: 44,
  imageMode: 'square',
}

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    settings_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    parent_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('folder', 'photo')),
    name TEXT NOT NULL,
    notes TEXT DEFAULT '',
    tags_json TEXT DEFAULT '[]',
    collapsed INTEGER DEFAULT 0,
    image_path TEXT,
    preview_path TEXT,
    original_filename TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(parent_id) REFERENCES nodes(id)
  );
`)

const projectColumns = db.prepare(`PRAGMA table_info(projects)`).all()
if (!projectColumns.some((column) => column.name === 'settings_json')) {
  db.exec(`ALTER TABLE projects ADD COLUMN settings_json TEXT DEFAULT '{}'`)
}

const nodeColumns = db.prepare(`PRAGMA table_info(nodes)`).all()
if (!nodeColumns.some((column) => column.name === 'preview_path')) {
  db.exec(`ALTER TABLE nodes ADD COLUMN preview_path TEXT`)
}
if (!nodeColumns.some((column) => column.name === 'collapsed')) {
  db.exec(`ALTER TABLE nodes ADD COLUMN collapsed INTEGER DEFAULT 0`)
}

const insertProject = db.prepare(`
  INSERT INTO projects (name, description, settings_json, created_at, updated_at)
  VALUES (@name, @description, @settings_json, @created_at, @updated_at)
`)

const insertNode = db.prepare(`
  INSERT INTO nodes (
    project_id, parent_id, type, name, notes, tags_json, image_path, preview_path,
    original_filename, created_at, updated_at
  ) VALUES (
    @project_id, @parent_id, @type, @name, @notes, @tags_json, @image_path, @preview_path,
    @original_filename, @created_at, @updated_at
  )
`)

const getProject = db.prepare(`SELECT * FROM projects WHERE id = ?`)
const listProjects = db.prepare(`
  SELECT
    p.*,
    COUNT(n.id) AS node_count
  FROM projects p
  LEFT JOIN nodes n ON n.project_id = p.id
  GROUP BY p.id
  ORDER BY p.updated_at DESC, p.id DESC
`)
const getProjectNodes = db.prepare(`
  SELECT *
  FROM nodes
  WHERE project_id = ?
  ORDER BY COALESCE(parent_id, 0), type, name, id
`)
const deleteProjectStmt = db.prepare(`DELETE FROM projects WHERE id = ?`)
const deleteNodesByProjectStmt = db.prepare(`DELETE FROM nodes WHERE project_id = ?`)
const getNode = db.prepare(`SELECT * FROM nodes WHERE id = ?`)
const getNodesByProject = db.prepare(`SELECT * FROM nodes WHERE project_id = ?`)
const listNodeNamesByProject = db.prepare(`SELECT name FROM nodes WHERE project_id = ?`)
const getNodeChildren = db.prepare(`SELECT id FROM nodes WHERE parent_id = ?`)
const updateProjectTimestamp = db.prepare(`
  UPDATE projects
  SET updated_at = ?
  WHERE id = ?
`)
const updateProjectSettingsStmt = db.prepare(`
  UPDATE projects
  SET settings_json = @settings_json,
      updated_at = @updated_at
  WHERE id = @id
`)
const updateNodeStmt = db.prepare(`
  UPDATE nodes
  SET name = @name,
      notes = @notes,
      tags_json = @tags_json,
      collapsed = COALESCE(@collapsed, collapsed),
      updated_at = @updated_at
  WHERE id = @id
`)
const updateNodeParentStmt = db.prepare(`
  UPDATE nodes
  SET parent_id = @parent_id,
      updated_at = @updated_at
  WHERE id = @id
`)
const deleteNodeStmt = db.prepare(`DELETE FROM nodes WHERE id = ?`)

const createProjectWithRoot = db.transaction(({ name, description }) => {
  const now = new Date().toISOString()
  const projectResult = insertProject.run({
    name,
    description,
    settings_json: JSON.stringify(defaultProjectSettings),
    created_at: now,
    updated_at: now,
  })

  insertNode.run({
    project_id: projectResult.lastInsertRowid,
    parent_id: null,
    type: 'folder',
    name,
    notes: '',
    tags_json: '[]',
    image_path: null,
    preview_path: null,
    original_filename: null,
    created_at: now,
    updated_at: now,
  })

  return projectResult.lastInsertRowid
})

const updateProjectSettings = db.transaction(({ id, settings }) => {
  const now = new Date().toISOString()
  updateProjectSettingsStmt.run({
    id,
    settings_json: JSON.stringify(settings),
    updated_at: now,
  })
})

const createNode = db.transaction((payload) => {
  const now = new Date().toISOString()
  const result = insertNode.run({
    ...payload,
    created_at: now,
    updated_at: now,
    tags_json: JSON.stringify(payload.tags),
  })

  updateProjectTimestamp.run(now, payload.project_id)
  return result.lastInsertRowid
})

const updateNode = db.transaction(({ id, project_id, name, notes, tags, collapsed }) => {
  const now = new Date().toISOString()
  updateNodeStmt.run({
    id,
    name,
    notes,
    tags_json: JSON.stringify(tags),
    collapsed,
    updated_at: now,
  })
  updateProjectTimestamp.run(now, project_id)
})

const moveNode = db.transaction(({ id, project_id, parent_id }) => {
  const now = new Date().toISOString()
  updateNodeParentStmt.run({
    id,
    parent_id,
    updated_at: now,
  })
  updateProjectTimestamp.run(now, project_id)
})

const deleteNodeRecursive = db.transaction((nodeId, projectId) => {
  const stack = [{ id: nodeId, visited: false }]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current.visited) {
      stack.push({ id: current.id, visited: true })
      const children = getNodeChildren.all(current.id)
      for (const child of children) {
        stack.push({ id: child.id, visited: false })
      }
      continue
    }

    const node = getNode.get(current.id)
    for (const filePath of [node?.image_path, node?.preview_path]) {
      if (!filePath) {
        continue
      }

      const absolutePath = path.join(uploadsDir, filePath)
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath)
      }
    }

    deleteNodeStmt.run(current.id)
  }

  updateProjectTimestamp.run(new Date().toISOString(), projectId)
})

const deleteProjectRecursive = db.transaction((projectId) => {
  assertProject(projectId)
  const rows = getNodesByProject.all(projectId)

  for (const node of rows) {
    for (const filePath of [node.image_path, node.preview_path]) {
      if (!filePath) {
        continue
      }

      const absolutePath = path.join(uploadsDir, filePath)
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath)
      }
    }
  }

  deleteNodesByProjectStmt.run(projectId)
  deleteProjectStmt.run(projectId)

  const projectUploadDir = path.join(uploadsDir, String(projectId))
  if (fs.existsSync(projectUploadDir)) {
    fs.rmSync(projectUploadDir, { recursive: true, force: true })
  }
})

function parseTags(input) {
  if (!input) {
    return []
  }

  if (Array.isArray(input)) {
    return input.map((tag) => String(tag).trim()).filter(Boolean)
  }

  return String(input)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function createUntitledName(projectId) {
  const names = new Set(listNodeNamesByProject.all(projectId).map((row) => row.name))
  let index = 1

  while (names.has(`<untitled ${index}>`)) {
    index += 1
  }

  return `<untitled ${index}>`
}

function normalizeProjectSettings(settingsInput) {
  const settings = {
    ...defaultProjectSettings,
    ...(settingsInput || {}),
  }

  settings.orientation = settings.orientation === 'vertical' ? 'vertical' : 'horizontal'
  settings.imageMode = settings.imageMode === 'square' ? 'square' : 'original'
  settings.horizontalGap = Math.max(24, Math.min(220, Number(settings.horizontalGap) || defaultProjectSettings.horizontalGap))
  settings.verticalGap = Math.max(16, Math.min(180, Number(settings.verticalGap) || defaultProjectSettings.verticalGap))

  return settings
}

function serializeProject(row) {
  return {
    ...row,
    settings: normalizeProjectSettings(JSON.parse(row.settings_json || '{}')),
  }
}

function serializeNode(row) {
  return {
    ...row,
    tags: JSON.parse(row.tags_json || '[]'),
    collapsed: Boolean(row.collapsed),
    hasImage: row.type === 'photo' && Boolean(row.image_path),
    imageUrl: row.image_path ? `/uploads/${row.image_path.replaceAll('\\', '/')}` : null,
    previewUrl: row.preview_path ? `/uploads/${row.preview_path.replaceAll('\\', '/')}` : null,
  }
}

function buildTree(project, rows) {
  const nodes = rows.map(serializeNode)
  const byId = new Map(nodes.map((node) => [node.id, { ...node, children: [] }]))
  let root = null

  for (const node of byId.values()) {
    if (node.parent_id == null) {
      root = node
      continue
    }

    const parent = byId.get(node.parent_id)
    if (parent) {
      parent.children.push(node)
    }
  }

  return {
    project: serializeProject(project),
    root,
    nodes: Array.from(byId.values()),
  }
}

function assertProject(projectId) {
  const project = getProject.get(projectId)
  if (!project) {
    const error = new Error('Project not found')
    error.status = 404
    throw error
  }
  return project
}

function assertNode(nodeId) {
  const node = getNode.get(nodeId)
  if (!node) {
    const error = new Error('Node not found')
    error.status = 404
    throw error
  }
  return node
}

function ensureNodeBelongsToProject(node, projectId) {
  if (node.project_id !== projectId) {
    const error = new Error('Node does not belong to project')
    error.status = 400
    throw error
  }
}

function ensureNotRoot(node) {
  if (node.parent_id == null) {
    const error = new Error('The project root cannot be deleted or moved')
    error.status = 400
    throw error
  }
}

function ensureNoCycle(nodeId, parentId) {
  if (parentId == null) {
    return
  }

  let cursor = getNode.get(parentId)
  while (cursor) {
    if (cursor.id === nodeId) {
      const error = new Error('Cannot move a node into its own descendant')
      error.status = 400
      throw error
    }
    cursor = cursor.parent_id == null ? null : getNode.get(cursor.parent_id)
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projectId = req.params.id
    const targetDir = path.join(uploadsDir, projectId)
    fs.mkdirSync(targetDir, { recursive: true })
    cb(null, targetDir)
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    cb(null, `${Date.now()}-${file.fieldname}-${safeName}`)
  },
})

const upload = multer({ storage })
const importUpload = multer({ dest: path.join(tempDir, 'imports') })

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(tempDir, `${prefix}-`))
}

function zipDirectory(sourceDir, destinationZip) {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${sourceDir.replace(/'/g, "''")}\\*' -DestinationPath '${destinationZip.replace(/'/g, "''")}' -Force`,
  ])
}

function unzipArchive(sourceZip, destinationDir) {
  execFileSync('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${sourceZip.replace(/'/g, "''")}' -DestinationPath '${destinationDir.replace(/'/g, "''")}' -Force`,
  ])
}

function exportProjectArchive(projectId) {
  const project = assertProject(projectId)
  const rows = getProjectNodes.all(projectId)
  const workDir = makeTempDir(`export-${projectId}`)
  const filesDir = path.join(workDir, 'files')
  fs.mkdirSync(filesDir, { recursive: true })

  const manifest = {
    version: 1,
    exported_at: new Date().toISOString(),
    project: {
      name: project.name,
      description: project.description || '',
      settings: normalizeProjectSettings(JSON.parse(project.settings_json || '{}')),
    },
    nodes: rows.map((row) => {
      const imageFile = row.image_path
        ? `files/${row.id}-image${path.extname(row.image_path) || path.extname(row.original_filename || '') || '.jpg'}`
        : null
      const previewFile = row.preview_path
        ? `files/${row.id}-preview${path.extname(row.preview_path) || '.jpg'}`
        : null

      if (row.image_path) {
        fs.copyFileSync(path.join(uploadsDir, row.image_path), path.join(workDir, imageFile))
      }
      if (row.preview_path) {
        fs.copyFileSync(path.join(uploadsDir, row.preview_path), path.join(workDir, previewFile))
      }

      return {
        old_id: row.id,
        parent_old_id: row.parent_id,
        type: row.type,
        name: row.name,
        notes: row.notes || '',
        tags: JSON.parse(row.tags_json || '[]'),
        collapsed: Boolean(row.collapsed),
        original_filename: row.original_filename,
        image_file: imageFile,
        preview_file: previewFile,
      }
    }),
  }

  fs.writeFileSync(path.join(workDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  const archivePath = path.join(tempDir, `photomap-project-${projectId}-${Date.now()}.zip`)
  zipDirectory(workDir, archivePath)
  fs.rmSync(workDir, { recursive: true, force: true })
  return archivePath
}

function importProjectArchive(archivePath) {
  const extractDir = makeTempDir('import')
  unzipArchive(archivePath, extractDir)

  const manifestPath = path.join(extractDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    const error = new Error('Invalid project archive: manifest.json not found')
    error.status = 400
    throw error
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const projectId = createProjectWithRoot({
    name: String(manifest.project?.name || 'Imported Project').trim() || 'Imported Project',
    description: String(manifest.project?.description || '').trim(),
  })

  if (manifest.project?.settings) {
    updateProjectSettings({
      id: projectId,
      settings: normalizeProjectSettings(manifest.project.settings),
    })
  }

  const importedRows = Array.isArray(manifest.nodes) ? manifest.nodes : []
  const oldToNew = new Map()
  const createdRoot = getProjectNodes.all(projectId).find((node) => node.parent_id == null)
  const rootRow = importedRows.find((node) => node.parent_old_id == null)

  if (createdRoot && rootRow) {
    updateNode({
      id: createdRoot.id,
      project_id: projectId,
      name: rootRow.name || createdRoot.name,
      notes: rootRow.notes || '',
      tags: rootRow.tags || [],
      collapsed: rootRow.collapsed ? 1 : 0,
    })
    oldToNew.set(rootRow.old_id, createdRoot.id)
  }

  const projectUploadDir = path.join(uploadsDir, String(projectId))
  fs.mkdirSync(projectUploadDir, { recursive: true })

  for (const row of importedRows) {
    if (row.parent_old_id == null) {
      continue
    }

    const parentId = oldToNew.get(row.parent_old_id)
    const importedImagePath = row.image_file ? path.join(extractDir, row.image_file) : null
    const importedPreviewPath = row.preview_file ? path.join(extractDir, row.preview_file) : null
    const relativeImagePath = importedImagePath
      ? path.join(String(projectId), `${Date.now()}-${path.basename(importedImagePath)}`)
      : null
    const relativePreviewPath = importedPreviewPath
      ? path.join(String(projectId), `${Date.now()}-${path.basename(importedPreviewPath)}`)
      : null

    if (importedImagePath && fs.existsSync(importedImagePath)) {
      fs.copyFileSync(importedImagePath, path.join(uploadsDir, relativeImagePath))
    }
    if (importedPreviewPath && fs.existsSync(importedPreviewPath)) {
      fs.copyFileSync(importedPreviewPath, path.join(uploadsDir, relativePreviewPath))
    }

    const nodeId = createNode({
      project_id: projectId,
      parent_id: parentId,
      type: row.type === 'photo' ? 'photo' : 'folder',
      name: row.name || (row.type === 'photo' ? createUntitledName(projectId) : 'Imported Folder'),
      notes: row.notes || '',
      tags: Array.isArray(row.tags) ? row.tags : [],
      image_path: relativeImagePath,
      preview_path: relativePreviewPath,
      original_filename: row.original_filename || null,
    })

    if (row.collapsed) {
      updateNode({
        id: nodeId,
        project_id: projectId,
        name: row.name || '',
        notes: row.notes || '',
        tags: Array.isArray(row.tags) ? row.tags : [],
        collapsed: 1,
      })
    }

    oldToNew.set(row.old_id, nodeId)
  }

  fs.rmSync(extractDir, { recursive: true, force: true })
  return buildTree(assertProject(projectId), getProjectNodes.all(projectId))
}

function broadcastProjectEvent(projectId, payload = { type: 'project-updated' }) {
  const listeners = projectEventClients.get(projectId)
  if (!listeners || listeners.size === 0) {
    return
  }

  const body = `data: ${JSON.stringify(payload)}\n\n`
  for (const response of listeners) {
    response.write(body)
  }
}

function getProjectClientMap(projectId) {
  let clients = activeDesktopClients.get(projectId)
  if (!clients) {
    clients = new Map()
    activeDesktopClients.set(projectId, clients)
  }
  return clients
}

function cleanupProjectClients(projectId) {
  const clients = activeDesktopClients.get(projectId)
  if (!clients) {
    return []
  }

  const cutoff = Date.now() - CLIENT_TTL_MS
  for (const [clientId, client] of clients) {
    if (client.updatedAt < cutoff) {
      clients.delete(clientId)
    }
  }

  if (clients.size === 0) {
    activeDesktopClients.delete(projectId)
    return []
  }

  return Array.from(clients.values())
}

app.use(express.json({ limit: '5mb' }))
app.use('/uploads', express.static(uploadsDir))

app.get('/capture', (_req, res) => {
  res.type('html').send(renderMobileCapturePage())
})

app.get('/api/projects', (req, res) => {
  const projects = listProjects.all().map(serializeProject)
  res.json(projects)
})

app.post('/api/projects', (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim()
    const description = String(req.body.description || '').trim()

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' })
    }

    const projectId = createProjectWithRoot({ name, description })
    const project = assertProject(projectId)
    const tree = buildTree(project, getProjectNodes.all(projectId))
    res.status(201).json(tree)
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects/:id/tree', (req, res, next) => {
  try {
    const projectId = Number(req.params.id)
    const project = assertProject(projectId)
    const tree = buildTree(project, getProjectNodes.all(projectId))
    res.json(tree)
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects/:id/clients', (req, res, next) => {
  try {
    const projectId = Number(req.params.id)
    assertProject(projectId)

    const clients = cleanupProjectClients(projectId).sort((a, b) => a.name.localeCompare(b.name))
    res.json(
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        selectedNodeId: client.selectedNodeId,
        selectedNodeName: client.selectedNodeName,
      })),
    )
  } catch (error) {
    next(error)
  }
})

app.patch('/api/projects/:id/clients/:clientId', (req, res, next) => {
  try {
    const projectId = Number(req.params.id)
    assertProject(projectId)

    const clientId = String(req.params.clientId || '').trim()
    const name = String(req.body.name || '').trim()
    const selectedNodeId = Number(req.body.selectedNodeId)
    const selectedNode = assertNode(selectedNodeId)
    ensureNodeBelongsToProject(selectedNode, projectId)

    const clients = getProjectClientMap(projectId)
    clients.set(clientId, {
      id: clientId,
      name: name || `Desktop ${clientId.slice(-4)}`,
      selectedNodeId,
      selectedNodeName: selectedNode.name,
      updatedAt: Date.now(),
    })

    cleanupProjectClients(projectId)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects/:id/events', (req, res, next) => {
  try {
    const projectId = Number(req.params.id)
    assertProject(projectId)

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

    let listeners = projectEventClients.get(projectId)
    if (!listeners) {
      listeners = new Set()
      projectEventClients.set(projectId, listeners)
    }
    listeners.add(res)

    const heartbeat = setInterval(() => {
      res.write(': keep-alive\n\n')
    }, 20000)

    req.on('close', () => {
      clearInterval(heartbeat)
      listeners.delete(res)
      if (listeners.size === 0) {
        projectEventClients.delete(projectId)
      }
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/projects/:id/settings', (req, res, next) => {
  try {
    const projectId = Number(req.params.id)
    const project = assertProject(projectId)
    const currentSettings = normalizeProjectSettings(JSON.parse(project.settings_json || '{}'))
    const nextSettings = normalizeProjectSettings({
      ...currentSettings,
      ...(req.body || {}),
    })

    updateProjectSettings({
      id: projectId,
      settings: nextSettings,
    })

    broadcastProjectEvent(projectId)
    res.json(serializeProject(assertProject(projectId)))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/projects/:id', (req, res, next) => {
  try {
    const projectId = Number(req.params.id)
    broadcastProjectEvent(projectId, { type: 'project-deleted' })
    activeDesktopClients.delete(projectId)
    deleteProjectRecursive(projectId)
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects/:id/export', (req, res, next) => {
  let archivePath = null

  try {
    const projectId = Number(req.params.id)
    archivePath = exportProjectArchive(projectId)
    const project = assertProject(projectId)
    const safeName = project.name.replace(/[^a-zA-Z0-9._-]/g, '_') || `project-${projectId}`
    res.download(archivePath, `${safeName}.zip`, (downloadError) => {
      if (archivePath && fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath)
      }
      if (downloadError) {
        next(downloadError)
      }
    })
  } catch (error) {
    if (archivePath && fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath)
    }
    next(error)
  }
})

app.post('/api/projects/import', importUpload.single('archive'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Project archive is required' })
    }

    const importedTree = importProjectArchive(req.file.path)
    fs.unlinkSync(req.file.path)
    res.status(201).json(importedTree)
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    next(error)
  }
})

app.post('/api/projects/:id/folders', (req, res, next) => {
  try {
    const projectId = Number(req.params.id)
    assertProject(projectId)

    const clientId = String(req.body.clientId || '').trim()
    let parentId = Number(req.body.parentId)
    if ((!parentId || Number.isNaN(parentId)) && clientId) {
      const clients = cleanupProjectClients(projectId)
      const controllingClient = clients.find((client) => client.id === clientId)
      if (!controllingClient) {
        return res.status(400).json({ error: 'Selected client is not active' })
      }
      parentId = controllingClient.selectedNodeId
    }

    const parentNode = assertNode(parentId)
    ensureNodeBelongsToProject(parentNode, projectId)

    const name = String(req.body.name || '').trim()
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' })
    }

    const nodeId = createNode({
      project_id: projectId,
      parent_id: parentId,
      type: 'folder',
      name,
      notes: String(req.body.notes || '').trim(),
      tags: parseTags(req.body.tags),
      image_path: null,
      preview_path: null,
      original_filename: null,
    })

    broadcastProjectEvent(projectId)
    res.status(201).json(serializeNode(assertNode(nodeId)))
  } catch (error) {
    next(error)
  }
})

app.post('/api/projects/:id/photos', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'preview', maxCount: 1 }]), (req, res, next) => {
  try {
    const projectId = Number(req.params.id)
    assertProject(projectId)

    const clientId = String(req.body.clientId || '').trim()
    let parentId = Number(req.body.parentId)
    if ((!parentId || Number.isNaN(parentId)) && clientId) {
      const clients = cleanupProjectClients(projectId)
      const controllingClient = clients.find((client) => client.id === clientId)
      if (!controllingClient) {
        return res.status(400).json({ error: 'Selected client is not active' })
      }
      parentId = controllingClient.selectedNodeId
    }

    const parentNode = assertNode(parentId)
    ensureNodeBelongsToProject(parentNode, projectId)

    const originalFile = req.files?.file?.[0]
    const previewFile = req.files?.preview?.[0] || null

    if (!originalFile) {
      return res.status(400).json({ error: 'Photo file is required' })
    }

    const requestedName = String(req.body.name || '').trim()
    const resolvedName =
      requestedName && requestedName !== '<untitled>' ? requestedName : createUntitledName(projectId)
    const nodeId = createNode({
      project_id: projectId,
      parent_id: parentId,
      type: 'photo',
      name: resolvedName,
      notes: String(req.body.notes || '').trim(),
      tags: parseTags(req.body.tags),
      image_path: path.relative(uploadsDir, originalFile.path),
      preview_path: previewFile ? path.relative(uploadsDir, previewFile.path) : null,
      original_filename: originalFile.originalname,
    })

    broadcastProjectEvent(projectId)
    res.status(201).json(serializeNode(assertNode(nodeId)))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/nodes/:id', (req, res, next) => {
  try {
    const nodeId = Number(req.params.id)
    const node = assertNode(nodeId)

    updateNode({
      id: nodeId,
      project_id: node.project_id,
      name: String(req.body.name || '').trim() || node.name,
      notes: String(req.body.notes || '').trim(),
      tags: parseTags(req.body.tags),
      collapsed: typeof req.body.collapsed === 'boolean' ? (req.body.collapsed ? 1 : 0) : null,
    })

    broadcastProjectEvent(node.project_id)
    res.json(serializeNode(assertNode(nodeId)))
  } catch (error) {
    next(error)
  }
})

app.post('/api/nodes/:id/collapse', (req, res, next) => {
  try {
    const nodeId = Number(req.params.id)
    const node = assertNode(nodeId)

    updateNode({
      id: nodeId,
      project_id: node.project_id,
      name: node.name,
      notes: node.notes || '',
      tags: JSON.parse(node.tags_json || '[]'),
      collapsed: req.body.collapsed ? 1 : 0,
    })

    broadcastProjectEvent(node.project_id)
    res.json(serializeNode(assertNode(nodeId)))
  } catch (error) {
    next(error)
  }
})

app.post('/api/nodes/:id/move', (req, res, next) => {
  try {
    const nodeId = Number(req.params.id)
    const node = assertNode(nodeId)
    ensureNotRoot(node)

    const parentId = Number(req.body.parentId)
    const targetParent = assertNode(parentId)
    ensureNodeBelongsToProject(targetParent, node.project_id)
    ensureNoCycle(nodeId, parentId)

    moveNode({
      id: nodeId,
      project_id: node.project_id,
      parent_id: parentId,
    })

    broadcastProjectEvent(node.project_id)
    res.json(serializeNode(assertNode(nodeId)))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/nodes/:id', (req, res, next) => {
  try {
    const nodeId = Number(req.params.id)
    const node = assertNode(nodeId)
    ensureNotRoot(node)
    deleteNodeRecursive(nodeId, node.project_id)
    broadcastProjectEvent(node.project_id)
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))

  app.use((req, res, next) => {
    if (req.path === '/capture' || req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return next()
    }

    return res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((error, req, res, _next) => {
  const status = error.status || 500
  if (status >= 500) {
    console.error(error)
  }
  res.status(status).json({ error: error.message || 'Unexpected server error' })
})

app.listen(port, host, () => {
  console.log(`PhotoMap server listening on http://${host}:${port}`)
})
