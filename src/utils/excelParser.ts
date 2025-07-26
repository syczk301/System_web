import * as XLSX from 'xlsx';

export interface ParsedData {
  headers: string[];
  data: any[][];
  rowCount: number;
  columnCount: number;
}

export const parseExcelFile = (file: File): Promise<ParsedData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { 
          type: 'array',
          // 优化选项：跳过某些不必要的处理
          cellHTML: false,
          cellNF: false,
          cellStyles: false
        });
        
        // 获取第一个工作表
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 使用更高效的转换选项
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          raw: false, // 保持原始格式以避免类型转换开销
          defval: '', // 空单元格的默认值
        });
        
        if (jsonData.length === 0) {
          reject(new Error('Excel文件为空'));
          return;
        }
        
        // 第一行作为表头
        const headers = jsonData[0] as string[];
        const dataRows = jsonData.slice(1) as any[][];
        
        // 优化过滤逻辑：使用简单的条件检查
        const filteredData = dataRows.filter(row => 
          row && row.length > 0 && row.some(cell => cell !== '' && cell != null)
        );
        
        const result: ParsedData = {
          headers,
          data: filteredData,
          rowCount: filteredData.length,
          columnCount: headers.length
        };
        
        resolve(result);
      } catch (error) {
        reject(new Error(`解析Excel文件失败: ${error}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    
    reader.readAsArrayBuffer(file);
  });
};

// 将解析后的数据转换为表格显示格式（优化版）
export const convertToTableData = (parsedData: ParsedData) => {
  return parsedData.data.map((row, index) => {
    const rowData: any = { key: index };
    // 预先分配对象大小以提高性能
    for (let colIndex = 0; colIndex < parsedData.headers.length; colIndex++) {
      const header = parsedData.headers[colIndex];
      rowData[header] = row[colIndex] || '';
    }
    return rowData;
  });
};

// 获取数值列数据（优化版）
export const getNumericColumns = (parsedData: ParsedData): { [key: string]: number[] } => {
  const numericData: { [key: string]: number[] } = {};
  
  // 并行处理所有列
  parsedData.headers.forEach((header, colIndex) => {
    const columnData: number[] = [];
    
    // 优化的数值提取逻辑
    for (let rowIndex = 0; rowIndex < parsedData.data.length; rowIndex++) {
      const value = parsedData.data[rowIndex][colIndex];
      
      if (typeof value === 'number') {
        columnData.push(value);
      } else if (typeof value === 'string' && value.trim() !== '') {
        // 尝试从字符串中解析数值，忽略非数值字符
        const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
        if (!isNaN(parsed) && isFinite(parsed)) {
          columnData.push(parsed);
        }
      }
    }
    
    // 只有当列中有足够的数值数据时才包含
    if (columnData.length > 0) {
      numericData[header] = columnData;
    }
  });
  
  return numericData;
};

// 获取统计信息（优化版）
export const getDataStatistics = (parsedData: ParsedData) => {
  const numericData = getNumericColumns(parsedData);
  const statistics: { [key: string]: any } = {};
  
  Object.keys(numericData).forEach(column => {
    const data = numericData[column];
    const length = data.length;
    
    // 优化统计计算
    let sum = 0;
    let min = data[0];
    let max = data[0];
    
    for (let i = 0; i < length; i++) {
      const val = data[i];
      sum += val;
      if (val < min) min = val;
      if (val > max) max = val;
    }
    
    const mean = sum / length;
    
    // 计算方差（单次遍历）
    let variance = 0;
    for (let i = 0; i < length; i++) {
      const diff = data[i] - mean;
      variance += diff * diff;
    }
    variance /= length;
    
    // 计算中位数（仅在需要时排序）
    const sortedData = [...data].sort((a, b) => a - b);
    const median = length % 2 === 0 
      ? (sortedData[length / 2 - 1] + sortedData[length / 2]) / 2
      : sortedData[Math.floor(length / 2)];
    
    statistics[column] = {
      count: length,
      mean: Number(mean.toFixed(3)),
      min: Number(min.toFixed(3)),
      max: Number(max.toFixed(3)),
      std: Number(Math.sqrt(variance).toFixed(3)),
      median: Number(median.toFixed(3))
    };
  });
  
  return statistics;
};