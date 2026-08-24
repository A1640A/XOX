import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  // Workspace paketleri kaynak olarak dışa verilir; Next onları kendisi derler.
  transpilePackages: ['@xox/game-core', '@xox/shared', '@xox/db', '@xox/ui-tokens'],
  typedRoutes: true,
  // Lint kök `eslint.config.mjs` üzerinden ayrı bir kapı; Next 16 zaten build
  // sırasında ESLint çalıştırmıyor (`eslint` anahtarı da artık geçersiz).
  typescript: { ignoreBuildErrors: false },
  // Next 16 her dev/build'de apps/web/AGENTS.md ve apps/web/CLAUDE.md üretiyor;
  // bunlar apps/web altında çalışan bir Claude Code oturumu için kök CLAUDE.md'yi
  // GÖLGELER (gotchas.md). Üretimi kapat — .gitignore geçici bir bant çözümdü.
  agentRules: false,
}

export default config
