// popup.js 檔案 (最終版本：包含模式控制、單卡查詢、中文到英文批量翻譯)

// 全域變數
let zhToEnMap = {}; // 中文 -> 英文 映射 (Key: 中文卡名, Value: 英文卡名)
let chineseNames = []; // 用於自動完成

// ===================================================================
// A. 翻譯模式控制邏輯 (原有功能)
// ===================================================================

// 保存模式到 storage
async function saveCurrentMode(mode) {
  try {
    await chrome.storage.local.set({ 'netrunner_translate_mode': mode });
    // console.log(`模式已保存: ${mode}`);
  } catch (error) {
    console.error('保存模式失敗:', error);
  }
}


// 更新按鈕狀態
function updateButtonStates(currentMode) {
  // 獲取所有模式按鈕
  const zhOnlyBtn = document.getElementById('zhOnlyButton');
  const bilingualBtn = document.getElementById('bilingualButton');
  const restoreBtn = document.getElementById('restoreButton');

  // 重置所有按鈕樣式
  [zhOnlyBtn, bilingualBtn, restoreBtn].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });

  // 高亮當前模式按鈕
  const buttonMap = {
    'zh_only': zhOnlyBtn,
    'bilingual': bilingualBtn,
    'restore': restoreBtn
  };

  const activeButton = buttonMap[currentMode];
  if (activeButton) {
    activeButton.classList.add('active');
  }
}

// 載入並顯示當前模式
async function loadCurrentMode() {
  try {
    const result = await chrome.storage.local.get('netrunner_translate_mode');
    const currentMode = result.netrunner_translate_mode || 'zh_only';
    updateButtonStates(currentMode);
    return currentMode;
  } catch (error) {
    console.error('載入模式失敗:', error);
    updateButtonStates('zh_only');
  }
}


// 显示成功消息
function showSuccess(message) {
  showNotification(message, 'success');
}

// 显示错误消息
function showError(message) {
  showNotification(message, 'error');
}

// 显示通知
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        font-size: 14px;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        opacity: 0;
        transition: all 0.3s ease;
        max-width: 300px;
        text-align: center;
    `;
  notification.textContent = message;

  document.body.appendChild(notification);

  // 显示动画
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(-50%) translateY(0)';
  }, 100);

  // 自动隐藏
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(-50%) translateY(-20px)';
    setTimeout(() => {
      notification.parentNode?.removeChild(notification);
    }, 300);
  }, 3000);
}

async function handleTranslationModeChange(mode) {
  // 1. 永遠執行：儲存模式到 Storage
  await saveCurrentMode(mode);

  // 2. 永遠執行：更新 Popup 介面按鈕狀態

  // 3. 嘗試發送訊息給內容腳本 (在 RingsDB 頁面才嘗試)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab && tab.url && tab.url.includes('netrunnerdb.com')) {
      // *** 在 RingsDB 頁面：發送訊息給 content2.js 觸發即時翻譯 ***
      updateButtonStates(mode);
      await chrome.tabs.sendMessage(tab.id, { action: mode });
      showSuccess(`已切換至 ${mode} 模式並更新頁面。`);
    } else {
      // *** 在其他頁面：只顯示儲存成功 ***
      showError(`只在 netrunnerdb.com 頁面時才能設定。`);
    }
  } catch (error) {
    // 捕捉因內容腳本未載入或連線中斷而發生的錯誤 (即您看到的 [object Object] 錯誤)
    // 由於 storage 已更新，我們只需給出提示
    console.error('[Popup] 即時更新頁面失敗:', error);
    showSuccess(`模式已儲存為 ${mode}。但即時更新頁面失敗，請重新載入 netrunnerdb.com 頁面。`);
  }
}


// ===================================================================
// B. 中文查詢工具邏輯 (單卡查詢)
// ===================================================================

// 載入中文查詢資料 (只建立 中文到英文 的映射)
async function loadZhToEnMap() {
  try {
    const response = await fetch(chrome.runtime.getURL('translation.json'));
    const response2 = await fetch(chrome.runtime.getURL('translation2.json'));

    const enToZh = await response.json(); // 這是原始的 英文 Key -> 中文 Value 映射
    const enToZh2 = await response2.json();

    // 反轉映射以建立 中文到英文 映射 (zhToEnMap)
    zhToEnMap = { ...enToZh, ...enToZh2 };

    chineseNames = Object.keys(zhToEnMap); // 用於單卡查詢的自動完成
    // console.log('[Popup] 翻譯資料載入完成，共有 ' + chineseNames.length + ' 條卡牌名稱。');
  } catch (error) {
    console.error('載入翻譯資料失敗:', error);
  }
}

// 處理單卡查詢按鈕點擊
function handleQuery() {
  const chineseNameInput = document.getElementById('chineseNameInput');
  const resultDiv = document.getElementById('resultDiv');
  const query = chineseNameInput.value.trim();

  resultDiv.innerHTML = '';

  if (!query) {
    resultDiv.textContent = '請輸入卡牌名稱。';
    return;
  }

  // 從中文到英文的映射表中查詢
  const englishName = zhToEnMap[query];

  if (englishName) {
    resultDiv.innerHTML = `${englishName}`;
  } else {
    resultDiv.innerHTML = `未找到: 「${query}」`;
  }
}

// 設置自動完成功能
function setupAutocomplete() {
  const chineseNameInput = document.getElementById('chineseNameInput');
  const autocompleteList = document.getElementById('autocompleteList');

  if (!chineseNameInput || !autocompleteList) return;

  chineseNameInput.addEventListener('input', function () {
    const query = this.value.trim();
    autocompleteList.innerHTML = '';

    if (query.length < 1) {
      autocompleteList.style.display = 'none';
      return;
    }

    const filteredNames = chineseNames.filter(name => name.includes(query)).slice(0, 5); // 只顯示前 5 個

    if (filteredNames.length > 0) {
      filteredNames.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        li.addEventListener('click', () => {
          chineseNameInput.value = name;
          autocompleteList.innerHTML = '';
          autocompleteList.style.display = 'none';
          handleQuery(); // 自動完成後執行查詢
        });
        autocompleteList.appendChild(li);
      });
      autocompleteList.style.display = 'block';
    } else {
      autocompleteList.style.display = 'none';
    }
  });

  // 點擊外部關閉列表
  document.addEventListener('click', function (e) {
    if (e.target !== chineseNameInput) {
      autocompleteList.style.display = 'none';
    }
  });
}


// ===================================================================
// C. 牌表批量翻譯邏輯 (中文轉英文)
// ===================================================================

/**
 * 處理多行中文牌表輸入，並翻譯成英文。
 */
function handleBatchTranslate() {
  const decklistInput = document.getElementById('decklistInput');
  const batchResultDiv = document.getElementById('batchResultDiv');
  const inputText = decklistInput.value.trim();

  if (!inputText) {
    batchResultDiv.textContent = '請輸入牌表內容。';
    return;
  }
  const sourceMap = zhToEnMap;
  const sourceLangName = '中文';
  const targetLangName = '英文';

  // 将输入拆分成行
  const lines = inputText.split('\n').filter(line => line.trim() !== '');
  const translatedLines = [];

  // 先排序 key，长的优先（最大匹配原则）
  const sortedKeys = Object.keys(sourceMap).sort((a, b) => b.length - a.length);

  lines.forEach(line => {
    let tempLine = line;
    const tempMap = {}; // 原名 → 暂时标记

    sortedKeys.forEach((sourceName, idx) => {
      const translatedName = sourceMap[sourceName];
      const placeholder = `__TMP_${idx}__`; // 临时标记

      const regex = new RegExp(`(?<!\\S)${sourceName}(?!\\S)`, 'g');
      if (regex.test(tempLine)) {
        tempMap[placeholder] = translatedName;
        tempLine = tempLine.replace(regex, placeholder);
      }
    });

    // 最后再把标记换成翻译
    Object.keys(tempMap).forEach(placeholder => {
      tempLine = tempLine.replace(new RegExp(placeholder, 'g'), tempMap[placeholder]);
    });

    translatedLines.push(tempLine);
  });


  // 显示结果
  if (translatedLines.length > 0) {
    const resultText = translatedLines.join('\n');
    batchResultDiv.textContent = resultText;

    if (resultText.trim() === inputText.trim()) {
      batchResultDiv.textContent += `\n\n(提示: 所有行均未找到 ${sourceLangName} 到 ${targetLangName} 的翻译)`;
    }
  } else {
    batchResultDiv.textContent = '无法识别任何有效的牌表行。';
  }
}


// ===================================================================
// D. 初始化 (DOMContentLoaded)
// ===================================================================

document.addEventListener('DOMContentLoaded', async function () {
  // 1. 載入並初始化翻譯模式狀態
  await loadCurrentMode();

  // 2. 載入中文查詢資料 (建立 zhToEnMap)
  await loadZhToEnMap();

  // 3. 設置自動完成功能 (需在載入完 zhToEnMap 後執行)
  setupAutocomplete();

  // 4. 綁定翻譯模式按鈕事件
  document.getElementById('zhOnlyButton')?.addEventListener('click', () => handleTranslationModeChange('zh_only'));
  document.getElementById('bilingualButton')?.addEventListener('click', () => handleTranslationModeChange('bilingual'));
  document.getElementById('restoreButton')?.addEventListener('click', () => handleTranslationModeChange('restore'));

  // 5. 綁定中文查詢工具事件 (單卡查詢)
  document.getElementById('queryButton')?.addEventListener('click', handleQuery);

  // 6. 綁定牌表批量翻譯事件 (中文 → 英文)
  document.getElementById('batchTranslateButton')?.addEventListener('click', handleBatchTranslate);
});