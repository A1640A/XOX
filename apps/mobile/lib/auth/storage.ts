import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

/**
 * İNCE TEL (next-auth/auth.ts ile aynı desen, conventions.md): bu dosya
 * `react-native`/`expo-secure-store` import ettiği için Vitest'te
 * ÇALIŞTIRILAMAZ (RN modülleri Metro'nun kendi çözümlemesini/Flow
 * dönüşümünü ister). Test edilebilir mantık (JWT `exp` okuma, yenileme
 * kararı) `jwt.ts`/`api.ts`'te next-auth'suz yaşıyor — buradaki tek iş
 * ham okuma/yazma/silmedir, dallanma yoktur.
 *
 * Token'lar `AsyncStorage`'A KONMAZ (kart değişmezi) — `expo-secure-store`
 * native platformlarda Keychain/Keystore kullanır. Web hedefinde
 * `expo-secure-store` ÇALIŞMAZ (Expo dokümanı: "This module does not work
 * on web") — `localStorage`'a düşülür. Bu, web hedefinin yalnız
 * geliştirme/duman-testi amaçlı olduğu (KK-090/E2E-005) gerçek cihazda
 * `expo-secure-store` kullanılacağı gerçeğiyle TUTARLIDIR; gerçek kullanıcı
 * verisi web hedefinde hiçbir zaman kalıcı/güvenli sayılmaz.
 */
const ACCESS_TOKEN_KEY = 'xox-mobile-access-token'
const REFRESH_TOKEN_KEY = 'xox-mobile-refresh-token'

export interface TokenPair {
  readonly access: string
  readonly refresh: string
}

function webGetItem(key: string): Promise<string | null> {
  return Promise.resolve(typeof localStorage === 'undefined' ? null : localStorage.getItem(key))
}

function webSetItem(key: string, value: string): Promise<void> {
  if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  return Promise.resolve()
}

function webDeleteItem(key: string): Promise<void> {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  return Promise.resolve()
}

const getItem = Platform.OS === 'web' ? webGetItem : SecureStore.getItemAsync
const setItemRaw = Platform.OS === 'web' ? webSetItem : SecureStore.setItemAsync
const deleteItem = Platform.OS === 'web' ? webDeleteItem : SecureStore.deleteItemAsync

async function setItem(key: string, value: string): Promise<void> {
  await setItemRaw(key, value)
}

export async function saveTokenPair(pair: TokenPair): Promise<void> {
  await Promise.all([
    setItem(ACCESS_TOKEN_KEY, pair.access),
    setItem(REFRESH_TOKEN_KEY, pair.refresh),
  ])
}

export async function loadTokenPair(): Promise<TokenPair | null> {
  const [access, refresh] = await Promise.all([
    getItem(ACCESS_TOKEN_KEY),
    getItem(REFRESH_TOKEN_KEY),
  ])
  if (access === null || refresh === null) return null
  return { access, refresh }
}

export async function clearTokenPair(): Promise<void> {
  await Promise.all([deleteItem(ACCESS_TOKEN_KEY), deleteItem(REFRESH_TOKEN_KEY)])
}
