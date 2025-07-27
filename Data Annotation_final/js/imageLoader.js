/**
 * 图片加载优化模块
 * 提供图片加载、缓存、压缩和错误处理功能
 */

class ImageLoader {
    constructor() {
        // 图片缓存
        this.imageCache = new Map();
        
        // 加载状态
        this.loadingStates = new Map();
        
        // 配置选项
        this.config = {
            maxCacheSize: 50, // 最大缓存图片数量
            maxImageSize: 2048, // 最大图片尺寸（像素）
            quality: 0.8, // 压缩质量
            timeout: 30000, // 加载超时时间（毫秒）
            retryCount: 3, // 重试次数
            preloadCount: 3 // 预加载图片数量
        };
        
        // 初始化
        this.init();
    }

    /**
     * 初始化图片加载器
     */
    init() {
        // 清理过期缓存
        this.cleanupCache();
        
        // 定期清理缓存
        setInterval(() => this.cleanupCache(), 60000); // 每分钟清理一次
    }

    /**
     * 加载图片（主要方法）
     * @param {File|string} source - 图片文件或URL
     * @param {Object} options - 加载选项
     * @returns {Promise<HTMLImageElement>} 加载完成的图片元素
     */
    async loadImage(source, options = {}) {
        const config = { ...this.config, ...options };
        const imageId = this.getImageId(source);
        
        // 检查缓存
        if (this.imageCache.has(imageId)) {
            console.log('从缓存加载图片:', imageId);
            return this.imageCache.get(imageId);
        }
        
        // 检查是否正在加载
        if (this.loadingStates.has(imageId)) {
            console.log('等待图片加载完成:', imageId);
            return this.loadingStates.get(imageId);
        }
        
        // 开始加载
        const loadPromise = this.performImageLoad(source, config);
        this.loadingStates.set(imageId, loadPromise);
        
        try {
            const result = await loadPromise;
            this.imageCache.set(imageId, result);
            this.loadingStates.delete(imageId);
            return result;
        } catch (error) {
            this.loadingStates.delete(imageId);
            throw error;
        }
    }

    /**
     * 执行图片加载
     * @param {File|string} source - 图片源
     * @param {Object} config - 配置
     * @returns {Promise<HTMLImageElement>}
     */
    async performImageLoad(source, config) {
        let retryCount = 0;
        
        while (retryCount < config.retryCount) {
            try {
                const img = await this.loadImageWithTimeout(source, config.timeout);
                
                // 压缩图片（如果需要）
                if (this.shouldCompressImage(img, config)) {
                    return await this.compressImage(img, config);
                }
                
                return img;
            } catch (error) {
                retryCount++;
                console.warn(`图片加载失败 (尝试 ${retryCount}/${config.retryCount}):`, error);
                
                if (retryCount >= config.retryCount) {
                    throw new Error(`图片加载失败: ${error.message}`);
                }
                
                // 等待一段时间后重试
                await this.delay(1000 * retryCount);
            }
        }
    }

    /**
     * 带超时的图片加载
     * @param {File|string} source - 图片源
     * @param {number} timeout - 超时时间
     * @returns {Promise<HTMLImageElement>}
     */
    loadImageWithTimeout(source, timeout) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const timer = setTimeout(() => {
                img.onload = null;
                img.onerror = null;
                reject(new Error('图片加载超时'));
            }, timeout);
            
            img.onload = () => {
                clearTimeout(timer);
                resolve(img);
            };
            
            img.onerror = () => {
                clearTimeout(timer);
                reject(new Error('图片加载失败'));
            };
            
            // 设置跨域属性
            img.crossOrigin = 'anonymous';
            
            // 加载图片
            if (source instanceof File) {
                const url = URL.createObjectURL(source);
                img.src = url;
                // 注意：这里不立即释放URL，因为图片可能还在使用
                // 在图片加载完成后，可以在适当的时候调用 URL.revokeObjectURL(url)
            } else {
                img.src = source;
            }
        });
    }

    /**
     * 判断是否需要压缩图片
     * @param {HTMLImageElement} img - 图片元素
     * @param {Object} config - 配置
     * @returns {boolean}
     */
    shouldCompressImage(img, config) {
        return img.width > config.maxImageSize || img.height > config.maxImageSize;
    }

    /**
     * 压缩图片
     * @param {HTMLImageElement} img - 原图片
     * @param {Object} config - 配置
     * @returns {Promise<HTMLImageElement>}
     */
    async compressImage(img, config) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 计算新的尺寸
            const { width, height } = this.calculateNewSize(img.width, img.height, config.maxImageSize);
            
            canvas.width = width;
            canvas.height = height;
            
            // 绘制压缩后的图片
            ctx.drawImage(img, 0, 0, width, height);
            
            // 创建新的图片元素
            const compressedImg = new Image();
            compressedImg.onload = () => resolve(compressedImg);
            compressedImg.src = canvas.toDataURL('image/jpeg', config.quality);
        });
    }

    /**
     * 计算压缩后的尺寸
     * @param {number} width - 原宽度
     * @param {number} height - 原高度
     * @param {number} maxSize - 最大尺寸
     * @returns {Object} 新的宽度和高度
     */
    calculateNewSize(width, height, maxSize) {
        if (width <= maxSize && height <= maxSize) {
            return { width, height };
        }
        
        const ratio = Math.min(maxSize / width, maxSize / height);
        return {
            width: Math.round(width * ratio),
            height: Math.round(height * ratio)
        };
    }

    /**
     * 预加载图片
     * @param {Array} imageSources - 图片源数组
     * @param {number} startIndex - 开始索引
     * @param {Object} options - 选项
     * @returns {Promise<Array>} 预加载结果
     */
    async preloadImages(imageSources, startIndex = 0, options = {}) {
        const config = { ...this.config, ...options };
        const preloadCount = Math.min(config.preloadCount, imageSources.length - startIndex);
        const promises = [];
        
        for (let i = 0; i < preloadCount; i++) {
            const index = startIndex + i;
            if (index < imageSources.length) {
                const source = imageSources[index];
                promises.push(
                    this.loadImage(source, config)
                        .catch(error => {
                            console.warn(`预加载图片失败 (索引 ${index}):`, error);
                            return null;
                        })
                );
            }
        }
        
        return Promise.all(promises);
    }

    /**
     * 获取图片ID
     * @param {File|string} source - 图片源
     * @returns {string} 图片ID
     */
    getImageId(source) {
        if (source instanceof File) {
            return `${source.name}_${source.size}_${source.lastModified}`;
        }
        return source;
    }

    /**
     * 清理缓存
     */
    cleanupCache() {
        if (this.imageCache.size > this.config.maxCacheSize) {
            const entries = Array.from(this.imageCache.entries());
            const toDelete = entries.slice(0, this.imageCache.size - this.config.maxCacheSize);
            
            toDelete.forEach(([key, img]) => {
                this.imageCache.delete(key);
                // 如果图片有src URL，释放它
                if (img.src && img.src.startsWith('blob:')) {
                    URL.revokeObjectURL(img.src);
                }
            });
            
            console.log(`清理了 ${toDelete.length} 个缓存图片`);
        }
    }

    /**
     * 清空所有缓存
     */
    clearAllCache() {
        // 释放所有blob URL
        this.imageCache.forEach(img => {
            if (img.src && img.src.startsWith('blob:')) {
                URL.revokeObjectURL(img.src);
            }
        });
        
        this.imageCache.clear();
        this.loadingStates.clear();
        console.log('已清空所有图片缓存');
    }

    /**
     * 获取缓存统计信息
     * @returns {Object} 缓存统计
     */
    getCacheStats() {
        return {
            cacheSize: this.imageCache.size,
            loadingCount: this.loadingStates.size,
            maxCacheSize: this.config.maxCacheSize
        };
    }

    /**
     * 延迟函数
     * @param {number} ms - 延迟毫秒数
     * @returns {Promise}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 检查图片是否已缓存
     * @param {File|string} source - 图片源
     * @returns {boolean}
     */
    isCached(source) {
        const imageId = this.getImageId(source);
        return this.imageCache.has(imageId);
    }

    /**
     * 检查图片是否正在加载
     * @param {File|string} source - 图片源
     * @returns {boolean}
     */
    isLoading(source) {
        const imageId = this.getImageId(source);
        return this.loadingStates.has(imageId);
    }
}

// 创建全局实例
window.imageLoader = new ImageLoader(); 