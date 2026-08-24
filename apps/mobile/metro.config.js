/* eslint-disable no-undef, @typescript-eslint/no-require-imports -- Metro bu dosyayı CommonJS olarak require eder. */
// pnpm sembolik bağlantı kullanır; Metro varsayılan olarak workspace kökünü
// izlemez. `watchFolders` + `nodeModulesPaths` olmadan @xox/* paketleri
// "module not found" verir.
//
// NOT: Expo'nun monorepo rehberindeki üçüncü ayar (`disableHierarchicalLookup`)
// yalnızca hoisted (npm/yarn) kurulumlar içindir. pnpm'in izole node_modules
// düzeninde geçişli bağımlılıklar `.pnpm/<paket>/node_modules` altında durur;
// hiyerarşik arama kapatılırsa Metro bunları göremez ve web derlemesi
// "Unable to resolve module expo-font/build/server" ile ölür. Bu yüzden AÇIK
// bırakıldı — bkz. Task 22 doğrulaması.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = config
