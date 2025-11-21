// NetrunnerDB 簡中整合版 - 背景腳本 (僅負責 PNP Data URL 代理)
console.log("★★★★ background.js PNP Service Worker 啟動! ★★★★"); 

/**
 * 獲取圖片 ArrayBuffer，並轉為 Data URL (Base64)。
 */
function urlToDataUrl(url) {
    return fetch(url)
        .then(response => {
            if (!response.ok) {
                console.error(`[SW] HTTP 錯誤! 狀態碼: ${response.status} (${response.statusText})`);
                throw new Error(`HTTP 錯誤! 狀態碼: ${response.status} (${response.statusText})`);
            }
            
            const contentType = response.headers.get("content-type") || "image/webp"; 
            
            return response.arrayBuffer().then(buffer => {
                let binary = '';
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }

                const base64 = btoa(binary);
                return `data:${contentType};base64,${base64}`;
            });
        })
        .catch(error => {
            console.error('[SW] Data URL 轉換失敗:', error);
            throw error;
        });
}


// 監聽來自 Content Script 的訊息 (僅處理 PNP 圖片請求)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === 'fetchImageAsDataUrl') {
        const { url, cardIndex, instanceIndex } = request;
        
        console.log(`[SW] 收到 PNP 圖片請求：開始 Fetch ${url.substring(url.lastIndexOf('/') + 1)}...`);

        urlToDataUrl(url)
            .then(dataUrl => {
                console.log(`[SW] Fetch 成功並轉換為 Data URL: ${url.substring(url.lastIndexOf('/') + 1)}`);
                sendResponse({
                    success: true,
                    dataUrl: dataUrl,
                    cardIndex: cardIndex,
                    instanceIndex: instanceIndex
                });
            })
            .catch(error => {
                const errorMessage = error.message || 'Service Worker failed to fetch image.';
                console.error(`[SW] 獲取 PNP 圖片失敗 (傳回失敗狀態): ${url.substring(url.lastIndexOf('/') + 1)}`);
                sendResponse({
                    success: false,
                    error: errorMessage,
                    cardIndex: cardIndex,
                    instanceIndex: instanceIndex
                });
            });

        return true; 
    }
});

chrome.action.onClicked.addListener((tab) => {
  // 當使用者點擊擴充功能圖示時，執行 content.js 中的翻譯函式
  chrome.tabs.sendMessage(tab.id, { action: "translate_page" });
});

console.log("✓ Service Worker Data URL proxy listener active.");