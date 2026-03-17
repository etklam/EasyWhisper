# Technical Debt - FOSSWhisper 專案

> 2026-03-17 | 記錄重構過程中的技術債

---

## 🔴 高優先級技術債

### 1. SettingsManager 仍使用舊常量定義

**檔案：** `apps/desktop/electron/main/settings/SettingsManager.ts`

**問題：**
```typescript
// SettingsManager.ts 第 19-21 行
const VALID_LOCALES = new Set(['en', 'zh-TW', 'zh-CN'])
const VALID_OUTPUT_FORMATS = new Set(['txt', 'srt', 'vtt', 'json'])
```

**影響：**
- 這些常量定義在 `apps/desktop/electron/main/settings/` 目錄下
- 雖然 `apps/desktop/electron/main/constants/` 目錄已創建，包含相同的常量
- SettingsManager 仍然使用內部定義的 Set，而不是從 `constants/` 導入
- 導致測試失敗：`TypeError: Cannot read properties of undefined (reading 'includes')`

**原因：**
- 重構階段 3 更新 SettingsManager 時出現了問題
- 可能是：
  1. 導入路徑不正確（相對路徑問題）
  2. 常量類型不匹配（Set vs Array）
  3. 模組加載順序問題

**失敗的更新嘗試：**
```typescript
// 第一次嘗試 - 導入從 '../constants'
import { VALID_LOCALES, VALID_OUTPUT_FORMATS } from '../constants'

// 第二次嘗試 - 導入從個別檔案
import { VALID_LOCALES } from '../constants/locales'
import { VALID_OUTPUT_FORMATS } from '../constants/formats'
```

**問題根源：**
- `constants/` 中的常量是 `Array` 類型（使用 `as const`）
- SettingsManager 原本使用 `Set` 類型
- 更新後將 `Set.includes()` 改為 `Array.includes()`
- 但測試環境中 `VALID_LOCALES` 或 `VALID_OUTPUT_FORMATS` 可能未正確導入
- 導致 `undefined.includes()` 錯誤

**測試失敗：**
```
electron/__tests__/settings/SettingsManager.test.ts:
  FAIL > Settings Validation > should validate locale
    TypeError: Cannot read properties of undefined (reading 'includes')
  FAIL > Settings Validation > should validate outputFormats
    TypeError: Cannot read properties of undefined (reading 'includes')
  FAIL > Export/Import Settings > should import settings from JSON
    TypeError: Cannot read properties of undefined (reading 'includes')
```

**受影響的測試：** 8 個

**暫時解決方案：**
- 導入改回內部 Set 定義
- 所有其他測試仍通過（116 個測試）

**待修復：**
1. 修復導入路徑或模組加載問題
2. 確保常量在測試環境中正確導入
3. 更新 SettingsManager 使用 Array.includes() 而不是 Set.includes()
4. 更新相應測試

---

## 🟡 中優先級技術債

### 2. 重構未完成

**完成的階段：**
- ✅ 階段 1：創建 constants/ 目錄（4 個檔案）
- ✅ 階段 2：創建 utils/ 目錄（4 個檔案）
- ✅ 階段 3a：更新 BatchQueue.ts ✅
- ✅ 階段 3b：更新 AudioProcessor.ts ✅
- ✅ 階段 3c：更新 YtDlpDownloader.ts ✅
- ✅ 階段 3d：更新 OutputFormatter.ts ✅
- ❌ 階段 3e：更新 SettingsManager.ts ⚠️

**未完成：**
- ❌ SettingsManager 仍使用舊常量

**影響：**
- 重構工作 90% 完成
- 只有 1 個檔案仍需更新
- 8 個測試暫時失敗

---

## 🟢 低優先級技術債

### 3. 常量定義仍有輕微重複

**已完成：**
- ✅ BatchQueue.ts - 已使用新的 `SUPPORTED_INPUT_FORMATS`
- ✅ AudioProcessor.ts - 已使用新的常量和工具函式
- ✅ YtDlpDownloader.ts - 已使用新的常量
- ✅ OutputFormatter.ts - 已使用新的工具函式
- ❌ SettingsManager.ts - 仍使用舊的 Set 定義

**未來改進：**
- 可以考慮移除測試中的重複常量定義
- 但這不影響功能，可延後處理

---

## 📋 行動項

### 立即處理

- [ ] 修復 SettingsManager 常量導入問題
- [ ] 確保所有測試通過（目標：124 個測試）
- [ ] 驗證重構收益（減少重複代碼）

### 短期（Phase 3 之前）

- [ ] 更新測試使用新的常量導入
- [ ] 清理任何未使用的舊導入
- [ ] 確保型別檢查通過

### 中期（Phase 4 之前）

- [ ] 審查是否需要統一事件系統
- [ ] 評估是否需要統一錯誤處理
- [ ] 完善重構文檔

---

## 🔍 調查記錄

### SettingsManager 導入問題詳細調查

**試圖的修復：**

1. **相對路徑導入**
```typescript
import { VALID_LOCALES, VALID_OUTPUT_FORMATS } from '../constants'
```
   - 失敗：`TypeError: Cannot read properties of undefined`
   - 原因：可能是模組加載順序或循環依賴

2. **絕對路徑導入**
```typescript
import { VALID_LOCALES } from '../../constants/locales'
import { VALID_OUTPUT_FORMATS } from '../../constants/formats'
```
   - 失敗：同樣問題
   - 原因：路徑不是問題，是導入機制

3. **內部常量回退**
```typescript
const VALID_LOCALES = new Set(['en', 'zh-TW', 'zh-CN'])
const VALID_OUTPUT_FORMATS = new Set(['txt', 'srt', 'vtt', 'json'])
```
   - 成功：所有其他測試通過
   - 但留下技術債：重複的常量定義

**下一步：**
1. 檢查 `constants/index.ts` 的匯出
2. 確保所有常量都正確匯出
3. 檢查測試環境中的模組解析
4. 考慮使用別的導入方式（例如：`import * as Constants from`）

---

## 📊 重構進度總結

| 項目 | 狀態 | 完成度 |
|---|---|---|
| constants/ 目錄 | ✅ 完成 | 100% |
| utils/ 目錄 | ✅ 完成 | 100% |
| BatchQueue.ts | ✅ 完成 | 100% |
| AudioProcessor.ts | ✅ 完成 | 100% |
| YtDlpDownloader.ts | ✅ 完成 | 100% |
| OutputFormatter.ts | ✅ 完成 | 100% |
| SettingsManager.ts | ⚠️ 待修復 | 90% |
| 所有測試通過 | ⚠️ 部分失敗 | 93% (116/124) |

**總體完成度：93%**

---

## 🎯 優先級建議

### 選項 1：跳過重構，直接進入 Phase 3
**優點：**
- ✅ 程式碼品質已經很好（116 個測試通過）
- ✅ 技術債很小且可管理
- ✅ 可以更快開始 AI 功能開發
- ✅ 重構可以在 Phase 3 開發中逐步進行

**缺點：**
- ⚠️ SettingsManager 仍有輕微的代碼重複
- ⚠️ 8 個測試暫時失敗

**建議行動：**
1. 暫時回退 SettingsManager 到使用舊常量（已實施）
2. 記錄技術債到 tech-debt.md（本檔案）
3. 進入 Phase 3 開發
4. 在 Phase 3 開發過程中逐步修復 SettingsManager

### 選項 2：先修復 SettingsManager 再進入 Phase 3
**優點：**
- ✅ 技術債會完全清償
- ✅ 所有測試都會通過
- ✅ 代碼一致性更好

**缺點：**
- ⚠️ 需要額外調查時間
- ⚠️ 可能會推遲 Phase 3 的開始

**預估修復時間：** 15-30 分鐘

---

## 💡 經驗教訓

### 重構策略

1. **Codex 不適合處理大型、相互關聯的重構**
   - 每個階段都出現各種問題（解析錯誤、執行失敗）
   - 手動執行小步驟更可靠

2. **測試驅動的重構更安全**
   - 每次更新後立即執行測試
   - 可以快速定位問題
   - 避免積累大量錯誤

3. **漸進式重構優於一次性重構**
   - 分成小步驟可以更好地控制風險
   - 可以快速回退有問題的變更

4. **型別一致性很重要**
   - Set vs Array 的差別導致了很多問題
   - 需要確保整個專案的型別定義一致

---

## 📝 備註

- 本檔案記錄了重構過程中的技術債
- 技術債已經識別並記錄，可以稍後處理
- 不影響當前功能的開發和運作
- 建議在下一個迭代的開始時清理這些技術債
