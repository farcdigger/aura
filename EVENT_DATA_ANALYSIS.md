# Event Data Analizi - Çektiğimiz Tek Event'in İçeriği

## 📊 Özet

**Çektiğimiz Event**: `ls009GameEventModels` query'sinden gelen **SON EVENT** (singleton pattern)

**Önemli Not**: Bu model sadece **son event'i** saklıyor. Ölüm öncesi tüm olaylar (kaçma, vuruşlar) **GELMİYOR**, sadece **son event** geliyor.

---

## 🔍 Event İçeriği

### Event Yapısı (GraphQL Response)

```typescript
{
  adventurer_id: string,        // Adventurer ID
  action_count: number,         // Action sayısı (turn number)
  details: {
    __typename: string,         // Event tipi (union type)
    
    // OPSIYONEL FIELD'LAR (sadece ilgili event tipinde dolu):
    
    // 1. ATTACK EVENT (Oyuncu canavara saldırdı)
    attack?: {
      damage: number,           // Verilen hasar
      location: number,         // Canavar ID / Lokasyon
      critical_hit: boolean     // Kritik vuruş mu?
    },
    
    // 2. DISCOVERY EVENT (Keşif yapıldı)
    discovery?: {
      discovery_type: {
        __typename: string     // "ls_0_0_9_DiscoveryTypeBeast", "Item", "Gold", vb.
      },
      xp_reward: number        // XP ödülü
    },
    
    // 3. AMBUSH EVENT (Canavar pusuya düşürdü)
    ambush?: {
      damage: number,          // Alınan hasar
      location: number,       // Canavar ID / Lokasyon
      critical_hit: boolean   // Kritik vuruş mu?
    },
    
    // 4. BEAST ATTACK EVENT (Canavar saldırdı)
    beast_attack?: {
      damage: number,          // Alınan hasar
      location: number,       // Canavar ID / Lokasyon
      critical_hit: boolean   // Kritik vuruş mu?
    },
    
    // 5. FLEE EVENT (Kaçma)
    flee?: boolean,            // true = kaçtı, false/undefined = kaçmadı
    
    // 6. OPTION (Kullanılmıyor şu an)
    option?: any
  }
}
```

---

## ⚠️ ÖNEMLİ SINIRLAMALAR

### 1. **Sadece Son Event Geliyor**
- `ls009GameEventModels` **singleton pattern** kullanıyor
- Her yeni action, **önceki event'i overwrite ediyor**
- Bu yüzden sadece **son action'ın event'i** geliyor

### 2. **Ölüm Öncesi Olaylar GELMİYOR**
- ❌ Ölüm öncesi kaçma denemeleri gelmiyor
- ❌ Ölüm öncesi vuruşlar gelmiyor
- ❌ Ölüm öncesi keşifler gelmiyor
- ✅ Sadece **son action'ın event'i** geliyor

### 3. **Ölüm Anı Event'i**
Eğer son event ölüm anındaysa, şu bilgiler gelebilir:
- **Attack**: Son vuruş (damage, location, critical_hit)
- **BeastAttack**: Son canavar saldırısı (damage, location, critical_hit)
- **Ambush**: Son pusu (damage, location, critical_hit)
- **Flee**: Son kaçma denemesi (true/false)

**AMA**: Ölüm öncesi tüm olaylar (kaç kez vurdu, kaç kez kaçtı) **GELMİYOR**.

---

## 📝 Örnek Senaryolar

### Senaryo 1: Son Event = Attack (Ölüm Anı)
```json
{
  "adventurer_id": "133595",
  "action_count": 150,
  "details": {
    "__typename": "Attack",
    "attack": {
      "damage": 25,
      "location": 5,
      "critical_hit": false
    }
  }
}
```

**Bilgiler:**
- ✅ Son vuruş: 25 hasar
- ✅ Canavar: Location 5
- ✅ Kritik vuruş: Hayır
- ❌ Önceki vuruşlar: GELMİYOR
- ❌ Kaçma denemeleri: GELMİYOR

### Senaryo 2: Son Event = BeastAttack (Ölüm Anı)
```json
{
  "adventurer_id": "133595",
  "action_count": 150,
  "details": {
    "__typename": "BeastAttack",
    "beast_attack": {
      "damage": 50,
      "location": 5,
      "critical_hit": true
    }
  }
}
```

**Bilgiler:**
- ✅ Son canavar saldırısı: 50 hasar (kritik)
- ✅ Canavar: Location 5
- ❌ Önceki saldırılar: GELMİYOR
- ❌ Oyuncunun vuruşları: GELMİYOR

### Senaryo 3: Son Event = Flee (Kaçma Denemesi)
```json
{
  "adventurer_id": "133595",
  "action_count": 150,
  "details": {
    "__typename": "Flee",
    "flee": true
  }
}
```

**Bilgiler:**
- ✅ Son action: Kaçma denemesi
- ✅ Kaçtı mı: Evet (true)
- ❌ Önceki kaçma denemeleri: GELMİYOR
- ❌ Önceki vuruşlar: GELMİYOR

---

## 🎯 Çizgi Roman İçin Kullanım

### Mevcut Durum (Prototype)
1. **Son event'i** kullanıyoruz (Attack, BeastAttack, Ambush, Flee)
2. **Adventurer data**'dan genel bilgileri alıyoruz (health, level, xp)
3. **18 sahne** adventurer data'dan oluşturuluyor (generic)
4. **Son 2 sahne** son event'ten oluşturuluyor (before/after)

### Sorun
- ❌ Ölüm öncesi tüm olaylar gelmiyor
- ❌ "Kaç kez vurdu, kaç kez kaçtı" bilgisi yok
- ❌ Sadece son action'ın detayları var

### Çözüm (Gelecek)
- ✅ **Apibara Indexer** ile tüm event history'yi çekmek
- ✅ **events query** ile tüm event'leri çekmek (timeout sorunu çözülürse)
- ✅ **Model-specific queries** kullanmak (battles, discoveries)

---

## 🔧 Kodda Nasıl Kullanılıyor?

### Event Parsing (event-fetcher.ts)

```typescript
// Attack event
if (details.attack) {
  eventType = 'Attack';
  eventData = {
    actionCount: node.action_count,
    damage: details.attack.damage || 0,
    location: details.attack.location || 0,
    criticalHit: details.attack.critical_hit || false,
    beastName: getBeastName(details.attack.location || 0),
    locationName: getLocationName(details.attack.location || 0)
  };
}

// Beast attack event
else if (details.beast_attack) {
  eventType = 'BeastAttack';
  eventData = {
    actionCount: node.action_count,
    damage: details.beast_attack.damage || 0,
    location: details.beast_attack.location || 0,
    criticalHit: details.beast_attack.critical_hit || false
  };
}

// Flee event
else if (details.flee === true) {
  eventType = 'Flee';
  eventData = {
    actionCount: node.action_count,
    fled: true
  };
}
```

---

## 📊 Özet Tablo

| Event Tipi | Gelen Bilgiler | Eksik Bilgiler |
|------------|----------------|----------------|
| **Attack** | Son vuruş (damage, location, critical_hit) | Önceki vuruşlar, kaç kez vurdu |
| **BeastAttack** | Son canavar saldırısı (damage, location, critical_hit) | Önceki saldırılar, toplam hasar |
| **Ambush** | Son pusu (damage, location, critical_hit) | Önceki pusular |
| **Flee** | Son kaçma denemesi (true/false) | Önceki kaçma denemeleri, kaç kez kaçtı |
| **Discovery** | Son keşif (type, xp_reward) | Önceki keşifler |

---

## ✅ Sonuç

**Çektiğimiz Event'te:**
- ✅ Son action'ın detayları var (damage, location, critical_hit, flee)
- ✅ Event tipi belli (Attack, BeastAttack, Ambush, Flee, Discovery)
- ✅ Action count var (turn number)

**Çektiğimiz Event'te YOK:**
- ❌ Ölüm öncesi tüm olaylar
- ❌ Kaç kez vurdu, kaç kez kaçtı
- ❌ Önceki vuruşların detayları
- ❌ Önceki kaçma denemeleri

**Çizgi Roman İçin:**
- Şu an sadece **son event**'i kullanıyoruz
- **18 sahne** generic (adventurer data'dan)
- **Son 2 sahne** son event'ten (before/after)
- Daha detaylı hikaye için **tüm event history** gerekiyor (Apibara Indexer)

---

**Son Güncelleme**: 2024
**Event Source**: `ls009GameEventModels` (Torii GraphQL)

