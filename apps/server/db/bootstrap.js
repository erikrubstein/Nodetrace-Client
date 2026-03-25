import Database from 'better-sqlite3'

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
  return segments.join('/')
}

function createTextSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      settings_json TEXT DEFAULT '{}',
      openai_api_key_encrypted TEXT,
      openai_api_key_mask TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      owner_user_id TEXT,
      parent_id TEXT,
      variant_of_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('folder', 'photo')),
      name TEXT NOT NULL,
      notes TEXT DEFAULT '',
      tags_json TEXT DEFAULT '[]',
      needs_attention INTEGER NOT NULL DEFAULT 0,
      image_edits_json TEXT DEFAULT '{}',
      image_path TEXT,
      preview_path TEXT,
      original_filename TEXT,
      added_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id),
      FOREIGN KEY(owner_user_id) REFERENCES users(id),
      FOREIGN KEY(parent_id) REFERENCES nodes(id),
      FOREIGN KEY(variant_of_id) REFERENCES nodes(id)
    );
  `)
}

function ensureTextIdSchema(db, { generateUniqueId, normalizeNodeImageEdits }) {
  const hasProjects = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'`).get()
  const hasNodes = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'nodes'`).get()

  if (!hasProjects && !hasNodes) {
    createTextSchema(db)
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
  if (!projectColumns.some((column) => column.name === 'openai_api_key_encrypted')) {
    db.exec(`ALTER TABLE projects ADD COLUMN openai_api_key_encrypted TEXT`)
  }
  if (!projectColumns.some((column) => column.name === 'openai_api_key_mask')) {
    db.exec(`ALTER TABLE projects ADD COLUMN openai_api_key_mask TEXT`)
  }
  if (!nodeColumns.some((column) => column.name === 'public_id')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN public_id TEXT`)
  }
  if (!nodeColumns.some((column) => column.name === 'preview_path')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN preview_path TEXT`)
  }
  if (!nodeColumns.some((column) => column.name === 'image_edits_json')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN image_edits_json TEXT DEFAULT '{}'`)
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
        openai_api_key_encrypted TEXT,
        openai_api_key_mask TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE nodes_new (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        owner_user_id TEXT,
        parent_id TEXT,
        variant_of_id TEXT,
        type TEXT NOT NULL CHECK(type IN ('folder', 'photo')),
        name TEXT NOT NULL,
        notes TEXT DEFAULT '',
        tags_json TEXT DEFAULT '[]',
        needs_attention INTEGER NOT NULL DEFAULT 0,
        image_edits_json TEXT DEFAULT '{}',
        image_path TEXT,
        preview_path TEXT,
        original_filename TEXT,
        added_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects_new(id),
        FOREIGN KEY(owner_user_id) REFERENCES users(id),
        FOREIGN KEY(parent_id) REFERENCES nodes_new(id),
        FOREIGN KEY(variant_of_id) REFERENCES nodes_new(id)
      );
    `)

    const insertProjectRow = db.prepare(`
      INSERT INTO projects_new (id, name, description, settings_json, openai_api_key_encrypted, openai_api_key_mask, created_at, updated_at)
      VALUES (@id, @name, @description, @settings_json, @openai_api_key_encrypted, @openai_api_key_mask, @created_at, @updated_at)
    `)
    const insertNodeRow = db.prepare(`
      INSERT INTO nodes_new (
        id, project_id, owner_user_id, parent_id, variant_of_id, type, name, notes, tags_json,
        needs_attention, image_edits_json, image_path, preview_path, original_filename, added_at, created_at, updated_at
      ) VALUES (
        @id, @project_id, @owner_user_id, @parent_id, @variant_of_id, @type, @name, @notes, @tags_json,
        @needs_attention, @image_edits_json, @image_path, @preview_path, @original_filename, @added_at, @created_at, @updated_at
      )
    `)

    for (const row of legacyProjects) {
      insertProjectRow.run({
        id: projectIdMap.get(row.id),
        name: row.name,
        description: row.description || '',
        settings_json: row.settings_json || '{}',
        openai_api_key_encrypted: row.openai_api_key_encrypted || null,
        openai_api_key_mask: row.openai_api_key_mask || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })
    }

    for (const row of legacyNodes) {
      insertNodeRow.run({
        id: nodeIdMap.get(row.id),
        project_id: projectIdMap.get(row.project_id),
        owner_user_id: row.owner_user_id || null,
        parent_id: row.parent_id != null ? nodeIdMap.get(row.parent_id) : null,
        variant_of_id: row.variant_of_id != null ? nodeIdMap.get(row.variant_of_id) : null,
        type: row.type,
        name: row.name,
        notes: row.notes || '',
        tags_json: row.tags_json || '[]',
        needs_attention: Number(row.needs_attention || 0),
        image_edits_json: JSON.stringify(normalizeNodeImageEdits(JSON.parse(row.image_edits_json || '{}'))),
        image_path: row.image_path ? rewriteUploadPathProjectFolder(row.image_path, projectIdMap.get(row.project_id)) : null,
        preview_path: row.preview_path ? rewriteUploadPathProjectFolder(row.preview_path, projectIdMap.get(row.project_id)) : null,
        original_filename: row.original_filename || null,
        added_at: row.added_at || new Date().toISOString(),
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

function ensureCollapseSchemaCleanup(db) {
  let nodeColumns = db.prepare(`PRAGMA table_info(nodes)`).all()
  if (!nodeColumns.some((column) => column.name === 'image_edits_json')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN image_edits_json TEXT DEFAULT '{}'`)
    nodeColumns = db.prepare(`PRAGMA table_info(nodes)`).all()
  }
  if (!nodeColumns.some((column) => column.name === 'collapsed')) {
    return
  }

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE nodes_clean (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        owner_user_id TEXT,
        parent_id TEXT,
        variant_of_id TEXT,
        type TEXT NOT NULL CHECK(type IN ('folder', 'photo')),
        name TEXT NOT NULL,
        notes TEXT DEFAULT '',
        tags_json TEXT DEFAULT '[]',
        needs_attention INTEGER NOT NULL DEFAULT 0,
        image_edits_json TEXT DEFAULT '{}',
        image_path TEXT,
        preview_path TEXT,
        original_filename TEXT,
        added_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id),
        FOREIGN KEY(owner_user_id) REFERENCES users(id),
        FOREIGN KEY(parent_id) REFERENCES nodes_clean(id),
        FOREIGN KEY(variant_of_id) REFERENCES nodes_clean(id)
      );

      INSERT INTO nodes_clean (
        id, project_id, owner_user_id, parent_id, variant_of_id, type, name, notes, tags_json,
        needs_attention, image_edits_json, image_path, preview_path, original_filename, added_at, created_at, updated_at
      )
      SELECT
        id, project_id, owner_user_id, parent_id, variant_of_id, type, name, notes, tags_json,
        COALESCE(needs_attention, 0), COALESCE(image_edits_json, '{}'), image_path, preview_path, original_filename, COALESCE(added_at, created_at), created_at, updated_at
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

function ensureNodeImageEditSchema(db) {
  const nodeColumns = db.prepare(`PRAGMA table_info(nodes)`).all()
  if (!nodeColumns.some((column) => column.name === 'image_edits_json')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN image_edits_json TEXT DEFAULT '{}'`)
  }
}

function ensureNodeNeedsAttentionSchema(db) {
  const nodeColumns = db.prepare(`PRAGMA table_info(nodes)`).all()
  if (!nodeColumns.some((column) => column.name === 'needs_attention')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN needs_attention INTEGER NOT NULL DEFAULT 0`)
  }
}

function ensureNodeAddedAtSchema(db) {
  const nodeColumns = db.prepare(`PRAGMA table_info(nodes)`).all()
  if (!nodeColumns.some((column) => column.name === 'added_at')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN added_at TEXT`)
    const now = new Date().toISOString()
    db.prepare(`UPDATE nodes SET added_at = ? WHERE added_at IS NULL OR TRIM(added_at) = ''`).run(now)
  }
}

function ensureAuthSchema(db) {
  const projectColumns = db.prepare(`PRAGMA table_info(projects)`).all()
  if (!projectColumns.some((column) => column.name === 'owner_user_id')) {
    db.exec(`ALTER TABLE projects ADD COLUMN owner_user_id TEXT`)
  }
  if (!projectColumns.some((column) => column.name === 'openai_api_key_encrypted')) {
    db.exec(`ALTER TABLE projects ADD COLUMN openai_api_key_encrypted TEXT`)
  }
  if (!projectColumns.some((column) => column.name === 'openai_api_key_mask')) {
    db.exec(`ALTER TABLE projects ADD COLUMN openai_api_key_mask TEXT`)
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

function ensureNodeOwnerSchema(db) {
  const nodeColumns = db.prepare(`PRAGMA table_info(nodes)`).all()
  if (!nodeColumns.some((column) => column.name === 'owner_user_id')) {
    db.exec(`ALTER TABLE nodes ADD COLUMN owner_user_id TEXT`)
  }

  db.exec(`
    UPDATE nodes
    SET owner_user_id = (
      SELECT owner_user_id
      FROM projects
      WHERE projects.id = nodes.project_id
    )
    WHERE owner_user_id IS NULL
  `)
}

function ensureIdentificationSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS identification_templates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      system_key TEXT,
      name TEXT NOT NULL,
      ai_instructions TEXT NOT NULL DEFAULT '',
      parent_depth INTEGER NOT NULL DEFAULT 0,
      child_depth INTEGER NOT NULL DEFAULT 0,
      fields_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS identification_templates_project_system_key
    ON identification_templates(project_id, system_key)
    WHERE system_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS node_identifications (
      node_id TEXT PRIMARY KEY,
      template_id TEXT NOT NULL,
      created_by_user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(node_id) REFERENCES nodes(id),
      FOREIGN KEY(template_id) REFERENCES identification_templates(id),
      FOREIGN KEY(created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS node_identification_field_values (
      node_id TEXT NOT NULL,
      field_key TEXT NOT NULL,
      value_json TEXT DEFAULT 'null',
      reviewed INTEGER NOT NULL DEFAULT 0,
      reviewed_by_user_id TEXT,
      reviewed_at TEXT,
      source TEXT DEFAULT 'manual',
      ai_suggestion_json TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (node_id, field_key),
      FOREIGN KEY(node_id) REFERENCES nodes(id),
      FOREIGN KEY(reviewed_by_user_id) REFERENCES users(id)
    );
  `)

  const templateColumns = db.prepare(`PRAGMA table_info(identification_templates)`).all()
  if (!templateColumns.some((column) => column.name === 'ai_instructions')) {
    db.exec(`ALTER TABLE identification_templates ADD COLUMN ai_instructions TEXT NOT NULL DEFAULT ''`)
  }
  if (!templateColumns.some((column) => column.name === 'parent_depth')) {
    db.exec(`ALTER TABLE identification_templates ADD COLUMN parent_depth INTEGER NOT NULL DEFAULT 0`)
  }
  if (!templateColumns.some((column) => column.name === 'child_depth')) {
    db.exec(`ALTER TABLE identification_templates ADD COLUMN child_depth INTEGER NOT NULL DEFAULT 0`)
  }
}

export function initializeDatabase({ dbPath, generateUniqueId, normalizeNodeImageEdits }) {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  ensureTextIdSchema(db, { generateUniqueId, normalizeNodeImageEdits })
  ensureCollapseSchemaCleanup(db)
  ensureNodeImageEditSchema(db)
  ensureNodeNeedsAttentionSchema(db)
  ensureNodeAddedAtSchema(db)
  ensureAuthSchema(db)
  ensureNodeOwnerSchema(db)
  ensureIdentificationSchema(db)

  return db
}
