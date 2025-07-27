/**
 * 图片设置管理模块
 * 提供图片加载参数的配置界面
 */

class ImageSettings {
    constructor() {
        this.settings = this.loadSettings();
        this.init();
    }

    /**
     * 初始化设置
     */
    init() {
        this.createSettingsModal();
        this.bindEvents();
    }

    /**
     * 加载设置
     */
    loadSettings() {
        const defaultSettings = {
            maxCacheSize: 50,
            maxImageSize: 2048,
            quality: 0.8,
            timeout: 30000,
            retryCount: 3,
            preloadCount: 3,
            enableCompression: true,
            enablePreload: true,
            enableCache: true
        };

        try {
            const saved = localStorage.getItem('imageSettings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch (error) {
            console.warn('加载图片设置失败，使用默认设置:', error);
            return defaultSettings;
        }
    }

    /**
     * 保存设置
     */
    saveSettings() {
        try {
            localStorage.setItem('imageSettings', JSON.stringify(this.settings));
            
            // 更新图片加载器配置
            if (window.imageLoader) {
                window.imageLoader.config = { ...this.settings };
            }
            
            console.log('图片设置已保存:', this.settings);
        } catch (error) {
            console.error('保存图片设置失败:', error);
        }
    }

    /**
     * 创建设置模态框
     */
    createSettingsModal() {
        const modal = document.createElement('div');
        modal.id = 'imageSettingsModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content settings-modal">
                <div class="modal-header">
                    <h3 class="modal-title">🖼️ 图片加载设置</h3>
                    <button class="modal-close" id="closeImageSettings">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="settings-section">
                        <h4>📦 缓存设置</h4>
                        <div class="setting-item">
                            <label>
                                <input type="checkbox" id="enableCache" ${this.settings.enableCache ? 'checked' : ''}>
                                启用图片缓存
                            </label>
                            <span class="setting-hint">缓存已加载的图片，提高切换速度</span>
                        </div>
                        <div class="setting-item">
                            <label for="maxCacheSize">最大缓存数量:</label>
                            <input type="range" id="maxCacheSize" min="10" max="100" value="${this.settings.maxCacheSize}">
                            <span id="maxCacheSizeValue">${this.settings.maxCacheSize}</span>
                        </div>
                    </div>

                    <div class="settings-section">
                        <h4>🔄 预加载设置</h4>
                        <div class="setting-item">
                            <label>
                                <input type="checkbox" id="enablePreload" ${this.settings.enablePreload ? 'checked' : ''}>
                                启用图片预加载
                            </label>
                            <span class="setting-hint">提前加载下一张图片，减少等待时间</span>
                        </div>
                        <div class="setting-item">
                            <label for="preloadCount">预加载数量:</label>
                            <input type="range" id="preloadCount" min="1" max="5" value="${this.settings.preloadCount}">
                            <span id="preloadCountValue">${this.settings.preloadCount}</span>
                        </div>
                    </div>

                    <div class="settings-section">
                        <h4>🗜️ 压缩设置</h4>
                        <div class="setting-item">
                            <label>
                                <input type="checkbox" id="enableCompression" ${this.settings.enableCompression ? 'checked' : ''}>
                                启用图片压缩
                            </label>
                            <span class="setting-hint">压缩大图片以减少内存占用</span>
                        </div>
                        <div class="setting-item">
                            <label for="maxImageSize">最大图片尺寸 (像素):</label>
                            <input type="range" id="maxImageSize" min="1024" max="4096" step="256" value="${this.settings.maxImageSize}">
                            <span id="maxImageSizeValue">${this.settings.maxImageSize}</span>
                        </div>
                        <div class="setting-item">
                            <label for="quality">压缩质量:</label>
                            <input type="range" id="quality" min="0.1" max="1" step="0.1" value="${this.settings.quality}">
                            <span id="qualityValue">${Math.round(this.settings.quality * 100)}%</span>
                        </div>
                    </div>

                    <div class="settings-section">
                        <h4>⏱️ 超时设置</h4>
                        <div class="setting-item">
                            <label for="timeout">加载超时时间 (秒):</label>
                            <input type="range" id="timeout" min="10" max="60" value="${this.settings.timeout / 1000}">
                            <span id="timeoutValue">${this.settings.timeout / 1000}</span>
                        </div>
                        <div class="setting-item">
                            <label for="retryCount">重试次数:</label>
                            <input type="range" id="retryCount" min="1" max="5" value="${this.settings.retryCount}">
                            <span id="retryCountValue">${this.settings.retryCount}</span>
                        </div>
                    </div>

                    <div class="settings-section">
                        <h4>📊 统计信息</h4>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-label">缓存图片数:</span>
                                <span class="stat-value" id="cacheStats">-</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">正在加载:</span>
                                <span class="stat-value" id="loadingStats">-</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">内存使用:</span>
                                <span class="stat-value" id="memoryStats">-</span>
                            </div>
                        </div>
                        <div class="settings-actions">
                            <button class="btn btn-secondary" id="clearCache">清空缓存</button>
                            <button class="btn btn-secondary" id="resetSettings">重置设置</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="modal-button secondary" id="cancelImageSettings">取消</button>
                    <button class="modal-button primary" id="saveImageSettings">保存设置</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 关闭按钮
        document.getElementById('closeImageSettings')?.addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('cancelImageSettings')?.addEventListener('click', () => {
            this.hideModal();
        });

        // 保存按钮
        document.getElementById('saveImageSettings')?.addEventListener('click', () => {
            this.saveCurrentSettings();
            this.hideModal();
        });

        // 清空缓存
        document.getElementById('clearCache')?.addEventListener('click', () => {
            this.clearCache();
        });

        // 重置设置
        document.getElementById('resetSettings')?.addEventListener('click', () => {
            this.resetSettings();
        });

        // 范围滑块事件
        this.bindRangeEvents();
    }

    /**
     * 绑定范围滑块事件
     */
    bindRangeEvents() {
        const ranges = [
            { id: 'maxCacheSize', valueId: 'maxCacheSizeValue' },
            { id: 'preloadCount', valueId: 'preloadCountValue' },
            { id: 'maxImageSize', valueId: 'maxImageSizeValue' },
            { id: 'quality', valueId: 'qualityValue', transform: (v) => Math.round(v * 100) + '%' },
            { id: 'timeout', valueId: 'timeoutValue', transform: (v) => v },
            { id: 'retryCount', valueId: 'retryCountValue' }
        ];

        ranges.forEach(({ id, valueId, transform }) => {
            const range = document.getElementById(id);
            const value = document.getElementById(valueId);
            
            if (range && value) {
                range.addEventListener('input', () => {
                    const val = range.value;
                    value.textContent = transform ? transform(val) : val;
                });
            }
        });
    }

    /**
     * 显示设置模态框
     */
    showModal() {
        const modal = document.getElementById('imageSettingsModal');
        if (modal) {
            modal.classList.add('show');
            this.updateStats();
        }
    }

    /**
     * 隐藏设置模态框
     */
    hideModal() {
        const modal = document.getElementById('imageSettingsModal');
        if (modal) {
            modal.classList.remove('show');
        }
    }

    /**
     * 保存当前设置
     */
    saveCurrentSettings() {
        this.settings = {
            enableCache: document.getElementById('enableCache')?.checked ?? true,
            maxCacheSize: parseInt(document.getElementById('maxCacheSize')?.value ?? 50),
            enablePreload: document.getElementById('enablePreload')?.checked ?? true,
            preloadCount: parseInt(document.getElementById('preloadCount')?.value ?? 3),
            enableCompression: document.getElementById('enableCompression')?.checked ?? true,
            maxImageSize: parseInt(document.getElementById('maxImageSize')?.value ?? 2048),
            quality: parseFloat(document.getElementById('quality')?.value ?? 0.8),
            timeout: parseInt(document.getElementById('timeout')?.value ?? 30) * 1000,
            retryCount: parseInt(document.getElementById('retryCount')?.value ?? 3)
        };

        this.saveSettings();
        this.showNotification('设置已保存');
    }

    /**
     * 清空缓存
     */
    clearCache() {
        if (window.imageLoader) {
            window.imageLoader.clearAllCache();
            this.updateStats();
            this.showNotification('缓存已清空');
        }
    }

    /**
     * 重置设置
     */
    resetSettings() {
        if (confirm('确定要重置所有图片设置吗？')) {
            localStorage.removeItem('imageSettings');
            this.settings = this.loadSettings();
            this.updateStats();
            this.showNotification('设置已重置');
        }
    }

    /**
     * 更新统计信息
     */
    updateStats() {
        if (window.imageLoader) {
            const stats = window.imageLoader.getCacheStats();
            document.getElementById('cacheStats').textContent = stats.cacheSize;
            document.getElementById('loadingStats').textContent = stats.loadingCount;
            
            // 估算内存使用（粗略计算）
            const estimatedMemory = (stats.cacheSize * 2).toFixed(1); // 假设每张图片平均2MB
            document.getElementById('memoryStats').textContent = `${estimatedMemory} MB`;
        }
    }

    /**
     * 显示通知
     */
    showNotification(message) {
        if (window.modalManager) {
            window.modalManager.showAlert({
                title: '设置',
                message: message,
                buttonClass: 'primary'
            });
        } else {
            alert(message);
        }
    }

    /**
     * 获取当前设置
     */
    getSettings() {
        return this.settings;
    }

    /**
     * 更新设置
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
    }
}

// 创建全局实例
window.imageSettings = new ImageSettings(); 