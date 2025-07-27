/**
 * 加载状态指示器模块
 * 提供图片加载进度显示和状态管理
 */

class LoadingIndicator {
    constructor() {
        this.indicators = new Map();
        this.globalIndicator = null;
        this.init();
    }

    /**
     * 初始化加载指示器
     */
    init() {
        this.createGlobalIndicator();
        this.bindEvents();
    }

    /**
     * 创建全局加载指示器
     */
    createGlobalIndicator() {
        // 创建全局加载指示器
        const globalIndicator = document.createElement('div');
        globalIndicator.id = 'globalLoadingIndicator';
        globalIndicator.className = 'loading-indicator global';
        globalIndicator.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner-ring"></div>
            </div>
            <div class="loading-text">正在加载...</div>
            <div class="loading-progress">
                <div class="progress-bar">
                    <div class="progress-fill"></div>
                </div>
                <div class="progress-text">0%</div>
            </div>
        `;
        
        document.body.appendChild(globalIndicator);
        this.globalIndicator = globalIndicator;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 监听页面可见性变化
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pauseAllIndicators();
            } else {
                this.resumeAllIndicators();
            }
        });
    }

    /**
     * 显示全局加载指示器
     * @param {Object} options - 选项
     */
    showGlobal(options = {}) {
        const {
            text = '正在加载...',
            progress = 0,
            showProgress = true
        } = options;

        this.globalIndicator.querySelector('.loading-text').textContent = text;
        this.globalIndicator.querySelector('.progress-fill').style.width = `${progress}%`;
        this.globalIndicator.querySelector('.progress-text').textContent = `${Math.round(progress)}%`;
        
        if (showProgress) {
            this.globalIndicator.querySelector('.loading-progress').style.display = 'block';
        } else {
            this.globalIndicator.querySelector('.loading-progress').style.display = 'none';
        }
        
        this.globalIndicator.classList.add('show');
    }

    /**
     * 隐藏全局加载指示器
     */
    hideGlobal() {
        this.globalIndicator.classList.remove('show');
    }

    /**
     * 更新全局加载进度
     * @param {number} progress - 进度百分比 (0-100)
     * @param {string} text - 进度文本
     */
    updateGlobalProgress(progress, text = null) {
        this.globalIndicator.querySelector('.progress-fill').style.width = `${progress}%`;
        this.globalIndicator.querySelector('.progress-text').textContent = `${Math.round(progress)}%`;
        
        if (text) {
            this.globalIndicator.querySelector('.loading-text').textContent = text;
        }
    }

    /**
     * 创建图片加载指示器
     * @param {string} imageId - 图片ID
     * @param {HTMLElement} container - 容器元素
     * @returns {HTMLElement} 指示器元素
     */
    createImageIndicator(imageId, container) {
        const indicator = document.createElement('div');
        indicator.className = 'loading-indicator image';
        indicator.dataset.imageId = imageId;
        indicator.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner-ring"></div>
            </div>
            <div class="loading-text">加载中...</div>
            <div class="loading-error" style="display: none;">
                <div class="error-icon">⚠️</div>
                <div class="error-text">加载失败</div>
                <button class="retry-btn">重试</button>
            </div>
        `;
        
        container.appendChild(indicator);
        this.indicators.set(imageId, indicator);
        
        // 绑定重试按钮事件
        const retryBtn = indicator.querySelector('.retry-btn');
        retryBtn.addEventListener('click', () => {
            this.triggerRetry(imageId);
        });
        
        return indicator;
    }

    /**
     * 显示图片加载指示器
     * @param {string} imageId - 图片ID
     * @param {HTMLElement} container - 容器元素
     */
    showImageIndicator(imageId, container) {
        let indicator = this.indicators.get(imageId);
        
        if (!indicator) {
            indicator = this.createImageIndicator(imageId, container);
        }
        
        indicator.classList.add('show');
        indicator.querySelector('.loading-error').style.display = 'none';
        indicator.querySelector('.loading-spinner').style.display = 'block';
        indicator.querySelector('.loading-text').textContent = '加载中...';
    }

    /**
     * 隐藏图片加载指示器
     * @param {string} imageId - 图片ID
     */
    hideImageIndicator(imageId) {
        const indicator = this.indicators.get(imageId);
        if (indicator) {
            indicator.classList.remove('show');
        }
    }

    /**
     * 显示图片加载错误
     * @param {string} imageId - 图片ID
     * @param {string} errorMessage - 错误信息
     */
    showImageError(imageId, errorMessage = '加载失败') {
        const indicator = this.indicators.get(imageId);
        if (indicator) {
            indicator.querySelector('.loading-spinner').style.display = 'none';
            indicator.querySelector('.loading-error').style.display = 'flex';
            indicator.querySelector('.error-text').textContent = errorMessage;
            indicator.classList.add('show');
        }
    }

    /**
     * 显示图片加载成功
     * @param {string} imageId - 图片ID
     */
    showImageSuccess(imageId) {
        const indicator = this.indicators.get(imageId);
        if (indicator) {
            indicator.querySelector('.loading-text').textContent = '加载完成';
            indicator.classList.add('success');
            
            // 延迟隐藏
            setTimeout(() => {
                this.hideImageIndicator(imageId);
                indicator.classList.remove('success');
            }, 1000);
        }
    }

    /**
     * 触发重试事件
     * @param {string} imageId - 图片ID
     */
    triggerRetry(imageId) {
        const event = new CustomEvent('imageRetry', {
            detail: { imageId }
        });
        document.dispatchEvent(event);
    }

    /**
     * 暂停所有指示器
     */
    pauseAllIndicators() {
        this.indicators.forEach(indicator => {
            indicator.classList.add('paused');
        });
    }

    /**
     * 恢复所有指示器
     */
    resumeAllIndicators() {
        this.indicators.forEach(indicator => {
            indicator.classList.remove('paused');
        });
    }

    /**
     * 清理指定图片的指示器
     * @param {string} imageId - 图片ID
     */
    cleanupImageIndicator(imageId) {
        const indicator = this.indicators.get(imageId);
        if (indicator) {
            indicator.remove();
            this.indicators.delete(imageId);
        }
    }

    /**
     * 清理所有指示器
     */
    cleanupAllIndicators() {
        this.indicators.forEach(indicator => {
            indicator.remove();
        });
        this.indicators.clear();
    }

    /**
     * 获取指示器统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            totalIndicators: this.indicators.size,
            activeIndicators: Array.from(this.indicators.values()).filter(ind => ind.classList.contains('show')).length
        };
    }
}

// 创建全局实例
window.loadingIndicator = new LoadingIndicator(); 