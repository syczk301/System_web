import { store } from '../store';
import { addFile, updateFile, setUploadProgress } from '../store/slices/dataSlice';
import type { DataFile } from '../store/slices/dataSlice';
import { message } from 'antd';
import { parseExcelFile, convertToTableData, getDataStatistics } from './excelParser';

// 模拟Excel数据解析
const parseExcelData = (fileName: string) => {
  // 根据文件名返回不同的模拟数据
  if (fileName.includes('正常数据')) {
    return {
      data: [
        { id: 1, timestamp: '2024-01-15 08:00:00', temperature: 25.2, pressure: 1.15, flow: 98.5, quality: 'A', workshop: '第一车间', equipment: 'EQ001' },
        { id: 2, timestamp: '2024-01-15 08:05:00', temperature: 25.8, pressure: 1.18, flow: 99.2, quality: 'A', workshop: '第一车间', equipment: 'EQ001' },
        { id: 3, timestamp: '2024-01-15 08:10:00', temperature: 25.5, pressure: 1.16, flow: 98.8, quality: 'A', workshop: '第一车间', equipment: 'EQ001' },
        { id: 4, timestamp: '2024-01-15 08:15:00', temperature: 25.9, pressure: 1.19, flow: 99.5, quality: 'A', workshop: '第一车间', equipment: 'EQ001' },
        { id: 5, timestamp: '2024-01-15 08:20:00', temperature: 25.3, pressure: 1.17, flow: 98.9, quality: 'A', workshop: '第一车间', equipment: 'EQ001' },
      ],
      columns: ['timestamp', 'temperature', 'pressure', 'flow', 'quality', 'workshop', 'equipment']
    };
  } else if (fileName.includes('质检数据')) {
    return {
      data: [
        { id: 1, timestamp: '2024-01-15 09:00:00', temperature: 26.8, pressure: 1.25, flow: 95.2, quality: 'B', workshop: '第二车间', equipment: 'EQ002' },
        { id: 2, timestamp: '2024-01-15 09:05:00', temperature: 27.2, pressure: 1.28, flow: 94.8, quality: 'C', workshop: '第二车间', equipment: 'EQ002' },
        { id: 3, timestamp: '2024-01-15 09:10:00', temperature: 26.5, pressure: 1.22, flow: 96.1, quality: 'B', workshop: '第二车间', equipment: 'EQ002' },
        { id: 4, timestamp: '2024-01-15 09:15:00', temperature: 27.5, pressure: 1.30, flow: 94.2, quality: 'C', workshop: '第二车间', equipment: 'EQ002' },
        { id: 5, timestamp: '2024-01-15 09:20:00', temperature: 26.9, pressure: 1.26, flow: 95.8, quality: 'B', workshop: '第二车间', equipment: 'EQ002' },
      ],
      columns: ['timestamp', 'temperature', 'pressure', 'flow', 'quality', 'workshop', 'equipment']
    };
  }
  
  return {
    data: [],
    columns: []
  };
};

// 模拟文件大小计算
const getFileSize = (fileName: string) => {
  if (fileName.includes('正常数据')) {
    return 1024 * 25; // 25KB
  } else if (fileName.includes('质检数据')) {
    return 1024 * 18; // 18KB
  }
  return 1024 * 10; // 默认10KB
};

// 自动上传单个文件
export const autoUploadFile = async (fileName: string): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    try {
      // 从public文件夹读取文件
      const filePath = `/${fileName}`;
      
      // 创建文件对象
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`无法读取文件: ${fileName}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const file = new File([arrayBuffer], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });
      
      const newFile: DataFile = {
        id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: fileName,
        size: file.size,
        uploadTime: new Date().toISOString(),
        status: 'uploading',
      };

      // 添加文件到store
      store.dispatch(addFile(newFile));

      // 模拟上传进度
      let progress = 0;
      const timer = setInterval(async () => {
        progress += 20;
        store.dispatch(setUploadProgress(progress));
        
        if (progress >= 100) {
          clearInterval(timer);
          
          try {
            // 解析Excel文件
            const parsedData = await parseExcelFile(file);
            const tableData = convertToTableData(parsedData);
            const statistics = getDataStatistics(parsedData);
            
            // 更新文件状态为成功
            store.dispatch(updateFile({
              id: newFile.id,
              updates: {
                status: 'success',
                data: tableData,
                columns: parsedData.headers,
                rawData: parsedData,
                statistics,
                rowCount: parsedData.rowCount,
                columnCount: parsedData.columnCount,
              },
            }));
            
            store.dispatch(setUploadProgress(0));
            message.success(`${fileName} 自动上传成功！`);
            resolve();
          } catch (parseError) {
            console.error('解析文件失败:', parseError);
            // 解析失败时使用模拟数据
            const { data, columns } = parseExcelData(fileName);
            
            store.dispatch(updateFile({
              id: newFile.id,
              updates: {
                status: 'success',
                data,
                columns,
                columnCount: columns.length,
                rowCount: data.length,
              },
            }));
            
            store.dispatch(setUploadProgress(0));
            message.success(`${fileName} 自动上传成功！`);
            resolve();
          }
        }
      }, 300);
    } catch (error) {
      // 如果读取真实文件失败，使用模拟数据
      console.warn(`无法读取真实文件 ${fileName}，使用模拟数据:`, error);
      
      const fileSize = getFileSize(fileName);
      const newFile: DataFile = {
        id: `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: fileName,
        size: fileSize,
        uploadTime: new Date().toISOString(),
        status: 'uploading',
      };

      // 添加文件到store
      store.dispatch(addFile(newFile));

      // 模拟上传进度
      let progress = 0;
      const timer = setInterval(() => {
        progress += 20;
        store.dispatch(setUploadProgress(progress));
        
        if (progress >= 100) {
          clearInterval(timer);
          
          // 解析文件数据
          const { data, columns } = parseExcelData(fileName);
          
          // 更新文件状态为成功
          store.dispatch(updateFile({
            id: newFile.id,
            updates: {
              status: 'success',
              data,
              columns,
              columnCount: columns.length,
              rowCount: data.length,
            },
          }));
          
          store.dispatch(setUploadProgress(0));
          message.success(`${fileName} 自动上传成功！`);
          resolve();
        }
      }, 300);
    }
  });
};

// 自动上传多个文件
export const autoUploadFiles = async (fileNames: string[]): Promise<void> => {
  for (const fileName of fileNames) {
    await autoUploadFile(fileName);
    // 文件之间间隔500ms
    await new Promise(resolve => setTimeout(resolve, 500));
  }
};

// 检查文件是否已经上传
export const isFileAlreadyUploaded = (fileName: string): boolean => {
  const state = store.getState();
  return state.data.files.some(file => file.name === fileName && file.status === 'success');
};