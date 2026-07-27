import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

const LOCAL_SERVER_BIND_HOST = '0.0.0.0'
const LOCAL_SERVER_DESKTOP_HOST = '127.0.0.1'
const LOCAL_SERVER_READY_TIMEOUT_MS = 15000
const LOCAL_SERVER_READY_POLL_MS = 100

function reserveAvailablePort() {
  return new Promise((resolve, reject) => {
    const reservation = net.createServer()
    reservation.unref()
    reservation.once('error', reject)
    reservation.listen(0, LOCAL_SERVER_BIND_HOST, () => {
      const address = reservation.address()
      const port = typeof address === 'object' && address ? Number(address.port) : 0
      reservation.close((error) => {
        if (error) {
          reject(error)
          return
        }
        if (!port) {
          reject(new Error('Unable to reserve a network port for Local Projects'))
          return
        }
        resolve(port)
      })
    })
  })
}

function probeLocalServer(baseUrl) {
  return new Promise((resolve) => {
    const request = http.get(`${baseUrl}/api/auth/me`, { timeout: 750 }, (response) => {
      response.resume()
      resolve(response.statusCode === 200)
    })
    request.once('error', () => resolve(false))
    request.once('timeout', () => {
      request.destroy()
      resolve(false)
    })
  })
}

async function waitForLocalServer(baseUrl, childProcess) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < LOCAL_SERVER_READY_TIMEOUT_MS) {
    if (childProcess.exitCode != null || childProcess.signalCode) {
      throw new Error(`Local Projects service exited before it was ready (code ${childProcess.exitCode ?? childProcess.signalCode})`)
    }
    if (await probeLocalServer(baseUrl)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, LOCAL_SERVER_READY_POLL_MS))
  }
  throw new Error('Local Projects service did not become ready in time')
}

function logChildOutput(stream, prefix, log) {
  stream?.setEncoding('utf8')
  stream?.on('data', (chunk) => {
    for (const line of String(chunk || '').split(/\r?\n/)) {
      const normalized = line.trim()
      if (normalized) {
        log(`${prefix}: ${normalized}`)
      }
    }
  })
}

export function createLocalServerController({
  app,
  bootstrapToken,
  dataDir,
  log,
  runtimeRootDir,
  secretKey,
  webDistDir,
}) {
  let childProcess = null
  let stopping = false
  let currentBaseUrl = ''

  async function start() {
    if (childProcess && childProcess.exitCode == null && currentBaseUrl) {
      return { baseUrl: currentBaseUrl }
    }

    const runtimeEntryPath = path.join(runtimeRootDir, '.local-server-runtime', 'index.js')
    const port = await reserveAvailablePort()
    currentBaseUrl = `http://${LOCAL_SERVER_DESKTOP_HOST}:${port}`
    if (!fs.existsSync(runtimeEntryPath)) {
      throw new Error(`Local Projects server runtime not found at ${runtimeEntryPath}. Run "npm run prepare:local-server".`)
    }

    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      HOST: LOCAL_SERVER_BIND_HOST,
      PORT: String(port),
      NODE_ENV: app.isPackaged ? 'production' : String(process.env.NODE_ENV || 'development'),
      NODETRACE_DATA_DIR: dataDir,
      NODETRACE_LOCAL_BOOTSTRAP_TOKEN: bootstrapToken,
      NODETRACE_LOCAL_USER_ID: 'local',
      NODETRACE_LOCAL_USERNAME: 'local',
      NODETRACE_SECRET_KEY: secretKey,
      NODETRACE_WEB_DIST: webDistDir,
    }
    stopping = false
    childProcess = spawn(process.execPath, [runtimeEntryPath], {
      cwd: app.isPackaged ? process.resourcesPath : path.dirname(runtimeEntryPath),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    logChildOutput(childProcess.stdout, 'Local Projects', log)
    logChildOutput(childProcess.stderr, 'Local Projects error', log)
    childProcess.once('error', (error) => {
      log(`Local Projects service process error: ${error.message}`)
    })
    childProcess.once('exit', (code, signal) => {
      const unexpected = !stopping
      childProcess = null
      if (unexpected) {
        log(`Local Projects service stopped unexpectedly (${code ?? signal ?? 'unknown'})`)
      }
    })

    try {
      await waitForLocalServer(currentBaseUrl, childProcess)
      log(`Local Projects service available to the desktop at ${currentBaseUrl}`)
      return { baseUrl: currentBaseUrl }
    } catch (error) {
      stop()
      throw error
    }
  }

  function stop() {
    stopping = true
    if (childProcess && childProcess.exitCode == null) {
      childProcess.kill()
    }
    childProcess = null
  }

  return {
    start,
    stop,
  }
}
