/**
 * N > 3 arama motorunun AYARLARI — TEK KAYNAK (ADR-0013 §9).
 *
 * Bu dosya hiçbir şey import etmez; katman zincirinin (config -> board ->
 * status -> moves -> evaluate -> search -> ai) yanında duran bir yapraktır.
 *
 * Sabitler `packages/shared`'a KONMAZ: `game-core` `shared`'ı import edemez
 * (`boundaries` `default: 'disallow'` + sıfır bağımlılık değişmezi), yani ya
 * iki kopya olurdu ya da motor kendi bütçesini bilemezdi. SB-07'nin önerisi
 * bu yüzden reddedildi (ADR-0013 §9, "Sabitlerin yeri").
 */

/**
 * Aday hücreler: herhangi bir taşa Chebyshev uzaklığı ≤ bu değer olan boşlar.
 *
 * **ÖLÇÜLDÜ ve DOĞRULANDI** — `docs/board/reports/AI-SPIKE-001.md`:
 * r=1 → r=2 geçişi gerçek bir sıçrama (%40–48 daha fazla aday; K ≥ 4
 * tehditlerini kaçırmamak için gerekli), r=2 → r=3 getirisi düşük
 * (%0–11 ek aday). 2 hem gerekli hem yeterli.
 */
export const CANDIDATE_RADIUS = 2

/**
 * Yinelemeli derinleşmenin üst sınırı.
 *
 * **ÖLÇÜLDÜ** — `AI-SPIKE-001`: pratikte bir tavan değil, bir GÜVENLİK sınırı.
 * 11×11'de hiçbir K gerçekçi bir bütçede derinlik 3'ü bitiremiyor; 6×6'nın
 * kolay pozisyonlarında 5–6'ya ulaşmak hâlâ ucuz olduğu için tavan
 * düşürülmedi.
 */
export const MAX_SEARCH_DEPTH = 6

/**
 * Hamle başına ziyaret edilebilecek EN FAZLA düğüm. Bu kapı **deterministiktir**
 * ve `[BİRİM]` Vitest'te ölçülür (ADR-0013 §8) — makineden bağımsızdır, CI'da
 * flake üretmez, algoritmik gerilemeyi (budama bozuldu, aday daraltma gevşedi)
 * doğrudan yakalar.
 *
 * **ÖLÇÜLDÜ** — `AI-SPIKE-001`: 11×11 K4'ün orta-oyun tepe değerini (22 528,
 * derinlik 3) tam kapsar; K5 (38 670) ve K6 (54 873) tepe değerlerini KASITLI
 * olarak aşar, yani o iki kombinasyon derinlik 3'ün ortasında kesilip
 * derinlik 2'nin sonucuna düşer (yarım iterasyon atma kuralı).
 *
 * Bu sayı DÜĞÜM bazlıdır, dolayısıyla spike'ın uyguladığı ×3 kalibrasyon
 * düzeltmesinden ETKİLENMEZ (düzeltme düğüm BAŞINA maliyetle ilgiliydi).
 */
export const AI_NODE_BUDGET = 30_000

/**
 * Duvar saati bütçesi (ms). Yalnız GERÇEK tarayıcıda anlamlıdır; bu paketin
 * birim testleri bu sayıyı bir kapı olarak KULLANMAZ (ADR-0013 §8, gotcha
 * örüntü 6: CI'ın hızlı Node'unda ölçülen 120 ms orta sınıf Android'de 900 ms
 * olabilir — "kapı yeşil" o durumda hiçbir şey ölçmemiş olur).
 *
 * ⚠️ **DOĞRULANMAMIŞ — R = 6 VARSAYIMI.** `AI-SPIKE-001`in `[MANUEL]` adımı
 * (Ömer'in gerçek orta sınıf Android cihazında kalibrasyon iş yükü)
 * YAPILMADI. Bu sayı `R = 6` CPU kısıtlama katsayısına **DOĞRUSAL** bağlıdır.
 * Gerçek `R` ölçüldüğünde tazelenmesi bir çarpmadır:
 *
 *     yeni_AI_BUDGET_MS = 1000 × (gerçek_R / 6)
 *
 * ⚠️ İKİNCİ DAMGA: spike'ın N > 3 sayıları basit bir prototiple ölçüldü ve
 * gerçek bundle ile arasındaki farkı kapatmak için **×3 tutucu kalibrasyon
 * düzeltmesi** uygulandı. `CORE-AI-001` gerçek kodu yazdı, dolayısıyla o
 * düzeltme artık bir tahmindir: bu sayı gerçek kodla, kısıtlanmış gerçek
 * tarayıcıda **YENİDEN ÖLÇÜLMELİDİR** (`E2E-BOARD-001`).
 */
export const AI_BUDGET_MS = 1000

/**
 * Duvar saati HER DÜĞÜMDE değil, her bu kadar düğümde bir okunur: `now()`
 * çağrısının kendisi ölçülebilir bir maliyettir ve 11×11'de düğüm sayısı yüz
 * binlerdedir (ADR-0013 §4).
 *
 * Düğüm bütçesi ise TERS: karşılaştırma bir tamsayı kıyaslamasıdır, her
 * düğümde yapılır — bu sayede `AI_NODE_BUDGET` bir tahmin değil, YAPISAL bir
 * üst sınırdır.
 */
export const NODE_CHECK_INTERVAL = 1024

/**
 * Kazanç/kayıp puanı. `TERMINAL_SCORE − ply` biçiminde derinlik cezalıdır:
 * erken kazanç geç kazançtan, geç kayıp erken kayıptan iyidir.
 *
 * DEĞİŞMEZ (KK-B48 (b)): `TERMINAL_SCORE − MAX_SEARCH_DEPTH > MAX_HEURISTIC`.
 * `MAX_HEURISTIC` `WINDOW_WEIGHT`ten ve maksimum pencere sayısından türetilip
 * `ai-config.test.ts`te iddia edilir — burada sabit olarak YAZILMAZ, yoksa
 * beklenti kendi kaynağından türemiş olurdu (gotcha örüntü 2).
 */
export const TERMINAL_SCORE = 10_000_000

/**
 * Pencere ağırlıkları — ELLE YAZILMIŞ, DONMUŞ tablo (ADR-0013 §5).
 *
 * İndeks "bu K-pencerede kaç taşım var"dır; uzunluk desteklenen EN BÜYÜK
 * K + 1'dir. Böylece yeni bir K **yeni bir örüntü sınıfı doğurmaz** —
 * spec §2.2(b)'nin "test yüzeyi çarpımsal büyür" endişesi doğrusala iner.
 * Açık-3 / kapalı-4 ayrımı ÖRTÜK gelir: kapalı bir dizi daha az canlı
 * pencereye katılır, dolayısıyla daha az puan toplar.
 *
 * Tablo formülden (`8 ** count` gibi) TÜRETİLMEDİ: türetilseydi bir satırın
 * bozulması hiçbir testle görülemezdi. Değerler `AI-SPIKE-001`in prototip
 * tablosundan alındı ama oradaki KEYFİ 25 000'lik yedinci basamak atıldı —
 * K = 6 penceresi zaten kazanmış demektir, sezgisel değerlendirmeye hiç
 * ulaşmaz.
 */
export const WINDOW_WEIGHT: readonly number[] = Object.freeze([0, 1, 8, 40, 200, 1000, 5000])

/**
 * Rakip puanının çarpanı: `toplam = benim − DEFENSE_BIAS × rakibin`.
 * 1'den büyüktür, yani AYNI şekle sahip iki hamlede savunma tercih edilir —
 * kaybetmemek kazanmaktan önce gelir.
 */
export const DEFENSE_BIAS = 1.1

/**
 * `WINDOW_WEIGHT` okumasının TEK daraltma noktası (`cellAt` disiplini):
 * `noUncheckedIndexedAccess` altında dizi indekslemesi `number | undefined`
 * verir. Çağıranlar sayıyı `min(count, K) ≤ 6` ile üretir, dolayısıyla burada
 * savunmacı bir dal açmak ULAŞILAMAZ bir mutant üretirdi.
 *
 * Kural çakışması `pickRandom` ile aynı: `non-nullable-type-assertion-style`
 * `!` ister, `no-non-null-assertion` `!`'i yasaklar.
 */
export function weightOf(stoneCount: number): number {
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style -- `!` yasak
  return WINDOW_WEIGHT[stoneCount] as number
}
