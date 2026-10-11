import { cp, mkdir, readFile, rm, rename, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const electronDist = join(root, 'node_modules', 'electron', 'dist')
const outDir = join(root, 'out')
const targetDir = join(root, 'dist', 'Android18DesktopPet')
const appDir = join(targetDir, 'resources', 'app')
const launcherName = 'Android18DesktopPet.exe'
const runtimeDirs = ['models', 'plugins', 'chats', 'cache', 'character-cards']

if (process.platform !== 'win32') {
  console.warn('提示：该脚本打包的是 Windows 绿色版（electron.exe），需要在 Windows 上运行 npm install 后执行。')
}

if (!existsSync(join(electronDist, 'electron.exe'))) {
  throw new Error('Missing Windows Electron runtime (electron.exe). Run npm install on Windows first, or use npm run dist:builder.')
}

if (!existsSync(join(outDir, 'main', 'main.js'))) {
  throw new Error('Missing build output. Run npm run build first.')
}

await rm(targetDir, { recursive: true, force: true })
await mkdir(targetDir, { recursive: true })
await cp(electronDist, targetDir, { recursive: true })

const defaultExe = join(targetDir, 'electron.exe')
const launcherExe = join(targetDir, launcherName)
await rm(launcherExe, { force: true })
await rename(defaultExe, launcherExe)

await rm(appDir, { recursive: true, force: true })
await mkdir(appDir, { recursive: true })
await cp(outDir, join(appDir, 'out'), { recursive: true })
await cp(join(root, 'characters'), join(appDir, 'characters'), { recursive: true })

// 角色卡和插件整体带上；models / chats / cache 只带 README，避免把本机的模型权重和聊天记录打进安装包
const fullCopyDirs = new Set(['character-cards', 'plugins'])
for (const dir of runtimeDirs) {
  const source = join(root, dir)
  const destination = join(targetDir, dir)
  await mkdir(destination, { recursive: true })
  if (!existsSync(source)) continue
  if (fullCopyDirs.has(dir)) await cp(source, destination, { recursive: true })
  else if (existsSync(join(source, 'README.md'))) await cp(join(source, 'README.md'), join(destination, 'README.md'))
}
await cp(join(root, 'LICENSE'), join(targetDir, 'LICENSE.txt'))

// 只复制生产依赖（npm ls --omit=dev），不再把 electron-builder、vite 等开发依赖打进绿色版
const sourceNodeModules = join(root, 'node_modules')
const targetNodeModules = join(appDir, 'node_modules')
const noCuda = process.env.A18_NO_CUDA === '1'
const llamaPlatform = `win-${process.env.A18_TARGET_ARCH || 'x64'}`

/** 只保留目标平台的 node-llama-cpp 预编译包；A18_NO_CUDA=1 时再去掉 CUDA 版本 */
function keepPackage(relativePath) {
  const match = relativePath.replaceAll('\\', '/').match(/^@node-llama-cpp\/([^/]+)/)
  if (!match) return true
  const name = match[1]
  if (name !== llamaPlatform && !name.startsWith(`${llamaPlatform}-`)) return false
  if (noCuda && /-cuda(-ext)?$/.test(name)) return false
  return true
}

const listing = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ls', '--omit=dev', '--all', '--parseable'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 16 * 1024 * 1024
})
const packageDirs = [...new Set(listing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
  .map((dir) => relative(sourceNodeModules, dir))
  .filter((dir) => dir && !dir.startsWith('..') && !isAbsolute(dir))
  .sort((a, b) => a.length - b.length)

await mkdir(targetNodeModules, { recursive: true })
const copied = []
for (const dir of packageDirs) {
  if (dir === 'electron' || !keepPackage(dir)) continue
  if (copied.some((parent) => dir.startsWith(`${parent}${sep}node_modules${sep}`))) continue
  await cp(join(sourceNodeModules, dir), join(targetNodeModules, dir), {
    recursive: true,
    // llama.cpp 源码 bundle 只在从源码编译时使用
    filter: (source) => !source.endsWith('gitRelease.bundle')
  })
  copied.push(dir)
}
console.log(`Copied ${copied.length} production packages${noCuda ? ' (without CUDA)' : ''}`)

await writeFile(
  join(appDir, 'package.json'),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: 'module',
      main: 'out/main/main.js'
    },
    null,
    2
  )
)

console.log(`Created ${launcherExe}`)
