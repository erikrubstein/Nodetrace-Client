import { spawn } from 'node:child_process'
import process from 'node:process'

const children = []
let shuttingDown = false
const npmExecPath = process.env.npm_execpath || null
const e2eServerUrl = String(process.env.NODETRACE_E2E_SERVER_URL || 'http://127.0.0.1:3001').trim()

function buildNpmInvocation(args) {
  if (npmExecPath) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
    }
  }

  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm', ...args],
    }
  }

  return {
    command: 'npm',
    args,
  }
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) {
      child.kill()
    }
  }
  process.exit(code)
}

function start(name, command, args, env) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: 'inherit',
  })
  children.push(child)
  child.on('exit', (code) => {
    if (shuttingDown) {
      return
    }
    const normalizedCode = code ?? 1
    console.error(`${name} exited with code ${normalizedCode}`)
    shutdown(normalizedCode)
  })
  return child
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

{
  const npm = buildNpmInvocation([
    'run',
    'dev',
    '--workspace',
    'nodetrace-renderer',
    '--',
    '--host',
    '127.0.0.1',
  ])
  start('renderer', npm.command, npm.args, {
    VITE_HOST: '127.0.0.1',
    VITE_PORT: '4173',
    VITE_API_BASE_URL: e2eServerUrl,
  })
}

setInterval(() => {}, 1000)
