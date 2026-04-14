import fs from 'node:fs'
import path from 'node:path'

export function resolveDesktopIconPaths(repoRootDir, platform) {
  const buildAssetsDir = path.join(repoRootDir, 'build')
  const svgLogoPath = path.join(repoRootDir, 'apps', 'renderer', 'public', 'nodetrace.svg')
  const pngIconPath = path.join(buildAssetsDir, 'icon-1024.png')
  const icoIconPath = path.join(buildAssetsDir, 'icon.ico')
  const icnsIconPath = path.join(buildAssetsDir, 'icon.icns')

  const appIconPath =
    platform === 'win32'
      ? (fs.existsSync(icoIconPath) ? icoIconPath : svgLogoPath)
      : (fs.existsSync(pngIconPath) ? pngIconPath : svgLogoPath)
  const dockIconPath = fs.existsSync(pngIconPath) ? pngIconPath : (fs.existsSync(icnsIconPath) ? icnsIconPath : svgLogoPath)

  return {
    appIconPath,
    dockIconPath,
    svgLogoPath,
    pngIconPath,
    icoIconPath,
    icnsIconPath,
  }
}
