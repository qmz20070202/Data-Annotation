/**
 * 自定义模态框组件
 * 替换浏览器默认弹窗，提供统一的视觉体验
 */

class ModalManager {
    constructor() {
        this.activeModal = null;
        this.modalContainer = null;
        this.initializeContainer();
        this.bindEvents();
    }

    /**
     * 初始化模态框容器
     */
    initializeContainer() {
        // 创建模态框容器
        this.modalContainer = document.createElement('div');
        this.modalContainer.id = 'modal-container';
        document.body.appendChild(this.modalContainer);
    }

    /**
     * 绑定全局事件
     */
    bindEvents() {
        // ESC键关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModal) {
                this.closeModal();
            }
        });
    }

    /**
     * 显示确认对话框
     */
    showConfirm(options = {}) {
        const {
            title = '确认操作',
            message = '您确定要执行此操作吗？',
            confirmText = '确认',
            cancelText = '取消',
            confirmClass = 'primary',
            onConfirm = () => {},
            onCancel = () => {}
        } = options;

        return new Promise((resolve) => {
            const modalHTML = `
                <div class="modal-overlay" id="current-modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 class="modal-title">${title}</h3>
                            <button class="modal-close" type="button">×</button>
                        </div>
                        <div class="modal-body">
                            ${message}
                        </div>
                        <div class="modal-footer">
                            <button class="modal-button secondary" data-action="cancel">
                                ${cancelText}
                            </button>
                            <button class="modal-button ${confirmClass}" data-action="confirm">
                                ${confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            this.showModal(modalHTML, {
                onConfirm: () => {
                    onConfirm();
                    resolve(true);
                },
                onCancel: () => {
                    onCancel();
                    resolve(false);
                }
            });
        });
    }

    /**
     * 显示信息提示框
     */
    showAlert(options = {}) {
        const {
            title = '提示',
            message = '',
            buttonText = '知道了',
            buttonClass = 'primary',
            onClose = () => {}
        } = options;

        return new Promise((resolve) => {
            const modalHTML = `
                <div class="modal-overlay" id="current-modal">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 class="modal-title">${title}</h3>
                            <button class="modal-close" type="button">×</button>
                        </div>
                        <div class="modal-body">
                            ${message}
                        </div>
                        <div class="modal-footer">
                            <button class="modal-button ${buttonClass}" data-action="confirm">
                                ${buttonText}
                            </button>
                        </div>
                    </div>
                </div>
            `;

            this.showModal(modalHTML, {
                onConfirm: () => {
                    onClose();
                    resolve();
                }
            });
        });
    }

    /**
     * 显示上传确认框
     */
    showUploadConfirm(folderName, fileCount) {
        return this.showConfirm({
            title: '确认上传文件夹',
            message: `
                <div style="text-align: center;">
                    <p style="margin-bottom: 16px;">您确定要上传以下文件夹吗？</p>
                    <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin: 16px 0;">
                        <div style="font-weight: 600; font-size: 1.1em; color: #007AFF;">📁 ${folderName}</div>
                        <div style="color: #8E8E93; margin-top: 8px;">包含 ${fileCount} 个图片文件</div>
                    </div>
                </div>
            `,
            confirmText: '确认上传',
            cancelText: '取消',
            confirmClass: 'primary'
        });
    }

    /**
     * 显示重复操作提示
     */
    showDuplicateActionAlert(imageName) {
        return this.showAlert({
            title: '重复操作提示',
            message: `
                <div style="text-align: center;">
                    <div style="font-size: 3em; margin-bottom: 16px;">⚠️</div>
                    <p>图片 <strong>${imageName}</strong> 已处理完毕</p>
                    <p style="color: #8E8E93; margin-top: 8px;">无需重复操作</p>
                </div>
            `,
            buttonText: '知道了',
            buttonClass: 'primary'
        });
    }

    /**
     * 显示处理进度模态框
     */
    showProgress(options = {}) {
        const {
            title = '处理中...',
            message = '正在处理，请稍候',
            showProgress = true
        } = options;

        const progressHTML = showProgress ? 
            '<div class="progress-container" style="margin-top: 16px;"><div class="progress-bar"><div class="progress-fill" id="modal-progress"></div></div></div>' : 
            '';

        const modalHTML = `
            <div class="modal-overlay" id="current-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                    </div>
                    <div class="modal-body">
                        <div style="text-align: center;">
                            <div style="font-size: 2em; margin-bottom: 16px;">⏳</div>
                            <div id="modal-message">${message}</div>
                            ${progressHTML}
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.showModal(modalHTML, {
            closable: false
        });

        return {
            updateProgress: (progress) => {
                const progressFill = document.getElementById('modal-progress');
                if (progressFill) {
                    progressFill.style.width = `${progress}%`;
                }
            },
            updateMessage: (message) => {
                const messageEl = document.getElementById('modal-message');
                if (messageEl) {
                    messageEl.textContent = message;
                }
            },
            close: () => this.closeModal()
        };
    }

    /**
     * 显示模态框的核心方法
     */
    showModal(modalHTML, options = {}) {
        const {
            onConfirm = () => {},
            onCancel = () => {},
            closable = true
        } = options;

        // 如果已有模态框，先关闭
        if (this.activeModal) {
            this.closeModal();
        }

        // 插入新模态框
        this.modalContainer.innerHTML = modalHTML;
        this.activeModal = document.getElementById('current-modal');

        // 绑定事件
        const closeBtn = this.activeModal.querySelector('.modal-close');
        const confirmBtn = this.activeModal.querySelector('[data-action="confirm"]');
        const cancelBtn = this.activeModal.querySelector('[data-action="cancel"]');

        if (closable && closeBtn) {
            closeBtn.addEventListener('click', () => {
                onCancel();
                this.closeModal();
            });
        } else if (closeBtn) {
            closeBtn.style.display = 'none';
        }

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                onConfirm();
                this.closeModal();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                onCancel();
                this.closeModal();
            });
        }

        // 点击遮罩关闭
        if (closable) {
            this.activeModal.addEventListener('click', (e) => {
                if (e.target === this.activeModal) {
                    onCancel();
                    this.closeModal();
                }
            });
        }

        // 显示模态框
        setTimeout(() => {
            this.activeModal.classList.add('show');
        }, 10);
    }

    /**
     * 关闭当前模态框
     */
    closeModal() {
        if (this.activeModal) {
            this.activeModal.classList.remove('show');
            
            setTimeout(() => {
                this.modalContainer.innerHTML = '';
                this.activeModal = null;
            }, 300);
        }
    }

    /**
     * 关闭所有模态框
     */
    closeAll() {
        this.closeModal();
    }
}

// 创建全局模态框管理器实例
window.modalManager = new ModalManager();