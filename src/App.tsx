import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { store } from './store';
import AppRouter from './router';
import { preloadData, resetPreloadState } from './utils/dataPreloader';
import { getNumericColumns } from './utils/excelParser';

function App() {
  useEffect(() => {
    // 应用启动时预加载数据
    preloadData();
    
    // 添加全局调试函数
    (window as any).debugDataState = () => {
      const state = store.getState();
      console.log('=== 全局数据状态调试 ===');
      console.log('文件数量:', state.data.files.length);
      
      state.data.files.forEach((file, index) => {
        console.log(`\n文件 ${index + 1}: ${file.name}`);
        console.log('  状态:', file.status);
        console.log('  大小:', file.size);
        console.log('  行数:', file.rowCount);
        console.log('  列数:', file.columnCount);
        console.log('  列名:', file.columns);
        
        if (file.rawData) {
          console.log('  原始数据前2行:', file.rawData.data.slice(0, 2));
          const numericColumns = getNumericColumns(file.rawData);
          console.log('  数值列:', Object.keys(numericColumns));
          Object.keys(numericColumns).forEach(col => {
            console.log(`    - ${col}: ${numericColumns[col].length}个数值, 示例:`, numericColumns[col].slice(0, 3));
          });
        } else {
          console.log('  ❌ 没有rawData');
        }
      });
      console.log('========================');
    };
    
    (window as any).resetDataPreload = () => {
      console.log('重置数据预加载状态...');
      resetPreloadState();
      preloadData();
    };
    
    console.log('💡 调试提示: 在控制台输入 debugDataState() 查看数据状态');
    console.log('💡 调试提示: 在控制台输入 resetDataPreload() 重新加载数据');
  }, []);

  return (
    <Provider store={store}>
      <ConfigProvider locale={zhCN}>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </ConfigProvider>
    </Provider>
  );
}

export default App;
