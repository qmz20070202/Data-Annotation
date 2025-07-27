/**
 * Canvas绘图模块 - 负责图片显示和标注框的绘制交互
 */

class CanvasManager {
    constructor(app) {
        this.app = app;
        this.canvas = document.getElementById('annotationCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.image = document.getElementById('currentImage');
        
        // 绘图状态
        this.drawingState = {
            isDrawing: false,
            startX: 0,
            startY: 0,
            currentBox: null
        };
        
        // 标注框数据
        this.annotationBoxes = new Map(); // id -> {region, highlighted}
        this.highlightedId = null;
        
        // 绑定事件
        this.bindEvents();
        
        // 初始化画布样式
        this.initCanvas();
    }

    /**
     * 初始化画布
     */
    initCanvas() {
        // 设置画布样式
        this.ctx.strokeStyle = '#007AFF';
        this.ctx.lineWidth = 2;
        this.ctx.fillStyle = 'rgba(0, 122, 255, 0.1)';
        
        // 设置高DPI支持
        this.setupHighDPI();
    }

    /**
     * 设置高DPI支持
     */
    setupHighDPI() {
        const devicePixelRatio = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * devicePixelRatio;
        this.canvas.height = rect.height * devicePixelRatio;
        
        this.ctx.scale(devicePixelRatio, devicePixelRatio);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 鼠标事件 - 用于手动绘制标注框
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // 鼠标悬浮事件 - 用于高亮标注框
        this.canvas.addEventListener('mouseover', (e) => this.handleMouseOver(e));
        this.canvas.addEventListener('mouseout', (e) => this.handleMouseOut(e));
        
        // 窗口大小变化时重新调整画布
        window.addEventListener('resize', () => this.handleResize());
    }

    /**
     * 加载图片到画布
     */
    async loadImage(imageUrl) {
        return new Promise((resolve, reject) => {
            // 如果传入的是HTMLImageElement，直接使用
            let img;
            if (imageUrl instanceof HTMLImageElement) {
                img = imageUrl;
            } else {
                img = new Image();
                img.crossOrigin = 'anonymous';
                img.src = imageUrl;
            }
            
            // 如果图片已经加载完成
            if (img.complete && img.naturalWidth > 0) {
                this.setupImage(img);
                resolve();
                return;
            }
            
            // 监听加载事件
            img.onload = () => {
                this.setupImage(img);
                resolve();
            };
            
            img.onerror = () => {
                reject(new Error('图片加载失败'));
            };
        });
    }

    /**
     * 设置图片到画布
     */
    setupImage(img) {
        // 更新HTML img元素
        this.image.src = img.src;
        this.image.style.display = 'block';
        
        // 计算缩放比例以适应容器
        const container = this.canvas.parentElement;
        const containerRect = container.getBoundingClientRect();
        
        const scaleX = (containerRect.width - 40) / img.width;
        const scaleY = (containerRect.height - 40) / img.height;
        const scale = Math.min(scaleX, scaleY, 1); // 不放大，只缩小
        
        const displayWidth = img.width * scale;
        const displayHeight = img.height * scale;
        
        // 调整画布大小
        this.canvas.width = displayWidth;
                this.canvas.height = displayHeight;
                this.canvas.style.width = displayWidth + 'px';
                this.canvas.style.height = displayHeight + 'px';
                
                // 调整图片大小
                this.image.style.width = displayWidth + 'px';
                this.image.style.height = displayHeight + 'px';
                
                // 保存图片信息用于坐标转换
                this.imageInfo = {
                    originalWidth: img.width,
                    originalHeight: img.height,
                    displayWidth: displayWidth,
                    displayHeight: displayHeight,
                    scale: scale
                };
                
                // 清空画布并重新初始化
                this.clearCanvas();
                this.initCanvas();
                
                resolve();
            };
            
            img.onerror = () => {
                reject(new Error('图片加载失败'));
            };
            
            img.src = imageUrl;
        });
    }

    /**
     * 处理鼠标按下事件
     */
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.drawingState.isDrawing = true;
        this.drawingState.startX = x;
        this.drawingState.startY = y;
        
        // 开始绘制提示
        this.app.updateStatus('拖拽鼠标绘制标注框...');
    }

    /**
     * 处理鼠标移动事件
     */
    handleMouseMove(e) {
        if (!this.drawingState.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 清除之前的临时绘制
        this.redrawCanvas();
        
        // 绘制当前的选择框
        this.drawTemporaryBox(this.drawingState.startX, this.drawingState.startY, x, y);
    }

    /**
     * 处理鼠标释放事件
     */
    handleMouseUp(e) {
        if (!this.drawingState.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.drawingState.isDrawing = false;
        
        // 计算选择区域
        const region = this.calculateRegion(this.drawingState.startX, this.drawingState.startY, x, y);
        
        // 检查区域是否有效（最小尺寸）
        if (region.width < 10 || region.height < 10) {
            this.redrawCanvas();
            this.app.updateStatus('标注框太小，请重新绘制');
            return;
        }
        
        // 转换为原图坐标
        const originalRegion = this.displayToOriginalCoords(region);
        
        // 创建新的标注
        const currentFileName = this.app.state.imageFiles[this.app.state.currentImageIndex].name;
        let annotations = this.app.state.annotations.get(currentFileName) || [];
        
        const newAnnotation = {
            id: Date.now(),
            text: '',
            region: originalRegion,
            isManual: true
        };
        
        annotations.push(newAnnotation);
        this.app.state.annotations.set(currentFileName, annotations);
        
        // 重绘画布
        this.redrawCanvas();
        this.drawAnnotationBox(originalRegion, newAnnotation.id);
        
        // 更新UI
        this.app.ui.displayTextItems(annotations);
        this.app.ui.enableButtons(['saveBtn']);
        
        // 聚焦到新的文本输入框
        setTimeout(() => {
            const textInput = document.querySelector(`[data-annotation-id="${newAnnotation.id}"]`);
            if (textInput) {
                textInput.focus();
            }
        }, 100);
        
        this.app.updateStatus('已添加新的标注框');
    }

    /**
     * 处理鼠标悬浮事件
     */
    handleMouseOver(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // 检查鼠标是否悬浮在标注框上
        const hoveredId = this.getAnnotationIdAtPoint(x, y);
        if (hoveredId && hoveredId !== this.highlightedId) {
            this.highlightAnnotation(hoveredId);
            this.canvas.style.cursor = 'pointer';
        }
    }

    /**
     * 处理鼠标离开事件
     */
    handleMouseOut(e) {
        this.canvas.style.cursor = 'crosshair';
    }

    /**
     * 处理窗口大小变化
     */
    handleResize() {
        // 重新加载当前图片以调整尺寸
        if (this.image.src) {
            setTimeout(() => {
                this.loadImage(this.image.src);
            }, 100);
        }
    }

    /**
     * 绘制标注框
     */
    drawAnnotationBox(region, id) {
        // 转换为显示坐标
        const displayRegion = this.originalToDisplayCoords(region);
        
        // 保存标注框信息
        this.annotationBoxes.set(id, {
            region: displayRegion,
            highlighted: false
        });
        
        // 绘制框
        this.ctx.save();
        this.ctx.strokeStyle = '#007AFF';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(displayRegion.left, displayRegion.top, displayRegion.width, displayRegion.height);
        
        // 添加半透明填充
        this.ctx.fillStyle = 'rgba(0, 122, 255, 0.1)';
        this.ctx.fillRect(displayRegion.left, displayRegion.top, displayRegion.width, displayRegion.height);
        
        this.ctx.restore();
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
        this.ctx.strokeRect(region.left, region.top, region.width, region.height);
        
        this.ctx.fillStyle = 'rgba(255, 149, 0, 0.1)';
        this.ctx.fillRect(region.left, region.top, region.width, region.height);
        
        this.ctx.restore();
    }

    /**
     * 高亮指定的标注框
     */
    highlightAnnotation(id) {
        if (this.highlightedId === id) return;
        
        // 清除之前的高亮
        this.clearHighlight();
        
        const boxInfo = this.annotationBoxes.get(id);
        if (!boxInfo) return;
        
        this.highlightedId = id;
        boxInfo.highlighted = true;
        
        // 重绘所有标注框
        this.redrawCanvas();
        
        // 绘制高亮框
        const region = boxInfo.region;
        this.ctx.save();
        this.ctx.strokeStyle = '#FF3B30';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(region.left, region.top, region.width, region.height);
        
        this.ctx.fillStyle = 'rgba(255, 59, 48, 0.2)';
        this.ctx.fillRect(region.left, region.top, region.width, region.height);
        
        this.ctx.restore();
        
        // 重绘其他标注框
        for (const [otherId, otherBoxInfo] of this.annotationBoxes) {
            if (otherId !== id) {
                this.drawAnnotationBox(this.displayToOriginalCoords(otherBoxInfo.region), otherId);
            }
        }
    }

    /**
     * 清除高亮
     */
    clearHighlight() {
        if (this.highlightedId) {
            const boxInfo = this.annotationBoxes.get(this.highlightedId);
            if (boxInfo) {
                boxInfo.highlighted = false;
            }
            this.highlightedId = null;
            this.redrawCanvas();
        }
    }

    /**
     * 清除所有标注
     */
    clearAnnotations() {
        this.annotationBoxes.clear();
        this.highlightedId = null;
        this.clearCanvas();
    }

    /**
     * 清空画布
     */
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * 重绘画布上的所有标注框
     */
    redrawCanvas() {
        this.clearCanvas();
        
        // 重绘所有标注框
        for (const [id, boxInfo] of this.annotationBoxes) {
            if (!boxInfo.highlighted) {
                this.drawAnnotationBox(this.displayToOriginalCoords(boxInfo.region), id);
            }
        }
    }

    /**
     * 计算选择区域
     */
    calculateRegion(startX, startY, endX, endY) {
        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);
        
        return { left, top, width, height };
    }

    /**
     * 获取指定点位置的标注框ID
     */
    getAnnotationIdAtPoint(x, y) {
        for (const [id, boxInfo] of this.annotationBoxes) {
            const region = boxInfo.region;
            if (x >= region.left && x <= region.left + region.width &&
                y >= region.top && y <= region.top + region.height) {
                return id;
            }
        }
        return null;
    }

    /**
     * 将显示坐标转换为原图坐标
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
     * 将原图坐标转换为显示坐标
     */
    originalToDisplayCoords(originalRegion) {
        if (!this.imageInfo) return originalRegion;
        
        const scale = this.imageInfo.scale;
        return {
            left: Math.round(originalRegion.left * scale),
            top: Math.round(originalRegion.top * scale),
            width: Math.round(originalRegion.width * scale),
            height: Math.round(originalRegion.height * scale)
        };
    }

    /**
     * 获取画布边界矩形
     */
    getCanvasRect() {
        return this.canvas.getBoundingClientRect();
    }

    /**
     * 获取图片信息
     */
    getImageInfo() {
        return this.imageInfo;
    }

    /**
     * 设置画布样式
     */
    setCanvasStyle(property, value) {
        if (this.ctx[property] !== undefined) {
            this.ctx[property] = value;
        }
    }

    /**
     * 获取画布数据URL（用于导出）
     */
    getCanvasDataURL(format = 'image/png') {
        return this.canvas.toDataURL(format);
    }

    /**
     * 重置画布到初始状态
     */
    reset() {
        this.clearAnnotations();
        this.drawingState = {
            isDrawing: false,
            startX: 0,
            startY: 0,
            currentBox: null
        };
        
        this.image.style.display = 'none';
        this.image.src = '';
        
        // 重置画布大小
        this.canvas.width = 800;
        this.canvas.height = 600;
        this.canvas.style.width = '800px';
        this.canvas.style.height = '600px';
        
        this.initCanvas();
    }
}