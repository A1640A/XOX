import type { NextConfig } from 'next'

/**
 * `exactOptionalPropertyTypes: true` altında `deploymentId?: string`e
 * elle `undefined` ATANAMAZ (TS2375) — anahtar Vercel dışında (yerel/CI)
 * tamamen ATLANIR, `deploymentId: undefined` YAZILMAZ.
 */
const vercelDeploymentId = process.env['VERCEL_DEPLOYMENT_ID']

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
  // ROLLOUT-BOARD-001 · ADR-0018 §3, Hat 2. Vercel Skew Protection'ın bu
  // projede (Pro/Enterprise gerektirir) etkin olduğu ÖLÇÜLMEDEN elle yazıldı
  // — `GET /api/health`'in `skewProtectionEnabled` sondası bunu doğrulayana
  // kadar bu satır ZARARSIZ varsayılan: Skew Protection etkinse Next zaten
  // aynı mekanizmayı otomatik kurar (bu, onunla ÇAKIŞMAZ); etkin DEĞİLSE bu
  // satır olmadan uyuşmazlık tespiti hiç çalışmaz. `VERCEL_DEPLOYMENT_ID`
  // Vercel dışında (yerel/CI) tanımsızdır — `deploymentId` o zaman
  // `undefined` olur ve devre dışı kalır (next.config tipi `string | undefined`
  // kabul eder). Amaç eski istemciyi PİNLEMEK değil YENİLEMEYE ZORLAMAKTIR:
  // dağıtım kimliği uyuşmazlığında istemci tam sayfa yenilemeye düşer, `__vdpl`
  // çerezi (pinleme) burada KULLANILMAZ.
  ...(vercelDeploymentId !== undefined ? { deploymentId: vercelDeploymentId } : {}),
}

export default config
