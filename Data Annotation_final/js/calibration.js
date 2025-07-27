/**
 * OCR 标注校准工具 - 简化重构版
 * 专注于核心功能：图片加载、OCR数据显示、手动标注、文本编辑
 */

class CalibrationApp {
    constructor() {
        // 基础状态
        this.state = {
            folderHandle: null,
            imageFiles: [],
            currentImageIndex: 0,
            annotations: new Map(),
            isLoading: false,
            hasChanges: false
        };

        // DOM 元素
        this.elements = {
            // 导航元素
            backBtn: document.getElementById('backBtn'),
            folderName: document.getElementById('folderName'),
            imageProgress: document.getElementById('imageProgress'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            imageName: document.getElementById('imageName'),
            completeBtn: document.getElementById('completeBtn'),
            
            // 图片和画布
            currentImage: document.getElementById('currentImage'),
            annotationCanvas: document.getElementById('annotationCanvas'),
            
            // 文本编辑
            textList: document.getElementById('textList'),
            addTextBtn: document.getElementById('addTextBtn'),
            clearAllBtn: document.getElementById('clearAllBtn'),
            textCount: document.getElementById('textCount'),
            charCount: document.getElementById('charCount'),
            
            // 状态栏
            statusText: document.getElementById('statusText'),
            lastSave: document.getElementById('lastSave')
        };

        // Canvas 相关
        this.canvas = this.elements.annotationCanvas;
        this.ctx = this.canvas.getContext('2d');
        this.imageInfo = null;
        
        // 绘图状态
        this.drawingState = {
            isDrawing: false,
            startX: 0,
            startY: 0
        };
        
        // 交互状态
        this.interactionState = {
            highlightedAnnotationId: null,
            annotationBoxes: new Map() // 存储每个标注框的显示区域信息
        };

        // 延迟初始化避免async构造函数问题
        setTimeout(() => {
            this.init().catch(error => {
                console.error('初始化失败:', error);
                this.updateStatus('初始化失败: ' + error.message);
            });
        }, 0);
    }

    /**
     * 初始化应用
     */
    async init() {
        try {
            this.updateStatus('正在初始化...');
            
            // 初始化存储管理器
            await window.storageManager.init();
            
            // 绑定事件
            this.bindEvents();
            
            // 从sessionStorage获取文件夹ID
            const folderId = sessionStorage.getItem('currentFolderId');
            if (!folderId) {
                await window.modalManager.showAlert({
                    title: '未找到文件夹',
                    message: '请从主控台选择一个文件夹进行校准',
                    buttonClass: 'primary'
                });
                window.location.href = 'dashboard.html';
                return;
            }
            
            // 加载文件夹数据
            await this.loadFolderData(parseInt(folderId));
            
        } catch (error) {
            console.error('初始化错误:', error);
            this.updateStatus('初始化失败: ' + error.message);
        }
    }

    /**
     * 绑定所有事件监听器
     */
    bindEvents() {
        // 导航按钮
        this.elements.backBtn.addEventListener('click', () => this.goBack());
        this.elements.prevBtn.addEventListener('click', () => this.previousImage());
        this.elements.nextBtn.addEventListener('click', () => this.nextImage());
        this.elements.completeBtn.addEventListener('click', () => this.completeCalibration());
        
        // 文本编辑按钮
        this.elements.addTextBtn.addEventListener('click', () => this.addNewTextItem());
        this.elements.clearAllBtn.addEventListener('click', () => this.clearAllText());
        
        // Canvas 鼠标事件
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
        
        // 键盘快捷键
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        // 窗口大小变化
        window.addEventListener('resize', () => this.handleResize());
    }

    /**
     * 加载文件夹数据
     */
    async loadFolderData(folderId) {
        try {
            this.updateStatus('正在加载文件夹...');
            
            // 从数据库获取文件夹信息
            const folderData = await window.storageManager.getFolderById(folderId);
            if (!folderData) {
                throw new Error('文件夹不存在');
            }
            
            this.state.folderData = folderData;
            // 优先使用 name 字段，如果没有则使用 folderName，都没有则使用默认值
            const displayName = folderData.name || folderData.folderName || '未命名文件夹';
            this.elements.folderName.textContent = displayName;
            
            // 设置图片文件列表
            this.state.imageFiles = folderData.imageFiles || [];
            
            // 加载标注数据
            if (folderData.annotations) {
                Object.entries(folderData.annotations).forEach(([imageName, annotation]) => {
                    this.state.annotations.set(imageName, annotation.textRegions || []);
                });
            }
            
            // 加载第一张图片
            if (this.state.imageFiles.length > 0) {
                await this.loadCurrentImage();
                this.updateNavigationState();
            } else {
                this.updateStatus('文件夹中没有找到图片文件');
            }
            
        } catch (error) {
            console.error('加载文件夹失败:', error);
            this.updateStatus('加载文件夹失败: ' + error.message);
        }
    }

    /**
     * 图片文件已在loadFolderData中加载，这个函数已不需要
     */

    /**
     * 加载当前图片
     */
    async loadCurrentImage() {
        if (this.state.currentImageIndex >= this.state.imageFiles.length) {
            return;
        }
        
        try {
            this.updateStatus('正在加载图片...');
            
            const imageFile = this.state.imageFiles[this.state.currentImageIndex];
            
            // 检查图片文件是否有效
            if (!imageFile) {
                this.showImagePlaceholder('未知图片', '图片文件不可用');
                this.updateStatus('图片文件不可用');
                return;
            }
            
            let imageUrl;
            
            console.log('当前图片文件数据:', {
                name: imageFile.name,
                hasDataURL: !!imageFile.dataURL,
                hasFile: !!(imageFile.file && imageFile.file instanceof File),
                hasData: !!imageFile.data,
                type: imageFile.type,
                size: imageFile.size
            });
            
            // 优先级1: 直接使用dataURL（最可靠）
            if (imageFile.dataURL) {
                imageUrl = imageFile.dataURL;
                console.log('✅ 使用dataURL加载图片:', imageFile.name, 'URL长度:', imageFile.dataURL.length);
            }
            // 优先级2: file对象（适用于刚上传的文件）
            else if (imageFile.file && imageFile.file instanceof File) {
                try {
                    imageUrl = URL.createObjectURL(imageFile.file);
                    console.log('✅ 使用File对象加载图片:', imageFile.name);
                } catch (error) {
                    console.error('❌ File对象创建URL失败:', error);
                    imageUrl = null;
                }
            }
            // 优先级3: base64数据（向后兼容）
            else if (imageFile.data) {
                imageUrl = `data:${imageFile.type || 'image/jpeg'};base64,${imageFile.data}`;
                console.log('✅ 使用base64数据加载图片:', imageFile.name);
            }
            
            // 如果所有方法都失败
            if (!imageUrl) {
                console.error('❌ 无法获取图片URL，图片文件结构:', JSON.stringify(imageFile, null, 2));
                this.showImagePlaceholder(imageFile.name || '未知图片', '图片数据格式错误 - 无法生成URL');
                this.updateStatus('图片数据格式错误');
                return;
            }
            
            console.log('🚀 准备加载图片URL:', imageUrl.substring(0, 100) + '...');
            
            // 加载图片到Canvas
            await this.loadImageToCanvas(imageUrl);
            
            // 更新UI
            this.elements.imageName.textContent = imageFile.name;
            this.updateProgress();
            
            // 加载OCR数据和标注
            await this.loadImageAnnotations(imageFile.name);
            
            this.updateStatus('图片加载完成');
            
        } catch (error) {
            console.error('加载图片失败:', error);
            this.updateStatus('加载图片失败: ' + error.message);
            this.showImagePlaceholder('错误', '图片加载失败');
        }
    }


    /**
     * 将图片加载到Canvas
     */
    async loadImageToCanvas(imageUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            img.onload = () => {
                console.log('🎉 图片成功加载到内存，原始尺寸:', img.width + 'x' + img.height);
                // 显示图片
                this.elements.currentImage.src = imageUrl;
                this.elements.currentImage.style.display = 'block';
                
                // 计算显示尺寸和缩放比例
                const container = this.canvas.parentElement;
                const containerRect = container.getBoundingClientRect();
                
                const scaleX = (containerRect.width - 40) / img.width;
                const scaleY = (containerRect.height - 40) / img.height;
                const scale = Math.min(scaleX, scaleY, 1);
                
                const displayWidth = img.width * scale;
                const displayHeight = img.height * scale;
                
                // 调整图片和Canvas尺寸
                this.elements.currentImage.style.width = displayWidth + 'px';
                this.elements.currentImage.style.height = displayHeight + 'px';
                
                this.canvas.width = displayWidth;
                this.canvas.height = displayHeight;
                this.canvas.style.width = displayWidth + 'px';
                this.canvas.style.height = displayHeight + 'px';
                
                // 保存图片信息
                this.imageInfo = {
                    originalWidth: img.width,
                    originalHeight: img.height,
                    displayWidth: displayWidth,
                    displayHeight: displayHeight,
                    scale: scale
                };
                
                // 清空并初始化Canvas
                this.clearCanvas();
                this.initCanvas();
                
                resolve();
            };
            
            img.onerror = (error) => {
                console.error('❌ 图片加载到内存失败:', error);
                console.error('❌ 失败的图片URL:', imageUrl.substring(0, 200) + '...');
                reject(new Error('图片数据无效或损坏'));
            };
            
            // 设置图片源开始加载
            img.src = imageUrl;
        });
    }

    /**
     * 加载图片标注数据
     */
    async loadImageAnnotations(imageName) {
        try {
            // 从已加载的数据中获取标注或从OCR结果获取
            let annotations = this.state.annotations.get(imageName) || [];
            
            // 如果没有标注数据，尝试从OCR结果创建
            if (annotations.length === 0 && this.state.folderData.ocrResults && this.state.folderData.ocrResults[imageName]) {
                const ocrResult = this.state.folderData.ocrResults[imageName];
                
                if (ocrResult.words_result && ocrResult.words_result.length > 0) {
                    annotations = ocrResult.words_result.map((item, index) => {
                        let location = item.location;
                        
                        // 处理各种OCR位置格式
                        if (!location && item.words) {
                            location = {
                                left: 50 + index * 120,
                                top: 50 + Math.floor(index / 3) * 40,
                                width: 100,
                                height: 30
                            };
                        } else if (location && Array.isArray(location)) {
                            const xs = location.map(p => p.x);
                            const ys = location.map(p => p.y);
                            location = {
                                left: Math.min(...xs),
                                top: Math.min(...ys),
                                width: Math.max(...xs) - Math.min(...xs),
                                height: Math.max(...ys) - Math.min(...ys)
                            };
                        }
                        
                        return {
                            id: Date.now() + index,
                            text: item.text || item.words || '',
                            region: location,
                            isManual: false
                        };
                    });
                    
                    this.state.annotations.set(imageName, annotations);
                }
            }
            
            // 显示标注框和文本列表
            this.drawAllAnnotations();
            this.displayTextItems(annotations);
            
            console.log(`已加载 ${annotations.length} 个标注`);
            
        } catch (error) {
            console.error('加载标注数据失败:', error);
            this.clearCanvas();
            this.displayTextItems([]);
        }
    }

    /**
     * 绘制所有标注框
     */
    drawAllAnnotations() {
        const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
        const annotations = this.state.annotations.get(currentFileName) || [];
        
        this.clearCanvas();
        this.interactionState.annotationBoxes.clear();
        
        annotations.forEach(annotation => {
            this.drawAnnotationBox(annotation.region, annotation.isManual, annotation.id);
        });
    }

    /**
     * 绘制单个标注框
     */
    drawAnnotationBox(region, isManual = false, annotationId = null) {
        if (!this.imageInfo) return;
        
        // 转换为显示坐标
        const scale = this.imageInfo.scale;
        const displayRegion = {
            left: region.left * scale,
            top: region.top * scale,
            width: region.width * scale,
            height: region.height * scale
        };
        
        // 存储标注框位置信息用于交互
        if (annotationId) {
            this.interactionState.annotationBoxes.set(annotationId, displayRegion);
        }
        
        // 检查是否高亮
        const isHighlighted = annotationId === this.interactionState.highlightedAnnotationId;
        
        // 设置绘制样式
        this.ctx.save();
        
        if (isHighlighted) {
            // 高亮状态 - 更柔和的颜色
            this.ctx.strokeStyle = '#FF6B4A';
            this.ctx.fillStyle = 'rgba(255, 107, 74, 0.15)';
            this.ctx.lineWidth = 3;
            // 添加柔和的发光效果
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = 'rgba(255, 107, 74, 0.6)';
        } else if (isManual) {
            // 手动标注用橙色
            this.ctx.strokeStyle = '#FF9500';
            this.ctx.fillStyle = 'rgba(255, 149, 0, 0.1)';
            this.ctx.lineWidth = 2;
        } else {
            // OCR标注用蓝色
            this.ctx.strokeStyle = '#007AFF';
            this.ctx.fillStyle = 'rgba(0, 122, 255, 0.1)';
            this.ctx.lineWidth = 2;
        }
        
        // 绘制框和填充
        this.ctx.fillRect(displayRegion.left, displayRegion.top, displayRegion.width, displayRegion.height);
        this.ctx.strokeRect(displayRegion.left, displayRegion.top, displayRegion.width, displayRegion.height);
        
        this.ctx.restore();
    }

    /**
     * 显示文本项列表
     */
    displayTextItems(annotations) {
        const textList = this.elements.textList;
        textList.innerHTML = '';
        
        if (annotations.length === 0) {
            textList.innerHTML = '<div class="loading"><p>暂无文本标注</p></div>';
            this.updateTextStats(0, 0);
            return;
        }
        
        let totalChars = 0;
        
        annotations.forEach((annotation, index) => {
            // const confidence = annotation.confidence || (annotation.isManual ? 1.0 : 0.8);
            // const confidenceLevel = this.getConfidenceLevel(confidence, annotation.isManual);
            // const confidenceText = annotation.isManual ? '手动' : `${Math.round(confidence * 100)}%`;
            
            const textItem = document.createElement('div');
            textItem.className = 'text-item';
            textItem.dataset.annotationId = annotation.id;
            
            textItem.innerHTML = `
                <div class="text-item-header">
                    <div class="text-item-meta">
                        <span class="text-item-index">${index + 1}</span>
                        <!-- 置信度显示已移除 -->
                    </div>
                    <div class="text-item-actions">
                        <button class="action-btn" data-annotation-id="${annotation.id}" title="删除">×</button>
                    </div>
                </div>
                
                <div class="text-content">
                    <textarea class="text-input" 
                              data-annotation-id="${annotation.id}"
                              placeholder="输入识别的文本内容..."
                              rows="2">${annotation.text}</textarea>
                    
                    <div class="text-stats">
                        <span class="char-count">${annotation.text.length} 字符</span>
                        <span class="text-type">${annotation.isManual ? '手动标注' : 'OCR识别'}</span>
                    </div>
                </div>
            `;
            
            // 绑定交互事件
            this.bindTextItemEvents(textItem, annotation);
            
            textList.appendChild(textItem);
            totalChars += annotation.text.length;
        });
        
        this.updateTextStats(annotations.length, totalChars);
    }
    
    /**
     * 绑定文本项交互事件
     */
    bindTextItemEvents(textItem, annotation) {
        const textarea = textItem.querySelector('.text-input');
        const deleteBtn = textItem.querySelector('.action-btn');
        const charCount = textItem.querySelector('.char-count');
        // 文本输入事件
        textarea.addEventListener('input', async (e) => {
            annotation.text = e.target.value;
            charCount.textContent = `${e.target.value.length} 字符`;
            this.state.hasChanges = true;
            this.updateTextStats();
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
            // 深拷贝 folderData，保证主数据对象同步
            const newFolderData = JSON.parse(JSON.stringify(this.state.folderData));
            const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
            if (newFolderData.ocrResults && newFolderData.ocrResults[currentFileName]) {
                const wordsArray = newFolderData.ocrResults[currentFileName].words_result;
                if (Array.isArray(wordsArray)) {
                    const wordToUpdate = wordsArray.find(word => word.id === annotation.id);
                    if (wordToUpdate) {
                        wordToUpdate.text = e.target.value;
                        wordToUpdate.words = e.target.value;
                        console.log(`输入捕获： ID: ${annotation.id}, 新内容: ${e.target.value}`);
                    }
                }
            }
            // 替换 state
            this.state.folderData = newFolderData;
            // 保存
            await this.saveAllAnnotations();
        });
        
        // 删除按钮事件
        deleteBtn.addEventListener('click', async () => {
            this.deleteAnnotation(annotation.id);
            // 新增：批量保存所有图片
            await this.saveAllAnnotations();
        });
        
        // 鼠标悬停事件 - 高亮对应的Canvas标注框
        textItem.addEventListener('mouseenter', () => {
            this.highlightAnnotation(annotation.id);
        });
        
        textItem.addEventListener('mouseleave', () => {
            this.clearHighlight();
        });
        
        // 自动调整初始高度
        setTimeout(() => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        }, 0);
    }
    
    /**
     * 获取置信度等级
     */
    getConfidenceLevel(confidence, isManual = false) {
        if (isManual) return 'manual';
        if (confidence >= 0.8) return 'high';
        if (confidence >= 0.6) return 'medium';
        return 'low';
    }

    /**
     * 删除标注
     */
    deleteAnnotation(annotationId) {
        const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
        let annotations = this.state.annotations.get(currentFileName) || [];
        
        annotations = annotations.filter(ann => ann.id !== annotationId);
        this.state.annotations.set(currentFileName, annotations);
        
        this.drawAllAnnotations();
        this.displayTextItems(annotations);
        this.state.hasChanges = true;
    }

    /**
     * 添加新文本项
     */
    addNewTextItem() {
        const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
        let annotations = this.state.annotations.get(currentFileName) || [];
        
        const newAnnotation = {
            id: Date.now(),
            text: '',
            region: {
                left: 50,
                top: 50,
                width: 100,
                height: 30
            },
            isManual: true
        };
        
        annotations.push(newAnnotation);
        this.state.annotations.set(currentFileName, annotations);
        
        this.drawAllAnnotations();
        this.displayTextItems(annotations);
        this.state.hasChanges = true;
        
        // 新增：批量保存所有图片
        this.saveAllAnnotations();
        
        // 聚焦到新输入框
        setTimeout(() => {
            const newInput = document.querySelector(`[data-annotation-id="${newAnnotation.id}"]`);
            if (newInput) newInput.focus();
        }, 100);
    }

    /**
     * 清空所有文本
     */
    clearAllText() {
        if (confirm('确定要清空所有文本标注吗？')) {
            const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
            this.state.annotations.set(currentFileName, []);
            
            this.clearCanvas();
            this.displayTextItems([]);
            this.state.hasChanges = true;
            
            // 新增：批量保存所有图片
            this.saveAllAnnotations();
        }
    }

    /**
     * Canvas鼠标按下事件
     */
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.drawingState.isDrawing = true;
        this.drawingState.startX = x;
        this.drawingState.startY = y;
        
        // 添加绘制状态类
        this.canvas.classList.add('drawing');
        
        this.updateStatus('拖拽鼠标绘制标注框...');
        
        // 清除任何高亮状态
        this.clearHighlight();
    }

    /**
     * Canvas鼠标移动事件
     */
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (this.drawingState.isDrawing) {
            // 绘制模式：重绘所有标注并显示临时框
            this.drawAllAnnotations();
            this.drawTemporaryBox(this.drawingState.startX, this.drawingState.startY, x, y);
        } else {
            // 悬停模式：检测鼠标是否在标注框上
            const hoveredAnnotationId = this.getAnnotationAtPoint(x, y);
            if (hoveredAnnotationId !== this.interactionState.highlightedAnnotationId) {
                if (hoveredAnnotationId) {
                    this.highlightAnnotation(hoveredAnnotationId);
                } else {
                    this.clearHighlight();
                }
            }
        }
    }

    /**
     * Canvas鼠标释放事件
     */
    handleMouseUp(e) {
        if (!this.drawingState.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.drawingState.isDrawing = false;
        
        // 移除绘制状态类
        this.canvas.classList.remove('drawing');
        
        // 计算选择区域
        const region = this.calculateRegion(this.drawingState.startX, this.drawingState.startY, x, y);
        
        // 检查区域大小
        if (region.width < 10 || region.height < 10) {
            this.drawAllAnnotations();
            this.updateStatus('标注框太小，请重新绘制');
            return;
        }
        
        // 转换为原图坐标
        const originalRegion = this.displayToOriginalCoords(region);
        
        // 创建新标注
        const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
        let annotations = this.state.annotations.get(currentFileName) || [];
        
        const newAnnotation = {
            id: Date.now(),
            text: '',
            region: originalRegion,
            isManual: true
        };
        
        annotations.push(newAnnotation);
        this.state.annotations.set(currentFileName, annotations);
        
        // 重绘和更新UI
        this.drawAllAnnotations();
        this.displayTextItems(annotations);
        this.state.hasChanges = true;
        
        // 聚焦到新输入框
        setTimeout(() => {
            const newInput = document.querySelector(`[data-annotation-id="${newAnnotation.id}"]`);
            if (newInput) newInput.focus();
        }, 100);
        
        this.updateStatus('已添加新的标注框');
    }

    /**
     * 绘制临时选择框
     */
    drawTemporaryBox(startX, startY, endX, endY) {
        const region = this.calculateRegion(startX, startY, endX, endY);
        
        this.ctx.save();
        this.ctx.strokeStyle = '#FF9500';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.fillStyle = 'rgba(255, 149, 0, 0.2)';
        
        this.ctx.fillRect(region.left, region.top, region.width, region.height);
        this.ctx.strokeRect(region.left, region.top, region.width, region.height);
        
        this.ctx.restore();
    }

    /**
     * 计算选择区域
     */
    calculateRegion(startX, startY, endX, endY) {
        return {
            left: Math.min(startX, endX),
            top: Math.min(startY, endY),
            width: Math.abs(endX - startX),
            height: Math.abs(endY - startY)
        };
    }

    /**
     * 显示坐标转原图坐标
     */
    displayToOriginalCoords(displayRegion) {
        if (!this.imageInfo) return displayRegion;
        
        const scale = this.imageInfo.scale;
        return {
            left: Math.round(displayRegion.left / scale),
            top: Math.round(displayRegion.top / scale),
            width: Math.round(displayRegion.width / scale),
            height: Math.round(displayRegion.height / scale)
        };
    }

    /**
     * 键盘事件处理
     */
    handleKeyDown(e) {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveCurrentAnnotations();
        } else if (e.key === 'ArrowLeft' && !e.target.matches('input')) {
            e.preventDefault();
            this.previousImage();
        } else if (e.key === 'ArrowRight' && !e.target.matches('input')) {
            e.preventDefault();
            this.nextImage();
        }
    }

    /**
     * 窗口大小变化处理
     */
    handleResize() {
        if (this.elements.currentImage.src) {
            setTimeout(() => {
                this.loadImageToCanvas(this.elements.currentImage.src);
            }, 100);
        }
    }

    /**
     * 上一张图片
     */
    async previousImage() {
        if (this.state.currentImageIndex > 0) {
            await this.saveCurrentAnnotations();
            this.state.currentImageIndex--;
            await this.loadCurrentImage();
            this.updateNavigationState();
        }
    }

    /**
     * 下一张图片
     */
    async nextImage() {
        if (this.state.currentImageIndex < this.state.imageFiles.length - 1) {
            await this.saveCurrentAnnotations();
            this.state.currentImageIndex++;
            await this.loadCurrentImage();
            this.updateNavigationState();
        }
    }

    /**
     * 保存当前标注
     */
    async saveCurrentAnnotations() {
        if (!this.state.hasChanges) return;
        try {
            const currentFileName = this.state.imageFiles[this.state.currentImageIndex].name;
            const annotations = this.state.annotations.get(currentFileName) || [];
            // 更新文件夹数据中的标注
            if (!this.state.folderData.annotations) {
                this.state.folderData.annotations = {};
            }
            this.state.folderData.annotations[currentFileName] = {
                imageName: currentFileName,
                textRegions: annotations
            };
            // 修复：始终带入id，防止新建
            const folderToSave = { ...this.state.folderData };
            if (this.state.folderData.id) folderToSave.id = this.state.folderData.id;
            await window.storageManager.saveFolder(folderToSave);
            this.state.hasChanges = false;
            this.elements.lastSave.textContent = `已保存 ${new Date().toLocaleTimeString()}`;
        } catch (error) {
            console.error('保存失败:', error);
            this.updateStatus('保存失败: ' + error.message);
        }
    }

    /**
     * 批量保存所有图片的标注
     */
    async saveAllAnnotations() {
        const allAnnotations = {};
        for (let i = 0; i < this.state.imageFiles.length; i++) {
            const fileName = this.state.imageFiles[i].name;
            const annotations = this.state.annotations.get(fileName) || [];
            allAnnotations[fileName] = {
                imageName: fileName,
                textRegions: annotations
            };
        }
        // 关键修复：保证 name 字段被正确保留，不要覆盖原始文件夹名
        // 优先保留原始的 name 字段，只有在完全没有名称时才设置默认值
        if (!this.state.folderData.name && !this.state.folderData.folderName) {
            this.state.folderData.name = this.state.folderData.folderName = '未命名文件夹';
        } else {
            // 确保 name 和 folderName 保持一致，优先使用 name
            const finalName = this.state.folderData.name || this.state.folderData.folderName;
            this.state.folderData.name = finalName;
            this.state.folderData.folderName = finalName;
        }
        this.state.folderData.annotations = allAnnotations;
        const folderToSave = { ...this.state.folderData };
        if (this.state.folderData.id) folderToSave.id = this.state.folderData.id;
        console.log('准备写入数据库的数据：', JSON.stringify(folderToSave, null, 2));
        await window.storageManager.saveFolder(folderToSave)
            .then(() => {
                console.log('✅ 数据库写入操作【成功】！');
            })
            .catch(error => {
                console.error('❌ 数据库写入操作【失败】！', error);
            });
        this.state.hasChanges = false;
        this.elements.lastSave.textContent = `已保存 ${new Date().toLocaleTimeString()}`;
    }

    /**
     * 完成校准
     */
    async completeCalibration() {
        try {
            // 一次性写入所有标注
            await this.saveAllAnnotations();
            this.state.folderData.status = 'calibrated';
            const folderToSave = { ...this.state.folderData };
            if (this.state.folderData.id) folderToSave.id = this.state.folderData.id;
            await window.storageManager.saveFolder(folderToSave);
            this.updateStatus('校准完成！');
            setTimeout(() => {
                this.goBack();
            }, 1000);
        } catch (error) {
            console.error('完成校准失败:', error);
            this.updateStatus('完成校准失败: ' + error.message);
        }
    }

    /**
     * 返回主控台
     */
    goBack() {
        if (this.state.hasChanges) {
            if (confirm('有未保存的更改，确定要离开吗？')) {
                window.location.href = 'dashboard.html';
            }
        } else {
            window.location.href = 'dashboard.html';
        }
    }

    /**
     * 更新导航状态
     */
    updateNavigationState() {
        const current = this.state.currentImageIndex;
        const total = this.state.imageFiles.length;
        
        this.elements.prevBtn.disabled = current === 0;
        this.elements.nextBtn.disabled = current === total - 1;
        this.elements.completeBtn.disabled = false;
    }

    /**
     * 更新进度显示
     */
    updateProgress() {
        const current = this.state.currentImageIndex + 1;
        const total = this.state.imageFiles.length;
        this.elements.imageProgress.textContent = `${current}/${total}`;
    }

    /**
     * 更新文本统计
     */
    updateTextStats(textCount = null, charCount = null) {
        if (textCount === null || charCount === null) {
            const currentFileName = this.state.imageFiles[this.state.currentImageIndex]?.name;
            const annotations = this.state.annotations.get(currentFileName) || [];
            textCount = annotations.length;
            charCount = annotations.reduce((sum, ann) => sum + ann.text.length, 0);
        }
        
        this.elements.textCount.textContent = textCount;
        this.elements.charCount.textContent = charCount;
    }

    /**
     * 更新状态文本
     */
    updateStatus(message) {
        this.elements.statusText.textContent = message;
        console.log('状态:', message);
    }

    /**
     * 清空Canvas
     */
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * 初始化Canvas样式
     */
    initCanvas() {
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    /**
     * 获取指定坐标处的标注ID
     */
    getAnnotationAtPoint(x, y) {
        for (const [annotationId, region] of this.interactionState.annotationBoxes) {
            if (x >= region.left && x <= region.left + region.width &&
                y >= region.top && y <= region.top + region.height) {
                return annotationId;
            }
        }
        return null;
    }

    /**
     * 高亮指定标注
     */
    highlightAnnotation(annotationId) {
        if (this.interactionState.highlightedAnnotationId === annotationId) return;
        
        // 清除之前的高亮
        this.clearHighlight();
        
        // 设置新的高亮
        this.interactionState.highlightedAnnotationId = annotationId;
        
        // 重绘Canvas
        this.drawAllAnnotations();
        
        // 高亮对应的文本框
        const textItem = document.querySelector(`[data-annotation-id="${annotationId}"]`);
        if (textItem) {
            textItem.classList.add('highlighted');
            // 滚动到可见区域
            textItem.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest',
                inline: 'nearest'
            });
        }
    }

    /**
     * 清除高亮
     */
    clearHighlight() {
        if (!this.interactionState.highlightedAnnotationId) return;
        
        // 移除文本框高亮
        const highlightedTextItem = document.querySelector('.text-item.highlighted');
        if (highlightedTextItem) {
            highlightedTextItem.classList.remove('highlighted');
        }
        
        // 清除高亮状态
        this.interactionState.highlightedAnnotationId = null;
        
        // 重绘Canvas
        this.drawAllAnnotations();
    }

    /**
     * 处理鼠标离开Canvas事件
     */
    handleMouseLeave() {
        if (!this.drawingState.isDrawing) {
            this.clearHighlight();
        }
    }

    /**
     * 显示图片占位符
     */
    showImagePlaceholder(imageName, message) {
        this.elements.currentImage.src = `data:image/svg+xml,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
                <rect width="800" height="600" fill="#f8f9fa"/>
                <text x="400" y="280" text-anchor="middle" fill="#666" font-size="24">
                    ${imageName}
                </text>
                <text x="400" y="320" text-anchor="middle" fill="#999" font-size="16">
                    ${message}
                </text>
            </svg>
        `)}`;
        this.elements.currentImage.style.display = 'block';
    }
}

// 页面加载完成后启动应用
document.addEventListener('DOMContentLoaded', () => {
    new CalibrationApp();
});