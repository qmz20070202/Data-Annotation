/**
 * UI管理模块 - 负责所有DOM操作和界面更新
 */

class UIManager {
    constructor(app) {
        this.app = app;
        this.elements = this.getElements();
    }

    /**
     * 获取关键DOM元素的引用
     */
    getElements() {
        return {
            fileList: document.getElementById('fileList'),
            fileCount: document.getElementById('fileCount'),
            currentImage: document.getElementById('currentImage'),
            imageInfo: document.getElementById('imageInfo'),
            textList: document.getElementById('textList'),
            statusText: document.getElementById('statusText'),
            progressContainer: document.querySelector('.progress-container'),
            progressBar: document.getElementById('progressBar'),
            progressText: document.getElementById('progressText'),
            prevBtn: document.getElementById('prevBtn'),
            nextBtn: document.getElementById('nextBtn'),
            selectFolderBtn: document.getElementById('selectFolderBtn'),
            ocrBtn: document.getElementById('ocrBtn'),
            saveBtn: document.getElementById('saveBtn'),
            addTextBtn: document.getElementById('addTextBtn')
        };
    }

    /**
     * 更新文件列表显示
     */
    updateFileList(imageFiles) {
        const fileList = this.elements.fileList;
        const fileCount = this.elements.fileCount;
        
        // 更新文件数量
        fileCount.textContent = `${imageFiles.length} 个文件`;
        
        // 清空现有列表
        fileList.innerHTML = '';
        
        // 创建文件项
        imageFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.textContent = file.name;
            fileItem.dataset.index = index;
            
            // 点击文件项切换图片
            fileItem.addEventListener('click', async () => {
                this.app.state.currentImageIndex = index;
                await this.app.loadCurrentImage();
            });
            
            fileList.appendChild(fileItem);
        });
    }

    /**
     * 设置当前活动的文件项
     */
    setActiveFileItem(index) {
        const fileItems = this.elements.fileList.querySelectorAll('.file-item');
        
        // 移除所有活动状态
        fileItems.forEach(item => item.classList.remove('active'));
        
        // 设置当前项为活动状态
        if (fileItems[index]) {
            fileItems[index].classList.add('active');
            
            // 滚动到可视区域
            fileItems[index].scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }

    /**
     * 更新图片信息显示
     */
    updateImageInfo(currentIndex, totalCount, fileName) {
        this.elements.imageInfo.textContent = `${currentIndex} / ${totalCount} - ${fileName}`;
    }

    /**
     * 更新导航按钮状态
     */
    updateNavigationButtons(currentIndex, totalCount) {
        this.elements.prevBtn.disabled = currentIndex === 0;
        this.elements.nextBtn.disabled = currentIndex === totalCount - 1;
    }

    /**
     * 显示/隐藏进度条
     */
    showProgress(show) {
        this.elements.progressContainer.style.display = show ? 'flex' : 'none';
        if (!show) {
            this.updateProgress(0, '');
        }
    }

    /**
     * 更新进度条
     */
    updateProgress(percent, text) {
        this.elements.progressBar.style.setProperty('--progress', `${percent}%`);
        this.elements.progressText.textContent = `${Math.round(percent)}%`;
        
        if (text) {
            this.elements.statusText.textContent = text;
        }
    }

    /**
     * 启用/禁用按钮
     */
    enableButtons(buttonIds) {
        buttonIds.forEach(id => {
            const button = this.elements[id];
            if (button) {
                button.disabled = false;
            }
        });
    }

    /**
     * 禁用按钮
     */
    disableButtons(buttonIds) {
        buttonIds.forEach(id => {
            const button = this.elements[id];
            if (button) {
                button.disabled = true;
            }
        });
    }

    /**
     * 显示文本标注项列表
     */
    displayTextItems(annotations) {
        const textList = this.elements.textList;
        
        // 清空现有内容
        textList.innerHTML = '';
        
        if (annotations.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.textContent = '暂无标注文本';
            textList.appendChild(emptyState);
            return;
        }
        
        // 创建文本项
        annotations.forEach((annotation, index) => {
            const textItem = this.createTextItem(annotation, index);
            textList.appendChild(textItem);
        });
    }

    /**
     * 创建单个文本标注项
     */
    createTextItem(annotation, index) {
        const textItem = document.createElement('div');
        textItem.className = 'text-item fade-in';
        textItem.dataset.annotationId = annotation.id;
        
        // 文本项头部
        const header = document.createElement('div');
        header.className = 'text-item-header';
        
        const indexLabel = document.createElement('span');
        indexLabel.className = 'text-item-index';
        indexLabel.textContent = `#${index + 1}`;
        
        const actions = document.createElement('div');
        actions.className = 'text-item-actions';
        
        // 删除按钮
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = '删除标注';
        deleteBtn.addEventListener('click', () => {
            if (confirm('确定要删除这个标注吗？')) {
                this.app.deleteAnnotation(annotation.id);
            }
        });
        
        actions.appendChild(deleteBtn);
        header.appendChild(indexLabel);
        header.appendChild(actions);
        
        // 文本输入框
        const textInput = document.createElement('textarea');
        textInput.className = 'text-input';
        textInput.value = annotation.text;
        textInput.placeholder = '请输入识别的文字...';
        textInput.dataset.annotationId = annotation.id;
        
        // 文本输入事件
        textInput.addEventListener('input', (e) => {
            this.app.updateAnnotationText(annotation.id, e.target.value);
        });
        
        // 鼠标悬浮高亮对应的标注框
        textItem.addEventListener('mouseenter', () => {
            this.app.canvas.highlightAnnotation(annotation.id);
            textItem.classList.add('highlighted');
        });
        
        textItem.addEventListener('mouseleave', () => {
            this.app.canvas.clearHighlight();
            textItem.classList.remove('highlighted');
        });
        
        // 聚焦时高亮
        textInput.addEventListener('focus', () => {
            this.app.canvas.highlightAnnotation(annotation.id);
            textItem.classList.add('highlighted');
        });
        
        textInput.addEventListener('blur', () => {
            this.app.canvas.clearHighlight();
            textItem.classList.remove('highlighted');
        });
        
        textItem.appendChild(header);
        textItem.appendChild(textInput);
        
        return textItem;
    }

    /**
     * 显示通知消息
     */
    showNotification(message, type = 'info') {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // 设置样式
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            backgroundColor: type === 'error' ? '#FF3B30' : '#34C759',
            color: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
            zIndex: '9999',
            fontSize: '14px',
            fontWeight: '500',
            maxWidth: '300px',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease'
        });
        
        document.body.appendChild(notification);
        
        // 动画显示
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // 自动隐藏
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    /**
     * 显示确认对话框
     */
    showConfirm(message, callback) {
        const result = confirm(message);
        if (callback) {
            callback(result);
        }
        return result;
    }

    /**
     * 显示加载状态
     */
    showLoading(show, message = '加载中...') {
        if (show) {
            // 创建加载遮罩
            const overlay = document.createElement('div');
            overlay.id = 'loadingOverlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                font-size: 16px;
                color: white;
            `;
            
            const spinner = document.createElement('div');
            spinner.style.cssText = `
                border: 3px solid rgba(255, 255, 255, 0.3);
                border-top: 3px solid #007AFF;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin-right: 12px;
            `;
            
            // 添加旋转动画
            const keyframes = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            
            if (!document.querySelector('#spinKeyframes')) {
                const style = document.createElement('style');
                style.id = 'spinKeyframes';
                style.textContent = keyframes;
                document.head.appendChild(style);
            }
            
            const container = document.createElement('div');
            container.style.cssText = 'display: flex; align-items: center;';
            container.appendChild(spinner);
            container.appendChild(document.createTextNode(message));
            
            overlay.appendChild(container);
            document.body.appendChild(overlay);
        } else {
            // 移除加载遮罩
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                overlay.parentNode.removeChild(overlay);
            }
        }
    }

    /**
     * 滚动到指定元素
     */
    scrollToElement(element, behavior = 'smooth') {
        if (element) {
            element.scrollIntoView({
                behavior: behavior,
                block: 'center',
                inline: 'nearest'
            });
        }
    }

    /**
     * 获取元素的边界矩形
     */
    getElementRect(element) {
        return element.getBoundingClientRect();
    }

    /**
     * 设置元素焦点
     */
    focusElement(element) {
        if (element && typeof element.focus === 'function') {
            element.focus();
        }
    }

    /**
     * 添加CSS类
     */
    addClass(element, className) {
        if (element) {
            element.classList.add(className);
        }
    }

    /**
     * 移除CSS类
     */
    removeClass(element, className) {
        if (element) {
            element.classList.remove(className);
        }
    }

    /**
     * 切换CSS类
     */
    toggleClass(element, className) {
        if (element) {
            element.classList.toggle(className);
        }
    }

    /**
     * 设置元素文本内容
     */
    setText(element, text) {
        if (element) {
            element.textContent = text;
        }
    }

    /**
     * 设置元素HTML内容
     */
    setHTML(element, html) {
        if (element) {
            element.innerHTML = html;
        }
    }

    /**
     * 创建元素
     */
    createElement(tag, className, textContent) {
        const element = document.createElement(tag);
        if (className) {
            element.className = className;
        }
        if (textContent) {
            element.textContent = textContent;
        }
        return element;
    }

    /**
     * 显示图片加载状态
     */
    showImageLoading(imageId) {
        if (window.loadingIndicator) {
            const imageContainer = document.querySelector('.image-container');
            if (imageContainer) {
                window.loadingIndicator.showImageIndicator(imageId, imageContainer);
            }
        }
        
        // 添加加载状态到文件项
        const fileItems = this.elements.fileList.querySelectorAll('.file-item');
        fileItems.forEach(item => {
            if (item.textContent === imageId) {
                item.classList.add('loading');
            }
        });
    }

    /**
     * 显示图片加载成功
     */
    showImageSuccess(imageId) {
        if (window.loadingIndicator) {
            window.loadingIndicator.showImageSuccess(imageId);
        }
        
        // 移除加载状态
        const fileItems = this.elements.fileList.querySelectorAll('.file-item');
        fileItems.forEach(item => {
            if (item.textContent === imageId) {
                item.classList.remove('loading');
            }
        });
    }

    /**
     * 显示图片加载错误
     */
    showImageError(imageId, errorMessage) {
        if (window.loadingIndicator) {
            window.loadingIndicator.showImageError(imageId, errorMessage);
        }
        
        // 移除加载状态
        const fileItems = this.elements.fileList.querySelectorAll('.file-item');
        fileItems.forEach(item => {
            if (item.textContent === imageId) {
                item.classList.remove('loading');
            }
        });
    }

    /**
     * 更新全局加载进度
     */
    updateGlobalProgress(progress, text) {
        if (window.loadingIndicator) {
            window.loadingIndicator.updateGlobalProgress(progress, text);
        }
    }

    /**
     * 显示优化的加载状态
     */
    showOptimizedLoading(show, message = '加载中...') {
        if (window.loadingIndicator) {
            if (show) {
                window.loadingIndicator.showGlobal({ text: message });
            } else {
                window.loadingIndicator.hideGlobal();
            }
        } else {
            // 降级到原来的方式
            this.showLoading(show, message);
        }
    }
}