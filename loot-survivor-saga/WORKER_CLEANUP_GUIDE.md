# Worker Cleanup Rehberi

## Worker Cleanup Fonksiyonu

Worker cleanup fonksiyonu mevcut ve kullanılabilir:

```bash
npm run cleanup:queue
```

## Ne Yapar?

1. **Queue'daki tüm job'ları listeler** (waiting, active, completed, failed, delayed)
2. **Waiting job'ları siler** (bekleyen eski job'lar)
3. **Completed job'ları siler** (tamamlanmış job'lar)
4. **Failed job'ları siler** (başarısız job'lar)
5. **Delayed job'ları siler** (ertelenmiş job'lar)
6. **Active job'ları korur** (şu anda çalışan job'lar silinmez)

## Kullanım Senaryoları

### Senaryo 1: Tüm Eski Job'ları Temizle

```bash
npm run cleanup:queue
```

### Senaryo 2: Sadece Belirli Bir Saga'yı Temizle

Supabase'den manuel olarak:

```sql
DELETE FROM sagas WHERE id = 'saga-uuid-here';
```

### Senaryo 3: Sadece Failed Job'ları Temizle

Script'i modifiye ederek sadece failed job'ları temizleyebilirsiniz.

## Önemli Notlar

⚠️ **DİKKAT**: Cleanup fonksiyonu aktif (active) job'ları silmez. Eğer bir job şu anda çalışıyorsa, o job tamamlanana kadar beklenir.

⚠️ **DİKKAT**: Cleanup fonksiyonu database'deki saga kayıtlarını silmez, sadece Redis queue'daki job'ları temizler.

## Events Sorgusu Timeout Sorunu

**ÖNEMLİ**: Worker cleanup'ın events sorgusu timeout sorunu ile alakası YOK.

Events sorgusu timeout sorunu:
- Torii GraphQL API'nin performans sorunu
- Worker'dan bağımsız
- Test script'i (`npm run test:torii`) worker kullanmaz

Events sorgusu timeout sorununu çözmek için:
1. Batch size'ı küçült (5 event)
2. Timeout'u artır (ama çok fazla değil)
3. Retry mekanizması kullan
4. Selector-only sorgu dene (experimental)

## İlgili Dosyalar

- `scripts/cleanup-queue.ts` - Cleanup script'i
- `src/lib/queue/saga-queue.ts` - Queue tanımları
- `src/app/api/saga/worker/route.ts` - Worker endpoint





