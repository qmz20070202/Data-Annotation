/**
 * 智能图片加载管理器
 * 专为大数据量图片标注优化，支持懒加载、内存管理、预加载
 */

class ImageLoadManager {
    constructor(options = {}) {
        this.options = {
            // 内存管理
            maxCacheSize: 50 * 1024 * 1024, // 50MB最大缓存
            maxCachedImages: 100, // 最大缓存图片数量
            
            // 懒加载配置
            rootMargin: '200px', // 提前200px开始加载
            threshold: 0.1,
            
            // 预加载配置
            preloadCount: 3, // 预加载前后3张图片
            
            // 质量优化
            enableWebP: true,
            enableCompression: true,
            maxImageSize: 2048, // 最大显示尺寸
            
            ...options
        };
        
        this.cache = new Map(); // 图片缓存
        this.loadingQueue = new Set(); // 加载队列
        this.observer = null; // Intersection Observer
        this.cacheSize = 0; // 当前缓存大小
        
        this.init();
    }
    
    init() {
        // 初始化 Intersection Observer
        if ('IntersectionObserver' in window) {
            this.observer = new IntersectionObserver(
                this.handleIntersection.bind(this),
                {
                    rootMargin: this.options.rootMargin,
                    threshold: this.options.threshold
                }
            );
        }
        
        // 监听内存压力
        this.setupMemoryManagement();
        
        console.log('🖼️ 智能图片加载管理器已初始化');
    }
    
    /**
     * 处理图片进入视口
     */
    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const imageUrl = img.dataset.src;
                
                if (imageUrl && !img.src) {
                    this.loadImage(imageUrl, img);
                    this.observer.unobserve(img);
                }
            }
        });
    }
    
    /**
     * 智能图片加载 - 支持多种优化策略
     */
    async loadImage(imageUrl, imgElement = null, options = {}) {
        const loadOptions = { ...this.options, ...options };
        
        try {
            // 检查缓存
            if (this.cache.has(imageUrl)) {
                const cachedData = this.cache.get(imageUrl);
                if (imgElement) {
                    imgElement.src = cachedData.url;
                    imgElement.classList.add('loaded');
                }
                return cachedData.url;
            }
            
            // 避免重复加载
            if (this.loadingQueue.has(imageUrl)) {
                return new Promise((resolve) => {
                    const checkCache = () => {
                        if (this.cache.has(imageUrl)) {
                            resolve(this.cache.get(imageUrl).url);
                        } else {
                            setTimeout(checkCache, 100);
                        }
                    };
                    checkCache();
                });
            }
            
            this.loadingQueue.add(imageUrl);
            
            // 显示加载状态
            if (imgElement) {
                this.showLoadingState(imgElement);
            }
            
            // 加载图片
            const processedUrl = await this.processImage(imageUrl, loadOptions);
            
            // 缓存结果
            await this.cacheImage(imageUrl, processedUrl);
            
            // 更新DOM
            if (imgElement) {
                imgElement.src = processedUrl;
                imgElement.classList.remove('loading');
                imgElement.classList.add('loaded');
            }
            
            this.loadingQueue.delete(imageUrl);
            return processedUrl;
            
        } catch (error) {
            console.error('图片加载失败:', imageUrl, error);
            this.loadingQueue.delete(imageUrl);
            
            if (imgElement) {
                this.showErrorState(imgElement);
            }
            
            throw error;
        }
    }
    
    /**
     * 图片处理 - 压缩、格式转换、尺寸优化
     */
    async processImage(imageUrl, options) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            img.onload = () => {
                try {
                    // 检查是否需要处理
                    if (!options.enableCompression && img.width <= options.maxImageSize && img.height <= options.maxImageSize) {
                        resolve(imageUrl);
                        return;
                    }
                    
                    // 创建canvas进行处理
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // 计算最佳显示尺寸
                    const { width, height } = this.calculateOptimalSize(
                        img.width, 
                        img.height, 
                        options.maxImageSize
                    );
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    // 绘制优化后的图片
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // 转换为最佳格式
                    const format = this.getBestFormat(options);
                    const quality = this.getOptimalQuality(width * height);
                    
                    const optimizedUrl = canvas.toDataURL(format, quality);
                    
                    console.log(`🎯 图片优化完成: ${img.width}x${img.height} → ${width}x${height}, 质量: ${Math.round(quality * 100)}%`);
                    resolve(optimizedUrl);
                    
                } catch (error) {
                    console.warn('图片处理失败，使用原图:', error);
                    resolve(imageUrl);
                }
            };
            
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = imageUrl;
        });
    }
    
    /**
     * 计算最佳显示尺寸
     */
    calculateOptimalSize(originalWidth, originalHeight, maxSize) {
        if (originalWidth <= maxSize && originalHeight <= maxSize) {
            return { width: originalWidth, height: originalHeight };
        }
        
        const ratio = Math.min(maxSize / originalWidth, maxSize / originalHeight);
        return {
            width: Math.round(originalWidth * ratio),
            height: Math.round(originalHeight * ratio)
        };
    }
    
    /**
     * 获取最佳图片格式
     */
    getBestFormat(options) {
        if (options.enableWebP && this.supportsWebP()) {
            return 'image/webp';
        }
        return 'image/jpeg';
    }
    
    /**
     * 检测WebP支持
     */
    supportsWebP() {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    }
    
    /**
     * 获取最佳压缩质量
     */
    getOptimalQuality(pixelCount) {
        // 根据图片大小动态调整质量
        if (pixelCount > 2000000) return 0.7; // 大图片用较低质量
        if (pixelCount > 1000000) return 0.8; // 中等图片
        return 0.9; // 小图片保持高质量
    }
    
    /**
     * 缓存图片
     */
    async cacheImage(originalUrl, processedUrl) {
        try {
            // 计算图片大小（粗略估算）
            const estimatedSize = processedUrl.length * 0.75; // base64编码大约比原始大25%
            
            // 检查缓存空间
            await this.ensureCacheSpace(estimatedSize);
            
            // 添加到缓存
            this.cache.set(originalUrl, {
                url: processedUrl,
                size: estimatedSize,
                timestamp: Date.now(),
                accessCount: 1
            });
            
            this.cacheSize += estimatedSize;
            
            console.log(`💾 图片已缓存: ${originalUrl.substring(0, 50)}..., 缓存大小: ${Math.round(this.cacheSize / 1024)}KB`);
            
        } catch (error) {
            console.warn('缓存图片失败:', error);
        }
    }
    
    /**
     * 确保缓存空间足够
     */
    async ensureCacheSpace(requiredSize) {
        // 检查缓存数量限制
        while (this.cache.size >= this.options.maxCachedImages) {
            this.evictLeastUsed();
        }
        
        // 检查缓存大小限制
        while (this.cacheSize + requiredSize > this.options.maxCacheSize) {
            this.evictLeastUsed();
        }
    }
    
    /**
     * 移除最少使用的图片
     */
    evictLeastUsed() {
        if (this.cache.size === 0) return;
        
        let leastUsedKey = null;
        let leastUsedScore = Infinity;
        
        for (const [key, data] of this.cache.entries()) {
            // 综合考虑访问次数和时间
            const score = data.accessCount * 1000000 + (Date.now() - data.timestamp);
            if (score < leastUsedScore) {
                leastUsedScore = score;
                leastUsedKey = key;
            }
        }
        
        if (leastUsedKey) {
            const removedData = this.cache.get(leastUsedKey);
            this.cache.delete(leastUsedKey);
            this.cacheSize -= removedData.size;
            
            console.log(`🗑️ 移除缓存图片: ${leastUsedKey.substring(0, 50)}...`);
        }
    }
    
    /**
     * 预加载图片序列
     */
    async preloadImages(imageUrls, currentIndex = 0) {
        const preloadPromises = [];
        const start = Math.max(0, currentIndex - this.options.preloadCount);
        const end = Math.min(imageUrls.length, currentIndex + this.options.preloadCount + 1);
        
        for (let i = start; i < end; i++) {
            if (i !== currentIndex && !this.cache.has(imageUrls[i])) {
                preloadPromises.push(
                    this.loadImage(imageUrls[i]).catch(error => {
                        console.warn(`预加载失败: ${imageUrls[i]}`, error);
                    })
                );
            }
        }
        
        if (preloadPromises.length > 0) {
            console.log(`🔄 预加载 ${preloadPromises.length} 张图片...`);
            await Promise.allSettled(preloadPromises);
        }
    }
    
    /**
     * 设置懒加载
     */
    setupLazyLoading(imgElement, imageUrl) {
        if (!imgElement || !imageUrl) return;
        
        imgElement.dataset.src = imageUrl;
        imgElement.classList.add('lazy-load');
        
        // 添加占位符
        if (!imgElement.src) {
            imgElement.src = this.createPlaceholder(300, 200);
        }
        
        // 开始观察
        if (this.observer) {
            this.observer.observe(imgElement);
        } else {
            // 降级处理：直接加载
            this.loadImage(imageUrl, imgElement);
        }
    }
    
    /**
     * 创建占位符
     */
    createPlaceholder(width, height) {
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
                <rect width="100%" height="100%" fill="#f0f0f0"/>
                <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#999" font-size="14">
                    加载中...
                </text>
            </svg>
        `;
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    }
    
    /**
     * 显示加载状态
     */
    showLoadingState(imgElement) {
        imgElement.classList.add('loading');
        if (!imgElement.src || imgElement.src.startsWith('data:image/svg+xml')) {
            imgElement.src = this.createPlaceholder(300, 200);
        }
    }
    
    /**
     * 显示错误状态
     */
    showErrorState(imgElement) {
        imgElement.classList.remove('loading');
        imgElement.classList.add('error');
        
        const errorSvg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
                <rect width="100%" height="100%" fill="#f8f8f8"/>
                <text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#ff6b6b" font-size="14">
                    图片加载失败
                </text>
            </svg>
        `;
        imgElement.src = `data:image/svg+xml,${encodeURIComponent(errorSvg)}`;
    }
    
    /**
     * 设置内存管理
     */
    setupMemoryManagement() {
        // 监听内存压力事件
        if ('memory' in performance) {
            setInterval(() => {
                const memInfo = performance.memory;
                const usedRatio = memInfo.usedJSHeapSize / memInfo.jsHeapSizeLimit;
                
                // 如果内存使用超过80%，主动清理缓存
                if (usedRatio > 0.8) {
                    console.warn('🚨 内存压力过大，清理图片缓存');
                    this.clearCache(0.5); // 清理50%的缓存
                }
            }, 30000); // 每30秒检查一次
        }
        
        // 页面隐藏时清理部分缓存
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.clearCache(0.3); // 清理30%的缓存
            }
        });
    }
    
    /**
     * 清理缓存
     */
    clearCache(ratio = 1) {
        const targetSize = Math.floor(this.cache.size * ratio);
        let clearedCount = 0;
        
        // 按使用频率排序，删除最少使用的
        const sortedEntries = Array.from(this.cache.entries())
            .sort((a, b) => a[1].accessCount - b[1].accessCount);
        
        for (let i = 0; i < targetSize && i < sortedEntries.length; i++) {
            const [key, data] = sortedEntries[i];
            this.cache.delete(key);
            this.cacheSize -= data.size;
            clearedCount++;
        }
        
        console.log(`🧹 已清理 ${clearedCount} 个缓存图片，释放内存: ${Math.round(this.cacheSize / 1024)}KB`);
    }
    
    /**
     * 获取缓存统计信息
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            totalSize: Math.round(this.cacheSize / 1024), // KB
            maxSize: Math.round(this.options.maxCacheSize / 1024), // KB
            utilization: Math.round((this.cacheSize / this.options.maxCacheSize) * 100) // %
        };
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        
        this.clearCache(1);
        this.loadingQueue.clear();
        
        console.log('🖼️ 图片加载管理器已销毁');
    }
}

// 导出到全局
window.ImageLoadManager = ImageLoadManager;