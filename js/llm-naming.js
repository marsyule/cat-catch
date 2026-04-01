/**
 * 大模型智能命名模块
 * 用于调用 LLM API 生成友好的文件名
 */

const LLMNaming = {
    // 缓存已生成的文件名，避免重复调用
    cache: new Map(),
    // 正在进行的请求
    pendingRequests: new Map(),
    // 请求队列和限流
    requestQueue: [],
    isProcessingQueue: false,
    maxConcurrentRequests: 3,
    currentRequests: 0,

    /**
     * 调用 LLM API 生成文件名
     * @param {Object} data - 资源数据
     * @param {Object} context - 页面上下文
     * @returns {Promise<string|null>} - 生成的文件名，失败返回 null
     */
    async generateFilename(data, context) {
        if (!G.llmNaming || !G.llmApiUrl) {
            return null;
        }

        // 生成缓存键
        const cacheKey = this.getCacheKey(data, context);

        // 检查缓存
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        // 检查是否有正在进行的相同请求
        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        // 限流：如果并发请求过多，加入队列
        if (this.currentRequests >= this.maxConcurrentRequests) {
            return new Promise((resolve) => {
                this.requestQueue.push({ data, context, resolve });
            });
        }

        // 创建新请求
        this.currentRequests++;
        const requestPromise = this._callAPI(data, context);
        this.pendingRequests.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            if (result) {
                // 缓存结果（最多缓存100条）
                if (this.cache.size >= 100) {
                    const firstKey = this.cache.keys().next().value;
                    this.cache.delete(firstKey);
                }
                this.cache.set(cacheKey, result);
            }
            return result;
        } finally {
            this.pendingRequests.delete(cacheKey);
            this.currentRequests--;
            // 处理队列中的下一个请求
            this.processQueue();
        }
    },

    /**
     * 处理请求队列
     */
    processQueue() {
        if (this.requestQueue.length > 0 && this.currentRequests < this.maxConcurrentRequests) {
            const { data, context, resolve } = this.requestQueue.shift();
            this.generateFilename(data, context).then(resolve);
        }
    },

    /**
     * 实际调用 API
     */
    async _callAPI(data, context) {
        const prompt = this.buildPrompt(data, context);

        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            // 添加 Authorization 头
            if (G.llmApiKey) {
                headers['Authorization'] = `Bearer ${G.llmApiKey}`;
            }

            const response = await fetch(G.llmApiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    model: G.llmModel,
                    messages: [
                        {
                            role: 'system',
                            content: '你是一个文件命名助手，请根据用户提供的信息生成简洁友好的文件名。只返回文件名本身，不要包含扩展名，不要有引号、括号或其他解释性文字。文件名应该简短、有意义、适合作为文件名使用。'
                        },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 50,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                console.error('LLM API error:', response.status, response.statusText);
                return null;
            }

            const result = await response.json();

            if (result.choices && result.choices[0] && result.choices[0].message) {
                let filename = result.choices[0].message.content;
                // 检查内容是否为空
                if (!filename || typeof filename !== 'string') {
                    console.error('LLM API returned empty content');
                    return null;
                }
                filename = filename.trim();
                // 清理文件名中的非法字符
                filename = this.sanitizeFilename(filename);
                return filename;
            }

            console.error('LLM API unexpected response format:', result);
            return null;
        } catch (e) {
            console.error('LLM naming error:', e);
            return null;
        }
    },

    /**
     * 构建提示词
     * @param {Object} data - 资源数据
     * @param {Object} context - 页面上下文
     * @returns {string} - 构建好的提示词
     */
    buildPrompt(data, context) {
        let content = G.llmPrompt + '\n\n';

        // 基础信息
        content += `网页标题: ${data.title || '未知'}\n`;
        content += `资源类型: ${data.type || data.ext || '未知'}\n`;

        // 添加 URL 域名信息
        if (data.webUrl) {
            try {
                const url = new URL(data.webUrl);
                content += `来源网站: ${url.hostname}\n`;
            } catch (e) {
                content += `来源网址: ${data.webUrl}\n`;
            }
        }

        // 页面描述信息
        if (context.metaDescription) {
            content += `页面描述: ${context.metaDescription}\n`;
        }
        if (context.ogTitle && context.ogTitle !== data.title) {
            content += `分享标题: ${context.ogTitle}\n`;
        }
        if (context.ogDescription && context.ogDescription !== context.metaDescription) {
            content += `分享描述: ${context.ogDescription}\n`;
        }

        // 根据上下文级别添加信息
        if (G.llmContextLevel >= 1 && context.pageElements) {
            content += `\n页面关键元素:\n${context.pageElements}\n`;
        }

        if (G.llmContextLevel >= 2 && context.pageContent) {
            const contentPreview = context.pageContent.substring(0, 500);
            content += `\n页面内容摘要:\n${contentPreview}\n`;
        }

        return content;
    },

    /**
     * 提取页面上下文
     * @param {number} tabId - 标签页ID
     * @returns {Promise<Object>} - 页面上下文信息
     */
    async extractContext(tabId) {
        return new Promise((resolve) => {
            if (!tabId || tabId <= 0) {
                resolve({});
                return;
            }

            chrome.tabs.sendMessage(tabId, { Message: 'getPageContext' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Get page context error:', chrome.runtime.lastError);
                    resolve({});
                    return;
                }
                resolve(response || {});
            });
        });
    },

    /**
     * 生成缓存键
     */
    getCacheKey(data, context) {
        // 加入 URL 避免不同页面相同标题导致缓存冲突
        const urlHost = data.webUrl ? new URL(data.webUrl).hostname : '';
        const key = `${urlHost}_${data.title || ''}_${data.ext || ''}_${context.metaDescription?.substring(0, 50) || ''}`;
        return key.substring(0, 100);
    },

    /**
     * 清理文件名中的非法字符
     * @param {string} filename - 原始文件名
     * @returns {string} - 清理后的文件名
     */
    sanitizeFilename(filename) {
        // 移除文件名中的非法字符
        filename = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '');
        // 移除引号
        filename = filename.replace(/["']/g, '');
        // 移除前后空格
        filename = filename.trim();
        // 限制长度
        if (filename.length > 100) {
            filename = filename.substring(0, 100);
        }
        // 如果清理后为空，返回默认名称
        if (!filename) {
            filename = '未命名';
        }
        return filename;
    },

    /**
     * 清空缓存
     */
    clearCache() {
        this.cache.clear();
    }
};
