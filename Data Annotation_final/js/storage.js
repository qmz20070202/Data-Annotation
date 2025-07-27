/**
 * 数据持久化存储管理器
 * 使用IndexedDB实现文件夹数据的本地持久化存储
 */

class StorageManager {
    constructor() {
        this.dbName = 'OCRAnnotationTool';
        this.dbVersion = 1;
        this.db = null;
        this.storeName = 'folders';
    }

    /**
     * 初始化数据库
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('数据库打开失败:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('数据库初始化成功');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // 创建对象存储空间
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    
                    // 创建索引
                    store.createIndex('folderName', 'folderName', { unique: false });
                    store.createIndex('status', 'status', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                    store.createIndex('updatedAt', 'updatedAt', { unique: false });
                    
                    console.log('数据库结构创建完成');
                }
            };
        });
    }

    /**
     * 保存文件夹数据
     */
    async saveFolder(folderData) {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);

        const folderRecord = {
            folderName: folderData.name,
            status: folderData.status || 'unprocessed', // unprocessed, processed, calibrated
            imageFiles: folderData.imageFiles || [],
            ocrResults: folderData.ocrResults || {},
            annotations: folderData.annotations || {},
            createdAt: folderData.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            metadata: {
                totalImages: folderData.imageFiles?.length || 0,
                processedImages: Object.keys(folderData.ocrResults || {}).length,
                calibratedImages: Object.keys(folderData.annotations || {}).length
            }
        };

        return new Promise((resolve, reject) => {
            const request = folderData.id ? 
                store.put({ ...folderRecord, id: folderData.id }) : 
                store.add(folderRecord);

            request.onsuccess = () => {
                console.log('文件夹数据保存成功:', folderRecord.folderName);
                resolve({
                    ...folderRecord,
                    id: request.result
                });
            };

            request.onerror = () => {
                console.error('文件夹数据保存失败:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 获取所有文件夹数据
     */
    async getAllFolders() {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.getAll();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const folders = request.result.sort((a, b) => 
                    new Date(b.updatedAt) - new Date(a.updatedAt)
                );
                console.log(`获取到 ${folders.length} 个文件夹记录`);
                resolve(folders);
            };

            request.onerror = () => {
                console.error('获取文件夹数据失败:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 根据状态获取文件夹
     */
    async getFoldersByStatus(status) {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('status');
        const request = index.getAll(status);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const folders = request.result.sort((a, b) => 
                    new Date(b.updatedAt) - new Date(a.updatedAt)
                );
                resolve(folders);
            };

            request.onerror = () => {
                console.error('根据状态获取文件夹失败:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 根据ID获取文件夹
     */
    async getFolderById(id) {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        const transaction = this.db.transaction([this.storeName], 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(id);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                console.error('根据ID获取文件夹失败:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 更新文件夹状态
     */
    async updateFolderStatus(id, status) {
        const folder = await this.getFolderById(id);
        if (!folder) {
            throw new Error('文件夹不存在');
        }

        folder.status = status;
        folder.updatedAt = new Date().toISOString();

        return await this.saveFolder(folder);
    }

    /**
     * 更新文件夹的OCR结果
     */
    async updateFolderOCRResults(id, ocrResults) {
        const folder = await this.getFolderById(id);
        if (!folder) {
            throw new Error('文件夹不存在');
        }

        folder.ocrResults = { ...folder.ocrResults, ...ocrResults };
        folder.updatedAt = new Date().toISOString();
        folder.metadata.processedImages = Object.keys(folder.ocrResults).length;

        // 如果所有图片都已处理，自动更新状态
        if (folder.metadata.processedImages === folder.metadata.totalImages) {
            folder.status = 'processed';
        }

        return await this.saveFolder(folder);
    }

    /**
     * 更新文件夹的标注数据
     */
    async updateFolderAnnotations(id, annotations) {
        const folder = await this.getFolderById(id);
        if (!folder) {
            throw new Error('文件夹不存在');
        }

        folder.annotations = { ...folder.annotations, ...annotations };
        folder.updatedAt = new Date().toISOString();
        folder.metadata.calibratedImages = Object.keys(folder.annotations).length;

        return await this.saveFolder(folder);
    }

    /**
     * 删除文件夹
     */
    async deleteFolder(id) {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(id);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log('文件夹删除成功:', id);
                resolve();
            };

            request.onerror = () => {
                console.error('文件夹删除失败:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 清空所有数据
     */
    async clearAllData() {
        if (!this.db) {
            throw new Error('数据库未初始化');
        }

        const transaction = this.db.transaction([this.storeName], 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.clear();

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                console.log('所有数据已清空');
                resolve();
            };

            request.onerror = () => {
                console.error('清空数据失败:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * 获取数据库统计信息
     */
    async getStatistics() {
        const folders = await this.getAllFolders();
        
        const stats = {
            totalFolders: folders.length,
            unprocessedFolders: folders.filter(f => f.status === 'unprocessed').length,
            processedFolders: folders.filter(f => f.status === 'processed').length,
            calibratedFolders: folders.filter(f => f.status === 'calibrated').length,
            totalImages: folders.reduce((sum, f) => sum + f.metadata.totalImages, 0),
            processedImages: folders.reduce((sum, f) => sum + f.metadata.processedImages, 0),
            calibratedImages: folders.reduce((sum, f) => sum + f.metadata.calibratedImages, 0)
        };

        return stats;
    }

    /**
     * 导出所有数据
     */
    async exportAllData() {
        const folders = await this.getAllFolders();
        const stats = await this.getStatistics();
        
        return {
            exportedAt: new Date().toISOString(),
            version: this.dbVersion,
            statistics: stats,
            folders: folders
        };
    }

    /**
     * 导入数据
     */
    async importData(data) {
        if (!data.folders || !Array.isArray(data.folders)) {
            throw new Error('无效的导入数据格式');
        }

        const results = [];
        for (const folderData of data.folders) {
            try {
                const savedFolder = await this.saveFolder(folderData);
                results.push({ success: true, folder: savedFolder });
            } catch (error) {
                results.push({ success: false, error: error.message, folder: folderData });
            }
        }

        return results;
    }
}

// 创建全局存储管理器实例
window.storageManager = new StorageManager();