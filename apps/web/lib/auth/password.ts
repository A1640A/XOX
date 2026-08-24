import { hash, verify } from '@node-rs/argon2'

/**
 * KK-005 — sabit zamanlı giriş. `authorizeCredentials()` kullanıcıyı
 * bulamadığında da bu özete karşı GERÇEK bir argon2id `verify` koşturur;
 * aksi halde "kayıtsız e-posta" yolu "yanlış parola" yolundan ölçülebilir
 * biçimde hızlı kalır ve e-posta numaralandırmasına izin verir (ADR-0009 D).
 *
 * Bu değer bir SIR DEĞİLDİR — hiçbir gerçek kullanıcı parolasının bu tam
 * dizeyle eşleşmesi argon2id altında pratikte imkânsızdır. Sabittir çünkü
 * amaç yalnızca "gerçek bir argon2id çalışması kadar süren" bir iş yapmak.
 */
const FAKE_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$mHymrMXS3NEnoU8bkA4XBQ$kEEPCIIbQMKHgjI3flcy3t1oMVXtVe16fYvByFL5gN8'

/** argon2id ile özetler (kütüphanenin varsayılan algoritması) — ADR-0009 C. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password)
}

/** Verilen düz metin parolanın saklanan argon2id özetiyle eşleşip eşleşmediğini döner. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password)
}

/**
 * Kullanıcı bulunamadığında çağrılır — gerçek bir argon2id doğrulaması
 * çalıştırır ama sonucu KULLANMAZ. Tek amacı zaman tüketmektir.
 */
export async function verifyFakePassword(password: string): Promise<boolean> {
  return verify(FAKE_PASSWORD_HASH, password)
}
