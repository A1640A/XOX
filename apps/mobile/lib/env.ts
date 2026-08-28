/**
 * Web API'sinin (Next.js, `apps/web`) tabanı — REST + WS upgrade uç noktaları
 * hep bu kökten türetilir. `EXPO_PUBLIC_*` öneki Expo'nun derleme zamanında
 * istemci paketine gömdüğü DEĞİŞMEZ (build-time) tek env sınıfıdır; `.env.example`
 * `OPS-002`'de DONDURULDU ve bu görevin çakışma kümesi dışında olduğu için
 * burada YALNIZ kod-içi bir varsayılanla belgeleniyor — gerçek bir dağıtımda
 * `EXPO_PUBLIC_API_BASE_URL` ortam değişkeniyle ezilir.
 *
 * Varsayılan `http://localhost:3000` yerel `vc dev`in adresidir (gotchas.md:
 * WS geliştirmesi `next dev` ile ÇALIŞMAZ, `vc dev` gerekir).
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env['EXPO_PUBLIC_API_BASE_URL']
  if (fromEnv !== undefined && fromEnv.length > 0) return stripTrailingSlash(fromEnv)
  return 'http://localhost:3000'
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/** `http(s)://host` -> `ws(s)://host` — WS upgrade'in taşıma şeması. */
export function getWsBaseUrl(): string {
  const base = getApiBaseUrl()
  if (base.startsWith('https://')) return `wss://${base.slice('https://'.length)}`
  if (base.startsWith('http://')) return `ws://${base.slice('http://'.length)}`
  return base
}
