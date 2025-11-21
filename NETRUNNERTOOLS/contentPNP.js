// NetrunnerDB 簡中整合版 Content Script - 處理翻譯與 PNP 邏輯   

(function () {
    'use strict';

    console.log('[Content Script] PNP/Translation Injector Started');

    // 檢查當前 URL
    const currentUrl = window.location.href;

    console.log(`[Content Script] 當前頁面: ${currentUrl}`);

    document.addEventListener('zhSimpGetImageEvent', async function (e) {
        if (e.detail && e.detail.action === 'getImage' && e.detail.url) {
            const { url, cardIndex, instanceIndex } = e.detail;

            chrome.runtime.sendMessage({
                action: 'fetchImageAsDataUrl',
                url: url,
                cardIndex: cardIndex,
                instanceIndex: instanceIndex
            }, function (response) {

                if (chrome.runtime.lastError) {
                    const errorMessage = chrome.runtime.lastError.message || 'Message port closed unexpectedly (Service Worker terminated).';
                    console.error('[PNP] 消息通道錯誤:', errorMessage);

                    document.dispatchEvent(new CustomEvent('zhSimpImageDataEvent', {
                        detail: {
                            success: false,
                            error: errorMessage,
                            cardIndex: cardIndex,
                            instanceIndex: instanceIndex
                        }
                    }));
                    return;
                }

                document.dispatchEvent(new CustomEvent('zhSimpImageDataEvent', {
                    detail: response
                }));
            });
        }
    });

    // 按鈕注入邏輯
    function injectZhSimpButton() {
        const originalPrintButton = document.getElementById('btn-print');

        if (originalPrintButton && !document.getElementById('btn-zh-simp-print')) {

            const newButtonHtml = `
              <div style="margin-top: 20px; margin-bottom: 20px;">
                  <button type="button" class="btn btn-primary btn-lg" id="btn-zh-simp-print" disabled="true" style="background-color: #764ba2; border-color: #764ba2; width: 100%;">
                      生成 簡中 PNP PDF
                  </button>
              </div>
              <div id="zh-simp-print-progress" class="progress" style="display: none; margin-top: 10px; height: 30px;">
                  <div id="zh-simp-print-progress-bar" class="progress-bar progress-bar-striped active" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%; line-height: 30px; font-weight: bold;">
                      0%
                  </div>
              </div>
          `;

            const originalButtonContainer = originalPrintButton.closest('div');
            if (originalButtonContainer) {
                originalButtonContainer.insertAdjacentHTML('afterend', newButtonHtml);
            } else {
                originalPrintButton.insertAdjacentHTML('afterend', newButtonHtml);
            }

            const newPrintButton = document.getElementById('btn-zh-simp-print');

            newPrintButton.addEventListener('click', function () {
                const event = new CustomEvent('zhSimpPrintEvent', {
                    detail: { action: 'doPrint' }
                });
                document.dispatchEvent(event);
            });

            const observer = new MutationObserver(function (mutations) {
                mutations.forEach(function (mutation) {
                    if (mutation.attributeName === 'disabled') {
                        newPrintButton.disabled = originalPrintButton.disabled;
                    }
                });
            });
            observer.observe(originalPrintButton, { attributes: true });

            newPrintButton.disabled = originalPrintButton.disabled;

            console.log('[PNP] Simplified Chinese PnP button injected.');
        }
    }

    // 等待原始按鈕並注入
    function waitForOriginalButtonAndInject() {
        const originalPrintButton = document.getElementById('btn-print');
        if (originalPrintButton) {
            injectZhSimpButton();
        } else {
            setTimeout(waitForOriginalButtonAndInject, 500);
        }
    }

    // 初始化 PNP 功能
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(waitForOriginalButtonAndInject, 50);
        });
    } else {
        waitForOriginalButtonAndInject();
    }

    console.log('[PNP] PNP 按鈕注入功能已啟動');


})();