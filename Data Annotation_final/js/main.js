/**
 * 手写汉字 OCR 标注工具 - 主控制器
 * 负责初始化应用和协调各个模块
 */

class OCRAnnotationTool {
    constructor() {
        // 应用状态
        this.state = {
            currentFolder: null,
            imageFiles: [],
            currentImageIndex: 0,
            annotations: new Map(), // 存储每张图片的标注数据
            isDrawing: false,
            ocrResults: new Map() // 存储OCR识别结果
        };

        // 延迟初始化，避免在构造函数中直接调用async函数
        setTimeout(() => {
            this.init().catch(error => {
                console.error('延迟初始化失败:', error);
            });
        }, 0);
    }

    /**
     * 初始化应用
     */
    async init() {
        try {
            // 检查浏览器兼容性
            this.checkBrowserSupport();
            
            // 初始化存储管理器
            await window.storageManager.init();
            
            // 初始化UI组件
            this.ui = new UIManager(this);
            this.canvas = new CanvasManager(this);
            this.api = new APIManager(this);
            
            // 绑定事件监听器
            this.bindEvents();
            
            // 加载持久化数据
            await this.loadPersistedData();
            
            // 更新状态
            this.updateStatus('应用已就绪，请选择图片文件夹');
            
            console.log('OCR 标注工具初始化完成');
        } catch (error) {
            console.error('应用初始化失败:', error);
            this.showError('应用初始化失败: ' + error.message);
        }
    }

    /**
     * 检查浏览器是否支持必要的API
     */
    checkBrowserSupport() {
        if (!window.showDirectoryPicker) {
            throw new Error('您的浏览器不支持文件系统访问API，请使用最新版本的Chrome或Edge浏览器');
        }
        
        if (!window.fetch) {
            throw new Error('您的浏览器不支持Fetch API');
        }
        
        const canvas = document.createElement('canvas');
        if (!canvas.getContext) {
            throw new Error('您的浏览器不支持Canvas API');
        }
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 文件夹选择
        document.getElementById('selectFolderBtn').addEventListener('click', () => {
            this.selectFolder();
        });

        // OCR识别
        document.getElementById('ocrBtn').addEventListener('click', () => {
            this.performOCR();
        });

        // 保存标注
        document.getElementById('saveBtn').addEventListener('click', () => {
            this.saveAnnotations();
        });

        // 图片导航
        document.getElementById('prevBtn').addEventListener('click', () => {
            this.navigateImage(-1);
        });

        document.getElementById('nextBtn').addEventListener('click', () => {
            this.navigateImage(1);
        });

        // 添加文本框
        document.getElementById('addTextBtn').addEventListener('click', () => {
            this.addNewTextBox();
        });

        // 键盘快捷键
        document.addEventListener('keydown', (e) => {
            this.handleKeyboard(e);
        });

        // 防止页面刷新时丢失数据
        window.addEventListener('beforeunload', (e) => {
            if (this.hasUnsavedChanges()) {
                e.preventDefault();
                e.returnValue = '您有未保存的标注数据，确定要离开吗？';
            }
        });
    }

    /**
     * 选择图片文件夹
     */
    async selectFolder() {
        try {
            this.updateStatus('正在选择文件夹...');
            
            // 使用File System Access API选择文件夹
            const dirHandle = await window.showDirectoryPicker();
            
            // 扫描图片文件以获取信息
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
                this.updateStatus('已取消文件夹选择');
                return;
            }

            // 用户确认后处理文件夹
            this.state.currentFolder = dirHandle;
            this.state.imageFiles = imageFiles;
            this.state.currentImageIndex = 0;
            
            // 更新UI
            this.ui.updateFileList(imageFiles);
            this.ui.enableButtons(['ocrBtn']);
            
            // 显示第一张图片
            await this.loadCurrentImage();
            
            // 保存文件夹数据到IndexedDB
            await this.saveCurrentFolderData();
            
            this.updateStatus(`已加载 ${imageFiles.length} 张图片`);
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('选择文件夹失败:', error);
                await window.modalManager.showAlert({
                    title: '选择文件夹失败',
                    message: `选择文件夹时发生错误：${error.message}`,
                    buttonClass: 'danger'
                });
            }
        }
    }

    /**
     * 扫描文件夹中的图片文件
     */
    async scanImageFiles(dirHandle) {
        const imageFiles = [];
        const supportedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
        
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const extension = entry.name.toLowerCase().substring(entry.name.lastIndexOf('.'));
                if (supportedTypes.includes(extension)) {
                    const file = await entry.getFile();
                    imageFiles.push({
                        name: entry.name,
                        file: file,
                        handle: entry
                    });
                }
            }
        }
        
        // 按文件名排序
        imageFiles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        
        return imageFiles;
    }

    /**
     * 加载当前图片
     */
    async loadCurrentImage() {
        if (this.state.imageFiles.length === 0) return;
        
        const currentFile = this.state.imageFiles[this.state.currentImageIndex];
        if (!currentFile) return;
        
        const imageId = currentFile.name;
        
        try {
            // 显示加载状态
            this.ui.showImageLoading(imageId);
            
            // 使用优化的图片加载器
            const img = await window.imageLoader.loadImage(currentFile.file, {
                maxImageSize: 2048,
                quality: 0.8,
                timeout: 30000,
                retryCount: 3
            });
            
            // 创建图片URL
            const imageUrl = img.src;
            
            // 加载图片到canvas
            await this.canvas.loadImage(imageUrl);
            
            // 更新UI
            this.ui.updateImageInfo(this.state.currentImageIndex + 1, this.state.imageFiles.length, currentFile.name);
            this.ui.updateNavigationButtons(this.state.currentImageIndex, this.state.imageFiles.length);
            this.ui.setActiveFileItem(this.state.currentImageIndex);
            
            // 加载已有的标注数据
            this.loadCurrentAnnotations();
            
            // 显示加载成功
            this.ui.showImageSuccess(imageId);
            
            // 预加载下一张图片
            this.preloadNextImages();
            
        } catch (error) {
            console.error('加载图片失败:', error);
            this.ui.showImageError(imageId, error.message);
            this.showError('加载图片失败: ' + error.message);
        }
    }

    /**
     * 预加载下一张图片
     */
    async preloadNextImages() {
        if (!window.imageLoader) return;
        
        const nextIndex = this.state.currentImageIndex + 1;
        const preloadCount = 3;
        const imageFiles = [];
        
        for (let i = 0; i < preloadCount; i++) {
            const index = nextIndex + i;
            if (index < this.state.imageFiles.length) {
                imageFiles.push(this.state.imageFiles[index].file);
            }
        }
        
        if (imageFiles.length > 0) {
            try {
                await window.imageLoader.preloadImages(imageFiles);
                console.log(`预加载了 ${imageFiles.length} 张图片`);
            } catch (error) {
                console.warn('预加载图片失败:', error);
            }
        }
    }

    /**
     * 图片导航
     */
    async navigateImage(direction) {
        const newIndex = this.state.currentImageIndex + direction;
        
        if (newIndex >= 0 && newIndex < this.state.imageFiles.length) {
            this.state.currentImageIndex = newIndex;
            await this.loadCurrentImage();
        }
    }

    /**
     * 执行OCR识别
     */
    async performOCR() {
        if (this.state.imageFiles.length === 0) {
            await window.modalManager.showAlert({
                title: '无可用文件',
                message: '请先选择包含图片的文件夹',
                buttonClass: 'primary'
            });
            return;
        }

        // 检查是否已经完成识别
        const processedCount = Array.from(this.state.ocrResults.keys()).length;
        if (processedCount === this.state.imageFiles.length) {
            await window.modalManager.showDuplicateActionAlert('所有图片');
            return;
        }

        try {
            // 使用模态框显示进度
            const progressModal = window.modalManager.showProgress({
                title: '正在识别文字...',
                message: '请稍候，正在处理图片...',
                showProgress: true
            });

            this.ui.disableButtons(['ocrBtn']);
            this.updateStatus('正在进行OCR识别...');

            // 批量处理所有图片
            for (let i = 0; i < this.state.imageFiles.length; i++) {
                const imageFile = this.state.imageFiles[i];
                const progress = ((i + 1) / this.state.imageFiles.length) * 100;
                
                // 更新模态框进度
                progressModal.updateProgress(progress);
                progressModal.updateMessage(`正在识别: ${imageFile.name} (${i + 1}/${this.state.imageFiles.length})`);
                
                try {
                    // 跳过已处理的图片
                    if (this.state.ocrResults.has(imageFile.name)) {
                        continue;
                    }

                    // 调用OCR API
                    const ocrResult = await this.api.performOCR(imageFile.file);
                    
                    // 存储OCR结果
                    this.state.ocrResults.set(imageFile.name, ocrResult);
                    
                    // 如果是当前显示的图片，立即更新界面
                    if (i === this.state.currentImageIndex) {
                        this.displayOCRResults(ocrResult);
                    }
                    
                } catch (error) {
                    console.error(`OCR识别失败 - ${imageFile.name}:`, error);
                    // 继续处理下一张图片，不中断整个流程
                }
            }

            // 关闭进度模态框
            progressModal.close();
            
            // 保存OCR结果到IndexedDB
            await this.saveCurrentFolderData();
            
            this.ui.enableButtons(['saveBtn', 'addTextBtn']);
            this.updateStatus('OCR识别完成');

            // 显示完成提示
            await window.modalManager.showAlert({
                title: '识别完成',
                message: `成功识别了 ${this.state.ocrResults.size} 张图片`,
                buttonClass: 'primary'
            });

        } catch (error) {
            console.error('OCR识别过程出错:', error);
            
            // 关闭进度模态框
            if (progressModal) {
                progressModal.close();
            }
            
            await window.modalManager.showAlert({
                title: 'OCR识别失败',
                message: `识别过程中发生错误：${error.message}`,
                buttonClass: 'danger'
            });
            
            this.ui.enableButtons(['ocrBtn']);
        }
    }

    /**
     * 显示OCR识别结果
     */
    displayOCRResults(ocrResult) {
        if (!ocrResult || !ocrResult.words_result) {
            return;
        }

        // 清除现有标注
        this.canvas.clearAnnotations();
        
        // 获取当前图片的标注数据，如果没有则创建新的
        const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
        let annotations = this.state.annotations.get(currentFileName) || [];
        
        // 如果没有现有标注，从OCR结果创建
        if (annotations.length === 0) {
            annotations = ocrResult.words_result.map((item, index) => ({
                id: Date.now() + index,
                text: item.words,
                region: item.location || this.generateDefaultRegion(index),
                isManual: false
            }));
            
            this.state.annotations.set(currentFileName, annotations);
        }
        
        // 在canvas上绘制标注框
        annotations.forEach(annotation => {
            this.canvas.drawAnnotationBox(annotation.region, annotation.id);
        });
        
        // 在右侧显示文本
        this.ui.displayTextItems(annotations);
    }

    /**
     * 生成默认的区域坐标（当OCR没有返回位置信息时）
     */
    generateDefaultRegion(index) {
        const canvasRect = this.canvas.getCanvasRect();
        const boxHeight = 30;
        const boxWidth = 200;
        const startY = 50 + index * (boxHeight + 10);
        
        return {
            left: 50,
            top: startY,
            width: boxWidth,
            height: boxHeight
        };
    }

    /**
     * 加载当前图片的标注数据
     */
    loadCurrentAnnotations() {
        const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
        const annotations = this.state.annotations.get(currentFileName) || [];
        
        // 清除canvas上的标注
        this.canvas.clearAnnotations();
        
        // 重新绘制标注框
        annotations.forEach(annotation => {
            this.canvas.drawAnnotationBox(annotation.region, annotation.id);
        });
        
        // 更新文本显示
        this.ui.displayTextItems(annotations);
        
        // 启用相关按钮
        if (annotations.length > 0) {
            this.ui.enableButtons(['saveBtn', 'addTextBtn']);
        }
    }

    /**
     * 添加新的文本框
     */
    addNewTextBox() {
        const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
        let annotations = this.state.annotations.get(currentFileName) || [];
        
        // 创建新的标注
        const newAnnotation = {
            id: Date.now(),
            text: '',
            region: this.generateDefaultRegion(annotations.length),
            isManual: true
        };
        
        annotations.push(newAnnotation);
        this.state.annotations.set(currentFileName, annotations);
        
        // 更新界面
        this.canvas.drawAnnotationBox(newAnnotation.region, newAnnotation.id);
        this.ui.displayTextItems(annotations);
        
        // 聚焦到新的文本框
        setTimeout(() => {
            const textInput = document.querySelector(`[data-annotation-id="${newAnnotation.id}"]`);
            if (textInput) {
                textInput.focus();
            }
        }, 100);
    }

    /**
     * 更新标注文本
     */
    updateAnnotationText(annotationId, newText) {
        const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
        const annotations = this.state.annotations.get(currentFileName) || [];
        
        const annotation = annotations.find(ann => ann.id === annotationId);
        if (annotation) {
            annotation.text = newText;
            this.state.annotations.set(currentFileName, annotations);
        }
    }

    /**
     * 删除标注
     */
    deleteAnnotation(annotationId) {
        const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
        let annotations = this.state.annotations.get(currentFileName) || [];
        
        annotations = annotations.filter(ann => ann.id !== annotationId);
        this.state.annotations.set(currentFileName, annotations);
        
        // 更新界面
        this.canvas.clearAnnotations();
        annotations.forEach(annotation => {
            this.canvas.drawAnnotationBox(annotation.region, annotation.id);
        });
        this.ui.displayTextItems(annotations);
    }

    /**
     * 保存标注数据
     */
    async saveAnnotations() {
        try {
            this.updateStatus('正在保存标注数据...');
            
            // 构建保存数据
            const saveData = {
                version: '1.0',
                createdAt: new Date().toISOString(),
                folderName: this.state.currentFolder ? this.state.currentFolder.name : 'unknown',
                totalImages: this.state.imageFiles.length,
                annotations: {}
            };
            
            // 收集所有标注数据
            for (const [fileName, annotations] of this.state.annotations) {
                if (annotations.length > 0) {
                    saveData.annotations[fileName] = {
                        imageInfo: {
                            name: fileName,
                            annotationCount: annotations.length
                        },
                        textRegions: annotations.map(ann => ({
                            id: ann.id,
                            text: ann.text,
                            region: ann.region,
                            isManual: ann.isManual
                        }))
                    };
                }
            }
            
            // 创建下载文件
            const jsonString = JSON.stringify(saveData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            // 创建下载链接
            const a = document.createElement('a');
            a.href = url;
            a.download = `ocr_annotations_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // 清理URL
            URL.revokeObjectURL(url);
            
            this.updateStatus(`标注数据已保存，共 ${Object.keys(saveData.annotations).length} 张图片`);
            
        } catch (error) {
            console.error('保存标注数据失败:', error);
            this.showError('保存失败: ' + error.message);
        }
    }

    /**
     * 处理键盘快捷键
     */
    handleKeyboard(e) {
        // 阻止在输入框中触发快捷键
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
            return;
        }
        
        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                this.navigateImage(-1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.navigateImage(1);
                break;
            case 's':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.saveAnnotations();
                }
                break;
            case 'n':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.addNewTextBox();
                }
                break;
        }
    }

    /**
     * 检查是否有未保存的更改
     */
    hasUnsavedChanges() {
        return this.state.annotations.size > 0;
    }

    /**
     * 更新状态栏文本
     */
    updateStatus(message) {
        const statusElement = document.getElementById('statusText');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }

    /**
     * 显示错误消息
     */
    async showError(message) {
        await window.modalManager.showAlert({
            title: '错误',
            message: message,
            buttonClass: 'danger'
        });
        this.updateStatus('发生错误: ' + message);
    }

    /**
     * 加载持久化数据
     */
    async loadPersistedData() {
        try {
            const folders = await window.storageManager.getAllFolders();
            if (folders.length > 0) {
                console.log(`发现 ${folders.length} 个已保存的文件夹`);
                // 这里可以显示已保存的文件夹列表供用户选择
            }
        } catch (error) {
            console.error('加载持久化数据失败:', error);
        }
    }

    /**
     * 保存当前文件夹数据
     */
    async saveCurrentFolderData() {
        if (!this.state.currentFolder) {
            return;
        }

        try {
            const folderData = {
                name: this.state.currentFolder.name,
                status: this.determineFolderStatus(),
                imageFiles: this.state.imageFiles.map(file => ({
                    name: file.name,
                    type: file.type,
                    size: file.size
                })),
                ocrResults: Object.fromEntries(this.state.ocrResults),
                annotations: Object.fromEntries(this.state.annotations)
            };

            const savedFolder = await window.storageManager.saveFolder(folderData);
            this.state.currentFolderId = savedFolder.id;
            console.log('文件夹数据已保存:', savedFolder);
        } catch (error) {
            console.error('保存文件夹数据失败:', error);
        }
    }

    /**
     * 确定文件夹状态
     */
    determineFolderStatus() {
        const totalImages = this.state.imageFiles.length;
        const processedImages = this.state.ocrResults.size;
        const annotatedImages = this.state.annotations.size;

        if (annotatedImages === totalImages && totalImages > 0) {
            return 'calibrated';
        } else if (processedImages === totalImages && totalImages > 0) {
            return 'processed';
        } else {
            return 'unprocessed';
        }
    }

    /**
     * 获取当前状态（供其他模块使用）
     */
    getState() {
        return this.state;
    }
}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    window.ocrTool = new OCRAnnotationTool();
});