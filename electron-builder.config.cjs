/**
 * electron-builder 配置。
 *
 * node-llama-cpp 会把各平台的预编译二进制作为 optionalDependencies 一起装下来
 * （例如 x64 Linux 上也会装 arm64 / armv7l 版本，Windows 上也会装 win-arm64），
 * 这里只把“目标平台 + 目标架构”的那几个包打进安装包，并去掉只在源码编译时才用到的 llama.cpp git bundle。
 *
 * 设置环境变量 A18_NO_CUDA=1（npm run dist:lite）可以再去掉 CUDA 版本（约 500 MB），
 * 只保留 CPU 与 Vulkan；Vulkan 同样支持 NVIDIA / AMD / Intel 显卡，只是 NVIDIA 上通常比 CUDA 慢一些。
 */
const noCuda = process.env.A18_NO_CUDA === '1'

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.local.android18.desktoppet',
  productName: 'Android 18 Desktop Pet',
  artifactName: noCuda ? '${productName}-${version}-${os}-${arch}-lite.${ext}' : '${productName}-${version}-${os}-${arch}.${ext}',
  icon: 'assets/icon.png',
  files: [
    'out/**/*',
    // 先排除全部预编译包，再按目标平台放回来（electron-builder 会展开 ${os} / ${arch}）
    '!node_modules/@node-llama-cpp/**',
    'node_modules/@node-llama-cpp/${os}-${arch}/**',
    'node_modules/@node-llama-cpp/${os}-${arch}-*/**',
    'node_modules/@node-llama-cpp/mac-${arch}-metal/**',
    ...(noCuda ? ['!node_modules/@node-llama-cpp/*-cuda/**', '!node_modules/@node-llama-cpp/*-cuda-ext/**'] : []),
    '!node_modules/node-llama-cpp/llama/gitRelease.bundle',
    '!node_modules/node-llama-cpp/llama/**/*.{c,cpp,h,hpp,cu,cuh,metal,comp}'
  ],
  extraFiles: [
    { from: 'character-cards', to: 'character-cards', filter: ['**/*'] },
    { from: 'plugins', to: 'plugins', filter: ['**/*'] },
    { from: 'models/README.md', to: 'models/README.md' },
    { from: 'LICENSE', to: 'LICENSE.txt' }
  ],
  win: {
    target: ['nsis', 'portable']
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    artifactName: noCuda
      ? '${productName}-${version}-Setup-lite.${ext}'
      : '${productName}-${version}-Setup.${ext}'
  },
  portable: {
    artifactName: noCuda
      ? '${productName}-${version}-portable-lite.${ext}'
      : '${productName}-${version}-portable.${ext}'
  },
  linux: {
    target: ['AppImage'],
    category: 'Utility'
  },
  publish: null
}
