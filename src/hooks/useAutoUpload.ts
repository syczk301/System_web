import { useState, useEffect } from 'react';
import { message } from 'antd';
import { autoUploadFiles, isFileAlreadyUploaded } from '../utils/autoUpload';

export const useAutoUpload = () => {
  const [autoUploadCompleted, setAutoUploadCompleted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const performAutoUpload = async () => {
      if (autoUploadCompleted) return;
      
      const filesToUpload = ['正常数据.xlsx', '质检数据.xlsx'];
      const filesToUploadFiltered = filesToUpload.filter(fileName => !isFileAlreadyUploaded(fileName));
      
      if (filesToUploadFiltered.length > 0) {
        setIsLoading(true);
        try {
          console.log('自动加载数据文件...');
          await autoUploadFiles(filesToUploadFiltered);
          console.log('自动加载完成');
        } catch (error) {
          console.error('自动加载失败:', error);
        } finally {
          setIsLoading(false);
        }
      }
      
      setAutoUploadCompleted(true);
    };

    // 延迟1秒后开始自动上传，确保组件完全加载
    const timer = setTimeout(performAutoUpload, 1000);
    return () => clearTimeout(timer);
  }, [autoUploadCompleted]);

  return { autoUploadCompleted, isLoading };
}; 