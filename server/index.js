import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
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
const dbPath = path.join(dataDir, 'database.db')
const distDir = path.join(baseDir, 'dist')
const projectEventClients = new Map()
const activeDesktopSessions = new Map()
const activeMobileConnections = new Map()
const CLIENT_TTL_MS = 45000
const MOBILE_CONNECTION_TTL_MS = 30000
const AUTH_COOKIE = 'session'

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
  layoutMode: 'compact',
}

const defaultUserProjectUi = {
  theme: 'dark',
  showGrid: true,
  leftSidebarOpen: false,
  rightSidebarOpen: true,
  leftSidebarWidth: 340,
  rightSidebarWidth: 320,
  leftActivePanel: 'preview',
  rightActivePanel: 'inspector',
  panelDock: {
    preview: 'left',
    camera: 'left',
    inspector: 'right',
    settings: 'right',
    account: 'right',
  },
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

function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':')
  if (!salt || !hash) {
    return false
  }

  const candidate = crypto.scryptSync(password, salt, 64)
  const actual = Buffer.from(hash, 'hex')
  return actual.length === candidate.length && crypto.timingSafeEqual(actual, candidate)
}

function parseCookies(headerValue) {
  const cookies = {}
  for (const pair of String(headerValue || '').split(';')) {
    const [rawKey, ...rest] = pair.split('=')
    const key = rawKey?.trim()
    if (!key) {
      continue
    }
    cookies[key] = decodeURIComponent(rest.join('=').trim())
  }
  return cookies
}

function setAuthCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
  )
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`)
}

function normalizeUsername(usernameInput) {
  const username = String(usernameInput || '')
    .trim()
    .toLowerCase()
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    const error = new Error('Username must be 3-32 characters using letters, numbers, dot, underscore, or dash')
    error.status = 400
    throw error
  }
  return username
}

function normalizePassword(passwordInput) {
  const password = String(passwordInput || '')
  if (password.length < 8) {
    const error = new Error('Password must be at least 8 characters')
    error.status = 400
    throw error
  }
  return password
}

function getProjectUploadDir(projectId) {
  return path.join(uploadsDir, String(projectId))
}

function rewriteUploadPathProjectFolder(filePath, projectId) {
  if (!filePath) {
    return filePath
  }

  const segments = String(filePath)
    .split(/[\\/]+/)
    .filter(Boolean)
  if (segments.length === 0) {
    return filePath
  }

  segments[0] = String(projectId)
  return path.join(...segments)
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
        id, project_id, parent_id, variant_of_id, type, name, notes, tags_json,
        image_path, preview_path, original_filename, created_at, updated_at
      ) VALUES (
        @id, @project_id, @parent_id, @variant_of_id, @type, @name, @notes, @tags_json,
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
        image_path: row.image_path ? rewriteUploadPathProjectFolder(row.image_path, projectIdMap.get(row.project_id)) : null,
        preview_path: row.preview_path ? rewriteUploadPathProjectFolder(row.preview_path, projectIdMap.get(row.project_id)) : null,
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

function ensureCollapseSchemaCleanup() {
  const nodeColumns = db.prepare(`PRAGMA table_info(nodes)`).all()
  if (!nodeColumns.some((column) => column.name === 'collapsed')) {
    return
  }

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE nodes_clean (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        parent_id TEXT,
        variant_of_id TEXT,
        type TEXT NOT NULL CHECK(type IN ('folder', 'photo')),
        name TEXT NOT NULL,
        notes TEXT DEFAULT '',
        tags_json TEXT DEFAULT '[]',
        image_path TEXT,
        preview_path TEXT,
        original_filename TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(parent_id) REFERENCES nodes_clean(id),
        FOREIGN KEY(variant_of_id) REFERENCES nodes_clean(id)
      );

      INSERT INTO nodes_clean (
        id, project_id, parent_id, variant_of_id, type, name, notes, tags_json,
        image_path, preview_path, original_filename, created_at, updated_at
      )
      SELECT
        id, project_id, parent_id, variant_of_id, type, name, notes, tags_json,
        image_path, preview_path, original_filename, created_at, updated_at
      FROM nodes;

      DROP TABLE nodes;
      ALTER TABLE nodes_clean RENAME TO nodes;
    `)
  })

  db.exec(`PRAGMA foreign_keys = OFF`)
  try {
    migrate()
  } finally {
    db.exec(`PRAGMA foreign_keys = ON`)
  }
}

ensureCollapseSchemaCleanup()

function ensureAuthSchema() {
  const projectColumns = db.prepare(`PRAGMA table_info(projects)`).all()
  if (!projectColumns.some((column) => column.name === 'owner_user_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN owner_user_id TEXT`)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      capture_session_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS project_collaborators (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      added_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(added_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_project_preferences (
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      settings_json TEXT DEFAULT '{}',
      ui_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, project_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS user_node_collapse_preferences (
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      node_id TEXT NOT NULL,
      collapsed INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (user_id, node_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(node_id) REFERENCES nodes(id)
    );
  `)
}

ensureAuthSchema()

const insertProject = db.prepare(`
  INSERT INTO projects (id, name, description, settings_json, owner_user_id, created_at, updated_at)
  VALUES (@id, @name, @description, @settings_json, @owner_user_id, @created_at, @updated_at)
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
const countUsers = db.prepare(`SELECT COUNT(*) AS count FROM users`)
const getUserById = db.prepare(`SELECT * FROM users WHERE id = ?`)
const getUserByUsername = db.prepare(`SELECT * FROM users WHERE username = ?`)
const updateUsernameStmt = db.prepare(`
  UPDATE users
  SET username = @username,
      updated_at = @updated_at
  WHERE id = @id
`)
const updatePasswordStmt = db.prepare(`
  UPDATE users
  SET password_hash = @password_hash,
      updated_at = @updated_at
  WHERE id = @id
`)
const insertUser = db.prepare(`
  INSERT INTO users (id, username, password_hash, created_at, updated_at)
  VALUES (@id, @username, @password_hash, @created_at, @updated_at)
`)
const getSessionById = db.prepare(`
  SELECT s.*, u.username
  FROM user_sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.id = ?
`)
const getSessionByCaptureId = db.prepare(`
  SELECT s.*, u.username
  FROM user_sessions s
  JOIN users u ON u.id = s.user_id
  WHERE s.capture_session_id = ?
`)
const insertSession = db.prepare(`
  INSERT INTO user_sessions (id, user_id, capture_session_id, created_at, updated_at)
  VALUES (@id, @user_id, @capture_session_id, @created_at, @updated_at)
`)
const updateSessionTimestampStmt = db.prepare(`
  UPDATE user_sessions
  SET updated_at = @updated_at
  WHERE id = @id
`)
const deleteSessionStmt = db.prepare(`DELETE FROM user_sessions WHERE id = ?`)
const listSessionsByUserStmt = db.prepare(`SELECT * FROM user_sessions WHERE user_id = ?`)
const deleteSessionsByUserStmt = db.prepare(`DELETE FROM user_sessions WHERE user_id = ?`)
const countOwnedProjectsByUserStmt = db.prepare(`SELECT COUNT(*) AS count FROM projects WHERE owner_user_id = ?`)
const deletePreferencesByUserStmt = db.prepare(`DELETE FROM user_project_preferences WHERE user_id = ?`)
const deleteCollaboratorsByUserStmt = db.prepare(`
  DELETE FROM project_collaborators
  WHERE user_id = ?
     OR added_by_user_id = ?
`)
const deleteUserStmt = db.prepare(`DELETE FROM users WHERE id = ?`)
const claimOwnerlessProjectsStmt = db.prepare(`
  UPDATE projects
  SET owner_user_id = @owner_user_id
  WHERE owner_user_id IS NULL
`)
const listAccessibleProjects = db.prepare(`
  SELECT
    p.*,
    owner.username AS owner_username,
    COUNT(n.id) AS node_count,
    CASE WHEN p.owner_user_id = @user_id THEN 1 ELSE 0 END AS is_owner
  FROM projects p
  LEFT JOIN nodes n ON n.project_id = p.id
  LEFT JOIN users owner ON owner.id = p.owner_user_id
  WHERE p.owner_user_id = @user_id
     OR EXISTS (
       SELECT 1
       FROM project_collaborators pc
       WHERE pc.project_id = p.id
         AND pc.user_id = @user_id
     )
  GROUP BY p.id
  ORDER BY p.updated_at DESC, p.id DESC
`)
const getAccessibleProjectRow = db.prepare(`
  SELECT
    p.*,
    owner.username AS owner_username,
    CASE WHEN p.owner_user_id = @user_id THEN 1 ELSE 0 END AS is_owner
  FROM projects p
  LEFT JOIN users owner ON owner.id = p.owner_user_id
  WHERE p.id = @project_id
    AND (
      p.owner_user_id = @user_id
      OR EXISTS (
        SELECT 1
        FROM project_collaborators pc
        WHERE pc.project_id = p.id
          AND pc.user_id = @user_id
      )
    )
`)
const listProjectCollaborators = db.prepare(`
  SELECT u.id, u.username
  FROM project_collaborators pc
  JOIN users u ON u.id = pc.user_id
  WHERE pc.project_id = ?
  ORDER BY u.username COLLATE NOCASE ASC
`)
const getProjectCollaborator = db.prepare(`
  SELECT *
  FROM project_collaborators
  WHERE project_id = ?
    AND user_id = ?
`)
const insertProjectCollaborator = db.prepare(`
  INSERT INTO project_collaborators (project_id, user_id, added_by_user_id, created_at)
  VALUES (@project_id, @user_id, @added_by_user_id, @created_at)
`)
const deleteProjectCollaboratorStmt = db.prepare(`
  DELETE FROM project_collaborators
  WHERE project_id = ?
    AND user_id = ?
`)
const deleteProjectCollaboratorsStmt = db.prepare(`DELETE FROM project_collaborators WHERE project_id = ?`)
const getUserProjectPreference = db.prepare(`
  SELECT *
  FROM user_project_preferences
  WHERE user_id = ?
    AND project_id = ?
`)
const upsertUserProjectPreference = db.prepare(`
  INSERT INTO user_project_preferences (user_id, project_id, settings_json, ui_json, created_at, updated_at)
  VALUES (@user_id, @project_id, @settings_json, @ui_json, @created_at, @updated_at)
  ON CONFLICT(user_id, project_id) DO UPDATE SET
    settings_json = excluded.settings_json,
    ui_json = excluded.ui_json,
    updated_at = excluded.updated_at
`)
const listUserNodeCollapsePrefsByProject = db.prepare(`
  SELECT node_id, collapsed
  FROM user_node_collapse_preferences
  WHERE user_id = ?
    AND project_id = ?
`)
const getUserNodeCollapsePreference = db.prepare(`
  SELECT collapsed
  FROM user_node_collapse_preferences
  WHERE user_id = ?
    AND node_id = ?
`)
const upsertUserNodeCollapsePreference = db.prepare(`
  INSERT INTO user_node_collapse_preferences (user_id, project_id, node_id, collapsed, created_at, updated_at)
  VALUES (@user_id, @project_id, @node_id, @collapsed, @created_at, @updated_at)
  ON CONFLICT(user_id, node_id) DO UPDATE SET
    collapsed = excluded.collapsed,
    updated_at = excluded.updated_at
`)
const deleteNodeCollapsePrefsByNodeStmt = db.prepare(`
  DELETE FROM user_node_collapse_preferences
  WHERE node_id = ?
`)
const deleteNodeCollapsePrefsByProjectStmt = db.prepare(`
  DELETE FROM user_node_collapse_preferences
  WHERE project_id = ?
`)
const deleteNodeCollapsePrefsByUserStmt = db.prepare(`
  DELETE FROM user_node_collapse_preferences
  WHERE user_id = ?
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
const hasChildNodeStmt = db.prepare(`
  SELECT 1
  FROM nodes
  WHERE parent_id = ?
  LIMIT 1
`)
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
const getProjectRootNodeStmt = db.prepare(`
  SELECT *
  FROM nodes
  WHERE project_id = ?
    AND parent_id IS NULL
  ORDER BY created_at ASC, id ASC
  LIMIT 1
`)
const updateNodeStmt = db.prepare(`
  UPDATE nodes
  SET name = @name,
      notes = @notes,
      tags_json = @tags_json,
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
const deleteNodeStmt = db.prepare(`DELETE FROM nodes WHERE id = ?`)

const createProjectWithRoot = db.transaction(({ name, description, owner_user_id }) => {
  const now = new Date().toISOString()
  const projectId = generateUniqueId((candidate) => Boolean(getProject.get(candidate)))
  insertProject.run({
    id: projectId,
    name,
    description,
    settings_json: JSON.stringify(defaultProjectSettings),
    owner_user_id: owner_user_id || null,
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

const renameProjectAndRoot = db.transaction(({ id, name }) => {
  const now = new Date().toISOString()
  const project = assertProject(id)
  const rootNode = getProjectRootNodeStmt.get(id)

  updateProjectMetaStmt.run({
    id,
    name,
    description: project.description || '',
    settings_json: project.settings_json || JSON.stringify(defaultProjectSettings),
    updated_at: now,
  })

  if (rootNode) {
    updateNodeStmt.run({
      id: rootNode.id,
      name,
      notes: rootNode.notes || '',
      tags_json: rootNode.tags_json || '[]',
      updated_at: now,
    })
  }
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

const updateNode = db.transaction(({ id, project_id, name, notes, tags }) => {
  const now = new Date().toISOString()
  updateNodeStmt.run({
    id,
    name,
    notes,
    tags_json: JSON.stringify(tags),
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

const setProjectCollapsedState = db.transaction(({ userId, projectId, collapsed }) => {
  const now = new Date().toISOString()
  const nodeIds = listCollapsibleNodeIdsByProject.all(projectId).map((row) => row.id)
  for (const nodeId of nodeIds) {
    upsertUserNodeCollapsePreference.run({
      user_id: userId,
      project_id: projectId,
      node_id: nodeId,
      collapsed,
      created_at: now,
      updated_at: now,
    })
  }
  return nodeIds
})

const setNodeCollapsedStateRecursive = db.transaction(({ userId, nodeId, projectId, collapsed }) => {
  const now = new Date().toISOString()
  const stack = [nodeId]
  const updatedIds = []

  while (stack.length > 0) {
    const currentId = stack.pop()
    updatedIds.push(currentId)
    upsertUserNodeCollapsePreference.run({
      user_id: userId,
      project_id: projectId,
      node_id: currentId,
      collapsed,
      created_at: now,
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

    deleteNodeCollapsePrefsByNodeStmt.run(current.id)
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
  deleteNodeCollapsePrefsByProjectStmt.run(projectId)
  deleteProjectCollaboratorsStmt.run(projectId)
  deleteProjectStmt.run(projectId)

  const projectUploadDir = getProjectUploadDir(projectId)
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
  deleteNodeCollapsePrefsByProjectStmt.run(projectId)

  const projectUploadDir = getProjectUploadDir(projectId)
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

function createUntitledName() {
  return 'Node'
}

function normalizeUserProjectUi(uiInput) {
  const ui = {
    ...defaultUserProjectUi,
    ...(uiInput || {}),
  }

  ui.theme = ui.theme === 'light' ? 'light' : 'dark'
  ui.showGrid = ui.showGrid !== false
  const panelDock = {
    ...defaultUserProjectUi.panelDock,
    ...(ui.panelDock || {}),
  }
  for (const panelId of Object.keys(defaultUserProjectUi.panelDock)) {
    panelDock[panelId] = panelDock[panelId] === 'right' ? 'right' : 'left'
  }
  ui.panelDock = panelDock

  if ('previewOpen' in ui || 'cameraOpen' in ui || 'inspectorOpen' in ui || 'settingsOpen' in ui || 'accountOpen' in ui) {
    const oldLeftPanels = ['camera', 'preview'].filter((panelId) => Boolean(ui[`${panelId}Open`]))
    const oldRightPanels = ['account', 'settings', 'inspector'].filter((panelId) => Boolean(ui[`${panelId}Open`]))
    ui.leftSidebarOpen = oldLeftPanels.length > 0
    ui.rightSidebarOpen = oldRightPanels.length > 0
    ui.leftActivePanel = oldLeftPanels[0] || defaultUserProjectUi.leftActivePanel
    ui.rightActivePanel = oldRightPanels[0] || defaultUserProjectUi.rightActivePanel
    ui.leftSidebarWidth = Math.max(
      220,
      Math.min(
        720,
        Number(ui.previewWidth || ui.cameraWidth || ui.leftSidebarWidth) || defaultUserProjectUi.leftSidebarWidth,
      ),
    )
    ui.rightSidebarWidth = Math.max(
      220,
      Math.min(
        720,
        Number(ui.inspectorWidth || ui.settingsWidth || ui.accountWidth || ui.rightSidebarWidth) ||
          defaultUserProjectUi.rightSidebarWidth,
      ),
    )
  }

  ui.leftSidebarOpen = Boolean(ui.leftSidebarOpen)
  ui.rightSidebarOpen = Boolean(ui.rightSidebarOpen)
  ui.leftSidebarWidth = Math.max(220, Math.min(720, Number(ui.leftSidebarWidth) || defaultUserProjectUi.leftSidebarWidth))
  ui.rightSidebarWidth = Math.max(
    220,
    Math.min(720, Number(ui.rightSidebarWidth) || defaultUserProjectUi.rightSidebarWidth),
  )

  const leftPanels = Object.keys(panelDock).filter((panelId) => panelDock[panelId] === 'left')
  const rightPanels = Object.keys(panelDock).filter((panelId) => panelDock[panelId] === 'right')
  ui.leftActivePanel = leftPanels.includes(ui.leftActivePanel) ? ui.leftActivePanel : leftPanels[0] || null
  ui.rightActivePanel = rightPanels.includes(ui.rightActivePanel) ? ui.rightActivePanel : rightPanels[0] || null

  return ui
}

function normalizeProjectSettings(settingsInput) {
  const settings = {
    ...defaultProjectSettings,
    ...(settingsInput || {}),
  }

  settings.orientation = settings.orientation === 'vertical' ? 'vertical' : 'horizontal'
  settings.imageMode = settings.imageMode === 'square' ? 'square' : 'original'
  settings.layoutMode = settings.layoutMode === 'classic' ? 'classic' : 'compact'
  settings.horizontalGap = Math.max(24, Math.min(220, Number(settings.horizontalGap) || defaultProjectSettings.horizontalGap))
  settings.verticalGap = Math.max(16, Math.min(180, Number(settings.verticalGap) || defaultProjectSettings.verticalGap))

  return settings
}

function getOrCreateProjectPreferences(project, userId) {
  const existing = getUserProjectPreference.get(userId, project.id)
  if (existing) {
    return {
      settings: normalizeProjectSettings(JSON.parse(existing.settings_json || '{}')),
      ui: normalizeUserProjectUi(JSON.parse(existing.ui_json || '{}')),
    }
  }

  const now = new Date().toISOString()
  const preferences = {
    settings: normalizeProjectSettings(JSON.parse(project.settings_json || '{}')),
    ui: normalizeUserProjectUi({}),
  }
  upsertUserProjectPreference.run({
    user_id: userId,
    project_id: project.id,
    settings_json: JSON.stringify(preferences.settings),
    ui_json: JSON.stringify(preferences.ui),
    created_at: now,
    updated_at: now,
  })
  return preferences
}

function serializeProject(row, userId) {
  const preferences = userId ? getOrCreateProjectPreferences(row, userId) : {
    settings: normalizeProjectSettings(JSON.parse(row.settings_json || '{}')),
    ui: normalizeUserProjectUi({}),
  }
  const collaborators = listProjectCollaborators
    .all(row.id)
    .map((collaborator) => ({ id: collaborator.id, username: collaborator.username }))

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ownerUserId: row.owner_user_id || null,
    ownerUsername: row.owner_username || null,
    canManageUsers: Boolean(userId && row.owner_user_id === userId),
    collaborators,
    settings: preferences.settings,
    ui: preferences.ui,
  }
}

function serializeNode(row, _collapsedMap = null) {
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
    collapsed: false,
    isVariant: row.variant_of_id != null,
    hasImage: row.type === 'photo' && Boolean(row.image_path),
    imageUrl: row.image_path ? `/uploads/${row.image_path.replaceAll('\\', '/')}` : null,
    previewUrl: row.preview_path ? `/uploads/${row.preview_path.replaceAll('\\', '/')}` : null,
  }
}

function serializeNodeForUser(row, userId) {
  if (!row) {
    return null
  }
  const node = serializeNode(row)
  if (row.variant_of_id != null || !hasChildNodeStmt.get(row.id)) {
    return node
  }
  const preference = userId ? getUserNodeCollapsePreference.get(userId, row.id) : null
  node.collapsed = preference == null ? true : Boolean(preference.collapsed)
  return node
}

function buildTree(project, rows, userId = null) {
  const collapsedMap = userId
    ? new Map(
        listUserNodeCollapsePrefsByProject
          .all(userId, project.id)
          .map((row) => [row.node_id, Boolean(row.collapsed)]),
      )
    : null
  const nodes = rows.map((row) => serializeNode(row, collapsedMap))
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

  for (const node of byId.values()) {
    if (node.variant_of_id != null || (node.children?.length || 0) === 0) {
      node.collapsed = false
      continue
    }
    const collapsePreference = collapsedMap?.get(node.id)
    node.collapsed = collapsePreference == null ? true : Boolean(collapsePreference)
  }

  return {
    project: serializeProject(project, userId),
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

function getRequestUser(req) {
  const cookies = parseCookies(req.headers.cookie)
  const sessionId = String(cookies[AUTH_COOKIE] || '').trim()
  if (!sessionId) {
    return null
  }

  const session = getSessionById.get(sessionId)
  if (!session) {
    return null
  }

  updateSessionTimestampStmt.run({
    id: session.id,
    updated_at: new Date().toISOString(),
  })

  return {
    id: session.user_id,
    username: session.username,
    authSessionId: session.id,
    captureSessionId: session.capture_session_id,
  }
}

function requireAuth(req, res, next) {
  const user = getRequestUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' })
  }

  req.user = user
  return next()
}

function assertProjectAccess(projectId, userId) {
  const project = getAccessibleProjectRow.get({
    project_id: String(projectId || '').trim(),
    user_id: userId,
  })
  if (!project) {
    const error = new Error('Project not found')
    error.status = 404
    throw error
  }
  return project
}

function assertProjectOwner(projectId, userId) {
  const project = assertProjectAccess(projectId, userId)
  if (project.owner_user_id !== userId) {
    const error = new Error('Only the project owner can manage collaborators')
    error.status = 403
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

function assertNodeAccess(nodeId, userId) {
  const node = assertNode(nodeId)
  assertProjectAccess(node.project_id, userId)
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
    try {
      let projectId = null
      if (req.params.id) {
        projectId = req.user ? assertProjectAccess(req.params.id, req.user.id).id : assertProject(req.params.id).id
      } else if (req.params.sessionId) {
        const session = getDesktopSession(String(req.params.sessionId || '').trim().toLowerCase())
        if (!session) {
          throw Object.assign(new Error('Session is not active'), { status: 404 })
        }
        projectId = session.projectId
      }

      if (!projectId) {
        throw Object.assign(new Error('Project not found'), { status: 404 })
      }

      const targetDir = getProjectUploadDir(projectId)
      fs.mkdirSync(targetDir, { recursive: true })
      cb(null, targetDir)
    } catch (error) {
      cb(error)
    }
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
  const archivePath = path.join(tempDir, `project-${projectId}-${Date.now()}.zip`)
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

  const archivePath = path.join(tempDir, `media-${projectId}-${Date.now()}.zip`)
  zipDirectory(workDir, archivePath)
  fs.rmSync(workDir, { recursive: true, force: true })
  return archivePath
}

function writeProjectManifest(project, rows, workDir) {
  const filesDir = path.join(workDir, 'files')
  fs.mkdirSync(filesDir, { recursive: true })

  const manifest = {
    version: 2,
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

  return serializeNodeForUser(assertNode(oldToNew.get(manifestRootId)), null)
}

function importProjectArchive(archivePath, projectNameOverride = '', ownerUserId = null) {
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
      owner_user_id: ownerUserId,
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
    })
    const rootManifestId = String(rootRow.id ?? rootRow.old_id)
    oldToNew.set(rootManifestId, createdRoot.id)

    const projectUploadDir = getProjectUploadDir(projectId)
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

app.get(/^\/uploads\/(.+)$/, requireAuth, (req, res, next) => {
  try {
    const relativePath = String(req.params[0] || '')
    const normalized = relativePath.split(/[\\/]+/).filter(Boolean)
    if (normalized.length < 2) {
      return res.status(404).json({ error: 'File not found' })
    }

    const projectId = normalized[0]
    assertProjectAccess(projectId, req.user.id)

    const absolutePath = path.join(uploadsDir, ...normalized)
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    return res.sendFile(absolutePath)
  } catch (error) {
    return next(error)
  }
})

app.get('/capture', (_req, res) => {
  res.type('html').send(renderMobileCapturePage())
})

app.get('/api/auth/me', (req, res) => {
  const user = getRequestUser(req)
  if (!user) {
    return res.json({
      authenticated: false,
      user: null,
    })
  }

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      captureSessionId: user.captureSessionId,
    },
  })
})

app.post('/api/auth/register', (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username)
    const password = normalizePassword(req.body?.password)
    if (getUserByUsername.get(username)) {
      return res.json({ ok: false, error: 'Username is already taken' })
    }

    const now = new Date().toISOString()
    const userId = generateUniqueId((candidate) => Boolean(getUserById.get(candidate)))
    insertUser.run({
      id: userId,
      username,
      password_hash: hashPassword(password),
      created_at: now,
      updated_at: now,
    })

    if ((countUsers.get()?.count || 0) === 1) {
      claimOwnerlessProjectsStmt.run({ owner_user_id: userId })
    }

    const sessionToken = generateToken()
    const captureSessionId = generateUniqueId((candidate) => Boolean(getSessionByCaptureId.get(candidate)))
    insertSession.run({
      id: sessionToken,
      user_id: userId,
      capture_session_id: captureSessionId,
      created_at: now,
      updated_at: now,
    })
    setAuthCookie(res, sessionToken)
    res.status(201).json({
      ok: true,
      id: userId,
      username,
      captureSessionId,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username)
    const password = String(req.body?.password || '')
    const user = getUserByUsername.get(username)
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.json({ ok: false, error: 'Invalid username or password' })
    }

    const now = new Date().toISOString()
    const sessionToken = generateToken()
    const captureSessionId = generateUniqueId((candidate) => Boolean(getSessionByCaptureId.get(candidate)))
    insertSession.run({
      id: sessionToken,
      user_id: user.id,
      capture_session_id: captureSessionId,
      created_at: now,
      updated_at: now,
    })
    setAuthCookie(res, sessionToken)
    res.json({
      ok: true,
      id: user.id,
      username: user.username,
      captureSessionId,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/logout', requireAuth, (req, res) => {
  deleteSessionStmt.run(req.user.authSessionId)
  activeDesktopSessions.delete(req.user.captureSessionId)
  activeMobileConnections.delete(req.user.captureSessionId)
  clearAuthCookie(res)
  res.status(204).send()
})

app.patch('/api/account/username', requireAuth, (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username)
    const existing = getUserByUsername.get(username)
    if (existing && existing.id !== req.user.id) {
      return res.json({ ok: false, error: 'Username is already taken' })
    }

    updateUsernameStmt.run({
      id: req.user.id,
      username,
      updated_at: new Date().toISOString(),
    })

    res.json({
      ok: true,
      id: req.user.id,
      username,
      captureSessionId: req.user.captureSessionId,
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/account/password', requireAuth, (req, res, next) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '')
    const newPassword = normalizePassword(req.body?.newPassword)
    const user = getUserById.get(req.user.id)
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      return res.json({ ok: false, error: 'Current password is incorrect' })
    }

    updatePasswordStmt.run({
      id: req.user.id,
      password_hash: hashPassword(newPassword),
      updated_at: new Date().toISOString(),
    })

    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

app.delete('/api/account', requireAuth, (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username)
    if (username !== req.user.username) {
      return res.json({ ok: false, error: 'Username confirmation does not match' })
    }
    const ownedProjectCount = Number(countOwnedProjectsByUserStmt.get(req.user.id)?.count || 0)
    if (ownedProjectCount > 0) {
      return res.json({ ok: false, error: 'Delete or transfer your owned projects before deleting this account' })
    }

    const deleteAccountTx = db.transaction(() => {
      const sessions = listSessionsByUserStmt.all(req.user.id)
      deletePreferencesByUserStmt.run(req.user.id)
      deleteNodeCollapsePrefsByUserStmt.run(req.user.id)
      deleteCollaboratorsByUserStmt.run(req.user.id, req.user.id)
      deleteSessionsByUserStmt.run(req.user.id)
      deleteUserStmt.run(req.user.id)
      return sessions
    })

    const sessions = deleteAccountTx()
    for (const session of sessions) {
      activeDesktopSessions.delete(session.capture_session_id)
      activeMobileConnections.delete(session.capture_session_id)
    }

    clearAuthCookie(res)
    res.status(204).send()
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects', requireAuth, (req, res) => {
  const projects = listAccessibleProjects
    .all({ user_id: req.user.id })
    .map((project) => serializeProject(project, req.user.id))
  res.json(projects)
})

app.post('/api/projects', requireAuth, (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim()
    const description = String(req.body.description || '').trim()

    if (!name) {
      return res.status(400).json({ error: 'Project name is required' })
    }

    const projectId = createProjectWithRoot({ name, description, owner_user_id: req.user.id })
    const project = assertProjectAccess(projectId, req.user.id)
    const tree = buildTree(project, getProjectNodes.all(projectId), req.user.id)
    res.status(201).json(tree)
  } catch (error) {
    next(error)
  }
})

app.patch('/api/projects/:id', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    const name = String(req.body?.name || '').trim()

    if (!name) {
      return res.json({ ok: false, error: 'Project name is required' })
    }

    renameProjectAndRoot({
      id: project.id,
      name,
    })

    const updatedProject = assertProjectAccess(project.id, req.user.id)
    res.json(buildTree(updatedProject, getProjectNodes.all(project.id), req.user.id))
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects/:id/tree', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    const projectId = project.id
    const tree = buildTree(project, getProjectNodes.all(projectId), req.user.id)
    res.json(tree)
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects/:id/clients', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
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

app.patch('/api/projects/:id/clients/:clientId', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    const projectId = project.id

    const clientId = String(req.params.clientId || '').trim()
    if (clientId !== req.user.captureSessionId) {
      return res.status(403).json({ error: 'Session mismatch' })
    }
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
      return res.json({ ok: false, error: 'Session is not active', connectionCount: 0 })
    }

    res.json({
      ok: true,
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

app.patch('/api/sessions/:sessionId', requireAuth, (req, res, next) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim().toLowerCase()
    if (sessionId !== req.user.captureSessionId) {
      return res.status(403).json({ error: 'Session mismatch' })
    }
    const project = assertProjectAccess(req.body.projectId, req.user.id)
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

app.get('/api/projects/:id/events', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
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

app.patch('/api/projects/:id/settings', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    const projectId = project.id
    const currentPreferences = getOrCreateProjectPreferences(project, req.user.id)
    const nextSettings = normalizeProjectSettings({
      ...currentPreferences.settings,
      ...(req.body || {}),
    })
    upsertUserProjectPreference.run({
      user_id: req.user.id,
      project_id: projectId,
      settings_json: JSON.stringify(nextSettings),
      ui_json: JSON.stringify(currentPreferences.ui),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    broadcastProjectEvent(projectId)
    res.json(serializeProject(assertProjectAccess(projectId, req.user.id), req.user.id))
  } catch (error) {
    next(error)
  }
})

app.patch('/api/projects/:id/preferences', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    const projectId = project.id
    const currentPreferences = getOrCreateProjectPreferences(project, req.user.id)
    const nextUi = normalizeUserProjectUi({
      ...currentPreferences.ui,
      ...(req.body || {}),
    })

    upsertUserProjectPreference.run({
      user_id: req.user.id,
      project_id: projectId,
      settings_json: JSON.stringify(currentPreferences.settings),
      ui_json: JSON.stringify(nextUi),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    broadcastProjectEvent(projectId)
    res.json(serializeProject(assertProjectAccess(projectId, req.user.id), req.user.id))
  } catch (error) {
    next(error)
  }
})

app.get('/api/projects/:id/collaborators', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    res.json({
      owner: project.owner_user_id ? { id: project.owner_user_id, username: project.owner_username } : null,
      collaborators: listProjectCollaborators.all(project.id),
      canManageUsers: project.owner_user_id === req.user.id,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/projects/:id/collaborators', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectOwner(req.params.id, req.user.id)
    const username = normalizeUsername(req.body?.username)
    const collaborator = getUserByUsername.get(username)
    if (!collaborator) {
      return res.json({ ok: false, error: 'User not found' })
    }
    if (collaborator.id === req.user.id) {
      return res.json({ ok: false, error: 'Project owner is already included' })
    }
    if (!getProjectCollaborator.get(project.id, collaborator.id)) {
      insertProjectCollaborator.run({
        project_id: project.id,
        user_id: collaborator.id,
        added_by_user_id: req.user.id,
        created_at: new Date().toISOString(),
      })
    }
    res.status(201).json({
      ok: true,
      owner: project.owner_user_id ? { id: project.owner_user_id, username: project.owner_username } : null,
      collaborators: listProjectCollaborators.all(project.id),
      canManageUsers: true,
    })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/projects/:id/collaborators/:userId', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectOwner(req.params.id, req.user.id)
    deleteProjectCollaboratorStmt.run(project.id, String(req.params.userId || '').trim())
    res.json({
      owner: project.owner_user_id ? { id: project.owner_user_id, username: project.owner_username } : null,
      collaborators: listProjectCollaborators.all(project.id),
      canManageUsers: true,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/projects/:id/collapse-all', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    const projectId = project.id
    const collapsed = Boolean(req.body?.collapsed)
    const updatedIds = setProjectCollapsedState({ userId: req.user.id, projectId, collapsed: collapsed ? 1 : 0 })
    broadcastProjectEvent(projectId)
    res.json({ updatedIds, collapsed })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/projects/:id', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
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

app.get('/api/projects/:id/export', requireAuth, (req, res, next) => {
  let archivePath = null

  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
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

app.get('/api/projects/:id/export-media', requireAuth, (req, res, next) => {
  let archivePath = null

  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
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

app.get('/api/projects/:id/snapshot', requireAuth, (req, res, next) => {
  let archivePath = null

  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
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

app.post('/api/projects/import', requireAuth, importUpload.single('archive'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Project archive is required' })
    }

    const archivePath = `${req.file.path}${path.extname(req.file.originalname || '') || '.zip'}`
    fs.renameSync(req.file.path, archivePath)
    const importedTree = importProjectArchive(archivePath, String(req.body.projectName || '').trim(), req.user.id)
    fs.unlinkSync(archivePath)
    res.status(201).json(buildTree(assertProjectAccess(importedTree.project.id, req.user.id), getProjectNodes.all(importedTree.project.id), req.user.id))
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

app.post('/api/projects/:id/restore', requireAuth, importUpload.single('archive'), (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    const projectId = project.id

    if (!req.file) {
      return res.status(400).json({ error: 'Project archive is required' })
    }

    const archivePath = `${req.file.path}${path.extname(req.file.originalname || '') || '.zip'}`
    fs.renameSync(req.file.path, archivePath)
    restoreProjectFromArchive(projectId, archivePath)
    fs.unlinkSync(archivePath)
    broadcastProjectEvent(projectId)
    res.json(buildTree(assertProjectAccess(projectId, req.user.id), getProjectNodes.all(projectId), req.user.id))
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

app.post('/api/projects/:id/folders', requireAuth, (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    const projectId = project.id

    const clientId = String(req.body.clientId || '').trim()
    let parentId = String(req.body.parentId || '').trim() || null
    if (!parentId && clientId) {
      if (clientId !== req.user.captureSessionId) {
        return res.status(403).json({ error: 'Session mismatch' })
      }
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
    res.status(201).json(serializeNodeForUser(assertNode(nodeId), req.user.id))
  } catch (error) {
    next(error)
  }
})

app.post('/api/projects/:id/photos', requireAuth, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'preview', maxCount: 1 }]), (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    const projectId = project.id

    const clientId = String(req.body.clientId || '').trim()
    const variantRequested = String(req.body.variant || '').trim() === 'true'
    let parentId = String(req.body.parentId || '').trim() || null
    let variantOfId = req.body.variantOfId != null ? String(req.body.variantOfId).trim() : null
    if (!parentId && clientId) {
      if (clientId !== req.user.captureSessionId) {
        return res.status(403).json({ error: 'Session mismatch' })
      }
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
    res.status(201).json(serializeNodeForUser(assertNode(nodeId), req.user.id))
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
    res.status(201).json(serializeNodeForUser(assertNode(nodeId), null))
  } catch (error) {
    next(error)
  }
})

app.post('/api/projects/:id/subtree-restore', requireAuth, restoreUpload.any(), (req, res, next) => {
  try {
    const project = assertProjectAccess(req.params.id, req.user.id)
    const projectId = project.id
    const manifest = JSON.parse(String(req.body.manifest || '{}'))
    const restoredRoot = restoreSubtreeFromPayload(projectId, manifest, req.files || [])
    broadcastProjectEvent(projectId)
    res.status(201).json(restoredRoot)
  } catch (error) {
    next(error)
  }
})

app.patch('/api/nodes/:id', requireAuth, (req, res, next) => {
  try {
    const node = assertNodeAccess(req.params.id, req.user.id)
    const requestedName = String(req.body.name || '').trim()

    if (node.parent_id == null && requestedName && requestedName !== node.name) {
      return res.json({ ok: false, error: 'Rename the project to rename the root node' })
    }

    updateNode({
      id: node.id,
      project_id: node.project_id,
      name: requestedName || node.name,
      notes: String(req.body.notes || '').trim(),
      tags: parseTags(req.body.tags),
    })

    broadcastProjectEvent(node.project_id)
    res.json(serializeNodeForUser(assertNode(node.id), req.user.id))
  } catch (error) {
    next(error)
  }
})

app.post('/api/nodes/:id/collapse', requireAuth, (req, res, next) => {
  try {
    const node = assertNodeAccess(req.params.id, req.user.id)
    const collapsed = req.body.collapsed ? 1 : 0
    const updatedIds = setNodeCollapsedStateRecursive({
      userId: req.user.id,
      nodeId: node.id,
      projectId: node.project_id,
      collapsed,
    })

    broadcastProjectEvent(node.project_id)
    res.json({ node: serializeNodeForUser(assertNode(node.id), req.user.id), updatedIds })
  } catch (error) {
    next(error)
  }
})

app.post('/api/nodes/:id/move', requireAuth, (req, res, next) => {
  try {
    const node = assertNodeAccess(req.params.id, req.user.id)
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
    res.json(serializeNodeForUser(assertNode(node.id), req.user.id))
  } catch (error) {
    next(error)
  }
})

app.delete('/api/nodes/:id', requireAuth, (req, res, next) => {
  try {
    const node = assertNodeAccess(req.params.id, req.user.id)
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
  console.log(`Nodetrace server listening on http://${host}:${port}`)
})
