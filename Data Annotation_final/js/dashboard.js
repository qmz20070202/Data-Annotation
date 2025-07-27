/**
 * 主控台管理器
 * 负责管理三栏布局和文件夹状态流转
 */

class DashboardManager {
    constructor() {
        this.folders = new Map();
        this.selectedFolders = new Set();
        this.batchProcessing = false;
        
        // DOM 元素引用
        this.elements = {
            // 统计卡片
            totalFolders: document.getElementById('totalFolders'),
            totalImages: document.getElementById('totalImages'),
            processedImages: document.getElementById('processedImages'),
            calibratedImages: document.getElementById('calibratedImages'),
            
            // 栏目计数
            unprocessedCount: document.getElementById('unprocessedCount'),
            processedCount: document.getElementById('processedCount'),
            calibratedCount: document.getElementById('calibratedCount'),
            
            // 栏目内容区
            unprocessedList: document.getElementById('unprocessedList'),
            processedList: document.getElementById('processedList'),
            calibratedList: document.getElementById('calibratedList'),
            
            // 按钮
            uploadFolderBtn: document.getElementById('uploadFolderBtn'),
            imageSettingsBtn: document.getElementById('imageSettingsBtn'),
            batchProcessBtn: document.getElementById('batchProcessBtn'),
            batchCalibrateBtn: document.getElementById('batchCalibrateBtn'),
            exportCalibratedBtn: document.getElementById('exportCalibratedBtn'),
            exportBtn: document.getElementById('exportBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            
            // 状态栏
            statusText: document.getElementById('statusText'),
            lastUpdateTime: document.getElementById('lastUpdateTime')
        };
        
        // 延迟初始化，避免在构造函数中直接调用async函数
        setTimeout(() => {
            this.init().catch(error => {
                console.error('延迟初始化失败:', error);
            });
        }, 0);
    }

    /**
     * 初始化主控台
     */
    async init() {
        try {
            // 初始化存储管理器
            await window.storageManager.init();
            
            // 绑定事件监听器
            this.bindEvents();
            
            // 绑定键盘快捷键
            this.bindKeyboardShortcuts();
            
            // 加载文件夹数据
            await this.loadFolders();
            
            // 更新统计信息
            this.updateStatistics();
            
            // 更新状态
            this.updateStatus('主控台已就绪');
            this.updateLastUpdateTime();
            
            console.log('主控台初始化完成');
        } catch (error) {
            console.error('主控台初始化失败:', error);
            await window.modalManager.showAlert({
                title: '初始化失败',
                message: `主控台初始化时发生错误：${error.message}`,
                buttonClass: 'danger'
            });
        }
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 上传文件夹
        this.elements.uploadFolderBtn.addEventListener('click', () => {
            this.uploadFolder();
        });
        
        // 图片设置
        this.elements.imageSettingsBtn.addEventListener('click', () => {
            this.showImageSettings();
        });
        
        // 批量处理
        this.elements.batchProcessBtn.addEventListener('click', () => {
            this.batchProcess();
        });
        
        // 批量校准
        this.elements.batchCalibrateBtn.addEventListener('click', () => {
            this.batchCalibrate();
        });
        
        // 导出已校准数据
        this.elements.exportCalibratedBtn.addEventListener('click', () => {
            this.exportCalibratedData();
        });
        
        // 导出所有数据
        this.elements.exportBtn.addEventListener('click', () => {
            this.exportAllData();
        });
        
        // 设置
        this.elements.settingsBtn.addEventListener('click', () => {
            this.showSettings();
        });
        
        // 每5分钟自动刷新数据
        setInterval(() => {
            this.refreshData();
        }, 5 * 60 * 1000);
    }

    /**
     * 加载文件夹数据
     */
    async loadFolders() {
        try {
            const folders = await window.storageManager.getAllFolders();
            this.folders.clear();
            
            folders.forEach(folder => {
                this.folders.set(folder.id, folder);
            });
            
            this.renderAllColumns();
            console.log(`加载了 ${folders.length} 个文件夹`);
        } catch (error) {
            console.error('加载文件夹失败:', error);
        }
    }

    /**
     * 渲染所有栏目
     */
    renderAllColumns() {
        this.renderColumn('unprocessed');
        this.renderColumn('processed');
        this.renderColumn('calibrated');
        this.updateColumnCounts();
    }

    /**
     * 渲染指定栏目
     */
    renderColumn(status) {
        const folders = Array.from(this.folders.values()).filter(f => f.status === status);
        const listElement = this.elements[`${status}List`];
        
        if (folders.length === 0) {
            listElement.innerHTML = this.getEmptyStateHTML(status);
            return;
        }
        
        listElement.innerHTML = folders.map(folder => this.createFolderCardHTML(folder)).join('');
        
        // 绑定卡片事件
        listElement.querySelectorAll('.folder-card').forEach(card => {
            const folderId = parseInt(card.dataset.folderId);
            const folder = this.folders.get(folderId);
            
            // 点击事件
            card.addEventListener('click', (e) => {
                if (e.ctrlKey || e.metaKey) {
                    this.toggleFolderSelection(folderId);
                } else {
                    this.selectFolder(folderId);
                }
            });
            
            // 双击进入校准页面
            card.addEventListener('dblclick', () => {
                this.openCalibrationPage(folderId);
            });
            
            // 绑定按钮事件
            this.bindFolderCardEvents(card, folder);
        });
    }

    /**
     * 创建文件夹卡片HTML
     */
    createFolderCardHTML(folder) {
        const progressPercent = folder.metadata.totalImages > 0 ? 
            Math.round((folder.metadata.processedImages / folder.metadata.totalImages) * 100) : 0;
        const calibrationPercent = folder.metadata.totalImages > 0 ? 
            Math.round((folder.metadata.calibratedImages / folder.metadata.totalImages) * 100) : 0;

        // 动态进度条颜色和class
        function getProgressColor(percent) {
            if (percent >= 90) return '#34C759'; // 绿色
            if (percent >= 50) return '#FF9500'; // 橙色
            return '#FF3B30'; // 红色
        }
        function getProgressClass(percent) {
            if (percent >= 90) return 'green';
            if (percent >= 50) return 'orange';
            return 'red';
        }
        const progressBarStyle = `width: ${progressPercent}%; background: ${getProgressColor(progressPercent)};`;
        const calibrationBarStyle = `width: ${calibrationPercent}%; background: ${getProgressColor(calibrationPercent)};`;
        const progressPercentClass = getProgressClass(progressPercent);
        const calibrationPercentClass = getProgressClass(calibrationPercent);

        return `
            <div class="folder-card" data-folder-id="${folder.id}">
                <div class="folder-card-header">
                    <h4 class="folder-name">${folder.folderName}</h4>
                    <span class="folder-status status-${folder.status}">
                        ${this.getStatusText(folder.status)}
                    </span>
                </div>
                
                <div class="folder-meta">
                    <div class="meta-item">
                        <span class="meta-label">图片总数</span>
                        <span class="meta-value">${folder.metadata.totalImages}</span>
                    </div>
                    <div class="meta-item">
                        <span class="meta-label">创建时间</span>
                        <span class="meta-value">${this.formatDate(folder.createdAt)}</span>
                    </div>
                </div>
                
                <div class="folder-progress">
                    <div class="progress-label">
                        <span>识别进度</span>
                        <span>${folder.metadata.processedImages}/${folder.metadata.totalImages} (<span class="progress-percent ${progressPercentClass}">${progressPercent}%</span>)</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="${progressBarStyle}"></div>
                    </div>
                </div>
                ${folder.status === 'calibrated' ? `
                    <div class="folder-progress">
                        <div class="progress-label">
                            <span>校准进度</span>
                            <span>${folder.metadata.calibratedImages}/${folder.metadata.totalImages} (<span class="progress-percent ${calibrationPercentClass}">${calibrationPercent}%</span>)</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="${calibrationBarStyle}"></div>
                        </div>
                    </div>
                ` : ''}
                <div class="folder-actions">
                    ${this.getFolderActionsHTML(folder)}
                </div>
            </div>
        `;
    }

    /**
     * 获取文件夹操作按钮HTML
     */
    getFolderActionsHTML(folder) {
        switch (folder.status) {
            case 'unprocessed':
                return `
                    <button class="btn btn-small btn-primary" data-action="process">
                        🚀 识别
                    </button>
                    <button class="btn btn-small btn-danger" data-action="delete">
                        🗑️ 删除
                    </button>
                `;
            case 'processed':
                return `
                    <button class="btn btn-small btn-success" data-action="calibrate">
                        🎯 校准
                    </button>
                    <button class="btn btn-small btn-secondary" data-action="reprocess">
                        🔄 重新识别
                    </button>
                    <button class="btn btn-small btn-danger" data-action="delete">
                        🗑️ 删除
                    </button>
                `;
            case 'calibrated':
                return `
                    <button class="btn btn-small btn-success" data-action="export">
                        💾 导出
                    </button>
                    <button class="btn btn-small btn-secondary" data-action="edit">
                        ✏️ 编辑
                    </button>
                    <button class="btn btn-small btn-danger" data-action="delete">
                        🗑️ 删除
                    </button>
                `;
            default:
                return '';
        }
    }

    /**
     * 绑定文件夹卡片事件
     */
    bindFolderCardEvents(card, folder) {
        card.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                
                switch (action) {
                    case 'process':
                        await this.processSingleFolder(folder.id);
                        break;
                    case 'calibrate':
                        this.openCalibrationPage(folder.id);
                        break;
                    case 'reprocess':
                        await this.reprocessFolder(folder.id);
                        break;
                    case 'export':
                        await this.exportSingleFolder(folder.id);
                        break;
                    case 'edit':
                        this.openCalibrationPage(folder.id);
                        break;
                    case 'delete':
                        await this.deleteFolder(folder.id);
                        break;
                }
            });
        });
    }

    /**
     * 获取空状态HTML
     */
    getEmptyStateHTML(status) {
        const emptyStates = {
            unprocessed: {
                icon: '📁',
                title: '暂无未识别的文件夹',
                subtitle: '点击上方"上传文件夹"按钮开始',
                button: '<button class="btn btn-primary" onclick="document.getElementById(\'uploadFolderBtn\').click()">上传第一个文件夹</button>'
            },
            processed: {
                icon: '✅',
                title: '暂无已识别的文件夹',
                subtitle: '完成OCR识别后会出现在这里',
                button: ''
            },
            calibrated: {
                icon: '🎯',
                title: '暂无已校准的文件夹',
                subtitle: '完成人工校准后会出现在这里',
                button: ''
            }
        };
        
        const state = emptyStates[status];
        return `
            <div class="empty-state">
                <div class="empty-icon">${state.icon}</div>
                <p>${state.title}</p>
                <p class="empty-hint">${state.subtitle}</p>
                ${state.button}
            </div>
        `;
    }

    /**
     * 上传文件夹
     */
    async uploadFolder() {
        try {
            this.updateStatus('正在选择文件夹...');
            
            // 使用File System Access API选择文件夹
            const dirHandle = await window.showDirectoryPicker();
            
            // 扫描图片文件
            const imageFiles = await this.scanImageFiles(dirHandle);
            
            if (imageFiles.length === 0) {
                await window.modalManager.showAlert({
                    title: '文件夹为空',
                    message: '所选文件夹中没有找到支持的图片文件（jpg, png, gif, bmp）',
                    buttonClass: 'danger'
                });
                return;
            }

            // 显示上传确认弹窗
            const confirmed = await window.modalManager.showUploadConfirm(
                dirHandle.name, 
                imageFiles.length
            );
            
            if (!confirmed) {
                this.updateStatus('已取消文件夹上传');
                return;
            }

            // 将文件转换为可存储的格式
            const imageFilesData = await Promise.all(
                imageFiles.map(async file => {
                    try {
                        // 使用FileReader确保兼容性
                        const dataURL = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(file);
                        });
                        
                        return {
                            name: file.name,
                            type: file.type || 'image/jpeg',
                            size: file.size,
                            dataURL: dataURL, // 存储完整的data URL
                            lastModified: file.lastModified || Date.now()
                        };
                    } catch (error) {
                        console.error(`转换文件 ${file.name} 失败:`, error);
                        return null;
                    }
                })
            );
            
            // 过滤掉转换失败的文件
            const validImageFiles = imageFilesData.filter(file => file !== null);

            if (validImageFiles.length === 0) {
                await window.modalManager.showAlert({
                    title: '文件处理失败',
                    message: '无法处理文件夹中的图片文件，请检查文件格式',
                    buttonClass: 'danger'
                });
                return;
            }

            // 保存文件夹数据
            const folderData = {
                name: dirHandle.name,
                status: 'unprocessed',
                imageFiles: validImageFiles,
                ocrResults: {},
                annotations: {}
            };
            
            console.log(`成功转换 ${validImageFiles.length} 个图片文件用于存储`);

            const savedFolder = await window.storageManager.saveFolder(folderData);
            this.folders.set(savedFolder.id, savedFolder);
            
            // 更新界面
            this.renderAllColumns();
            this.updateStatistics();
            this.updateLastUpdateTime();
            
            this.updateStatus(`成功上传文件夹 "${dirHandle.name}"，包含 ${imageFiles.length} 张图片`);
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('上传文件夹失败:', error);
                await window.modalManager.showAlert({
                    title: '上传失败',
                    message: `上传文件夹时发生错误：${error.message}`,
                    buttonClass: 'danger'
                });
            }
            this.updateStatus('文件夹上传失败');
        }
    }

    /**
     * 扫描文件夹中的图片文件
     */
    async scanImageFiles(dirHandle) {
        const supportedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp'];
        const imageFiles = [];

        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const file = await entry.getFile();
                if (supportedTypes.includes(file.type)) {
                    imageFiles.push(file);
                }
            }
        }

        return imageFiles.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * 打开校准页面
     */
    openCalibrationPage(folderId) {
        // 将文件夹ID存储到sessionStorage，供校准页面使用
        sessionStorage.setItem('currentFolderId', folderId);
        
        // 跳转到校准页面
        window.location.href = 'calibration.html';
    }

    /**
     * 更新统计信息
     */
    updateStatistics() {
        const stats = {
            totalFolders: this.folders.size,
            unprocessedFolders: 0,
            processedFolders: 0,
            calibratedFolders: 0,
            totalImages: 0,
            processedImages: 0,
            calibratedImages: 0
        };

        this.folders.forEach(folder => {
            stats[`${folder.status}Folders`]++;
            stats.totalImages += folder.metadata.totalImages;
            stats.processedImages += folder.metadata.processedImages;
            stats.calibratedImages += folder.metadata.calibratedImages;
        });

        // 更新DOM
        this.elements.totalFolders.textContent = stats.totalFolders;
        this.elements.totalImages.textContent = stats.totalImages;
        this.elements.processedImages.textContent = stats.processedImages;
        this.elements.calibratedImages.textContent = stats.calibratedImages;
    }

    /**
     * 更新栏目计数
     */
    updateColumnCounts() {
        const counts = {
            unprocessed: 0,
            processed: 0,
            calibrated: 0
        };

        this.folders.forEach(folder => {
            counts[folder.status]++;
        });

        this.elements.unprocessedCount.textContent = counts.unprocessed;
        this.elements.processedCount.textContent = counts.processed;
        this.elements.calibratedCount.textContent = counts.calibrated;
    }

    /**
     * 工具方法
     */
    getStatusText(status) {
        const statusTexts = {
            unprocessed: '未识别',
            processed: '已识别',
            calibrated: '已校准'
        };
        return statusTexts[status] || status;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN');
    }

    updateStatus(message) {
        this.elements.statusText.textContent = message;
    }

    updateLastUpdateTime() {
        this.elements.lastUpdateTime.textContent = 
            `最后更新: ${new Date().toLocaleTimeString('zh-CN')}`;
    }

    /**
     * 刷新数据
     */
    async refreshData() {
        await this.loadFolders();
        this.updateStatistics();
        this.updateLastUpdateTime();
    }

    /**
     * 处理单个文件夹的OCR
     */
    async processSingleFolder(folderId) {
        const folder = this.folders.get(folderId);
        if (!folder) return;

        const confirmed = await window.modalManager.showConfirm({
            title: '确认开始识别',
            message: `
                <div style="text-align: center;">
                    <p>即将开始识别文件夹：<strong>${folder.folderName}</strong></p>
                    <p style="color: #8E8E93;">包含 ${folder.metadata.totalImages} 张图片</p>
                </div>
            `,
            confirmText: '开始识别',
            confirmClass: 'primary'
        });

        if (!confirmed) return;

        try {
            // 显示进度模态框
            const progressModal = window.modalManager.showProgress({
                title: '正在识别文字...',
                message: `正在处理文件夹 "${folder.folderName}"...`,
                showProgress: true
            });

            this.updateStatus(`正在识别文件夹: ${folder.folderName}`);

            // 初始化API管理器
            if (!window.apiManager) {
                window.apiManager = new APIManager();
            }

            // 将存储的数据转换为File对象用于OCR处理
            const actualFiles = folder.imageFiles.map(imageFileData => {
                try {
                    // 优先使用File对象
                    if (imageFileData.file && imageFileData.file instanceof File) {
                        return imageFileData.file;
                    }
                    // 从dataURL重建File对象
                    else if (imageFileData.dataURL) {
                        const arr = imageFileData.dataURL.split(',');
                        const mime = arr[0].match(/:(.*?);/)[1];
                        const bstr = atob(arr[1]);
                        let n = bstr.length;
                        const u8arr = new Uint8Array(n);
                        while (n--) {
                            u8arr[n] = bstr.charCodeAt(n);
                        }
                        return new File([u8arr], imageFileData.name, {
                            type: mime,
                            lastModified: imageFileData.lastModified
                        });
                    }
                    // 向后兼容：从base64数据重建
                    else if (imageFileData.data) {
                        const byteCharacters = atob(imageFileData.data);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        return new File([byteArray], imageFileData.name, {
                            type: imageFileData.type,
                            lastModified: imageFileData.lastModified
                        });
                    }
                } catch (error) {
                    console.error(`重建文件 ${imageFileData.name} 失败:`, error);
                }
                return null;
            }).filter(f => f);
            
            console.log(`成功重建 ${actualFiles.length} 个文件对象用于OCR处理`);
            
            if (actualFiles.length === 0) {
                throw new Error('没有找到可处理的图片文件');
            }

            // 使用真实的OCR API处理
            const ocrResults = await window.apiManager.processLocalImageFolder(
                actualFiles,
                (progressInfo) => {
                    const progress = Math.round((progressInfo.current / progressInfo.total) * 100);
                    progressModal.updateProgress(progress);
                    progressModal.updateMessage(`正在识别: ${progressInfo.fileName} (${progressInfo.current}/${progressInfo.total})`);
                }
            );

            // 将OCR结果存储到文件夹对象中
            folder.ocrResults = ocrResults.results;

            // 更新文件夹状态
            folder.status = 'processed';
            folder.metadata.processedImages = folder.imageFiles.length;
            folder.updatedAt = new Date().toISOString();

            // 保存到数据库
            await window.storageManager.saveFolder(folder);
            this.folders.set(folderId, folder);

            // 关闭进度模态框
            progressModal.close();

            // 重新渲染界面
            this.renderAllColumns();
            this.updateStatistics();
            this.updateLastUpdateTime();

            // 显示完成提示
            await window.modalManager.showAlert({
                title: '识别完成',
                message: `
                    <div style="text-align: center;">
                        <p>文件夹 "${folder.folderName}" 识别完成</p>
                        <p style="color: #8E8E93;">共处理 ${ocrResults.totalFiles} 张图片</p>
                        <p style="color: #34C759;">成功 ${ocrResults.successCount} 张，失败 ${ocrResults.errorCount} 张</p>
                    </div>
                `,
                buttonClass: 'primary'
            });

            this.updateStatus(`文件夹 "${folder.folderName}" 识别完成 - 成功 ${ocrResults.successCount}/${ocrResults.totalFiles}`);

        } catch (error) {
            console.error('处理文件夹失败:', error);
            await window.modalManager.showAlert({
                title: '识别失败',
                message: `处理文件夹时发生错误：${error.message}`,
                buttonClass: 'danger'
            });
        }
    }

    /**
     * 批量处理未识别的文件夹
     */
    async batchProcess() {
        const unprocessedFolders = Array.from(this.folders.values()).filter(f => f.status === 'unprocessed');
        
        if (unprocessedFolders.length === 0) {
            await window.modalManager.showAlert({
                title: '没有可处理的文件夹',
                message: '当前没有未识别的文件夹需要处理',
                buttonClass: 'primary'
            });
            return;
        }

        const confirmed = await window.modalManager.showConfirm({
            title: '批量识别确认',
            message: `
                <div style="text-align: center;">
                    <p>即将批量识别 <strong>${unprocessedFolders.length}</strong> 个文件夹</p>
                    <p style="color: #8E8E93;">总计 ${unprocessedFolders.reduce((sum, f) => sum + f.metadata.totalImages, 0)} 张图片</p>
                    <p style="color: #FF9500; font-size: 0.9em;">⚠️ 此操作可能需要较长时间</p>
                </div>
            `,
            confirmText: '开始批量识别',
            confirmClass: 'primary'
        });

        if (!confirmed) return;

        this.batchProcessing = true;

        for (let i = 0; i < unprocessedFolders.length; i++) {
            const folder = unprocessedFolders[i];
            this.updateStatus(`批量处理中: ${i + 1}/${unprocessedFolders.length} - ${folder.folderName}`);
            await this.processSingleFolder(folder.id);
        }

        this.batchProcessing = false;
        this.updateStatus('批量处理完成');

        await window.modalManager.showAlert({
            title: '批量识别完成',
            message: `成功处理了 ${unprocessedFolders.length} 个文件夹`,
            buttonClass: 'primary'
        });
    }

    /**
     * 批量校准
     */
    async batchCalibrate() {
        const processedFolders = Array.from(this.folders.values()).filter(f => f.status === 'processed');
        
        if (processedFolders.length === 0) {
            await window.modalManager.showAlert({
                title: '没有可校准的文件夹',
                message: '当前没有已识别的文件夹需要校准',
                buttonClass: 'primary'
            });
            return;
        }

        await window.modalManager.showAlert({
            title: '批量校准提示',
            message: `
                <div style="text-align: center;">
                    <p>找到 <strong>${processedFolders.length}</strong> 个可校准的文件夹</p>
                    <p style="color: #8E8E93;">批量校准需要逐个打开校准页面进行操作</p>
                    <p style="color: #007AFF;">建议选择单个文件夹进行校准</p>
                </div>
            `,
            buttonClass: 'primary'
        });
    }

    /**
     * 删除文件夹
     */
    async deleteFolder(folderId) {
        const folder = this.folders.get(folderId);
        if (!folder) return;

        const confirmed = await window.modalManager.showConfirm({
            title: '确认删除文件夹',
            message: `
                <div style="text-align: center;">
                    <p style="color: #FF3B30; font-weight: 600;">⚠️ 危险操作</p>
                    <p>即将删除文件夹：<strong>${folder.folderName}</strong></p>
                    <p style="color: #8E8E93;">包含 ${folder.metadata.totalImages} 张图片的所有标注数据</p>
                    <p style="color: #FF3B30; font-size: 0.9em;">此操作不可恢复！</p>
                </div>
            `,
            confirmText: '确认删除',
            confirmClass: 'danger'
        });

        if (!confirmed) return;

        try {
            await window.storageManager.deleteFolder(folderId);
            this.folders.delete(folderId);
            
            this.renderAllColumns();
            this.updateStatistics();
            this.updateLastUpdateTime();
            
            this.updateStatus(`已删除文件夹: ${folder.folderName}`);

            await window.modalManager.showAlert({
                title: '删除完成',
                message: `文件夹 "${folder.folderName}" 已成功删除`,
                buttonClass: 'primary'
            });

        } catch (error) {
            console.error('删除文件夹失败:', error);
            await window.modalManager.showAlert({
                title: '删除失败',
                message: `删除文件夹时发生错误：${error.message}`,
                buttonClass: 'danger'
            });
        }
    }

    /**
     * 导出单个文件夹
     */
    async exportSingleFolder(folderId) {    
        await this.refreshData();
        const folder = await window.storageManager.getFolderById(folderId);
        if (!folder) return;
        
        try {
            // 使用新的数据处理方式
            const processedData = this.processExportData(folder);
            
            const exportData = {
                // 导出元信息
                exportInfo: {
                    type: '单个文件夹标注数据',
                    version: '2.0',
                    exportedAt: new Date().toISOString(),
                    description: `文件夹 "${folder.folderName}" 的完整标注数据，包含原始OCR结果和校准后数据`
                },
                
                // 统计摘要
                summary: {
                    folderName: folder.folderName,
                    status: folder.status,
                    totalImages: Object.keys(processedData.images).length,
                    textRegionsCount: 0,
                    manualAnnotationsCount: 0,
                    processedAt: folder.createdAt,
                    calibratedAt: folder.updatedAt
                },
                
                // 处理后的数据
                folderData: processedData
            };
            
            // 计算统计数据
            Object.values(processedData.images).forEach(image => {
                if (image.calibratedText) {
                    exportData.summary.textRegionsCount += image.calibratedText.textRegions.length;
                    exportData.summary.manualAnnotationsCount += image.calibratedText.textRegions.filter(r => r.isManuallyAdded).length;
                }
            });
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${folder.folderName}_结构化数据_v2.0_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.updateStatus(`已导出文件夹: ${folder.folderName} (结构化格式)`);
            
        } catch (error) {
            console.error('导出文件夹失败:', error);
            await window.modalManager.showAlert({
                title: '导出失败',
                message: `导出文件夹时发生错误：${error.message}`,
                buttonClass: 'danger'
            });
        }
    }

    /**
     * 导出已校准数据
     */
    /**
     * 处理导出数据格式 - 清晰分离原始OCR和校准数据
     */
    processExportData(folder) {
        const result = {
            // 基础信息
            folderInfo: {
                name: folder.folderName,
                status: folder.status,
                totalImages: folder.metadata?.totalImages || 0,
                processedAt: folder.createdAt,
                calibratedAt: folder.updatedAt
            },
            
            // 分离的数据结构
            images: {}
        };
        
        // 处理每张图片的数据
        if (folder.imageFiles) {
            folder.imageFiles.forEach(imageFile => {
                const imageName = imageFile.name;
                const imageData = {
                    // 原始OCR识别结果
                    originalOCR: null,
                    // 人工校准后的最终结果
                    calibratedText: null,
                    // 变更统计
                    modifications: {
                        textChanged: false,
                        annotationsAdded: 0,
                        annotationsDeleted: 0,
                        totalEdits: 0
                    }
                };
                
                // 获取原始OCR结果
                if (folder.ocrResults && folder.ocrResults[imageName]) {
                    const ocrResult = folder.ocrResults[imageName];
                    imageData.originalOCR = {
                        confidence: 'OCR自动识别',
                        textRegions: ocrResult.words_result?.map(item => ({
                            text: item.text || item.words || '',
                            position: item.location || item.text_region,
                            confidence: item.confidence || 0.8
                        })) || []
                    };
                }
                
                // 获取校准后结果
                if (folder.annotations && folder.annotations[imageName]) {
                    const annotation = folder.annotations[imageName];
                    const textRegions = annotation.textRegions || [];
                    
                    imageData.calibratedText = {
                        confidence: '人工校准确认',
                        textRegions: textRegions.map(region => ({
                            text: region.text || '',
                            position: region.region,
                            source: region.isManual ? '手动添加' : 'OCR+校准',
                            isManuallyAdded: region.isManual || false
                        })),
                        // 提取纯文本便于使用
                        fullText: textRegions.map(r => r.text || '').join(' ').trim()
                    };
                    
                    // 计算修改统计
                    const originalCount = imageData.originalOCR?.textRegions?.length || 0;
                    const calibratedCount = textRegions.length;
                    const manualCount = textRegions.filter(r => r.isManual).length;
                    
                    imageData.modifications = {
                        textChanged: originalCount !== calibratedCount || 
                                   JSON.stringify(imageData.originalOCR?.textRegions?.map(r => r.text)) !== 
                                   JSON.stringify(textRegions.filter(r => !r.isManual).map(r => r.text)),
                        annotationsAdded: manualCount,
                        annotationsDeleted: Math.max(0, originalCount - (calibratedCount - manualCount)),
                        totalEdits: Math.abs(originalCount - calibratedCount) + manualCount
                    };
                }
                
                result.images[imageName] = imageData;
            });
        }
        
        return result;
    }
    
    async exportCalibratedData() {
        // 导出前强制刷新数据库内容
        await this.refreshData();
        const calibratedFolders = Array.from(this.folders.values()).filter(f => f.status === 'calibrated');
        
        if (calibratedFolders.length === 0) {
            await window.modalManager.showAlert({
                title: '没有可导出的数据',
                message: '当前没有已校准的文件夹可以导出',
                buttonClass: 'primary'
            });
            return;
        }

        try {
            const exportData = {
                // 导出元信息
                exportInfo: {
                    type: '已校准标注数据',
                    version: '2.0',
                    exportedAt: new Date().toISOString(),
                    description: '此文件包含OCR识别结果和人工校准后的最终数据，数据结构清晰分离便于使用'
                },
                
                // 统计摘要
                summary: {
                    totalFolders: calibratedFolders.length,
                    totalImages: calibratedFolders.reduce((sum, f) => sum + (f.metadata?.totalImages || 0), 0),
                    totalTextRegions: 0, // 将在下面计算
                    totalManualAnnotations: 0
                },
                
                // 处理后的文件夹数据
                folders: calibratedFolders.map(folder => this.processExportData(folder))
            };
            
            // 计算统计数据
            exportData.folders.forEach(folder => {
                Object.values(folder.images).forEach(image => {
                    if (image.calibratedText) {
                        exportData.summary.totalTextRegions += image.calibratedText.textRegions.length;
                        exportData.summary.totalManualAnnotations += image.calibratedText.textRegions.filter(r => r.isManuallyAdded).length;
                    }
                });
            });
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `校准标注数据_v2.0_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.updateStatus(`已导出 ${calibratedFolders.length} 个文件夹的结构化标注数据`);

        } catch (error) {
            console.error('导出已校准数据失败:', error);
            await window.modalManager.showAlert({
                title: '导出失败',
                message: `导出数据时发生错误：${error.message}`,
                buttonClass: 'danger'
            });
        }
    }

    /**
     * 导出所有数据
     */
    async exportAllData() {
        try {
            const exportData = await window.storageManager.exportAllData();
            
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `OCR标注工具_完整数据_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.updateStatus('已导出所有数据');

        } catch (error) {
            console.error('导出所有数据失败:', error);
            await window.modalManager.showAlert({
                title: '导出失败',
                message: `导出数据时发生错误：${error.message}`,
                buttonClass: 'danger'
            });
        }
    }

    /**
     * 重新处理文件夹
     */
    async reprocessFolder(folderId) {
        const folder = this.folders.get(folderId);
        if (!folder) return;

        const confirmed = await window.modalManager.showConfirm({
            title: '确认重新识别',
            message: `
                <div style="text-align: center;">
                    <p>即将重新识别文件夹：<strong>${folder.folderName}</strong></p>
                    <p style="color: #FF9500;">⚠️ 这将覆盖现有的识别结果</p>
                    <p style="color: #8E8E93;">包含 ${folder.metadata.totalImages} 张图片</p>
                </div>
            `,
            confirmText: '重新识别',
            confirmClass: 'primary'
        });

        if (!confirmed) return;

        // 重置文件夹状态
        folder.status = 'unprocessed';
        folder.ocrResults = {};
        folder.metadata.processedImages = 0;
        folder.updatedAt = new Date().toISOString();

        // 保存到数据库
        await window.storageManager.saveFolder(folder);
        this.folders.set(folderId, folder);

        // 重新渲染界面
        this.renderAllColumns();
        this.updateStatistics();
        this.updateLastUpdateTime();

        // 自动开始处理
        await this.processSingleFolder(folderId);
    }

    /**
     * 显示设置
     */
    showSettings() {
        const settingsHTML = `
            <div class="modal-overlay" id="current-modal">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3 class="modal-title">⚙️ 系统设置</h3>
                        <button class="modal-close" type="button">×</button>
                    </div>
                    <div class="modal-body">
                        <div style="display: flex; flex-direction: column; gap: 24px;">
                            <!-- 数据管理 -->
                            <div class="settings-section">
                                <h4 style="margin: 0 0 16px 0; color: var(--text-primary); font-size: 1.1rem;">📊 数据管理</h4>
                                <div style="display: flex; flex-direction: column; gap: 12px;">
                                    <button class="btn btn-secondary" id="clearAllDataBtn">
                                        🗑️ 清空所有数据
                                    </button>
                                    <button class="btn btn-primary" id="importDataBtn">
                                        📥 导入数据
                                    </button>
                                    <input type="file" id="importFileInput" accept=".json" style="display: none;">
                                </div>
                            </div>
                            
                            <!-- 系统信息 -->
                            <div class="settings-section">
                                <h4 style="margin: 0 0 16px 0; color: var(--text-primary); font-size: 1.1rem;">ℹ️ 系统信息</h4>
                                <div style="background: var(--background-color); padding: 16px; border-radius: var(--border-radius-medium); font-family: monospace; font-size: 0.9rem;">
                                    <div>版本：v2.0.0</div>
                                    <div>浏览器：${navigator.userAgent.split(' ')[0]}</div>
                                    <div>存储空间：IndexedDB</div>
                                    <div>最后更新：${this.elements.lastUpdateTime.textContent}</div>
                                </div>
                            </div>
                            
                            <!-- 快捷键 -->
                            <div class="settings-section">
                                <h4 style="margin: 0 0 16px 0; color: var(--text-primary); font-size: 1.1rem;">⌨️ 快捷键</h4>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9rem;">
                                    <div><kbd>Ctrl</kbd> + <kbd>U</kbd></div><div>上传文件夹</div>
                                    <div><kbd>Ctrl</kbd> + <kbd>E</kbd></div><div>导出数据</div>
                                    <div><kbd>Ctrl</kbd> + <kbd>R</kbd></div><div>刷新数据</div>
                                    <div><kbd>F5</kbd></div><div>刷新页面</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="modal-button secondary" data-action="close">
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        `;

        window.modalManager.showModal(settingsHTML, {
            onConfirm: () => {},
            onCancel: () => {}
        });

        // 绑定设置按钮事件
        document.getElementById('clearAllDataBtn').addEventListener('click', async () => {
            const confirmed = await window.modalManager.showConfirm({
                title: '清空所有数据',
                message: `
                    <div style="text-align: center;">
                        <p style="color: #FF3B30; font-weight: 600;">⚠️ 危险操作</p>
                        <p>即将清空所有文件夹和标注数据</p>
                        <p style="color: #FF3B30; font-size: 0.9em;">此操作不可恢复！</p>
                    </div>
                `,
                confirmText: '确认清空',
                confirmClass: 'danger'
            });

            if (confirmed) {
                await window.storageManager.clearAllData();
                this.folders.clear();
                this.renderAllColumns();
                this.updateStatistics();
                this.updateLastUpdateTime();
                window.modalManager.closeModal();
                
                await window.modalManager.showAlert({
                    title: '清空完成',
                    message: '所有数据已成功清空',
                    buttonClass: 'primary'
                });
            }
        });

        document.getElementById('importDataBtn').addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });

        document.getElementById('importFileInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);
                
                const results = await window.storageManager.importData(data);
                
                await this.loadFolders();
                this.updateStatistics();
                this.updateLastUpdateTime();
                
                window.modalManager.closeModal();
                
                const successCount = results.filter(r => r.success).length;
                const failCount = results.filter(r => !r.success).length;
                
                await window.modalManager.showAlert({
                    title: '导入完成',
                    message: `
                        <div style="text-align: center;">
                            <p>成功导入 ${successCount} 个文件夹</p>
                            ${failCount > 0 ? `<p style="color: #FF9500;">失败 ${failCount} 个</p>` : ''}
                        </div>
                    `,
                    buttonClass: 'primary'
                });
                
            } catch (error) {
                await window.modalManager.showAlert({
                    title: '导入失败',
                    message: `导入数据时发生错误：${error.message}`,
                    buttonClass: 'danger'
                });
            }
        });
    }

    /**
     * 绑定键盘快捷键
     */
    bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 避免在输入框中触发快捷键
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'u':
                        e.preventDefault();
                        this.showShortcutFeedback('上传文件夹');
                        this.uploadFolder();
                        break;
                    case 'e':
                        e.preventDefault();
                        this.showShortcutFeedback('导出所有数据');
                        this.exportAllData();
                        break;
                    case 'r':
                        e.preventDefault();
                        this.showShortcutFeedback('刷新数据');
                        this.refreshData();
                        break;
                }
            }
        });

        // 显示快捷键提示
        this.showInitialShortcutHint();
    }

    /**
     * 显示快捷键操作反馈
     */
    showShortcutFeedback(action) {
        const feedback = document.createElement('div');
        feedback.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 0.9rem;
            z-index: 10000;
            animation: slideInRight 0.3s ease;
        `;
        feedback.textContent = `快捷键: ${action}`;
        document.body.appendChild(feedback);

        setTimeout(() => {
            feedback.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => feedback.remove(), 300);
        }, 2000);
    }

    /**
     * 显示初始快捷键提示
     */
    showInitialShortcutHint() {
        // 只在首次访问时显示
        if (localStorage.getItem('shortcut_hint_shown')) return;

        setTimeout(() => {
            const hint = document.createElement('div');
            hint.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
                color: white;
                padding: 12px 16px;
                border-radius: 8px;
                font-size: 0.85rem;
                z-index: 10000;
                max-width: 280px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                animation: slideInUp 0.5s ease;
                cursor: pointer;
            `;
            hint.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 4px;">💡 快捷键提示</div>
                <div style="font-size: 0.8rem; opacity: 0.9;">
                    Ctrl+U: 上传文件夹<br>
                    Ctrl+E: 导出数据<br>
                    Ctrl+R: 刷新数据<br>
                    <small style="opacity: 0.7;">点击关闭</small>
                </div>
            `;
            
            hint.addEventListener('click', () => {
                hint.style.animation = 'slideOutDown 0.3s ease';
                setTimeout(() => hint.remove(), 300);
                localStorage.setItem('shortcut_hint_shown', 'true');
            });

            document.body.appendChild(hint);

            // 10秒后自动关闭
            setTimeout(() => {
                if (hint.parentNode) {
                    hint.style.animation = 'slideOutDown 0.3s ease';
                    setTimeout(() => hint.remove(), 300);
                    localStorage.setItem('shortcut_hint_shown', 'true');
                }
            }, 10000);
        }, 3000);
    }

    selectFolder(folderId) {
        // 单选逻辑
        document.querySelectorAll('.folder-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
        
        const card = document.querySelector(`[data-folder-id="${folderId}"]`);
        if (card) {
            card.classList.add('selected');
        }
    }

    toggleFolderSelection(folderId) {
        // 多选逻辑
        if (this.selectedFolders.has(folderId)) {
            this.selectedFolders.delete(folderId);
        } else {
            this.selectedFolders.add(folderId);
        }
        
        const card = document.querySelector(`[data-folder-id="${folderId}"]`);
        if (card) {
            card.classList.toggle('batch-selected', this.selectedFolders.has(folderId));
        }
    }

    /**
     * 显示图片设置
     */
    showImageSettings() {
        if (window.imageSettings) {
            window.imageSettings.showModal();
        } else {
            console.warn('图片设置模块未加载');
            alert('图片设置模块未加载，请刷新页面重试');
        }
    }
}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardManager = new DashboardManager();
});