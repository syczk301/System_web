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
        const workbook = XLSX.read(data, { type: 'array' });
        
        // 获取第一个工作表
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // 转换为JSON格式
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length === 0) {
          reject(new Error('Excel文件为空'));
          return;
        }
        
        // 第一行作为表头
        const headers = jsonData[0] as string[];
        const dataRows = jsonData.slice(1) as any[][];
        
        // 过滤空行
        const filteredData = dataRows.filter(row => 
          row.some(cell => cell !== null && cell !== undefined && cell !== '')
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

// 将解析后的数据转换为表格显示格式
export const convertToTableData = (parsedData: ParsedData) => {
  return parsedData.data.map((row, index) => {
    const rowData: any = { key: index };
    parsedData.headers.forEach((header, colIndex) => {
      rowData[header] = row[colIndex] || '';
    });
    return rowData;
  });
};

// 获取数值列数据（用于分析算法）
export const getNumericColumns = (parsedData: ParsedData): { [key: string]: number[] } => {
  const numericData: { [key: string]: number[] } = {};
  
  parsedData.headers.forEach((header, colIndex) => {
    const columnData = parsedData.data
      .map(row => {
        const value = row[colIndex];
        if (typeof value === 'number') {
          return value;
        }
        if (typeof value === 'string') {
          // 尝试从字符串中解析数值，忽略非数值字符
          const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
          return isNaN(parsed) ? null : parsed;
        }
        return null;
      })
      .filter((val): val is number => val !== null && isFinite(val));
    
    if (columnData.length > 0) {
      numericData[header] = columnData;
    }
  });
  
  return numericData;
};

// 获取统计信息
export const getDataStatistics = (parsedData: ParsedData) => {
  const numericData = getNumericColumns(parsedData);
  const statistics: { [key: string]: any } = {};
  
  Object.keys(numericData).forEach(column => {
    const data = numericData[column];
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = sum / data.length;
    const sortedData = [...data].sort((a, b) => a - b);
    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / data.length;
    
    statistics[column] = {
      count: data.length,
      mean: mean.toFixed(3),
      min: Math.min(...data).toFixed(3),
      max: Math.max(...data).toFixed(3),
      std: Math.sqrt(variance).toFixed(3),
      median: data.length % 2 === 0 
        ? ((sortedData[data.length / 2 - 1] + sortedData[data.length / 2]) / 2).toFixed(3)
        : sortedData[Math.floor(data.length / 2)].toFixed(3)
    };
  });
  
  return statistics;
};