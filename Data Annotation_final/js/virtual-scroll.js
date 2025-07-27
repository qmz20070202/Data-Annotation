/**
 * 虚拟滚动组件 - 专为大数据量优化
 * 支持数百个文件夹的流畅显示
 */

class VirtualScrollManager {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            itemHeight: 320, // 单个文件夹卡片高度
            containerHeight: 600, // 可视区域高度
            buffer: 5, // 缓冲区项目数量
            threshold: 50, // 触发虚拟滚动的最小项目数
            ...options
        };
        
        this.items = [];
        this.visibleStart = 0;
        this.visibleEnd = 0;
        this.scrollTop = 0;
        this.isVirtualMode = false;
        
        this.init();
    }
    
    init() {
        // 创建虚拟滚动容器结构
        this.container.style.position = 'relative';
        this.container.style.overflow = 'auto';
        
        // 创建占位容器
        this.spacer = document.createElement('div');
        this.spacer.className = 'virtual-scroll-spacer';
        this.spacer.style.position = 'absolute';
        this.spacer.style.top = '0';
        this.spacer.style.left = '0';
        this.spacer.style.right = '0';
        this.spacer.style.pointerEvents = 'none';
        
        // 创建可视区域容器
        this.viewport = document.createElement('div');
        this.viewport.className = 'virtual-scroll-viewport';
        this.viewport.style.position = 'relative';
        
        this.container.appendChild(this.spacer);
        this.container.appendChild(this.viewport);
        
        // 绑定滚动事件
        this.container.addEventListener('scroll', this.handleScroll.bind(this));
        window.addEventListener('resize', this.handleResize.bind(this));
    }
    
    /**
     * 设置数据项
     */
    setItems(items) {
        this.items = items;
        this.isVirtualMode = items.length > this.options.threshold;
        
        if (this.isVirtualMode) {
            console.log(`🚀 启用虚拟滚动模式，优化 ${items.length} 个项目的显示性能`);
            this.updateVirtualScroll();
        } else {
            console.log(`📋 常规模式显示 ${items.length} 个项目`);
            this.renderAllItems();
        }
    }
    
    /**
     * 处理滚动事件
     */
    handleScroll() {
        if (!this.isVirtualMode) return;
        
        const scrollTop = this.container.scrollTop;
        if (Math.abs(scrollTop - this.scrollTop) < 10) return; // 减少不必要的重绘
        
        this.scrollTop = scrollTop;
        this.updateVirtualScroll();
    }
    
    /**
     * 更新虚拟滚动显示
     */
    updateVirtualScroll() {
        if (!this.isVirtualMode) return;
        
        const containerHeight = this.container.clientHeight;
        const totalHeight = this.items.length * this.options.itemHeight;
        
        // 计算可视区域
        const visibleStart = Math.floor(this.scrollTop / this.options.itemHeight);
        const visibleCount = Math.ceil(containerHeight / this.options.itemHeight);
        const visibleEnd = Math.min(visibleStart + visibleCount, this.items.length);
        
        // 添加缓冲区
        const bufferedStart = Math.max(0, visibleStart - this.options.buffer);
        const bufferedEnd = Math.min(this.items.length, visibleEnd + this.options.buffer);
        
        // 检查是否需要更新
        if (bufferedStart === this.visibleStart && bufferedEnd === this.visibleEnd) {
            return;
        }
        
        this.visibleStart = bufferedStart;
        this.visibleEnd = bufferedEnd;
        
        // 更新占位容器高度
        this.spacer.style.height = `${totalHeight}px`;
        
        // 渲染可视区域项目
        this.renderVisibleItems();
    }
    
    /**
     * 渲染可视区域内的项目
     */
    renderVisibleItems() {
        const fragment = document.createDocumentFragment();
        
        // 清空当前显示
        this.viewport.innerHTML = '';
        
        // 渲染可视区域项目
        for (let i = this.visibleStart; i < this.visibleEnd; i++) {
            const item = this.items[i];
            const element = this.createItemElement(item, i);
            
            // 设置绝对定位
            element.style.position = 'absolute';
            element.style.top = `${i * this.options.itemHeight}px`;
            element.style.left = '0';
            element.style.right = '0';
            element.style.height = `${this.options.itemHeight}px`;
            
            fragment.appendChild(element);
        }
        
        this.viewport.appendChild(fragment);
        
        // 调试信息
        console.log(`🎯 虚拟滚动渲染: ${this.visibleStart}-${this.visibleEnd} / ${this.items.length}`);
    }
    
    /**
     * 渲染所有项目（非虚拟模式）
     */
    renderAllItems() {
        const fragment = document.createDocumentFragment();
        this.viewport.innerHTML = '';
        
        this.items.forEach((item, index) => {
            const element = this.createItemElement(item, index);
            fragment.appendChild(element);
        });
        
        this.viewport.appendChild(fragment);
    }
    
    /**
     * 创建单个项目元素 - 由外部提供具体实现
     */
    createItemElement(item, index) {
        // 这个方法应该被重写
        const div = document.createElement('div');
        div.textContent = `Item ${index}`;
        return div;
    }
    
    /**
     * 处理窗口大小变化
     */
    handleResize() {
        if (this.isVirtualMode) {
            this.updateVirtualScroll();
        }
    }
    
    /**
     * 滚动到指定项目
     */
    scrollToItem(index) {
        if (index < 0 || index >= this.items.length) return;
        
        const targetTop = index * this.options.itemHeight;
        this.container.scrollTo({
            top: targetTop,
            behavior: 'smooth'
        });
    }
    
    /**
     * 获取当前可视区域的项目索引
     */
    getVisibleRange() {
        return {
            start: this.visibleStart,
            end: this.visibleEnd
        };
    }
    
    /**
     * 销毁虚拟滚动
     */
    destroy() {
        this.container.removeEventListener('scroll', this.handleScroll.bind(this));
        window.removeEventListener('resize', this.handleResize.bind(this));
        
        if (this.spacer && this.spacer.parentNode) {
            this.spacer.parentNode.removeChild(this.spacer);
        }
        if (this.viewport && this.viewport.parentNode) {
            this.viewport.parentNode.removeChild(this.viewport);
        }
    }
}

/**
 * 专门用于文件夹列表的虚拟滚动实现
 */
class FolderVirtualScroll extends VirtualScrollManager {
    constructor(container, dashboardManager, options = {}) {
        const folderOptions = {
            itemHeight: 340, // 文件夹卡片高度
            containerHeight: container.clientHeight,
            buffer: 3,
            threshold: 20, // 超过20个文件夹启用虚拟滚动
            ...options
        };
        
        super(container, folderOptions);
        this.dashboardManager = dashboardManager;
    }
    
    /**
     * 创建文件夹卡片元素
     */
    createItemElement(folder, index) {
        const card = document.createElement('div');
        card.className = 'folder-card';
        card.dataset.folderId = folder.id;
        
        // 使用原有的文件夹卡片渲染逻辑
        card.innerHTML = this.renderFolderCardContent(folder);
        
        // 绑定事件
        this.bindFolderCardEvents(card, folder);
        
        return card;
    }
    
    /**
     * 渲染文件夹卡片内容
     */
    renderFolderCardContent(folder) {
        const metadata = folder.metadata || {};
        const progress = this.calculateProgress(metadata);
        
        return `
            <div class="folder-card-header">
                <h4 class="folder-name" title="${folder.folderName}">${folder.folderName}</h4>
                <span class="folder-status status-${folder.status}">${this.getStatusText(folder.status)}</span>
            </div>
            
            <div class="folder-meta">
                <div class="meta-item">
                    <span class="meta-label">图片数量</span>
                    <span class="meta-value">${metadata.totalImages || 0}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">已处理</span>
                    <span class="meta-value">${metadata.processedImages || 0}</span>
                </div>
            </div>
            
            <div class="folder-progress">
                <div class="progress-label">
                    <span>处理进度</span>
                    <span class="progress-percent ${progress.level}">${progress.percent}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${progress.percent}%; background: ${progress.color};"></div>
                </div>
            </div>
            
            <div class="folder-actions">
                ${this.renderActionButtons(folder)}
            </div>
        `;
    }
    
    /**
     * 渲染操作按钮
     */
    renderActionButtons(folder) {
        const buttons = [];
        
        switch (folder.status) {
            case 'unprocessed':
                buttons.push('<button class="btn btn-primary" data-action="process">开始识别</button>');
                buttons.push('<button class="btn btn-secondary" data-action="export">导出</button>');
                buttons.push('<button class="btn btn-danger" data-action="delete">删除</button>');
                break;
            case 'processed':
                buttons.push('<button class="btn btn-success" data-action="calibrate">开始校准</button>');
                buttons.push('<button class="btn btn-secondary" data-action="export">导出</button>');
                buttons.push('<button class="btn btn-danger" data-action="delete">删除</button>');
                break;
            case 'calibrated':
                buttons.push('<button class="btn btn-info" data-action="edit">重新编辑</button>');
                buttons.push('<button class="btn btn-secondary" data-action="export">导出</button>');
                buttons.push('<button class="btn btn-danger" data-action="delete">删除</button>');
                break;
        }
        
        return buttons.join('');
    }
    
    /**
     * 绑定文件夹卡片事件
     */
    bindFolderCardEvents(card, folder) {
        // 按钮点击事件
        card.addEventListener('click', async (e) => {
            if (e.target.classList.contains('btn')) {
                e.stopPropagation();
                const action = e.target.dataset.action;
                await this.dashboardManager.handleFolderAction(folder, action);
            }
        });
        
        // 卡片点击选择
        card.addEventListener('click', () => {
            this.dashboardManager.selectFolder(folder.id);
        });
        
        // 双击进入校准
        card.addEventListener('dblclick', () => {
            if (folder.status === 'processed' || folder.status === 'calibrated') {
                this.dashboardManager.openCalibrationPage(folder.id);
            }
        });
    }
    
    /**
     * 计算处理进度
     */
    calculateProgress(metadata) {
        const total = metadata.totalImages || 0;
        const processed = metadata.processedImages || 0;
        const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
        
        let color, level;
        if (percent < 30) {
            color = '#FF3B30';
            level = 'red';
        } else if (percent < 80) {
            color = '#FF9500';
            level = 'orange';
        } else {
            color = '#34C759';
            level = 'green';
        }
        
        return { percent, color, level };
    }
    
    /**
     * 获取状态文本
     */
    getStatusText(status) {
        const statusMap = {
            'unprocessed': '未处理',
            'processed': '已识别',
            'calibrated': '已校准'
        };
        return statusMap[status] || status;
    }
}

// 导出类
window.VirtualScrollManager = VirtualScrollManager;
window.FolderVirtualScroll = FolderVirtualScroll;