/**
 * 高性能存储管理器 - 基于IndexedDB
 * 专为大数据量优化：分片存储、懒加载、批量操作、内存管理
 * 支持数百个文件夹和数万张图片的高效管理
 */

class OptimizedStorageManager {
    constructor() {
        this.dbName = 'OCRAnnotationTool_v2';
        this.dbVersion = 3;
        this.db = null;
        
        // 存储表配置
        this.stores = {
            folders: 'folders',           // 文件夹元数据
            imageChunks: 'imageChunks',   // 图片数据分片
            annotations: 'annotations',   // 标注数据
            cache: 'cache'               // 缓存数据
        };
        
        // 性能配置
        this.config = {
            chunkSize: 1024 * 1024,      // 1MB分片大小
            maxMemoryCache: 50,          // 最大内存缓存项目数
            batchSize: 20,               // 批量操作大小
            indexedDBQuota: 500 * 1024 * 1024, // 500MB配额
        };
        
        // 内存缓存
        this.memoryCache = new Map();
        this.cacheStats = {
            hits: 0,
            misses: 0,
            size: 0
        };
        
        // 操作队列
        this.operationQueue = [];
        this.isProcessingQueue = false;
    }
    
    /**
     * 初始化优化的数据库结构
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                console.error('🚨 优化数据库打开失败:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                this.setupErrorHandling();
                console.log('🚀 优化数据库初始化成功');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createOptimizedSchema(db);
            };
        });
    }
    
    /**
     * 创建优化的数据库结构
     */
    createOptimizedSchema(db) {
        console.log('📊 创建优化数据库结构...');
        
        // 1. 文件夹元数据存储 - 只存储基本信息，不存储大文件
        if (!db.objectStoreNames.contains(this.stores.folders)) {
            const folderStore = db.createObjectStore(this.stores.folders, {
                keyPath: 'id',
                autoIncrement: true
            });
            
            // 创建索引用于快速查询
            folderStore.createIndex('name', 'folderName', { unique: false });
            folderStore.createIndex('status', 'status', { unique: false });
            folderStore.createIndex('created', 'createdAt', { unique: false });
            folderStore.createIndex('updated', 'updatedAt', { unique: false });
            folderStore.createIndex('size', 'totalSize', { unique: false });
        }
        
        // 2. 图片数据分片存储 - 将大图片分片存储
        if (!db.objectStoreNames.contains(this.stores.imageChunks)) {
            const chunkStore = db.createObjectStore(this.stores.imageChunks, {
                keyPath: 'id'
            });
            
            chunkStore.createIndex('folderId', 'folderId', { unique: false });
            chunkStore.createIndex('imageName', 'imageName', { unique: false });
            chunkStore.createIndex('chunkIndex', 'chunkIndex', { unique: false });
        }
        
        // 3. 标注数据存储 - 分离标注数据提高查询性能
        if (!db.objectStoreNames.contains(this.stores.annotations)) {
            const annotationStore = db.createObjectStore(this.stores.annotations, {
                keyPath: 'id'
            });
            
            annotationStore.createIndex('folderId', 'folderId', { unique: false });
            annotationStore.createIndex('imageName', 'imageName', { unique: false });
            annotationStore.createIndex('modified', 'lastModified', { unique: false });
        }
        
        // 4. 缓存存储 - 用于临时数据和预处理结果
        if (!db.objectStoreNames.contains(this.stores.cache)) {
            const cacheStore = db.createObjectStore(this.stores.cache, {
                keyPath: 'key'
            });
            
            cacheStore.createIndex('expiry', 'expiryTime', { unique: false });
            cacheStore.createIndex('size', 'size', { unique: false });
        }
        
        console.log('✅ 优化数据库结构创建完成');
    }
    
    /**
     * 保存文件夹 - 优化版本，支持大数据量
     */
    async saveFolder(folderData) {
        try {
            const startTime = performance.now();
            
            // 1. 分离数据结构
            const { imageFiles, annotations, ocrResults, ...metadata } = folderData;
            
            // 2. 保存文件夹元数据
            const folderMeta = {
                ...metadata,
                totalSize: this.calculateDataSize(folderData),
                imageCount: imageFiles?.length || 0,
                lastOptimized: Date.now(),
                updatedAt: Date.now()
            };
            
            const savedFolder = await this.saveFolderMetadata(folderMeta);
            const folderId = savedFolder.id;
            
            // 3. 分片保存图片数据
            if (imageFiles && imageFiles.length > 0) {
                await this.saveImageDataInChunks(folderId, imageFiles);
            }
            
            // 4. 保存标注数据
            if (annotations) {
                await this.saveAnnotationData(folderId, annotations);
            }
            
            // 5. 更新缓存
            this.updateMemoryCache(`folder_${folderId}`, savedFolder);
            
            const duration = performance.now() - startTime;
            console.log(`💾 文件夹保存完成: ${savedFolder.folderName}, 耗时: ${Math.round(duration)}ms`);
            
            return savedFolder;
            
        } catch (error) {
            console.error('保存文件夹失败:', error);
            throw error;
        }
    }
    
    /**
     * 分片保存图片数据
     */
    async saveImageDataInChunks(folderId, imageFiles) {
        const batchPromises = [];
        
        for (let i = 0; i < imageFiles.length; i += this.config.batchSize) {
            const batch = imageFiles.slice(i, i + this.config.batchSize);
            batchPromises.push(this.processBatchImages(folderId, batch, i));
        }
        
        await Promise.all(batchPromises);
        console.log(`📸 已分片保存 ${imageFiles.length} 张图片`);
    }
    
    /**
     * 处理批量图片
     */
    async processBatchImages(folderId, imageBatch, startIndex) {
        const transaction = this.db.transaction([this.stores.imageChunks], 'readwrite');
        const store = transaction.objectStore(this.stores.imageChunks);
        
        for (let i = 0; i < imageBatch.length; i++) {
            const image = imageBatch[i];
            const imageIndex = startIndex + i;
            
            if (image.dataURL) {
                await this.saveImageInChunks(store, folderId, image, imageIndex);
            }
        }
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
    
    /**
     * 将单张图片分片保存
     */
    async saveImageInChunks(store, folderId, image, imageIndex) {
        const dataURL = image.dataURL;
        const chunkSize = this.config.chunkSize;
        const totalChunks = Math.ceil(dataURL.length / chunkSize);
        
        // 删除旧的分片
        await this.deleteImageChunks(folderId, image.name);
        
        // 保存新的分片
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, dataURL.length);
            const chunkData = dataURL.slice(start, end);
            
            const chunkRecord = {
                id: `${folderId}_${image.name}_${chunkIndex}`,
                folderId: folderId,
                imageName: image.name,
                imageIndex: imageIndex,
                chunkIndex: chunkIndex,
                totalChunks: totalChunks,
                data: chunkData,
                metadata: {
                    type: image.type,
                    size: image.size,
                    lastModified: image.lastModified
                },
                createdAt: Date.now()
            };
            
            store.add(chunkRecord);
        }
    }
    
    /**
     * 获取文件夹 - 优化版本，支持懒加载
     */
    async getFolderById(folderId, options = {}) {
        const { 
            includeImages = false, 
            includeAnnotations = true,
            imageRange = null // { start: 0, count: 20 }
        } = options;
        
        try {
            // 1. 检查内存缓存
            const cacheKey = `folder_${folderId}`;
            if (this.memoryCache.has(cacheKey) && !includeImages) {
                this.cacheStats.hits++;
                return this.memoryCache.get(cacheKey);
            }
            this.cacheStats.misses++;
            
            // 2. 获取文件夹元数据
            const folderMeta = await this.getFolderMetadata(folderId);
            if (!folderMeta) return null;
            
            // 3. 按需加载附加数据
            const result = { ...folderMeta };
            
            if (includeImages) {
                result.imageFiles = await this.getImageFiles(folderId, imageRange);
            }
            
            if (includeAnnotations) {
                result.annotations = await this.getAnnotationData(folderId);
            }
            
            // 4. 更新缓存
            if (!includeImages) { // 只缓存元数据，避免内存占用过大
                this.updateMemoryCache(cacheKey, result);
            }
            
            return result;
            
        } catch (error) {
            console.error('获取文件夹失败:', folderId, error);
            throw error;
        }
    }
    
    /**
     * 重组图片数据
     */
    async getImageFiles(folderId, range = null) {
        const transaction = this.db.transaction([this.stores.imageChunks], 'readonly');
        const store = transaction.objectStore(this.stores.imageChunks);
        const index = store.index('folderId');
        
        return new Promise((resolve, reject) => {
            const chunks = new Map(); // imageName -> chunks
            const request = index.openCursor(IDBKeyRange.only(folderId));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                
                if (cursor) {
                    const chunk = cursor.value;
                    const imageName = chunk.imageName;
                    
                    if (!chunks.has(imageName)) {
                        chunks.set(imageName, []);
                    }
                    chunks.get(imageName).push(chunk);
                    
                    cursor.continue();
                } else {
                    // 重组图片数据
                    const imageFiles = [];
                    
                    for (const [imageName, imageChunks] of chunks) {
                        // 应用范围过滤
                        if (range) {
                            const imageIndex = imageChunks[0].imageIndex;
                            if (imageIndex < range.start || imageIndex >= range.start + range.count) {
                                continue;
                            }
                        }
                        
                        const reconstructed = this.reconstructImageFromChunks(imageName, imageChunks);
                        if (reconstructed) {
                            imageFiles.push(reconstructed);
                        }
                    }
                    
                    // 按索引排序
                    imageFiles.sort((a, b) => (a.originalIndex || 0) - (b.originalIndex || 0));
                    resolve(imageFiles);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * 从分片重组图片
     */
    reconstructImageFromChunks(imageName, chunks) {
        try {
            // 按分片索引排序
            chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
            
            // 检查分片完整性
            const totalChunks = chunks[0].totalChunks;
            if (chunks.length !== totalChunks) {
                console.warn(`图片分片不完整: ${imageName}, 预期: ${totalChunks}, 实际: ${chunks.length}`);
                return null;
            }
            
            // 重组数据
            const dataURL = chunks.map(chunk => chunk.data).join('');
            const metadata = chunks[0].metadata;
            
            return {
                name: imageName,
                type: metadata.type,
                size: metadata.size,
                lastModified: metadata.lastModified,
                dataURL: dataURL,
                originalIndex: chunks[0].imageIndex
            };
            
        } catch (error) {
            console.error(`重组图片失败: ${imageName}`, error);
            return null;
        }
    }
    
    /**
     * 获取所有文件夹 - 分页支持
     */
    async getAllFolders(options = {}) {
        const { 
            page = 0, 
            pageSize = 50,
            sortBy = 'updatedAt',
            sortOrder = 'desc',
            filter = null
        } = options;
        
        try {
            const transaction = this.db.transaction([this.stores.folders], 'readonly');
            const store = transaction.objectStore(this.stores.folders);
            
            // 使用索引优化查询
            const index = store.index(this.getIndexName(sortBy));
            const direction = sortOrder === 'desc' ? 'prev' : 'next';
            
            return new Promise((resolve, reject) => {
                const results = [];
                let skipped = 0;
                let collected = 0;
                
                const request = index.openCursor(null, direction);
                
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    
                    if (cursor && collected < pageSize) {
                        const folder = cursor.value;
                        
                        // 应用过滤器
                        if (!filter || this.applyFilter(folder, filter)) {
                            if (skipped >= page * pageSize) {
                                results.push(folder);
                                collected++;
                            } else {
                                skipped++;
                            }
                        }
                        
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };
                
                request.onerror = () => reject(request.error);
            });
            
        } catch (error) {
            console.error('获取文件夹列表失败:', error);
            throw error;
        }
    }
    
    /**
     * 批量删除文件夹
     */
    async deleteFolders(folderIds) {
        const startTime = performance.now();
        
        try {
            const deletePromises = folderIds.map(id => this.deleteFolder(id));
            await Promise.all(deletePromises);
            
            const duration = performance.now() - startTime;
            console.log(`🗑️ 批量删除 ${folderIds.length} 个文件夹完成，耗时: ${Math.round(duration)}ms`);
            
        } catch (error) {
            console.error('批量删除失败:', error);
            throw error;
        }
    }
    
    /**
     * 数据库维护和优化
     */
    async performMaintenance() {
        console.log('🔧 开始数据库维护...');
        
        try {
            // 1. 清理过期缓存
            await this.cleanupExpiredCache();
            
            // 2. 压缩数据库
            await this.compactDatabase();
            
            // 3. 重建索引
            await this.rebuildIndexes();
            
            // 4. 更新统计信息
            const stats = await this.getDatabaseStats();
            console.log('📊 数据库统计:', stats);
            
            console.log('✅ 数据库维护完成');
            
        } catch (error) {
            console.error('数据库维护失败:', error);
        }
    }
    
    /**
     * 获取数据库统计信息
     */
    async getDatabaseStats() {
        const stats = {
            folders: 0,
            images: 0,
            annotations: 0,
            cacheEntries: 0,
            totalSize: 0,
            memoryCache: {
                size: this.memoryCache.size,
                hits: this.cacheStats.hits,
                misses: this.cacheStats.misses,
                hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses)
            }
        };
        
        try {
            // 统计各个存储的记录数
            for (const [name, storeName] of Object.entries(this.stores)) {
                const count = await this.countRecords(storeName);
                stats[name === 'imageChunks' ? 'images' : name] = count;
            }
            
            // 估算总大小
            if (navigator.storage && navigator.storage.estimate) {
                const estimate = await navigator.storage.estimate();
                stats.totalSize = estimate.usage;
                stats.quota = estimate.quota;
                stats.utilization = Math.round((estimate.usage / estimate.quota) * 100);
            }
            
        } catch (error) {
            console.warn('获取统计信息部分失败:', error);
        }
        
        return stats;
    }
    
    /**
     * 内存缓存管理
     */
    updateMemoryCache(key, data) {
        // 如果缓存已满，删除最老的项目
        if (this.memoryCache.size >= this.config.maxMemoryCache) {
            const firstKey = this.memoryCache.keys().next().value;
            this.memoryCache.delete(firstKey);
        }
        
        this.memoryCache.set(key, {
            data: data,
            timestamp: Date.now()
        });
        
        this.cacheStats.size = this.memoryCache.size;
    }
    
    /**
     * 计算数据大小
     */
    calculateDataSize(data) {
        try {
            return new Blob([JSON.stringify(data)]).size;
        } catch {
            return 0;
        }
    }
    
    /**
     * 错误处理设置
     */
    setupErrorHandling() {
        this.db.onerror = (event) => {
            console.error('数据库错误:', event.target.error);
        };
        
        this.db.onversionchange = (event) => {
            console.warn('数据库版本变化，需要刷新页面');
            this.db.close();
        };
    }
    
    /**
     * 销毁管理器
     */
    destroy() {
        if (this.db) {
            this.db.close();
        }
        this.memoryCache.clear();
        console.log('🗃️ 优化存储管理器已销毁');
    }
    
    // ... 其他辅助方法
    getFolderMetadata(folderId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.stores.folders], 'readonly');
            const store = transaction.objectStore(this.stores.folders);
            const request = store.get(folderId);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    saveFolderMetadata(metadata) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.stores.folders], 'readwrite');
            const store = transaction.objectStore(this.stores.folders);
            const request = metadata.id ? store.put(metadata) : store.add(metadata);
            
            request.onsuccess = () => resolve({ ...metadata, id: request.result });
            request.onerror = () => reject(request.error);
        });
    }
    
    getIndexName(sortBy) {
        const indexMap = {
            'folderName': 'name',
            'status': 'status',
            'createdAt': 'created',
            'updatedAt': 'updated',
            'totalSize': 'size'
        };
        return indexMap[sortBy] || 'updated';
    }
    
    applyFilter(folder, filter) {
        if (filter.status && folder.status !== filter.status) return false;
        if (filter.name && !folder.folderName.toLowerCase().includes(filter.name.toLowerCase())) return false;
        return true;
    }
    
    async countRecords(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async deleteImageChunks(folderId, imageName) {
        // 实现删除图片分片的逻辑
        const transaction = this.db.transaction([this.stores.imageChunks], 'readwrite');
        const store = transaction.objectStore(this.stores.imageChunks);
        const index = store.index('folderId');
        
        return new Promise((resolve, reject) => {
            const request = index.openCursor(IDBKeyRange.only(folderId));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const chunk = cursor.value;
                    if (chunk.imageName === imageName) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    resolve();
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async saveAnnotationData(folderId, annotations) {
        // 实现保存标注数据的逻辑
        if (!annotations || Object.keys(annotations).length === 0) return;
        
        const transaction = this.db.transaction([this.stores.annotations], 'readwrite');
        const store = transaction.objectStore(this.stores.annotations);
        
        for (const [imageName, annotation] of Object.entries(annotations)) {
            const record = {
                id: `${folderId}_${imageName}`,
                folderId: folderId,
                imageName: imageName,
                data: annotation,
                lastModified: Date.now()
            };
            
            store.put(record);
        }
        
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
    
    async getAnnotationData(folderId) {
        // 实现获取标注数据的逻辑
        const transaction = this.db.transaction([this.stores.annotations], 'readonly');
        const store = transaction.objectStore(this.stores.annotations);
        const index = store.index('folderId');
        
        return new Promise((resolve, reject) => {
            const annotations = {};
            const request = index.openCursor(IDBKeyRange.only(folderId));
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const record = cursor.value;
                    annotations[record.imageName] = record.data;
                    cursor.continue();
                } else {
                    resolve(annotations);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async cleanupExpiredCache() {
        // 清理过期缓存的实现
        console.log('🧹 清理过期缓存...');
    }
    
    async compactDatabase() {
        // 数据库压缩的实现
        console.log('🗜️ 压缩数据库...');
    }
    
    async rebuildIndexes() {
        // 重建索引的实现
        console.log('🔄 重建索引...');
    }
}

// 导出到全局
window.OptimizedStorageManager = OptimizedStorageManager;