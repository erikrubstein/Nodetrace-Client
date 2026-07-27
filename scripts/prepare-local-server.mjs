import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.resolve(
  String(process.env.NODETRACE_SERVER_SOURCE_DIR || path.join(clientDir, '..', 'Nodetrace-Server')).trim(),
)
const targetDir = path.join(clientDir, '.local-server-runtime')
const sourcePackagePath = path.join(sourceDir, 'package.json')
const requiredPaths = ['index.js', 'db', 'routes', 'server', 'shared']

if (!fs.existsSync(sourcePackagePath)) {
  throw new Error(
    `Nodetrace server source was not found at ${sourceDir}. Set NODETRACE_SERVER_SOURCE_DIR to the Nodetrace-Server checkout.`,
  )
}

const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, 'utf8'))
if (sourcePackage.name !== 'nodetrace-server') {
  throw new Error(`Expected a nodetrace-server package at ${sourceDir}`)
}

for (const relativePath of requiredPaths) {
  if (!fs.existsSync(path.join(sourceDir, relativePath))) {
    throw new Error(`The Nodetrace server runtime is missing ${relativePath}`)
  }
}

fs.rmSync(targetDir, { recursive: true, force: true })
fs.mkdirSync(targetDir, { recursive: true })

for (const relativePath of [...requiredPaths, 'package.json']) {
  fs.cpSync(path.join(sourceDir, relativePath), path.join(targetDir, relativePath), {
    recursive: true,
    filter(sourcePath) {
      const basename = path.basename(sourcePath)
      return fs.statSync(sourcePath).isDirectory() || basename === 'package.json' || basename.endsWith('.js')
    },
  })
}

console.log(`Prepared Local Projects server ${sourcePackage.version} from ${sourceDir}`)
