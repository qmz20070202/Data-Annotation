/**
 * API管理模块 - PaddleOCR调用
 */

class APIManager {
    constructor(app) {
        this.app = app;
        
        // PaddleOCR配置
        this.config = {
            apiUrl: 'https://scanimage.iclass30.com/paddleocr/predict/ocr_system'
        };
        
        // 请求配置
        this.requestConfig = {
            timeout: 30000,
            retryCount: 3,
            retryDelay: 1000
        };
    }

    /**
     * 执行OCR识别
     */
    async performOCR(imageFile) {
        return await this.paddleOCR(imageFile);
    }

    /**
     * 批量OCR识别
     */
    async batchOCR(imageFiles, progressCallback = null) {
        if (!Array.isArray(imageFiles) || imageFiles.length === 0) {
            throw new Error('请提供有效的图片文件数组');
        }

        console.log(`开始批量OCR识别，共 ${imageFiles.length} 个文件`);
        
        const results = {};
        let completedCount = 0;
        
        try {
            const promises = imageFiles.map(async (imageFile, index) => {
                try {
                    console.log(`处理第 ${index + 1} 个文件: ${imageFile.name}`);
                    
                    const ocrResult = await this.performOCR(imageFile);
                    
                    completedCount++;
                    if (progressCallback) {
                        progressCallback({
                            current: completedCount,
                            total: imageFiles.length,
                            fileName: imageFile.name,
                            success: true
                        });
                    }
                    
                    return {
                        fileName: imageFile.name,
                        success: true,
                        result: ocrResult
                    };
                    
                } catch (error) {
                    console.error(`文件 ${imageFile.name} OCR识别失败:`, error);
                    
                    completedCount++;
                    if (progressCallback) {
                        progressCallback({
                            current: completedCount,
                            total: imageFiles.length,
                            fileName: imageFile.name,
                            success: false,
                            error: error.message
                        });
                    }
                    
                    return {
                        fileName: imageFile.name,
                        success: false,
                        error: error.message
                    };
                }
            });
            
            const ocrResults = await Promise.all(promises);
            
            let successCount = 0;
            let failureCount = 0;
            
            ocrResults.forEach(item => {
                if (item.success) {
                    results[item.fileName] = item.result;
                    successCount++;
                } else {
                    results[item.fileName] = {
                        error: item.error,
                        words_result_num: 0,
                        words_result: []
                    };
                    failureCount++;
                }
            });
            
            console.log(`批量OCR识别完成: 成功 ${successCount} 个，失败 ${failureCount} 个`);
            
            return {
                success: true,
                totalFiles: imageFiles.length,
                successCount,
                failureCount,
                results: results
            };
            
        } catch (error) {
            console.error('批量OCR识别过程中发生错误:', error);
            throw new Error(`批量识别失败: ${error.message}`);
        }
    }

    /**
     * PaddleOCR API调用
     */
    async paddleOCR(imageFile) {
        try {
            console.log(`开始处理图片文件: ${imageFile.name}`);
            
            const base64Image = await this.fileToBase64(imageFile);
            console.log(`图片转换完成，Base64长度: ${base64Image.length}`);
            
            const requestData = {
                images: [base64Image],
                is_det: 1
            };
            
            console.log('发送PaddleOCR请求到:', this.config.apiUrl);
            
            const response = await fetch(this.config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            console.log(`PaddleOCR响应状态: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('PaddleOCR错误响应:', errorText);
                throw new Error(`PaddleOCR API请求失败: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            console.log('=== PaddleOCR完整响应分析 ===');
            console.log('响应类型:', typeof result);
            console.log('响应内容:', result);
            console.log('响应字段:', Object.keys(result));
            
            return this.processPaddleOCRResponse(result, imageFile.name);

        } catch (error) {
            console.error(`PaddleOCR处理图片 ${imageFile.name} 失败:`, error);
            throw new Error(`OCR识别失败: ${error.message}`);
        }
    }

    /**
     * 处理PaddleOCR响应
     */
    processPaddleOCRResponse(result, fileName) {
        try {
            console.log(`处理 ${fileName} 的PaddleOCR响应:`, result);
            
            // 检查是否有错误字段
            if (result.error) {
                throw new Error(`API返回错误: ${result.error}`);
            }
            
            // 对于PaddleOCR，状态码"000"表示成功
            if (result.status !== undefined) {
                const status = String(result.status);
                if (status !== "000") {
                    throw new Error(`API状态错误: ${result.status} - ${result.message || '状态异常'}`);
                }
                console.log(`状态码检查通过: ${result.status}`);
            }
            
            // 检查结果格式 - 针对新的返回格式优化
            let ocrResults = [];
            
            if (result.results && Array.isArray(result.results)) {
                // 新格式: results是二维数组，每个图片是一个数组，包含多个文本对象
                if (result.results.length > 0 && Array.isArray(result.results[0])) {
                    ocrResults = result.results[0]; // 取第一张图片的结果
                } else {
                    ocrResults = result.results;
                }
            } else if (Array.isArray(result)) {
                ocrResults = result;
            } else {
                console.warn('未识别的响应格式:', result);
                return {
                    words_result_num: 0,
                    words_result: [],
                    source: 'paddle',
                    fileName: fileName
                };
            }
            
            // 转换为标准格式 - 针对新的数据结构
            const formattedResults = ocrResults.map((item, index) => {
                // 新格式: 每个item是对象，包含text, confidence, text_region
                if (item && typeof item === 'object' && item.text) {
                    return {
                        text: item.text || '',
                        text_region: item.text_region || [],
                        words: item.text || '',
                        location: this.convertBboxToLocation(item.text_region),
                        confidence: item.confidence || 1.0,
                        id: Date.now() + index
                    };
                }
                // 兼容旧格式: [bbox, text, confidence]
                else if (Array.isArray(item) && item.length >= 2) {
                    const [bbox, text, confidence] = item;
                    return {
                        text: text || '',
                        text_region: bbox || [],
                        words: text || '',
                        location: this.convertBboxToLocation(bbox),
                        confidence: confidence || 1.0,
                        id: Date.now() + index
                    };
                }
                return null;
            }).filter(item => item !== null);
            
            console.log(`图片 ${fileName} 识别到 ${formattedResults.length} 个文字区域`);
            
            return {
                words_result_num: formattedResults.length,
                words_result: formattedResults,
                source: 'paddle',
                fileName: fileName
            };
            
        } catch (error) {
            console.error('处理PaddleOCR响应失败:', error);
            throw error;
        }
    }

    /**
     * 批量处理本地图片文件夹
     */
    async processLocalImageFolder(imageFiles, progressCallback = null) {
        if (!imageFiles || imageFiles.length === 0) {
            throw new Error('没有提供图片文件');
        }
        
        console.log(`开始批量处理 ${imageFiles.length} 个本地图片文件`);
        
        const results = {};
        const errors = [];
        
        for (let i = 0; i < imageFiles.length; i++) {
            const imageFile = imageFiles[i];
            
            try {
                console.log(`处理第 ${i + 1}/${imageFiles.length} 个文件: ${imageFile.name}`);
                
                if (progressCallback) {
                    progressCallback({
                        current: i + 1,
                        total: imageFiles.length,
                        fileName: imageFile.name,
                        status: 'processing'
                    });
                }
                
                const ocrResult = await this.paddleOCR(imageFile);
                results[imageFile.name] = ocrResult;
                
                console.log(`✅ ${imageFile.name} 处理完成，识别到 ${ocrResult.words_result_num} 个文字区域`);
                
            } catch (error) {
                console.error(`❌ ${imageFile.name} 处理失败:`, error.message);
                errors.push({
                    fileName: imageFile.name,
                    error: error.message
                });
                
                results[imageFile.name] = {
                    words_result_num: 0,
                    words_result: [],
                    error: error.message,
                    source: 'paddle'
                };
            }
        }
        
        const successCount = Object.keys(results).length - errors.length;
        console.log(`批量处理完成: 成功 ${successCount} 个，失败 ${errors.length} 个`);
        
        return {
            success: true,
            totalFiles: imageFiles.length,
            successCount: successCount,
            errorCount: errors.length,
            results: results,
            errors: errors
        };
    }

    /**
     * 格式化PaddleOCR API返回结果
     */
    formatPaddleResult(paddleResult) {
        if (!paddleResult.results || !Array.isArray(paddleResult.results)) {
            if (Array.isArray(paddleResult)) {
                const formattedResults = paddleResult.map((item, index) => {
                    if (Array.isArray(item) && item.length >= 2) {
                        const [bbox, text, confidence] = item;
                        return {
                            text: text,
                            text_region: bbox,
                            words: text,
                            location: this.convertBboxToLocation(bbox),
                            confidence: confidence || 1.0,
                            id: Date.now() + index
                        };
                    }
                    return null;
                }).filter(item => item !== null);

                return {
                    words_result_num: formattedResults.length,
                    words_result: formattedResults
                };
            }
            return { words_result_num: 0, words_result: [] };
        }

        const formattedResults = paddleResult.results.map((item, index) => ({
            text: item.text || item.words || '',
            text_region: item.text_region || item.bbox,
            words: item.text || item.words || '',
            location: this.convertBboxToLocation(item.text_region || item.bbox),
            confidence: item.confidence || 1.0,
            id: Date.now() + index
        }));

        return {
            words_result_num: formattedResults.length,
            words_result: formattedResults
        };
    }

    /**
     * 将PaddleOCR的bbox格式转换为标准的location格式
     */
    convertBboxToLocation(bbox) {
        if (!bbox || !Array.isArray(bbox) || bbox.length < 4) {
            return { left: 0, top: 0, width: 100, height: 30 };
        }

        const [[x1, y1], [x2, y2], [x3, y3], [x4, y4]] = bbox;
        
        const left = Math.min(x1, x2, x3, x4);
        const top = Math.min(y1, y2, y3, y4);
        const right = Math.max(x1, x2, x3, x4);
        const bottom = Math.max(y1, y2, y3, y4);
        
        return {
            left: Math.round(left),
            top: Math.round(top),
            width: Math.round(right - left),
            height: Math.round(bottom - top)
        };
    }

    /**
     * 将文件转换为Base64编码
     */
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            
            reader.onerror = () => {
                reject(new Error('文件读取失败'));
            };
            
            reader.readAsDataURL(file);
        });
    }

    /**
     * 延迟函数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 获取支持的图片格式
     */
    getSupportedFormats() {
        return ['image/jpeg', 'image/png', 'image/gif', 'image/bmp'];
    }

    /**
     * 检查文件格式是否支持
     */
    isFormatSupported(file) {
        return this.getSupportedFormats().includes(file.type);
    }

    /**
     * 获取文件大小限制（字节）
     */
    getFileSizeLimit() {
        return 4 * 1024 * 1024; // 4MB
    }

    /**
     * 检查文件大小是否符合要求
     */
    isFileSizeValid(file) {
        return file.size <= this.getFileSizeLimit();
    }

    /**
     * 验证图片文件
     */
    validateImageFile(file) {
        const errors = [];
        
        if (!this.isFormatSupported(file)) {
            errors.push(`不支持的文件格式: ${file.type}`);
        }
        
        if (!this.isFileSizeValid(file)) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            const limitMB = (this.getFileSizeLimit() / 1024 / 1024).toFixed(2);
            errors.push(`文件过大: ${sizeMB}MB，限制: ${limitMB}MB`);
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * 批量验证图片文件
     */
    validateImageFiles(files) {
        const results = {
            valid: [],
            invalid: []
        };
        
        files.forEach(file => {
            const validation = this.validateImageFile(file);
            if (validation.valid) {
                results.valid.push(file);
            } else {
                results.invalid.push({
                    file: file,
                    errors: validation.errors
                });
            }
        });
        
        return results;
    }
}