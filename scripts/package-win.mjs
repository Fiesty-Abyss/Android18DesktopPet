import { cp, mkdir, readdir, readFile, rm, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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

for (const dir of runtimeDirs) {
  const source = join(root, dir)
  const destination = join(targetDir, dir)
  await mkdir(destination, { recursive: true })
  if (existsSync(source)) await cp(source, destination, { recursive: true })
}

const sourceNodeModules = join(root, 'node_modules')
const targetNodeModules = join(appDir, 'node_modules')
await mkdir(targetNodeModules, { recursive: true })
for (const entry of await readdir(sourceNodeModules, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === '.bin' || entry.name === 'electron') continue
  await cp(join(sourceNodeModules, entry.name), join(targetNodeModules, entry.name), { recursive: true })
}

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
