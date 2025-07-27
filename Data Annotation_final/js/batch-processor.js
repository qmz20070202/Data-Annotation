/**
 * 批量处理管理器
 * 专为大数据量OCR处理优化：分批处理、进度管理、错误恢复
 * 支持数百张图片的批量OCR识别和校准
 */

class BatchProcessor {
    constructor(options = {}) {
        this.options = {
            batchSize: 5,           // 每批处理数量
            maxConcurrent: 3,       // 最大并发数
            retryCount: 3,          // 重试次数
            retryDelay: 2000,       // 重试延迟(ms)
            progressInterval: 500,  // 进度更新间隔
            timeoutMs: 60000,       // 单个任务超时时间
            enableRecovery: true,   // 启用任务恢复
            ...options
        };
        
        this.currentTask = null;
        this.taskQueue = [];
        this.activeJobs = new Map();
        this.completedJobs = new Map();
        this.failedJobs = new Map();
        
        // 性能监控
        this.stats = {
            totalProcessed: 0,
            totalFailed: 0,
            averageTime: 0,
            startTime: null,
            endTime: null
        };
        
        // 事件系统
        this.listeners = new Map();
        
        console.log('🚀 批量处理管理器已初始化');
    }
    
    /**
     * 批量OCR处理
     */
    async batchOCRProcess(folders, apiManager, progressCallback) {
        const taskId = `ocr_${Date.now()}`;
        
        try {
            console.log(`📋 开始批量OCR处理: ${folders.length} 个文件夹`);
            
            const task = {
                id: taskId,
                type: 'ocr',
                folders: folders,
                totalImages: this.calculateTotalImages(folders),
                processedImages: 0,
                failedImages: 0,
                startTime: Date.now(),
                status: 'running'
            };
            
            this.currentTask = task;
            this.stats.startTime = Date.now();
            
            // 创建处理队列
            const processingQueue = this.createOCRQueue(folders, apiManager);
            
            // 执行批量处理
            const results = await this.processBatchQueue(
                processingQueue, 
                (progress) => {
                    task.processedImages = progress.completed;
                    task.failedImages = progress.failed;
                    
                    if (progressCallback) {
                        progressCallback({
                            taskId: taskId,
                            type: 'ocr',
                            progress: Math.round((progress.completed / task.totalImages) * 100),
                            completed: progress.completed,
                            failed: progress.failed,
                            total: task.totalImages,
                            currentItem: progress.currentItem,
                            elapsedTime: Date.now() - task.startTime,
                            estimatedRemaining: this.estimateRemainingTime(progress, task)
                        });
                    }
                }
            );
            
            task.status = 'completed';
            task.endTime = Date.now();
            this.stats.endTime = Date.now();
            
            console.log(`✅ 批量OCR处理完成: 成功 ${results.successful.length}, 失败 ${results.failed.length}`);
            
            return {
                taskId: taskId,
                successful: results.successful,
                failed: results.failed,
                stats: this.getTaskStats(task)
            };
            
        } catch (error) {
            console.error('批量OCR处理失败:', error);
            if (this.currentTask) {
                this.currentTask.status = 'failed';
                this.currentTask.error = error.message;
            }
            throw error;
        } finally {
            this.currentTask = null;
        }
    }
    
    /**
     * 创建OCR处理队列
     */
    createOCRQueue(folders, apiManager) {
        const queue = [];
        
        folders.forEach(folder => {
            if (folder.imageFiles && folder.imageFiles.length > 0) {
                // 按批次分组图片
                const batches = this.createBatches(folder.imageFiles, this.options.batchSize);
                
                batches.forEach((batch, batchIndex) => {
                    queue.push({
                        id: `${folder.id}_batch_${batchIndex}`,
                        folderId: folder.id,
                        folderName: folder.folderName,
                        batch: batch,
                        batchIndex: batchIndex,
                        totalBatches: batches.length,
                        processor: () => this.processOCRBatch(folder, batch, apiManager)
                    });
                });
            }
        });
        
        return queue;
    }
    
    /**
     * 处理单个OCR批次
     */
    async processOCRBatch(folder, imageBatch, apiManager) {
        const batchStartTime = Date.now();
        
        try {
            console.log(`🔄 处理文件夹 "${folder.folderName}" 批次: ${imageBatch.length} 张图片`);
            
            // 重建File对象供OCR使用
            const fileObjects = imageBatch.map(imageFile => {
                if (imageFile.dataURL) {
                    return this.dataURLToFile(imageFile.dataURL, imageFile.name, imageFile.type);
                }
                return imageFile.file || imageFile;
            }).filter(file => file);
            
            // 批量OCR处理
            const ocrResults = await apiManager.batchOCR(
                fileObjects,
                (progress) => {
                    // 单批次进度回调
                    console.log(`📸 批次进度: ${progress.current}/${progress.total} - ${progress.fileName}`);
                }
            );
            
            // 处理结果
            const processedResults = {};
            const errors = [];
            
            Object.entries(ocrResults.results).forEach(([fileName, result]) => {
                if (result.error) {
                    errors.push({ fileName, error: result.error });
                } else {
                    processedResults[fileName] = result;
                }
            });
            
            const duration = Date.now() - batchStartTime;
            console.log(`✅ 批次处理完成，耗时: ${Math.round(duration / 1000)}s`);
            
            return {
                folderId: folder.id,
                folderName: folder.folderName,
                results: processedResults,
                errors: errors,
                duration: duration,
                imageCount: imageBatch.length
            };
            
        } catch (error) {
            console.error(`❌ 批次处理失败: ${folder.folderName}`, error);
            throw {
                folderId: folder.id,
                folderName: folder.folderName,
                error: error.message,
                imageCount: imageBatch.length
            };
        }
    }
    
    /**
     * 执行批量处理队列
     */
    async processBatchQueue(queue, progressCallback) {
        const results = {
            successful: [],
            failed: []
        };
        
        let completed = 0;
        let failed = 0;
        
        // 使用并发控制处理队列
        const concurrent = Math.min(this.options.maxConcurrent, queue.length);
        const workers = [];
        
        for (let i = 0; i < concurrent; i++) {
            workers.push(this.createWorker(queue, results, (progress) => {
                completed = progress.completed;
                failed = progress.failed;
                
                if (progressCallback) {
                    progressCallback({
                        completed: completed,
                        failed: failed,
                        total: queue.length,
                        currentItem: progress.currentItem
                    });
                }
            }));
        }
        
        // 等待所有工作线程完成
        await Promise.all(workers);
        
        return results;
    }
    
    /**
     * 创建工作线程
     */
    async createWorker(queue, results, progressCallback) {
        while (queue.length > 0) {
            const job = queue.shift();
            if (!job) break;
            
            try {
                const result = await this.executeJobWithRetry(job);
                results.successful.push(result);
                this.stats.totalProcessed++;
                
                if (progressCallback) {
                    progressCallback({
                        completed: results.successful.length,
                        failed: results.failed.length,
                        currentItem: job.folderName
                    });
                }
                
            } catch (error) {
                results.failed.push({
                    job: job,
                    error: error
                });
                this.stats.totalFailed++;
                
                console.error(`❌ 任务失败: ${job.id}`, error);
            }
            
            // 避免CPU过载
            await this.sleep(100);
        }
    }
    
    /**
     * 带重试的任务执行
     */
    async executeJobWithRetry(job) {
        let lastError;
        
        for (let attempt = 1; attempt <= this.options.retryCount; attempt++) {
            try {
                // 添加超时控制
                const result = await Promise.race([
                    job.processor(),
                    this.createTimeoutPromise(this.options.timeoutMs)
                ]);
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                if (attempt < this.options.retryCount) {
                    console.warn(`⚠️ 任务重试 ${attempt}/${this.options.retryCount}: ${job.id}`);
                    await this.sleep(this.options.retryDelay * attempt); // 指数退避
                } else {
                    console.error(`❌ 任务最终失败: ${job.id}`, error);
                }
            }
        }
        
        throw lastError;
    }
    
    /**
     * 分批处理数组
     */
    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }
    
    /**
     * 计算总图片数量
     */
    calculateTotalImages(folders) {
        return folders.reduce((total, folder) => {
            return total + (folder.imageFiles?.length || 0);
        }, 0);
    }
    
    /**
     * 估算剩余时间
     */
    estimateRemainingTime(progress, task) {
        if (progress.completed === 0) return null;
        
        const elapsedTime = Date.now() - task.startTime;
        const avgTimePerImage = elapsedTime / progress.completed;
        const remainingImages = task.totalImages - progress.completed;
        
        return Math.round(avgTimePerImage * remainingImages);
    }
    
    /**
     * DataURL转File对象
     */
    dataURLToFile(dataURL, fileName, mimeType) {
        try {
            const [header, data] = dataURL.split(',');
            const bytes = atob(data);
            const array = new Uint8Array(bytes.length);
            
            for (let i = 0; i < bytes.length; i++) {
                array[i] = bytes.charCodeAt(i);
            }
            
            return new File([array], fileName, { type: mimeType });
        } catch (error) {
            console.error('DataURL转File失败:', error);
            return null;
        }
    }
    
    /**
     * 创建超时Promise
     */
    createTimeoutPromise(timeoutMs) {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`任务超时: ${timeoutMs}ms`));
            }, timeoutMs);
        });
    }
    
    /**
     * 睡眠函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * 获取任务统计信息
     */
    getTaskStats(task) {
        const duration = task.endTime - task.startTime;
        const totalImages = task.totalImages;
        const avgTimePerImage = totalImages > 0 ? duration / totalImages : 0;
        
        return {
            duration: duration,
            totalImages: totalImages,
            processedImages: task.processedImages,
            failedImages: task.failedImages,
            successRate: totalImages > 0 ? Math.round((task.processedImages / totalImages) * 100) : 0,
            avgTimePerImage: Math.round(avgTimePerImage),
            throughput: duration > 0 ? Math.round((task.processedImages / duration) * 1000 * 60) : 0 // 每分钟处理数
        };
    }
    
    /**
     * 暂停处理
     */
    pause() {
        if (this.currentTask) {
            this.currentTask.status = 'paused';
            console.log('⏸️ 批量处理已暂停');
        }
    }
    
    /**
     * 恢复处理
     */
    resume() {
        if (this.currentTask && this.currentTask.status === 'paused') {
            this.currentTask.status = 'running';
            console.log('▶️ 批量处理已恢复');
        }
    }
    
    /**
     * 取消处理
     */
    cancel() {
        if (this.currentTask) {
            this.currentTask.status = 'cancelled';
            console.log('⏹️ 批量处理已取消');
        }
    }
    
    /**
     * 获取当前进度
     */
    getCurrentProgress() {
        if (!this.currentTask) return null;
        
        const task = this.currentTask;
        const progress = task.totalImages > 0 ? 
            Math.round((task.processedImages / task.totalImages) * 100) : 0;
        
        return {
            taskId: task.id,
            type: task.type,
            status: task.status,
            progress: progress,
            processedImages: task.processedImages,
            failedImages: task.failedImages,
            totalImages: task.totalImages,
            elapsedTime: Date.now() - task.startTime,
            estimatedRemaining: this.estimateRemainingTime({
                completed: task.processedImages
            }, task)
        };
    }
    
    /**
     * 清理资源
     */
    cleanup() {
        this.currentTask = null;
        this.taskQueue = [];
        this.activeJobs.clear();
        this.completedJobs.clear();
        this.failedJobs.clear();
        
        console.log('🧹 批量处理器已清理');
    }
}

// 导出到全局
window.BatchProcessor = BatchProcessor;