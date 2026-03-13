import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import Database from 'better-sqlite3'
import AdmZip from 'adm-zip'
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
const activeDesktopSessions = new Map()
const activeMobileConnections = new Map()
const CLIENT_TTL_MS = 45000
const MOBILE_CONNECTION_TTL_MS = 30000

fs.mkdirSync(uploadsDir, { recursive: true })
fs.mkdirSync(tempDir, { recursive: true })
fs.mkdirSync(path.join(tempDir, 'imports'), { recursive: true })

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

const ID_FIRST_CHARS = 'abcdefghijklmnopqrstuvwxyz'
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

const defaultProjectSettings = {
  orientation: 'horizontal',
  horizontalGap: 72,
  verticalGap: 44,
  imageMode: 'square',
}

function generateShortId() {
  let value = ID_FIRST_CHARS[Math.floor(Math.random() * ID_FIRST_CHARS.length)]
  for (let index = 1; index < 5; index += 1) {
    value += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)]
  }
  return value
}

function generateUniqueId(lookup) {
  let attempts = 0
  while (attempts < 200) {
    const candidate = generateShortId()
    if (!lookup(candidate)) {
      return candidate
    }
    attempts += 1
  }

  throw new Error('Unable to generate a unique short id')
}

function createTextSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      settings_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      parent_id TEXT,
      variant_of_id TEXT,
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
      FOREIGN KEY(parent_id) REFERENCES nodes(id),
      FOREIGN KEY(variant_of_id) REFERENCES nodes(id)
    );
  `)
}

function ensureTextIdSchema() {
  const hasProjects = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'`).get()
  const hasNodes = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nodes'`).get()

  if (!hasProjects && !hasNodes) {
    createTextSchema()
    return
  }

  const projectColumns = db.prepare(`PRAGMA table_info(projects)`).all()
  const nodeColumns = db.prepare(`PRAGMA table_info(nodes)`).all()
  const projectIdType = String(projectColumns.find((column) => column.name === 'id')?.type || '').toUpperCase()
  const nodeProjectIdType = String(nodeColumns.find((column) => column.name === 'project_id')?.type || '').toUpperCase()
  const legacySchema =
    projectIdType.includes('INT') ||
    nodeProjectIdType.includes('INT') ||
    projectColumns.some((column) => column.name === 'public_id') ||
    nodeColumns.some((column) => column.name === 'public_id')

  if (!legacySchema) {
    return
  }

  if (!projectColumns.some((column) => column.name === 'public_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN public_id TEXT`)
  }
  if (!projectColumns.some((column) => column.name === 'settings_json')) {
    db.exec(`ALTER TABLE projects ADD COLUMN settings_json TEXT DEFAULT '{}'`)
  }
  if (!nodeColumns.some((column) => column.name === 'public_id')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN public_id TEXT`)
  }
  if (!nodeColumns.some((column) => column.name === 'preview_path')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN preview_path TEXT`)
  }
  if (!nodeColumns.some((column) => column.name === 'collapsed')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN collapsed INTEGER DEFAULT 0`)
  }
  if (!nodeColumns.some((column) => column.name === 'variant_of_id')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN variant_of_id INTEGER`)
  }

  const legacyProjects = db.prepare(`SELECT * FROM projects`).all()
  const legacyNodes = db.prepare(`SELECT * FROM nodes`).all()
  const isValidPublicId = (value) => typeof value === 'string' && /^[a-z][a-z0-9]{4}$/i.test(value)

  const usedProjectIds = new Set()
  const projectIdMap = new Map()
  for (const row of legacyProjects) {
    const publicId = isValidPublicId(row.public_id)
      ? row.public_id
      : generateUniqueId((candidate) => usedProjectIds.has(candidate))
    usedProjectIds.add(publicId)
    projectIdMap.set(row.id, publicId)
  }

  const usedNodeIds = new Set()
  const nodeIdMap = new Map()
  for (const row of legacyNodes) {
    const publicId = isValidPublicId(row.public_id)
      ? row.public_id
      : generateUniqueId((candidate) => usedNodeIds.has(candidate))
    usedNodeIds.add(publicId)
    nodeIdMap.set(row.id, publicId)
  }

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE projects_new (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        settings_json TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE nodes_new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        parent_id TEXT,
        variant_of_id TEXT,
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
        FOREIGN KEY(project_id) REFERENCES projects_new(id),
        FOREIGN KEY(parent_id) REFERENCES nodes_new(id),
        FOREIGN KEY(variant_of_id) REFERENCES nodes_new(id)
      );
    `)

    const insertProjectRow = db.prepare(`
      INSERT INTO projects_new (id, name, description, settings_json, created_at, updated_at)
      VALUES (@id, @name, @description, @settings_json, @created_at, @updated_at)
    `)
    const insertNodeRow = db.prepare(`
      INSERT INTO nodes_new (
        id, project_id, parent_id, variant_of_id, type, name, notes, tags_json, collapsed,
        image_path, preview_path, original_filename, created_at, updated_at
      ) VALUES (
        @id, @project_id, @parent_id, @variant_of_id, @type, @name, @notes, @tags_json, @collapsed,
        @image_path, @preview_path, @original_filename, @created_at, @updated_at
      )
    `)

    for (const row of legacyProjects) {
      insertProjectRow.run({
        id: projectIdMap.get(row.id),
        name: row.name,
        description: row.description || '',
        settings_json: row.settings_json || '{}',
        created_at: row.created_at,
        updated_at: row.updated_at,
      })
    }

    for (const row of legacyNodes) {
      insertNodeRow.run({
        id: nodeIdMap.get(row.id),
        project_id: projectIdMap.get(row.project_id),
        parent_id: row.parent_id != null ? nodeIdMap.get(row.parent_id) : null,
        variant_of_id: row.variant_of_id != null ? nodeIdMap.get(row.variant_of_id) : null,
        type: row.type,
        name: row.name,
        notes: row.notes || '',
        tags_json: row.tags_json || '[]',
        collapsed: row.collapsed ? 1 : 0,
        image_path: row.image_path || null,
        preview_path: row.preview_path || null,
        original_filename: row.original_filename || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })
    }

    db.exec(`
      DROP TABLE nodes;
      DROP TABLE projects;
      ALTER TABLE projects_new RENAME TO projects;
      ALTER TABLE nodes_new RENAME TO nodes;
    `)
  })

  db.exec(`PRAGMA foreign_keys = OFF`)
  try {
    migrate()
  } finally {
    db.exec(`PRAGMA foreign_keys = ON`)
  }
}

ensureTextIdSchema()

const insertProject = db.prepare(`
  INSERT INTO projects (id, name, description, settings_json, created_at, updated_at)
  VALUES (@id, @name, @description, @settings_json, @created_at, @updated_at)
`)

const insertNode = db.prepare(`
  INSERT INTO nodes (
    id, project_id, parent_id, variant_of_id, type, name, notes, tags_json, image_path, preview_path,
    original_filename, created_at, updated_at
  ) VALUES (
    @id, @project_id, @parent_id, @variant_of_id, @type, @name, @notes, @tags_json, @image_path, @preview_path,
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
  ORDER BY COALESCE(parent_id, ''), type, name, id
`)
const deleteProjectStmt = db.prepare(`DELETE FROM projects WHERE id = ?`)
const deleteNodesByProjectStmt = db.prepare(`DELETE FROM nodes WHERE project_id = ?`)
const getNode = db.prepare(`SELECT * FROM nodes WHERE id = ?`)
const getNodesByProject = db.prepare(`SELECT * FROM nodes WHERE project_id = ?`)
const listNodeNamesByProject = db.prepare(`SELECT name FROM nodes WHERE project_id = ?`)
const getNodeChildren = db.prepare(`SELECT id FROM nodes WHERE parent_id = ? OR variant_of_id = ?`)
const listCollapsibleNodeIdsByProject = db.prepare(`
  SELECT DISTINCT parent.id
  FROM nodes child
  JOIN nodes parent ON child.parent_id = parent.id
  WHERE parent.project_id = ?
    AND parent.variant_of_id IS NULL
`)
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
const updateProjectMetaStmt = db.prepare(`
  UPDATE projects
  SET name = @name,
      description = @description,
      settings_json = @settings_json,
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
      variant_of_id = @variant_of_id,
      updated_at = @updated_at
  WHERE id = @id
`)
const updateNodeCollapsedStmt = db.prepare(`
  UPDATE nodes
  SET collapsed = @collapsed,
      updated_at = @updated_at
  WHERE id = @id
`)
const deleteNodeStmt = db.prepare(`DELETE FROM nodes WHERE id = ?`)

const createProjectWithRoot = db.transaction(({ name, description }) => {
  const now = new Date().toISOString()
  const projectId = generateUniqueId((candidate) => Boolean(getProject.get(candidate)))
  insertProject.run({
    id: projectId,
    name,
    description,
    settings_json: JSON.stringify(defaultProjectSettings),
    created_at: now,
    updated_at: now,
  })

  insertNode.run({
    id: generateUniqueId((candidate) => Boolean(getNode.get(candidate))),
    project_id: projectId,
    parent_id: null,
    type: 'folder',
    name,
    notes: '',
    tags_json: '[]',
    variant_of_id: null,
    image_path: null,
    preview_path: null,
    original_filename: null,
    created_at: now,
    updated_at: now,
  })

  return projectId
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
  const nodeId = payload.id || generateUniqueId((candidate) => Boolean(getNode.get(candidate)))
  insertNode.run({
    id: nodeId,
    ...payload,
    created_at: now,
    updated_at: now,
    tags_json: JSON.stringify(payload.tags),
    variant_of_id: payload.variant_of_id ?? null,
  })

  updateProjectTimestamp.run(now, payload.project_id)
  return nodeId
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

const moveNode = db.transaction(({ id, project_id, parent_id, variant_of_id }) => {
  const now = new Date().toISOString()
  updateNodeParentStmt.run({
    id,
    parent_id,
    variant_of_id,
    updated_at: now,
  })
  updateProjectTimestamp.run(now, project_id)
})

const setProjectCollapsedState = db.transaction(({ projectId, collapsed }) => {
  const now = new Date().toISOString()
  const nodeIds = listCollapsibleNodeIdsByProject.all(projectId).map((row) => row.id)
  for (const nodeId of nodeIds) {
    updateNodeCollapsedStmt.run({
      id: nodeId,
      collapsed,
      updated_at: now,
    })
  }
  updateProjectTimestamp.run(now, projectId)
  return nodeIds
})

const setNodeCollapsedStateRecursive = db.transaction(({ nodeId, projectId, collapsed }) => {
  const now = new Date().toISOString()
  const stack = [nodeId]
  const updatedIds = []

  while (stack.length > 0) {
    const currentId = stack.pop()
    updatedIds.push(currentId)
    updateNodeCollapsedStmt.run({
      id: currentId,
      collapsed,
      updated_at: now,
    })

    if (!collapsed) {
      continue
    }

    const children = getNodeChildren.all(currentId, currentId)
    for (const child of children) {
      stack.push(child.id)
    }
  }

  updateProjectTimestamp.run(now, projectId)
  return updatedIds
})

const deleteNodeRecursive = db.transaction((nodeId, projectId) => {
  const stack = [{ id: nodeId, visited: false }]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current.visited) {
      stack.push({ id: current.id, visited: true })
      const children = getNodeChildren.all(current.id, current.id)
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

const clearProjectContents = db.transaction((projectId) => {
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

  const projectUploadDir = path.join(uploadsDir, String(projectId))
  if (fs.existsSync(projectUploadDir)) {
    fs.rmSync(projectUploadDir, { recursive: true, force: true })
  }
  fs.mkdirSync(projectUploadDir, { recursive: true })
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

function sanitizeUploadName(filename, fallback = 'file.jpg') {
  const safeName = path.basename(String(filename || fallback)).replace(/[^a-zA-Z0-9._ -]/g, '_')
  return safeName || fallback
}

function sanitizeFilesystemName(name, fallback = 'item') {
  const safeName = Array.from(String(name || fallback).trim())
    .map((character) => {
      if ('<>:"/\\|?*'.includes(character)) {
        return '_'
      }
      const code = character.charCodeAt(0)
      return code >= 0 && code <= 31 ? '_' : character
    })
    .join('')
  return safeName || fallback
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
    id: row.id,
    name: row.name,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
    settings: normalizeProjectSettings(JSON.parse(row.settings_json || '{}')),
  }
}

function serializeNode(row) {
  return {
    id: row.id,
    parent_id: row.parent_id,
    variant_of_id: row.variant_of_id,
    type: row.type,
    name: row.name,
    notes: row.notes,
    original_filename: row.original_filename,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tags: JSON.parse(row.tags_json || '[]'),
    collapsed: Boolean(row.collapsed),
    isVariant: row.variant_of_id != null,
    hasImage: row.type === 'photo' && Boolean(row.image_path),
    imageUrl: row.image_path ? `/uploads/${row.image_path.replaceAll('\\', '/')}` : null,
    previewUrl: row.preview_path ? `/uploads/${row.preview_path.replaceAll('\\', '/')}` : null,
  }
}

function buildTree(project, rows) {
  const nodes = rows.map((row) => serializeNode(row))
  const byId = new Map(nodes.map((node) => [node.id, { ...node, children: [], variants: [] }]))
  let root = null

  for (const node of byId.values()) {
    if (node.variant_of_id != null) {
      const anchor = byId.get(node.variant_of_id)
      if (anchor) {
        anchor.variants.push(node)
      }
      continue
    }

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
  const project = getProject.get(String(projectId || '').trim())
  if (!project) {
    const error = new Error('Project not found')
    error.status = 404
    throw error
  }
  return project
}

function assertNode(nodeId) {
  const node = getNode.get(String(nodeId || '').trim())
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
  if (node.parent_id == null && node.variant_of_id == null) {
    const error = new Error('The project root cannot be deleted or moved')
    error.status = 400
    throw error
  }
}

function ensureCanHaveChildren(node) {
  if (node.variant_of_id != null) {
    const error = new Error('Variants cannot have children')
    error.status = 400
    throw error
  }
}

function ensureNoChildren(node) {
  const children = getNodeChildren.all(node.id, node.id)
  if (children.length > 0) {
    const error = new Error('Only leaf nodes can become variants')
    error.status = 400
    throw error
  }
}

function resolveVariantAnchor(node) {
  if (node.variant_of_id == null) {
    return node
  }

  return assertNode(node.variant_of_id)
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
const restoreUpload = multer({ storage: multer.memoryStorage() })

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(tempDir, `${prefix}-`))
}

function zipDirectory(sourceDir, destinationZip) {
  try {
    const zip = new AdmZip()
    for (const entry of fs.readdirSync(sourceDir)) {
      const absolutePath = path.join(sourceDir, entry)
      const stats = fs.statSync(absolutePath)
      if (stats.isDirectory()) {
        zip.addLocalFolder(absolutePath, entry)
      } else {
        zip.addLocalFile(absolutePath)
      }
    }
    zip.writeZip(destinationZip)
  } catch (error) {
    const wrapped = new Error(error.message || 'Project export failed')
    wrapped.status = 500
    throw wrapped
  }
}

function unzipArchive(sourceZip, destinationDir) {
  try {
    const zip = new AdmZip(sourceZip)
    zip.extractAllTo(destinationDir, true)
  } catch (error) {
    const wrapped = new Error(error.message || 'Project import failed')
    wrapped.status = 500
    throw wrapped
  }
}

function exportProjectArchive(projectId) {
  const project = assertProject(projectId)
  const rows = getProjectNodes.all(projectId)
  const workDir = makeTempDir(`export-${projectId}`)
  writeProjectManifest(project, rows, workDir)
  const archivePath = path.join(tempDir, `photomap-project-${projectId}-${Date.now()}.zip`)
  zipDirectory(workDir, archivePath)
  fs.rmSync(workDir, { recursive: true, force: true })
  return archivePath
}

function ensureUniquePath(targetPath, suffix = '') {
  const parsed = path.parse(targetPath)
  let candidate = targetPath
  let index = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name} (${index})${suffix || parsed.ext}`)
    index += 1
  }
  return candidate
}

function exportProjectMediaArchive(projectId) {
  const project = assertProject(projectId)
  const rows = getProjectNodes.all(projectId)
  const tree = buildTree(project, rows)
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const workDir = makeTempDir(`export-media-${projectId}`)
  const rootDir = path.join(workDir, sanitizeFilesystemName(project.name || `project-${projectId}`))
  fs.mkdirSync(rootDir, { recursive: true })

  function copyImageFile(row, destinationDir, requestedName) {
    if (!row?.image_path) {
      return
    }
    const sourcePath = path.join(uploadsDir, row.image_path)
    if (!fs.existsSync(sourcePath)) {
      return
    }

    const ext =
      path.extname(row.original_filename || '') ||
      path.extname(row.image_path || '') ||
      '.jpg'
    const baseName = sanitizeFilesystemName(requestedName || row.name || 'photo')
    const initialPath = path.join(destinationDir, `${baseName}${ext}`)
    const destinationPath = ensureUniquePath(initialPath)
    fs.copyFileSync(sourcePath, destinationPath)
  }

  function exportVariants(anchorNode, destinationDir) {
    if (!anchorNode?.variants?.length) {
      return
    }

    const variantsDir = path.join(destinationDir, '_variants')
    fs.mkdirSync(variantsDir, { recursive: true })
    for (const variant of anchorNode.variants) {
      exportNode(variant, variantsDir)
    }
  }

  function exportChildren(node, destinationDir) {
    for (const child of node.children || []) {
      exportNode(child, destinationDir)
    }
  }

  function exportNode(node, destinationDir) {
    const row = rowById.get(node.id)
    const hasNestedContent = (node.children?.length || 0) > 0 || (node.variants?.length || 0) > 0
    const safeNodeName = sanitizeFilesystemName(node.name || node.type || 'node')

    if (node.type === 'folder') {
      const folderDir = ensureUniquePath(path.join(destinationDir, safeNodeName), '')
      fs.mkdirSync(folderDir, { recursive: true })
      exportChildren(node, folderDir)
      exportVariants(node, folderDir)
      return
    }

    if (!hasNestedContent) {
      copyImageFile(row, destinationDir, safeNodeName)
      return
    }

    const photoDir = ensureUniquePath(path.join(destinationDir, safeNodeName), '')
    fs.mkdirSync(photoDir, { recursive: true })
    copyImageFile(row, photoDir, '_photo')
    exportChildren(node, photoDir)
    exportVariants(node, photoDir)
  }

  if (tree.root) {
    exportChildren(tree.root, rootDir)
    exportVariants(tree.root, rootDir)
  }

  const archivePath = path.join(tempDir, `photomap-media-${projectId}-${Date.now()}.zip`)
  zipDirectory(workDir, archivePath)
  fs.rmSync(workDir, { recursive: true, force: true })
  return archivePath
}

function writeProjectManifest(project, rows, workDir) {
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
        id: row.id,
        parent_id: row.parent_id,
        variant_of_id: row.variant_of_id,
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
}

function restoreProjectFromArchive(projectId, archivePath) {
  const extractDir = makeTempDir(`restore-${projectId}`)

  try {
    unzipArchive(archivePath, extractDir)
    const manifestPath = path.join(extractDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      const error = new Error('Invalid project archive: manifest.json not found')
      error.status = 400
      throw error
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    const importedRows = Array.isArray(manifest.nodes) ? manifest.nodes : []
    const rootRow = importedRows.find((node) => (node.parent_id ?? node.parent_old_id) == null && (node.variant_of_id ?? node.variant_of_old_id) == null)
    if (!rootRow) {
      const error = new Error('Invalid project archive: root node missing')
      error.status = 400
      throw error
    }

    clearProjectContents(projectId)

    const now = new Date().toISOString()
    updateProjectMetaStmt.run({
      id: projectId,
      name: String(manifest.project?.name || 'Restored Project').trim() || 'Restored Project',
      description: String(manifest.project?.description || '').trim(),
      settings_json: JSON.stringify(normalizeProjectSettings(manifest.project?.settings)),
      updated_at: now,
    })

    const rootId = generateUniqueId((candidate) => Boolean(getNode.get(candidate)))
    insertNode.run({
      id: rootId,
      project_id: projectId,
      parent_id: null,
      variant_of_id: null,
      type: 'folder',
      name: rootRow.name || 'Root',
      notes: rootRow.notes || '',
      tags_json: JSON.stringify(Array.isArray(rootRow.tags) ? rootRow.tags : []),
      image_path: null,
      preview_path: null,
      original_filename: null,
      created_at: now,
      updated_at: now,
    })

    if (rootRow.collapsed) {
      updateNode({
        id: rootId,
        project_id: projectId,
        name: rootRow.name || 'Root',
        notes: rootRow.notes || '',
        tags: Array.isArray(rootRow.tags) ? rootRow.tags : [],
        collapsed: 1,
      })
    }

    const rootManifestId = String(rootRow.id ?? rootRow.old_id)
    const oldToNew = new Map([[rootManifestId, rootId]])
    const pendingRows = importedRows.filter((row) => String(row.id ?? row.old_id) !== rootManifestId)

    while (pendingRows.length > 0) {
      let importedCount = 0

      for (let index = pendingRows.length - 1; index >= 0; index -= 1) {
        const row = pendingRows[index]
        const rowId = String(row.id ?? row.old_id)
        const parentRef = row.parent_id ?? row.parent_old_id ?? null
        const variantRef = row.variant_of_id ?? row.variant_of_old_id ?? null
        const parentId = parentRef != null ? oldToNew.get(String(parentRef)) : null
        const variantOfId = variantRef != null ? oldToNew.get(String(variantRef)) : null
        if (
          (parentRef != null && !parentId) ||
          (variantRef != null && !variantOfId)
        ) {
          continue
        }

        const importedImagePath = row.image_file ? path.join(extractDir, row.image_file) : null
        const importedPreviewPath = row.preview_file ? path.join(extractDir, row.preview_file) : null
        const uniqueToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const relativeImagePath = importedImagePath
          ? path.join(String(projectId), `${uniqueToken}-${path.basename(importedImagePath)}`)
          : null
        const relativePreviewPath = importedPreviewPath
          ? path.join(String(projectId), `${uniqueToken}-${path.basename(importedPreviewPath)}`)
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
          variant_of_id: variantOfId,
          type: row.type === 'photo' ? 'photo' : 'folder',
          name: row.name || (row.type === 'photo' ? createUntitledName(projectId) : 'Restored Folder'),
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

        oldToNew.set(rowId, nodeId)
        pendingRows.splice(index, 1)
        importedCount += 1
      }

      if (importedCount === 0) {
        const error = new Error('Invalid project archive: unable to resolve parent links during restore')
        error.status = 400
        throw error
      }
    }

    updateProjectTimestamp.run(new Date().toISOString(), projectId)
    return buildTree(assertProject(projectId), getProjectNodes.all(projectId))
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
}

function restoreSubtreeFromPayload(projectId, manifest, uploadedFiles) {
  assertProject(projectId)

  const rows = Array.isArray(manifest?.nodes) ? manifest.nodes : []
  const manifestRootId = String(manifest.root_id)
  const rootRow = rows.find((row) => String(row.id ?? row.old_id) === manifestRootId)
  if (!rootRow) {
    const error = new Error('Invalid subtree payload: root node missing')
    error.status = 400
    throw error
  }

  const fileMap = new Map(uploadedFiles.map((file) => [file.fieldname, file]))
  const oldToNew = new Map()

  const pendingRows = [...rows]
  while (pendingRows.length > 0) {
    let importedCount = 0

    for (let index = pendingRows.length - 1; index >= 0; index -= 1) {
      const row = pendingRows[index]
      const rowId = String(row.id ?? row.old_id)
      const isRoot = rowId === manifestRootId
      const parentId = isRoot
        ? manifest.root_parent_id
        : row.parent_id != null || row.parent_old_id != null
          ? oldToNew.get(String(row.parent_id ?? row.parent_old_id))
          : null
      const variantOfId = isRoot
        ? manifest.root_variant_of_id
        : row.variant_of_id != null || row.variant_of_old_id != null
          ? oldToNew.get(String(row.variant_of_id ?? row.variant_of_old_id))
          : null

      if (!isRoot && (row.parent_id != null || row.parent_old_id != null) && !parentId) {
        continue
      }
      if (!isRoot && (row.variant_of_id != null || row.variant_of_old_id != null) && !variantOfId) {
        continue
      }

      const imageFile = row.image_file_key ? fileMap.get(row.image_file_key) : null
      const previewFile = row.preview_file_key ? fileMap.get(row.preview_file_key) : null
      const uniqueToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const safeImageName = imageFile ? sanitizeUploadName(imageFile.originalname, 'image.jpg') : null
      const safePreviewName = previewFile ? sanitizeUploadName(previewFile.originalname, 'preview.jpg') : null
      const relativeImagePath = imageFile
        ? path.join(String(projectId), `${uniqueToken}-${safeImageName}`)
        : null
      const relativePreviewPath = previewFile
        ? path.join(String(projectId), `${uniqueToken}-${safePreviewName}`)
        : null

      if (imageFile?.buffer) {
        const absoluteImagePath = path.join(uploadsDir, relativeImagePath)
        fs.mkdirSync(path.dirname(absoluteImagePath), { recursive: true })
        fs.writeFileSync(absoluteImagePath, imageFile.buffer)
      }
      if (previewFile?.buffer) {
        const absolutePreviewPath = path.join(uploadsDir, relativePreviewPath)
        fs.mkdirSync(path.dirname(absolutePreviewPath), { recursive: true })
        fs.writeFileSync(absolutePreviewPath, previewFile.buffer)
      }

      const nodeId = createNode({
        project_id: projectId,
        parent_id: parentId,
        variant_of_id: variantOfId,
        type: row.type === 'photo' ? 'photo' : 'folder',
        name: row.name || (row.type === 'photo' ? createUntitledName(projectId) : 'Restored Folder'),
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

      oldToNew.set(rowId, nodeId)
      pendingRows.splice(index, 1)
      importedCount += 1
    }

    if (importedCount === 0) {
      const error = new Error('Invalid subtree payload: unable to resolve hierarchy')
      error.status = 400
      throw error
    }
  }

  return serializeNode(assertNode(oldToNew.get(manifestRootId)))
}

function importProjectArchive(archivePath, projectNameOverride = '') {
  const extractDir = makeTempDir('import')
  let projectId = null

  try {
    unzipArchive(archivePath, extractDir)

    const manifestPath = path.join(extractDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) {
      const error = new Error('Invalid project archive: manifest.json not found')
      error.status = 400
      throw error
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    projectId = createProjectWithRoot({
      name:
        String(projectNameOverride || manifest.project?.name || 'Imported Project').trim() ||
        'Imported Project',
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
    const rootRow = importedRows.find((node) => (node.parent_id ?? node.parent_old_id) == null)

    if (!createdRoot || !rootRow) {
      const error = new Error('Invalid project archive: root node missing')
      error.status = 400
      throw error
    }

    updateNode({
      id: createdRoot.id,
      project_id: projectId,
      name: rootRow.name || createdRoot.name,
      notes: rootRow.notes || '',
      tags: Array.isArray(rootRow.tags) ? rootRow.tags : [],
      collapsed: rootRow.collapsed ? 1 : 0,
    })
    const rootManifestId = String(rootRow.id ?? rootRow.old_id)
    oldToNew.set(rootManifestId, createdRoot.id)

    const projectUploadDir = path.join(uploadsDir, String(projectId))
    fs.mkdirSync(projectUploadDir, { recursive: true })

    const pendingRows = importedRows.filter((row) => String(row.id ?? row.old_id) !== rootManifestId)
    while (pendingRows.length > 0) {
      let importedCount = 0

      for (let index = pendingRows.length - 1; index >= 0; index -= 1) {
        const row = pendingRows[index]
        const parentId =
          row.parent_id != null || row.parent_old_id != null
            ? oldToNew.get(String(row.parent_id ?? row.parent_old_id))
            : null
        const variantOfId =
          row.variant_of_id != null || row.variant_of_old_id != null ? oldToNew.get(String(row.variant_of_id ?? row.variant_of_old_id)) : null
        if (
          ((row.parent_id != null || row.parent_old_id != null) && !parentId) ||
          ((row.variant_of_id != null || row.variant_of_old_id != null) && !variantOfId)
        ) {
          continue
        }

        const importedImagePath = row.image_file ? path.join(extractDir, row.image_file) : null
        const importedPreviewPath = row.preview_file ? path.join(extractDir, row.preview_file) : null
        const uniqueToken = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const relativeImagePath = importedImagePath
          ? path.join(String(projectId), `${uniqueToken}-${path.basename(importedImagePath)}`)
          : null
        const relativePreviewPath = importedPreviewPath
          ? path.join(String(projectId), `${uniqueToken}-${path.basename(importedPreviewPath)}`)
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
          variant_of_id: variantOfId,
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

        oldToNew.set(String(row.id ?? row.old_id), nodeId)
        pendingRows.splice(index, 1)
        importedCount += 1
      }

      if (importedCount === 0) {
        const unresolvedParents = pendingRows.slice(0, 5).map((row) => ({
          node: row.name || row.id || row.old_id,
          missingParentId: row.parent_id ?? row.parent_old_id,
        }))
        const error = new Error(
          `Invalid project archive: unable to resolve parent links for ${pendingRows.length} node(s)`,
        )
        error.status = 400
        error.details = unresolvedParents
        throw error
      }
    }

    return buildTree(assertProject(projectId), getProjectNodes.all(projectId))
  } catch (error) {
    if (projectId != null) {
      try {
        deleteProjectRecursive(projectId)
      } catch {
        // Ignore cleanup failures and surface the original import error.
      }
    }
    throw error
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
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

function cleanupDesktopSessions() {
  const cutoff = Date.now() - CLIENT_TTL_MS
  for (const [sessionId, session] of activeDesktopSessions) {
    if (session.updatedAt < cutoff) {
      activeDesktopSessions.delete(sessionId)
    }
  }
}

function listProjectSessions(projectId) {
  cleanupDesktopSessions()
  return Array.from(activeDesktopSessions.values()).filter((session) => session.projectId === projectId)
}

function cleanupMobileConnections() {
  const cutoff = Date.now() - MOBILE_CONNECTION_TTL_MS
  for (const [sessionId, connections] of activeMobileConnections) {
    for (const [connectionId, connection] of connections) {
      if (connection.updatedAt < cutoff) {
        connections.delete(connectionId)
      }
    }
    if (connections.size === 0) {
      activeMobileConnections.delete(sessionId)
    }
  }
}

function getMobileConnectionCount(sessionId) {
  cleanupMobileConnections()
  return activeMobileConnections.get(sessionId)?.size || 0
}

function getDesktopSession(sessionId) {
  cleanupDesktopSessions()
  return activeDesktopSessions.get(sessionId) || null
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
    const project = assertProject(req.params.id)
    const projectId = project.id
    const tree = buildTree(project, getProjectNodes.all(projectId))
    res.json(tree)
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects/:id/clients', (req, res, next) => {
  try {
    const project = assertProject(req.params.id)
    const projectId = project.id

    const clients = listProjectSessions(projectId).sort((a, b) => a.id.localeCompare(b.id))
    res.json(
      clients.map((client) => ({
        id: client.id,
        name: `Session ${client.id}`,
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
    const project = assertProject(req.params.id)
    const projectId = project.id

    const clientId = String(req.params.clientId || '').trim()
    const name = String(req.body.name || '').trim()
    const selectedNodeId = String(req.body.selectedNodeId || '').trim()
    const selectedNode = assertNode(selectedNodeId)
    ensureNodeBelongsToProject(selectedNode, projectId)

    activeDesktopSessions.set(clientId, {
      id: clientId,
      name: name || `Session ${clientId}`,
      projectId,
      projectName: project.name,
      selectedNodeId,
      selectedNodeName: selectedNode.name,
      updatedAt: Date.now(),
    })

    cleanupDesktopSessions()
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/sessions/:sessionId', (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim().toLowerCase()
    const session = getDesktopSession(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session is not active' })
    }

    res.json({
      id: session.id,
      projectId: session.projectId,
      projectName: session.projectName,
      selectedNodeId: session.selectedNodeId,
      selectedNodeName: session.selectedNodeName,
      connectionCount: getMobileConnectionCount(session.id),
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/sessions/:sessionId', (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim().toLowerCase()
    const project = assertProject(req.body.projectId)
    const projectId = project.id
    const selectedNodeId = String(req.body.selectedNodeId || '').trim()
    const selectedNode = assertNode(selectedNodeId)
    ensureNodeBelongsToProject(selectedNode, projectId)

    activeDesktopSessions.set(sessionId, {
      id: sessionId,
      name: `Session ${sessionId}`,
      projectId,
      projectName: project.name,
      selectedNodeId,
      selectedNodeName: selectedNode.name,
      updatedAt: Date.now(),
    })

    cleanupDesktopSessions()
    res.json({
      ok: true,
      id: sessionId,
      projectId,
      projectName: project.name,
      selectedNodeId,
      selectedNodeName: selectedNode.name,
      connectionCount: getMobileConnectionCount(sessionId),
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/sessions/:sessionId/connections/:connectionId', (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim().toLowerCase()
    const connectionId = String(req.params.connectionId || '').trim().toLowerCase()
    const session = getDesktopSession(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session is not active' })
    }

    let connections = activeMobileConnections.get(sessionId)
    if (!connections) {
      connections = new Map()
      activeMobileConnections.set(sessionId, connections)
    }
    connections.set(connectionId, {
      id: connectionId,
      updatedAt: Date.now(),
    })

    res.json({
      ok: true,
      connectionCount: getMobileConnectionCount(sessionId),
    })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/sessions/:sessionId/connections/:connectionId', (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim().toLowerCase()
    const connectionId = String(req.params.connectionId || '').trim().toLowerCase()
    const connections = activeMobileConnections.get(sessionId)
    if (connections) {
      connections.delete(connectionId)
      if (connections.size === 0) {
        activeMobileConnections.delete(sessionId)
      }
    }
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

app.post('/api/sessions/:sessionId/connections/:connectionId/release', (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim().toLowerCase()
    const connectionId = String(req.params.connectionId || '').trim().toLowerCase()
    const connections = activeMobileConnections.get(sessionId)
    if (connections) {
      connections.delete(connectionId)
      if (connections.size === 0) {
        activeMobileConnections.delete(sessionId)
      }
    }
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects/:id/events', (req, res, next) => {
  try {
    const project = assertProject(req.params.id)
    const projectId = project.id

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
    const project = assertProject(req.params.id)
    const projectId = project.id
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

app.post('/api/projects/:id/collapse-all', (req, res, next) => {
  try {
    const project = assertProject(req.params.id)
    const projectId = project.id
    const collapsed = Boolean(req.body?.collapsed)
    const updatedIds = setProjectCollapsedState({ projectId, collapsed: collapsed ? 1 : 0 })
    broadcastProjectEvent(projectId)
    res.json({ updatedIds, collapsed })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/projects/:id', (req, res, next) => {
  try {
    const project = assertProject(req.params.id)
    const projectId = project.id
    broadcastProjectEvent(projectId, { type: 'project-deleted' })
    for (const [sessionId, session] of activeDesktopSessions) {
      if (session.projectId === projectId) {
        activeDesktopSessions.delete(sessionId)
        activeMobileConnections.delete(sessionId)
      }
    }
    deleteProjectRecursive(projectId)
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects/:id/export', (req, res, next) => {
  let archivePath = null

  try {
    const project = assertProject(req.params.id)
    const projectId = project.id
    archivePath = exportProjectArchive(projectId)
    const safeName = project.name.replace(/[^a-zA-Z0-9._-]/g, '_') || `project-${projectId}`
    res.download(archivePath, `${safeName}.zip`, (downloadError) => {
      if (archivePath && fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath)
      }
      if (downloadError && downloadError.code !== 'ECONNABORTED') {
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

app.get('/api/projects/:id/export-media', (req, res, next) => {
  let archivePath = null

  try {
    const project = assertProject(req.params.id)
    const projectId = project.id
    archivePath = exportProjectMediaArchive(projectId)
    const safeName = project.name.replace(/[^a-zA-Z0-9._-]/g, '_') || `project-${projectId}`
    res.download(archivePath, `${safeName}-media.zip`, (downloadError) => {
      if (archivePath && fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath)
      }
      if (downloadError && downloadError.code !== 'ECONNABORTED') {
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

app.get('/api/projects/:id/snapshot', (req, res, next) => {
  let archivePath = null

  try {
    const project = assertProject(req.params.id)
    const projectId = project.id
    archivePath = exportProjectArchive(projectId)
    res.type('application/zip')
    res.sendFile(archivePath, (sendError) => {
      if (archivePath && fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath)
      }
      if (sendError && sendError.code !== 'ECONNABORTED') {
        next(sendError)
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

    const archivePath = `${req.file.path}${path.extname(req.file.originalname || '') || '.zip'}`
    fs.renameSync(req.file.path, archivePath)
    const importedTree = importProjectArchive(archivePath, String(req.body.projectName || '').trim())
    fs.unlinkSync(archivePath)
    res.status(201).json(importedTree)
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    const archivePath = req.file?.path
      ? `${req.file.path}${path.extname(req.file.originalname || '') || '.zip'}`
      : null
    if (archivePath && fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath)
    }
    next(error)
  }
})

app.post('/api/projects/:id/restore', importUpload.single('archive'), (req, res, next) => {
  try {
    const project = assertProject(req.params.id)
    const projectId = project.id

    if (!req.file) {
      return res.status(400).json({ error: 'Project archive is required' })
    }

    const archivePath = `${req.file.path}${path.extname(req.file.originalname || '') || '.zip'}`
    fs.renameSync(req.file.path, archivePath)
    const restoredTree = restoreProjectFromArchive(projectId, archivePath)
    fs.unlinkSync(archivePath)
    broadcastProjectEvent(projectId)
    res.json(restoredTree)
  } catch (error) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    const archivePath = req.file?.path
      ? `${req.file.path}${path.extname(req.file.originalname || '') || '.zip'}`
      : null
    if (archivePath && fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath)
    }
    next(error)
  }
})

app.post('/api/projects/:id/folders', (req, res, next) => {
  try {
    const project = assertProject(req.params.id)
    const projectId = project.id

    const clientId = String(req.body.clientId || '').trim()
    let parentId = String(req.body.parentId || '').trim() || null
    if (!parentId && clientId) {
      const controllingClient = getDesktopSession(clientId)
      if (!controllingClient) {
        return res.status(400).json({ error: 'Selected client is not active' })
      }
      if (controllingClient.projectId !== projectId) {
        return res.status(400).json({ error: 'Selected client is controlling a different project' })
      }
      parentId = controllingClient.selectedNodeId
    }

    const parentNode = assertNode(parentId)
    ensureNodeBelongsToProject(parentNode, projectId)
    ensureCanHaveChildren(parentNode)

    const name = String(req.body.name || '').trim()
    if (!name) {
      return res.status(400).json({ error: 'Folder name is required' })
    }

    const nodeId = createNode({
      project_id: projectId,
      parent_id: parentNode.id,
      variant_of_id: null,
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
    const project = assertProject(req.params.id)
    const projectId = project.id

    const clientId = String(req.body.clientId || '').trim()
    const variantRequested = String(req.body.variant || '').trim() === 'true'
    let parentId = String(req.body.parentId || '').trim() || null
    let variantOfId = req.body.variantOfId != null ? String(req.body.variantOfId).trim() : null
    if (!parentId && clientId) {
      const controllingClient = getDesktopSession(clientId)
      if (!controllingClient) {
        return res.status(400).json({ error: 'Selected client is not active' })
      }
      if (controllingClient.projectId !== projectId) {
        return res.status(400).json({ error: 'Selected client is controlling a different project' })
      }
      if (variantRequested) {
        variantOfId = controllingClient.selectedNodeId
      } else {
        parentId = controllingClient.selectedNodeId
      }
    }

    if (variantRequested || variantOfId) {
      const rawAnchorNode = assertNode(variantOfId)
      ensureNodeBelongsToProject(rawAnchorNode, projectId)
      const anchorNode = resolveVariantAnchor(rawAnchorNode)
      parentId = anchorNode.parent_id
      variantOfId = anchorNode.id
    }

    const parentNode = parentId != null ? assertNode(parentId) : null
    if (parentNode) {
      ensureNodeBelongsToProject(parentNode, projectId)
      if (!variantOfId) {
        ensureCanHaveChildren(parentNode)
      }
    }

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
      parent_id: parentNode?.id ?? null,
      variant_of_id: variantOfId,
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

app.post('/api/sessions/:sessionId/photos', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'preview', maxCount: 1 }]), (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim().toLowerCase()
    const session = getDesktopSession(sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session is not active' })
    }

    const project = assertProject(session.projectId)
    const projectId = project.id
    const variantRequested = String(req.body.variant || '').trim() === 'true'
    let parentId = session.selectedNodeId
    let variantOfId = null

    if (variantRequested) {
      const rawAnchorNode = assertNode(session.selectedNodeId)
      ensureNodeBelongsToProject(rawAnchorNode, projectId)
      const anchorNode = resolveVariantAnchor(rawAnchorNode)
      parentId = anchorNode.parent_id
      variantOfId = anchorNode.id
    }

    const parentNode = parentId != null ? assertNode(parentId) : null
    if (parentNode) {
      ensureNodeBelongsToProject(parentNode, projectId)
      if (!variantOfId) {
        ensureCanHaveChildren(parentNode)
      }
    }

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
      parent_id: parentNode?.id ?? null,
      variant_of_id: variantOfId,
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

app.post('/api/projects/:id/subtree-restore', restoreUpload.any(), (req, res, next) => {
  try {
    const project = assertProject(req.params.id)
    const projectId = project.id
    const manifest = JSON.parse(String(req.body.manifest || '{}'))
    const restoredRoot = restoreSubtreeFromPayload(projectId, manifest, req.files || [])
    broadcastProjectEvent(projectId)
    res.status(201).json(restoredRoot)
  } catch (error) {
    next(error)
  }
})

app.patch('/api/nodes/:id', (req, res, next) => {
  try {
    const node = assertNode(req.params.id)

    updateNode({
      id: node.id,
      project_id: node.project_id,
      name: String(req.body.name || '').trim() || node.name,
      notes: String(req.body.notes || '').trim(),
      tags: parseTags(req.body.tags),
      collapsed: typeof req.body.collapsed === 'boolean' ? (req.body.collapsed ? 1 : 0) : null,
    })

    broadcastProjectEvent(node.project_id)
    res.json(serializeNode(assertNode(node.id)))
  } catch (error) {
    next(error)
  }
})

app.post('/api/nodes/:id/collapse', (req, res, next) => {
  try {
    const node = assertNode(req.params.id)
    const collapsed = req.body.collapsed ? 1 : 0
    const updatedIds = setNodeCollapsedStateRecursive({
      nodeId: node.id,
      projectId: node.project_id,
      collapsed,
    })

    broadcastProjectEvent(node.project_id)
    res.json({ node: serializeNode(assertNode(node.id)), updatedIds })
  } catch (error) {
    next(error)
  }
})

app.post('/api/nodes/:id/move', (req, res, next) => {
  try {
    const node = assertNode(req.params.id)
    ensureNotRoot(node)
    const variantOfId = req.body.variantOfId != null ? String(req.body.variantOfId).trim() : null
    let parentId = req.body.parentId != null ? String(req.body.parentId).trim() : null

    if (variantOfId) {
      ensureNoChildren(node)
      const requestedAnchor = assertNode(variantOfId)
      ensureNodeBelongsToProject(requestedAnchor, node.project_id)
      const anchorNode = resolveVariantAnchor(requestedAnchor)
      if (anchorNode.id === node.id) {
        return res.status(400).json({ error: 'A node cannot be a variant of itself' })
      }
      parentId = anchorNode.parent_id
      moveNode({
        id: node.id,
        project_id: node.project_id,
        parent_id: parentId,
        variant_of_id: anchorNode.id,
      })
    } else {
      if (!parentId) {
        return res.status(400).json({ error: 'Parent node is required' })
      }
      const targetParent = assertNode(parentId)
      ensureNodeBelongsToProject(targetParent, node.project_id)
      ensureCanHaveChildren(targetParent)
      ensureNoCycle(node.id, targetParent.id)

      moveNode({
        id: node.id,
        project_id: node.project_id,
        parent_id: targetParent.id,
        variant_of_id: null,
      })
    }

    broadcastProjectEvent(node.project_id)
    res.json(serializeNode(assertNode(node.id)))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/nodes/:id', (req, res, next) => {
  try {
    const node = assertNode(req.params.id)
    ensureNotRoot(node)
    deleteNodeRecursive(node.id, node.project_id)
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
  const requestedStatus = Number(error.status)
  const status = requestedStatus >= 100 && requestedStatus < 1000 ? requestedStatus : 500
  if (status >= 500) {
    console.error(error)
  }
  res.status(status).json({ error: error.message || 'Unexpected server error' })
})

app.listen(port, host, () => {
  console.log(`PhotoMap server listening on http://${host}:${port}`)
})
