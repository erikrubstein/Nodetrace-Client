import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fileEnv = loadEnv('development', clientDir, '')
const env = { ...fileEnv, ...process.env }
const host = String(env.VITE_HOST || '127.0.0.1').trim()
const port = Number(env.VITE_PORT || 5173)
const desktopHost = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host
const desktopArgs = process.argv.slice(2)
const children = []
let shuttingDown = false

function buildNpmInvocation(args) {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...args],
    }
  }

  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm', ...args],
    }
  }

  return { command: 'npm', args }
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

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: clientDir,
    env,
    stdio: 'inherit',
  })
  children.push(child)
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.error(`${name} exited with code ${code ?? 1}`)
      shutdown(code ?? 1)
    }
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

const npm = buildNpmInvocation(['run', 'dev:renderer'])
start('renderer', npm.command, npm.args)
start(
  'desktop',
  process.execPath,
  [
    path.join(clientDir, 'node_modules', 'electron', 'cli.js'),
    'apps/desktop',
    `--dev-url=http://${desktopHost}:${port}`,
    ...desktopArgs,
  ],
)

setInterval(() => {}, 1000)
