/**
 * 进度管理器
 * 专为大数据量处理设计：实时进度显示、后台处理、用户友好的进度反馈
 */

class ProgressManager {
    constructor(options = {}) {
        this.options = {
            updateInterval: 200,        // 进度更新间隔(ms)
            smoothAnimation: true,      // 平滑动画
            showETA: true,             // 显示预计完成时间
            showSpeed: true,           // 显示处理速度
            persistProgress: true,     // 持久化进度状态
            ...options
        };
        
        this.activeProgresses = new Map();
        this.progressHistory = [];
        this.isVisible = false;
        
        this.createProgressUI();
        this.bindEvents();
        
        console.log('📊 进度管理器已初始化');
    }
    
    /**
     * 创建进度显示UI
     */
    createProgressUI() {
        // 创建主容器
        this.container = document.createElement('div');
        this.container.id = 'progress-manager';
        this.container.className = 'progress-manager';
        this.container.innerHTML = `
            <div class="progress-header">
                <div class="progress-title">
                    <span class="title-text">处理进度</span>
                    <div class="progress-controls">
                        <button class="btn-minimize" title="最小化">−</button>
                        <button class="btn-close" title="关闭">×</button>
                    </div>
                </div>
            </div>
            <div class="progress-content">
                <div class="progress-list"></div>
                <div class="progress-summary">
                    <div class="summary-stats"></div>
                    <div class="summary-actions">
                        <button class="btn btn-secondary btn-pause">暂停</button>
                        <button class="btn btn-danger btn-cancel">取消</button>
                    </div>
                </div>
            </div>
        `;
        
        // 应用样式
        this.applyProgressStyles();
        
        // 初始隐藏
        this.container.style.display = 'none';
        document.body.appendChild(this.container);
    }
    
    /**
     * 应用进度条样式
     */
    applyProgressStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .progress-manager {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 500px;
                max-height: 400px;
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                overflow: hidden;
                border: 1px solid rgba(0, 0, 0, 0.1);
            }
            
            .progress-manager.minimized .progress-content {
                display: none;
            }
            
            .progress-header {
                background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%);
                color: white;
                padding: 16px 20px;
                cursor: move;
            }
            
            .progress-title {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .title-text {
                font-weight: 600;
                font-size: 1rem;
            }
            
            .progress-controls {
                display: flex;
                gap: 8px;
            }
            
            .progress-controls button {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                transition: background 0.2s ease;
            }
            
            .progress-controls button:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            
            .progress-content {
                padding: 20px;
                max-height: 300px;
                overflow-y: auto;
            }
            
            .progress-item {
                margin-bottom: 16px;
                padding: 16px;
                background: #f8f9fa;
                border-radius: 8px;
                border: 1px solid #e9ecef;
            }
            
            .progress-item-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }
            
            .progress-item-title {
                font-weight: 600;
                color: #212529;
                font-size: 0.9rem;
            }
            
            .progress-item-status {
                font-size: 0.8rem;
                color: #6c757d;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .status-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                display: inline-block;
            }
            
            .status-indicator.running {
                background: #28a745;
                animation: pulse 1.5s ease-in-out infinite alternate;
            }
            
            .status-indicator.paused {
                background: #ffc107;
            }
            
            .status-indicator.completed {
                background: #17a2b8;
            }
            
            .status-indicator.failed {
                background: #dc3545;
            }
            
            .progress-bar-container {
                position: relative;
                height: 8px;
                background: #e9ecef;
                border-radius: 4px;
                overflow: hidden;
                margin-bottom: 8px;
            }
            
            .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #28a745 0%, #20c997 100%);
                border-radius: 4px;
                transition: width 0.3s ease;
                position: relative;
            }
            
            .progress-bar.indeterminate::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, 
                    transparent 0%, 
                    rgba(255, 255, 255, 0.3) 50%, 
                    transparent 100%);
                animation: shimmer 1.5s linear infinite;
            }
            
            .progress-details {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 0.75rem;
                color: #6c757d;
            }
            
            .progress-stats {
                display: flex;
                gap: 12px;
            }
            
            .progress-eta {
                font-weight: 500;
            }
            
            .progress-summary {
                border-top: 1px solid #e9ecef;
                padding-top: 16px;
                margin-top: 16px;
            }
            
            .summary-stats {
                margin-bottom: 12px;
                font-size: 0.85rem;
                color: #495057;
            }
            
            .summary-actions {
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            
            .summary-actions .btn {
                padding: 6px 12px;
                font-size: 0.8rem;
                border-radius: 6px;
                border: none;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .btn-secondary {
                background: #6c757d;
                color: white;
            }
            
            .btn-secondary:hover {
                background: #545b62;
            }
            
            .btn-danger {
                background: #dc3545;
                color: white;
            }
            
            .btn-danger:hover {
                background: #c82333;
            }
            
            @keyframes pulse {
                from { opacity: 0.6; }
                to { opacity: 1; }
            }
            
            @keyframes shimmer {
                from { transform: translateX(-100%); }
                to { transform: translateX(100%); }
            }
            
            .progress-toast {
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ffffff;
                border: 1px solid #e9ecef;
                border-radius: 8px;
                padding: 12px 16px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                z-index: 10001;
                min-width: 300px;
                animation: slideInRight 0.3s ease;
            }
            
            @keyframes slideInRight {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 最小化按钮
        this.container.querySelector('.btn-minimize').addEventListener('click', () => {
            this.toggleMinimize();
        });
        
        // 关闭按钮
        this.container.querySelector('.btn-close').addEventListener('click', () => {
            this.hide();
        });
        
        // 暂停按钮
        this.container.querySelector('.btn-pause').addEventListener('click', () => {
            this.togglePause();
        });
        
        // 取消按钮
        this.container.querySelector('.btn-cancel').addEventListener('click', () => {
            this.cancelAll();
        });
        
        // 拖拽功能
        this.makeDraggable();
    }
    
    /**
     * 开始新的进度任务
     */
    startProgress(taskId, options = {}) {
        const config = {
            title: '处理中...',
            type: 'default',
            total: 100,
            current: 0,
            showPercentage: true,
            showETA: this.options.showETA,
            showSpeed: this.options.showSpeed,
            indeterminate: false,
            ...options
        };
        
        const progressData = {
            id: taskId,
            ...config,
            startTime: Date.now(),
            lastUpdate: Date.now(),
            status: 'running',
            speed: 0,
            eta: null,
            history: []
        };
        
        this.activeProgresses.set(taskId, progressData);
        this.renderProgress();
        this.show();
        
        console.log(`📊 开始进度跟踪: ${taskId}`);
        return taskId;
    }
    
    /**
     * 更新进度
     */
    updateProgress(taskId, current, options = {}) {
        const progress = this.activeProgresses.get(taskId);
        if (!progress) return;
        
        const now = Date.now();
        const timeDelta = now - progress.lastUpdate;
        
        // 避免过于频繁的更新
        if (timeDelta < this.options.updateInterval && current < progress.total) {
            return;
        }
        
        // 更新数据
        const previousCurrent = progress.current;
        progress.current = current;
        progress.lastUpdate = now;
        
        // 合并选项
        Object.assign(progress, options);
        
        // 计算速度和ETA
        if (timeDelta > 0) {
            const itemsDelta = current - previousCurrent;
            progress.speed = itemsDelta / (timeDelta / 1000); // 每秒处理数
            
            if (progress.speed > 0 && current < progress.total) {
                const remaining = progress.total - current;
                progress.eta = Math.round(remaining / progress.speed * 1000); // 毫秒
            }
        }
        
        // 记录历史
        progress.history.push({
            time: now,
            current: current,
            speed: progress.speed
        });
        
        // 限制历史记录长度
        if (progress.history.length > 50) {
            progress.history = progress.history.slice(-25);
        }
        
        this.renderProgress();
        
        // 检查是否完成
        if (current >= progress.total) {
            this.completeProgress(taskId);
        }
    }
    
    /**
     * 完成进度
     */
    completeProgress(taskId, options = {}) {
        const progress = this.activeProgresses.get(taskId);
        if (!progress) return;
        
        progress.status = 'completed';
        progress.current = progress.total;
        progress.endTime = Date.now();
        
        Object.assign(progress, options);
        
        this.renderProgress();
        
        // 显示完成提示
        this.showToast(`任务完成: ${progress.title}`, 'success');
        
        // 3秒后自动移除已完成的任务
        setTimeout(() => {
            this.removeProgress(taskId);
        }, 3000);
        
        console.log(`✅ 进度完成: ${taskId}`);
    }
    
    /**
     * 失败进度
     */
    failProgress(taskId, error, options = {}) {
        const progress = this.activeProgresses.get(taskId);
        if (!progress) return;
        
        progress.status = 'failed';
        progress.error = error;
        progress.endTime = Date.now();
        
        Object.assign(progress, options);
        
        this.renderProgress();
        
        // 显示错误提示
        this.showToast(`任务失败: ${progress.title}`, 'error');
        
        console.error(`❌ 进度失败: ${taskId}`, error);
    }
    
    /**
     * 渲染进度界面
     */
    renderProgress() {
        const progressList = this.container.querySelector('.progress-list');
        const summaryStats = this.container.querySelector('.summary-stats');
        
        // 清空现有内容
        progressList.innerHTML = '';
        
        // 渲染每个进度项
        for (const [taskId, progress] of this.activeProgresses) {
            const progressItem = this.createProgressItem(progress);
            progressList.appendChild(progressItem);
        }
        
        // 更新摘要统计
        this.updateSummaryStats(summaryStats);
        
        // 如果没有活动任务，隐藏界面
        if (this.activeProgresses.size === 0) {
            setTimeout(() => this.hide(), 1000);
        }
    }
    
    /**
     * 创建单个进度项
     */
    createProgressItem(progress) {
        const item = document.createElement('div');
        item.className = 'progress-item';
        
        const percentage = progress.total > 0 ? 
            Math.round((progress.current / progress.total) * 100) : 0;
        
        const statusClass = progress.status;
        const statusText = this.getStatusText(progress.status);
        
        item.innerHTML = `
            <div class="progress-item-header">
                <div class="progress-item-title">${progress.title}</div>
                <div class="progress-item-status">
                    <span class="status-indicator ${statusClass}"></span>
                    ${statusText}
                </div>
            </div>
            
            <div class="progress-bar-container">
                <div class="progress-bar ${progress.indeterminate ? 'indeterminate' : ''}" 
                     style="width: ${progress.indeterminate ? '100%' : percentage + '%'}"></div>
            </div>
            
            <div class="progress-details">
                <div class="progress-stats">
                    ${progress.showPercentage ? `<span>${percentage}%</span>` : ''}
                    <span>${progress.current}/${progress.total}</span>
                    ${progress.showSpeed && progress.speed > 0 ? 
                        `<span>${Math.round(progress.speed * 60)}/分钟</span>` : ''}
                </div>
                <div class="progress-eta">
                    ${progress.showETA && progress.eta ? 
                        `剩余 ${this.formatTime(progress.eta)}` : ''}
                </div>
            </div>
        `;
        
        return item;
    }
    
    /**
     * 更新摘要统计
     */
    updateSummaryStats(element) {
        const stats = this.calculateStats();
        
        element.innerHTML = `
            <div>总任务: ${stats.total} | 
                 运行中: ${stats.running} | 
                 已完成: ${stats.completed} | 
                 失败: ${stats.failed}</div>
        `;
    }
    
    /**
     * 计算统计信息
     */
    calculateStats() {
        const stats = {
            total: this.activeProgresses.size,
            running: 0,
            paused: 0,
            completed: 0,
            failed: 0
        };
        
        for (const progress of this.activeProgresses.values()) {
            stats[progress.status]++;
        }
        
        return stats;
    }
    
    /**
     * 显示提示消息
     */
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = 'progress-toast';
        
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };
        
        toast.style.borderLeft = `4px solid ${colors[type] || colors.info}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }
    
    /**
     * 显示进度管理器
     */
    show() {
        this.container.style.display = 'block';
        this.isVisible = true;
        
        // 添加显示动画
        this.container.style.animation = 'slideInUp 0.3s ease';
    }
    
    /**
     * 隐藏进度管理器
     */
    hide() {
        this.container.style.animation = 'slideOutDown 0.3s ease';
        setTimeout(() => {
            this.container.style.display = 'none';
            this.isVisible = false;
        }, 300);
    }
    
    /**
     * 切换最小化状态
     */
    toggleMinimize() {
        this.container.classList.toggle('minimized');
    }
    
    /**
     * 暂停所有任务
     */
    togglePause() {
        // 这里应该调用相应的暂停/恢复逻辑
        console.log('🔄 切换暂停状态');
    }
    
    /**
     * 取消所有任务
     */
    cancelAll() {
        if (confirm('确定要取消所有正在进行的任务吗？')) {
            // 这里应该调用相应的取消逻辑
            console.log('⏹️ 取消所有任务');
        }
    }
    
    /**
     * 移除进度项
     */
    removeProgress(taskId) {
        this.activeProgresses.delete(taskId);
        this.renderProgress();
    }
    
    /**
     * 使窗口可拖拽
     */
    makeDraggable() {
        const header = this.container.querySelector('.progress-header');
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        
        header.addEventListener('mousedown', (e) => {
            isDragging = true;
            const rect = this.container.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            document.addEventListener('mousemove', handleDrag);
            document.addEventListener('mouseup', stopDrag);
        });
        
        const handleDrag = (e) => {
            if (!isDragging) return;
            
            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;
            
            this.container.style.left = x + 'px';
            this.container.style.top = y + 'px';
            this.container.style.transform = 'none';
        };
        
        const stopDrag = () => {
            isDragging = false;
            document.removeEventListener('mousemove', handleDrag);
            document.removeEventListener('mouseup', stopDrag);
        };
    }
    
    // 辅助方法
    getStatusText(status) {
        const statusMap = {
            running: '运行中',
            paused: '已暂停',
            completed: '已完成',
            failed: '失败'
        };
        return statusMap[status] || status;
    }
    
    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        if (seconds < 60) return `${seconds}秒`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}分${seconds % 60}秒`;
        const hours = Math.floor(minutes / 60);
        return `${hours}时${minutes % 60}分`;
    }
    
    /**
     * 销毁进度管理器
     */
    destroy() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        
        this.activeProgresses.clear();
        console.log('📊 进度管理器已销毁');
    }
}

// 导出到全局
window.ProgressManager = ProgressManager;