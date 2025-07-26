import { store } from '../store';
import { addFile, updateFile } from '../store/slices/dataSlice';
import type { DataFile } from '../store/slices/dataSlice';
import { parseExcelFile, convertToTableData, getDataStatistics, getNumericColumns } from './excelParser';

// 标记是否已经完成数据预加载
let isDataPreloaded = false;

// 预定义要加载的文件列表
const DATA_FILES = ['正常数据.xlsx', '质检数据.xlsx'];

/**
 * 快速解析单个文件
 */
const processFile = async (fileName: string): Promise<DataFile | null> => {
  const fileId = `preload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`[数据预加载] 开始处理文件: ${fileName}`);
    
    // 获取文件
    const response = await fetch(`/${fileName}`);
    if (!response.ok) {
      console.warn(`[数据预加载] 文件 ${fileName} 不存在或无法访问 (HTTP ${response.status})`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const file = new File([arrayBuffer], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    console.log(`[数据预加载] 文件 ${fileName} 获取成功，大小: ${file.size} bytes`);

    // 解析文件
    const parsedData = await parseExcelFile(file);
    console.log(`[数据预加载] 文件 ${fileName} 解析完成:`);
    console.log(`  - 列数: ${parsedData.columnCount}`);
    console.log(`  - 行数: ${parsedData.rowCount}`);
    console.log(`  - 表头: `, parsedData.headers);
    console.log(`  - 前3行数据示例: `, parsedData.data.slice(0, 3));
    
    const tableData = convertToTableData(parsedData);
    const statistics = getDataStatistics(parsedData);
    
    // 专门检查数值列识别
    const numericColumns = getNumericColumns(parsedData);
    console.log(`[数据预加载] 文件 ${fileName} 数值列识别结果:`);
    console.log(`  - 找到的数值列: `, Object.keys(numericColumns));
    Object.keys(numericColumns).forEach(colName => {
      console.log(`  - ${colName}: ${numericColumns[colName].length} 个数值`);
    });

    const result: DataFile = {
      id: fileId,
      name: fileName,
      size: file.size,
      uploadTime: new Date().toISOString(),
      status: 'success',
      data: tableData,
      columns: parsedData.headers,
      rawData: parsedData,
      statistics,
      rowCount: parsedData.rowCount,
      columnCount: parsedData.columnCount,
    };

    console.log(`[数据预加载] 文件 ${fileName} 处理完成！`);
    return result;
  } catch (error) {
    console.error(`[数据预加载] 处理文件 ${fileName} 时出错:`, error);
    return null;
  }
};

/**
 * 全局数据预加载器 - 无感加载所有数据文件
 * 只会执行一次，避免重复加载
 */
export const preloadData = async (): Promise<void> => {
  // 防止重复执行
  if (isDataPreloaded) {
    console.log('[数据预加载] 已完成，跳过重复执行');
    return;
  }

  isDataPreloaded = true;
  console.log('[数据预加载] 开始执行数据预加载...');

  try {
    // 并行处理所有文件以提高速度
    const filePromises = DATA_FILES.map(fileName => processFile(fileName));
    const results = await Promise.allSettled(filePromises);

    // 将成功加载的文件添加到store
    let successCount = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value) {
        store.dispatch(addFile(result.value));
        successCount++;
      }
    });

    console.log(`[数据预加载] 完成！成功加载 ${successCount}/${DATA_FILES.length} 个文件`);
    
    // 检查store中的文件状态
    const state = store.getState();
    console.log('[数据预加载] Store中的文件状态:');
    state.data.files.forEach(file => {
      console.log(`  - ${file.name}: ${file.status}, 列数: ${file.columnCount}, 行数: ${file.rowCount}`);
    });
    
  } catch (error) {
    console.error('[数据预加载] 预加载过程中发生错误:', error);
  }
};

/**
 * 重置预加载状态（仅用于开发调试）
 */
export const resetPreloadState = (): void => {
  isDataPreloaded = false;
  console.log('[数据预加载] 预加载状态已重置');
};

/**
 * 检查数据是否已预加载
 */
export const isDataReady = (): boolean => {
  const state = store.getState();
  return state.data.files.some(file => file.status === 'success');
}; 