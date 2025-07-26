import { store } from '../store';
import { addFile, updateFile } from '../store/slices/dataSlice';
import type { DataFile } from '../store/slices/dataSlice';
import { message } from 'antd';
import { parseExcelFile, convertToTableData, getDataStatistics } from './excelParser';

/**
 * 自动从 /public 目录获取文件、解析并更新到 Redux store
 * @param fileName 要获取的文件名
 */
export const autoUploadFile = async (fileName: string): Promise<void> => {
  const fileId = `auto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 1. 立即将文件添加到 store，并设置为 'uploading' 状态
  const initialFile: DataFile = {
    id: fileId,
    name: fileName,
    size: 0,
    uploadTime: new Date().toISOString(),
    status: 'uploading',
  };
  store.dispatch(addFile(initialFile));

  try {
    // 2. 从服务器获取文件
    const response = await fetch(`/${fileName}`);
    if (!response.ok) {
      throw new Error(`文件获取失败 (HTTP ${response.status})`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const file = new File([arrayBuffer], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    // 更新文件大小
    store.dispatch(updateFile({ id: fileId, updates: { size: file.size } }));

    // 3. 解析文件
    const parsedData = await parseExcelFile(file);
    const tableData = convertToTableData(parsedData);
    const statistics = getDataStatistics(parsedData);
    
    // 4. 使用解析出的数据更新 store，状态为 'success'
    store.dispatch(updateFile({
      id: fileId,
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
  } catch (error: any) {
    // 5. 如果过程中任何一步出错，更新 store 中该文件的状态为 'error'
    const errorMessage = error.message || '未知错误';
    console.error(`自动处理文件 "${fileName}" 失败:`, error);
    message.error(`处理文件 "${fileName}" 失败: ${errorMessage}`);
    store.dispatch(updateFile({
      id: fileId,
      updates: {
        status: 'error',
        error: errorMessage,
      },
    }));
    // 重新抛出错误，以便调用者可以捕获它
    throw error;
  }
};

/**
 * 自动上传多个文件
 * @param fileNames 文件名数组
 */
export const autoUploadFiles = async (fileNames: string[]): Promise<void> => {
  for (const fileName of fileNames) {
    try {
      await autoUploadFile(fileName);
      // 在文件之间添加一个小的延迟，以便UI可以平滑更新
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      // 如果一个文件失败，记录错误并中断后续文件的处理
      console.error(`处理文件 ${fileName} 时发生错误，后续自动上传将中止。`);
      break; 
    }
  }
};

/**
 * 检查文件是否已经成功上传
 * @param fileName 文件名
 */
export const isFileAlreadyUploaded = (fileName: string): boolean => {
  const state = store.getState();
  return state.data.files.some(file => file.name === fileName && file.status === 'success');
};