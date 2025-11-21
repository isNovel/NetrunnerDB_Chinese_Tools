// inject.js - 簡中整合版 PNP 核心邏輯 + 翻譯網路攔截 (在頁面的 MAIN world 執行)
(function() {
  'use strict';
  
  console.log('\n═══════════════════════════════════════════');
  console.log('🎴 NETRUNNER PNP ZH SIMP INJECTOR ACTIVE (Main World)');
  console.log('═══════════════════════════════════════════\n');
  
  // ====================================================================
  // A. 翻譯網路攔截邏輯 (只在非 PNP 頁面執行)
  // ====================================================================
  
  let translations = {};
  let caseInsensitiveTranslations = {};
  let translationRegex = null;
  let currentMode = 'zh_only';
  let isInterceptEnabled = true;
  
  // 監聽來自 content.js 的翻譯資料和模式設定
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    if (event.data.type === 'NETRUNNER_TRANSLATION_DATA') {
      translations = event.data.translations;
      caseInsensitiveTranslations = event.data.caseInsensitiveTranslations;
      
      // 重建 regex
      if (event.data.translationRegex) {
        translationRegex = new RegExp(event.data.translationRegex, event.data.translationRegexFlags);
      }
      
      console.log('[Translation-Inject] 收到翻譯資料，共', Object.keys(translations).length, '條');
    }
    
    if (event.data.type === 'NETRUNNER_TRANSLATION_MODE') {
      if (event.data.mode === 'pnp_page_no_translate') {
        isInterceptEnabled = false;
        console.log('[Translation-Inject] 這是 PNP 頁面，關閉翻譯攔截');
      } else {
        currentMode = event.data.mode;
        isInterceptEnabled = event.data.isInterceptEnabled !== undefined ? event.data.isInterceptEnabled : true;
        console.log('[Translation-Inject] 翻譯模式已更新為:', currentMode, '，攔截狀態:', isInterceptEnabled);
      }
    }
  });
  
  // 替換文字內容的函數
  function translateText(text, mode = 'zh_only') {
    if (!translationRegex || !text || mode === 'restore' || !isInterceptEnabled) return text;
    
    return text.replace(translationRegex, (match) => {
      const translation = caseInsensitiveTranslations[match.toLowerCase()];
      if (translation) {
        if (mode === 'zh_only') {
          return translation;
        } else if (mode === 'bilingual') {
          return `${match} (${translation})`;
        }
      }
      return match;
    });
  }
  
  // 攔截 XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._url = url;
    return originalXHROpen.call(this, method, url, ...args);
  };
  
  XMLHttpRequest.prototype.send = function(...args) {
    const xhr = this;
    this.addEventListener('readystatechange', function() {
      if (this.readyState === 4 && this.status === 200 && isInterceptEnabled && 
          (currentMode === 'zh_only' || currentMode === 'bilingual')) {
        const contentType = this.getResponseHeader('content-type') || '';
        if (contentType.includes('text/html') || contentType.includes('application/json')) {
          const originalResponse = this.responseText;
          if (originalResponse && typeof originalResponse === 'string') {
            const translatedResponse = translateText(originalResponse, currentMode);
            
            // 替換 responseText
            try {
              Object.defineProperty(this, 'responseText', {
                writable: false,
                value: translatedResponse
              });
            } catch (e) {
              console.error('[Translation-Inject] XHR responseText 替換失敗:', e);
            }
          }
        }
      }
    });
    
    return originalXHRSend.call(this, ...args);
  };
  
  // 攔截 fetch API
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    
    // 支援中文和中英對照模式的攔截
    if (isInterceptEnabled && (currentMode === 'zh_only' || currentMode === 'bilingual')) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        try {
          const originalText = await response.clone().text();
          const translatedText = translateText(originalText, currentMode);
          
          const newResponse = new Response(translatedText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
          
          return newResponse;
        } catch (e) {
          console.error('[Translation-Inject] Fetch 翻譯錯誤:', e);
          return response;
        }
      }
    }
    
    return response;
  };
  
  console.log('[Translation-Inject] 網路攔截已啟動 (fetch & XHR)');
  
  // ====================================================================
  // B. PNP 按鈕注入與圖片代理轉發邏輯 (保持不變)
  // ====================================================================
  
  // 🚨 關鍵：全域模式開關，用於控制 retrieve_cards 是否替換 URL (由 do_print_zh_simp 控制)
  window.zhSimpPrintMode = false;

  // 替換URL的函數 (修正版 for Multi-Side Cards)
  function replaceImageUrl(url) {
    if (!url) return url;
    
    // 捕獲完整的卡牌代碼 (e.g., "25001", "26066", "26066-0")
    const pattern = /^https:\/\/card-images\.netrunnerdb\.com\/v2\/xlarge\/([0-9]+-?[0-9]*)\.(webp|png)$/;
    const match = url.match(pattern);
    
    if (match) {
      const cardCodeWithSuffix = match[1]; // e.g., "26066", "26066-0", "25001"
      // 您提供的多面卡基本代碼列表
      const multiSideBaseCodes = ["26066", "26120", "35023", "35057"];
      
      let newCardCode = cardCodeWithSuffix;
      
      if (cardCodeWithSuffix.endsWith('-0')) {
          // 處理背面卡 (e.g., 26066-0 -> 26066-back)
          const baseCode = cardCodeWithSuffix.substring(0, cardCodeWithSuffix.length - 2); 
          if (multiSideBaseCodes.includes(baseCode)) {
              newCardCode = `${baseCode}-back`; 
              console.log(`[PNP-Fix] Multi-side BACK: ${cardCodeWithSuffix} -> ${newCardCode}`);
          }
      } else if (multiSideBaseCodes.includes(cardCodeWithSuffix)) {
          // 處理正面卡 (e.g., 26066 -> 26066-front)
          // 確保 URL 結尾是代碼本身 (e.g. 26066.webp)，而非帶有其他後綴
          if (url.endsWith(`${cardCodeWithSuffix}.webp`) || url.endsWith(`${cardCodeWithSuffix}.png`)) {
              newCardCode = `${cardCodeWithSuffix}-front`; 
              console.log(`[PNP-Fix] Multi-side FRONT: ${cardCodeWithSuffix} -> ${newCardCode}`);
          }
      }
      
      // 非多面卡或已處理的多面卡，使用最終的代碼路徑
      return `https://play.sneakdoorbeta.net/img/cards/zh-simp/default/stock/${newCardCode}.webp`;
    }
    return url;
  }

  // ===== 1. 攔截 retrieve_cards 函數 (精準控制 URL 替換) =====
  let retrieveInterval = setInterval(function() {
    
    if (typeof window.retrieve_cards === 'function') {
      clearInterval(retrieveInterval);
      
      const originalRetrieveCards = window.retrieve_cards;
      
      window.retrieve_cards = function() {
        const cards = originalRetrieveCards.apply(this, arguments);
        
        // 🚨 僅在 zhSimpPrintMode 為 true 時才進行 URL 替換
        if (!window.zhSimpPrintMode) {
            return cards;
        }

        console.log('retrieve_cards: 簡中 PNP 模式啟動，正在替換 URL...');
        const modified = cards.map(card => {
          if (card.image_url) {
            const original = card.image_url;
            const replaced = replaceImageUrl(original); 
            
            return {...card, image_url: replaced};
          }
          return card;
        });
        
        return modified;
      };
      
      console.log('✓ retrieve_cards hooked for PNP URL replacement.');
    }
  }, 200);


  // ====================================================================
  // 2. PNP PDF 生成類別與方法 (此處保持不變)
  // ====================================================================

  class PNP_CORS_FIXED {
    // 構造函數
    constructor (cutmarks, format, bleed) {
      this.settings = { cutmarks, format, bleed };
      const { jsPDF } = window.jspdf;
      this.doc = new jsPDF({ unit: "mm", format: this.settings.format });
      this.MIN_MARGIN = 6.35;
      this.CARD_WIDTH = 63.5;
      this.CARD_HEIGHT = 88.9;

      this.page_width = this.doc.internal.pageSize.getWidth();
      this.page_height = this.doc.internal.pageSize.getHeight();

      if(this.settings.bleed > 0) {
        let scale_width = ((this.page_width - this.MIN_MARGIN*2 - this.settings.bleed*2)/3)/this.CARD_WIDTH;
        let scale_height = ((this.page_height - this.MIN_MARGIN*2 - this.settings.bleed*2)/3)/this.CARD_HEIGHT;
        let scale = Math.min(scale_width, scale_height);
        this.CARD_WIDTH *= scale;
        this.CARD_HEIGHT *= scale;
      }
      this.MARGIN_LEFT = (this.page_width - (this.CARD_WIDTH*3 + this.settings.bleed*2))/2;
      this.MARGIN_TOP = (this.page_height - (this.CARD_HEIGHT*3 + this.settings.bleed*2))/2;
    }
    
    draw_cutlines() { 
        for(let p = 1; p <= this.doc.getNumberOfPages(); p++) {
            this.doc.setPage(p);
            for(let i = 0; i < 4; i++) {
                let y = this.MARGIN_TOP + this.CARD_HEIGHT*i + (this.settings.bleed*i) - this.settings.bleed/2;
                this.doc.line(0, y, this.page_width, y);
            }
            for(let i = 0; i < 4; i++) {
                let x = this.MARGIN_LEFT + this.CARD_WIDTH*i + (this.settings.bleed*i) - this.settings.bleed/2;
                this.doc.line(x, 0, x, this.page_height);
            }
        }
    }
    draw_cutmarks(padding) {
        for(let p = 1; p <= this.doc.getNumberOfPages(); p++) {
            this.doc.setPage(p);
            for(let row = 0; row < 4; row++) {
                for(let col = 0; col < 4; col++) {
                    let x = this.MARGIN_LEFT + this.CARD_WIDTH*col + this.settings.bleed*Math.min(2, col);
                    let y = this.MARGIN_TOP + this.CARD_HEIGHT*row + this.settings.bleed*Math.min(2, row);
                    if(row == 0) {
                        this.doc.line(x, 0, x, this.MARGIN_TOP - padding);
                        if(col == 1 || col == 2) {
                            this.doc.line(x - this.settings.bleed, 0, x - this.settings.bleed, this.MARGIN_TOP - padding);
                        }
                    }
                    if(col == 0) {
                        this.doc.line(0, y, this.MARGIN_LEFT - padding, y);
                        if(row == 1 || row == 2) {
                            this.doc.line(0, y - this.settings.bleed, this.MARGIN_LEFT - padding, y - this.settings.bleed);
                        }
                    }
                    if(row == 3) {
                        this.doc.line(x, this.MARGIN_TOP + this.CARD_HEIGHT*row + this.settings.bleed*2 + padding, x, this.page_height);
                        if(col == 1 || col == 2) {
                            this.doc.line(x - this.settings.bleed, this.MARGIN_TOP + this.CARD_HEIGHT*row + this.settings.bleed*2 + padding, x - this.settings.bleed, this.page_height);
                        }
                    }
                    if(col == 3) {
                        this.doc.line(this.MARGIN_LEFT + this.CARD_WIDTH*col + this.settings.bleed*2 + padding, y, this.page_width, y);
                        if(row == 1 || row == 2) {
                            this.doc.line(this.MARGIN_LEFT + this.CARD_WIDTH*col + this.settings.bleed*2 + padding, y - this.settings.bleed, this.page_width, y - this.settings.bleed);
                        }
                    }
                }
            }
        }
    }


    // 核心的 print 函數
    print(done_callback = null){
      const cards = window.retrieve_cards(); 
      let count = 0;
      const that = this;
      const progress_bar = document.querySelector("#zh-simp-print-progress-bar"); 

      const progressContainer = document.querySelector("#zh-simp-print-progress");
      if (progressContainer) {
          progressContainer.style.display = "block";
      }
      if (progress_bar) {
          progress_bar.style.width = '0%';
      }

      let cardInstances = [];
      cards.forEach((card, cardIndex) => {
          for(let i = 0; i < card.qty; i++) {
              cardInstances.push({
                  url: card.image_url,
                  cardIndex: cardIndex,      
                  instanceIndex: i           
              });
          }
      });
      
      let currentInstance = 0;
      
      // 非同步圖片處理循環
      const pnp_print_loop = () => {
          if (currentInstance >= cardInstances.length) {
              // 所有卡牌處理完成
              switch(that.settings.cutmarks) {
                  case "Lines": that.draw_cutlines(); break;
                  case "Marks": that.draw_cutmarks(/*padding*/ 2); break;
              }
              that.doc.save(`NetrunnerDB_zh_simp_PnP_${new Date().toISOString().slice(0, 10)}.pdf`);
              
              document.removeEventListener('zhSimpImageDataEvent', handleImageData);
              if (done_callback) done_callback();
              
              // 🚨 關鍵：生成完成後關閉替換模式
              window.zhSimpPrintMode = false; 
              return;
          }
          
          const instance = cardInstances[currentInstance];
          
          if (count == 9) {
              count = 0;
              that.doc.addPage(that.settings.format);
          }
          
          // 發送圖片請求給 Content Script
          document.dispatchEvent(new CustomEvent('zhSimpGetImageEvent', {
              detail: {
                  action: 'getImage',
                  url: instance.url,
                  cardIndex: instance.cardIndex,
                  instanceIndex: instance.instanceIndex 
              }
          }));
      };
      
      // 處理來自 Content Script 的 Data URL 回傳
      const handleImageData = (e) => {
          if (!e.detail || e.detail.cardIndex === undefined || e.detail.instanceIndex === undefined) return;

          const receivedIndex = cardInstances.findIndex(inst => 
              inst.cardIndex === e.detail.cardIndex && inst.instanceIndex === e.detail.instanceIndex
          );
          
          if (receivedIndex !== currentInstance) {
              return; 
          }
          
          // 更新進度條
          const new_progress = ((currentInstance + 1) / cardInstances.length) * 100;
          if (progress_bar) {
              progress_bar.style.width = `${new_progress}%`;
              progress_bar.setAttribute('aria-valuenow', new_progress);
              progress_bar.textContent = `${Math.round(new_progress)}%`;
          }

          if (e.detail.success && e.detail.dataUrl) {
              const dataUrl = e.detail.dataUrl;
              
              let row = Math.floor(count / 3);
              let col = count % 3;
              
              const img = new Image(); 
              
              img.onload = () => {
                  console.log(`[PNP] 圖片載入完成，將添加到 PDF: ${currentInstance + 1} / ${cardInstances.length}`);
                  
                  that.doc.addImage(img, "WEBP",
                      that.MARGIN_LEFT + that.CARD_WIDTH * col + that.settings.bleed * (col),
                      that.MARGIN_TOP + that.CARD_HEIGHT * row + that.settings.bleed * (row),
                      that.CARD_WIDTH, that.CARD_HEIGHT, '', 'FAST');

                  count++;
                  currentInstance++;
                  setTimeout(pnp_print_loop, 0); 
              };

              img.onerror = () => {
                  console.error(`[PNP] Data URL 載入失敗 (圖片轉換成功但addImage失敗)，將跳過此圖。`);
                  count++;
                  currentInstance++;
                  setTimeout(pnp_print_loop, 0);
              };

              img.src = dataUrl; 
              
          } else {
              console.error(`[PNP] 圖片代理服務失敗: ${e.detail.error || '未知錯誤'}，將跳過此圖。`);
              count++;
              currentInstance++;
              setTimeout(pnp_print_loop, 0); 
          }
      };
      
      // 開始監聽 Data URL 回應
      document.addEventListener('zhSimpImageDataEvent', handleImageData);

      pnp_print_loop(); // 開始循環
    }
  }
      
  // ----------------------------------------------------------------------
  // 3. 公共函數 (MAIN WORLD)
  // ----------------------------------------------------------------------

  window.print_zh_simp_button_busy = function() {
      const elem = document.querySelector("#btn-zh-simp-print");
      if (!elem) return;
      elem.dataset.originalHtml = elem.innerHTML;
      elem.disabled = true;
      elem.innerHTML = '<span class="glyphicon glyphicon-refresh spinning"></span> 正在生成中文 PNP...';
  }

  window.print_zh_simp_button_done = function() {
      const elem = document.querySelector("#btn-zh-simp-print");
      if (!elem) return;
      elem.disabled = false;
      elem.innerHTML = elem.dataset.originalHtml;
      const progressContainer = document.querySelector("#zh-simp-print-progress");
      if (progressContainer) progressContainer.style.display = "none";
  }

  window.do_print_zh_simp = function() {
      console.log('do_print_zh_simp: 啟動簡中 PNP PDF 生成');
      
      if (!window.jspdf || !window.NRDB || !window.NRDB.settings) {
          alert('錯誤: 頁面核心函式庫 (jspdf 或 NRDB) 尚未載入。');
          return;
      }
      
      // 🚨 關鍵：在開始生成前開啟替換模式
      window.zhSimpPrintMode = true;

      window.print_zh_simp_button_busy();
      
      let bleed = 0;
      switch (NRDB.settings.getItem("pnp-bleed")) {
        case "Narrow":
          bleed = 3;
          break;
        case "Wide":
          bleed = 6;
          break;
      }
      
      const pnp = new PNP_CORS_FIXED(
          NRDB.settings.getItem("pnp-cut-marks"),
          NRDB.settings.getItem("pnp-page-format"),
          bleed
      );
      
      pnp.print(window.print_zh_simp_button_done);
  }

  document.addEventListener('zhSimpPrintEvent', function(e) {
      if (e.detail && e.detail.action === 'doPrint') {
          window.do_print_zh_simp();
      }
  });

})();