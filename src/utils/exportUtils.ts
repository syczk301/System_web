import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { AEAnalysisResults } from './aeApi';
import type { AnalysisResult } from '../store/slices/analysisSlice';

// 导出AE分析结果为Excel
export const exportAEResultsToExcel = (
  results: AEAnalysisResults,
  analysisInfo: AnalysisResult
) => {
  try {
    // 创建工作簿
    const workbook = XLSX.utils.book_new();

    // 1. 概览信息工作表
    const overviewData = [
      ['分析类型', '自动编码器异常检测'],
      ['分析名称', analysisInfo.name],
      ['创建时间', new Date(analysisInfo.createdAt).toLocaleString()],
      ['完成时间', analysisInfo.completedAt ? new Date(analysisInfo.completedAt).toLocaleString() : ''],
      ['', ''],
      ['数据信息', ''],
      ['训练样本数', results.data_info.samples_train],
      ['测试样本数', results.data_info.samples_test],
      ['特征维度', results.data_info.features],
      ['文件名', results.data_info.file_name],
      ['', ''],
      ['训练参数', ''],
      ['编码器维度', analysisInfo.parameters.encoderDim],
      ['训练轮数', analysisInfo.parameters.epochs],
      ['批次大小', analysisInfo.parameters.batchSize],
      ['学习率', analysisInfo.parameters.learningRate],
      ['置信度', analysisInfo.parameters.confidenceLevel],
      ['', ''],
      ['最终结果', ''],
      ['最终训练损失', results.train_losses[results.train_losses.length - 1]],
      ['RE²控制限', results.re2_control_limit],
      ['SPE控制限', results.spe_control_limit],
      ['RE²异常数量', results.re2_anomalies.count],
      ['RE²异常比例(%)', results.re2_anomalies.percentage],
      ['SPE异常数量', results.spe_anomalies.count],
      ['SPE异常比例(%)', results.spe_anomalies.percentage],
    ];

    const overviewSheet = XLSX.utils.aoa_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(workbook, overviewSheet, '分析概览');

    // 2. 训练损失数据
    const lossData = [
      ['Epoch', '训练损失'],
      ...results.train_losses.map((loss, index) => [index + 1, loss])
    ];
    const lossSheet = XLSX.utils.aoa_to_sheet(lossData);
    XLSX.utils.book_append_sheet(workbook, lossSheet, '训练损失');

    // 3. RE²检测结果
    const re2Data = [
      ['样本序号', 'RE²值', '是否异常', '控制限'],
      ...results.re2_test.map((value, index) => [
        index + 1,
        value,
        results.re2_anomalies.indices.includes(index) ? '是' : '否',
        results.re2_control_limit
      ])
    ];
    const re2Sheet = XLSX.utils.aoa_to_sheet(re2Data);
    XLSX.utils.book_append_sheet(workbook, re2Sheet, 'RE²检测结果');

    // 4. SPE检测结果
    const speData = [
      ['样本序号', 'SPE值', '是否异常', '控制限'],
      ...results.spe_test.map((value, index) => [
        index + 1,
        value,
        results.spe_anomalies.indices.includes(index) ? '是' : '否',
        results.spe_control_limit
      ])
    ];
    const speSheet = XLSX.utils.aoa_to_sheet(speData);
    XLSX.utils.book_append_sheet(workbook, speSheet, 'SPE检测结果');

    // 5. 异常样本汇总
    const allAnomalyIndices = new Set([
      ...results.re2_anomalies.indices,
      ...results.spe_anomalies.indices
    ]);
    
    const anomalyData = [
      ['样本序号', 'RE²值', 'SPE值', '异常类型'],
      ...Array.from(allAnomalyIndices).sort((a, b) => a - b).map(index => {
        const anomalyTypes = [];
        if (results.re2_anomalies.indices.includes(index)) anomalyTypes.push('RE²异常');
        if (results.spe_anomalies.indices.includes(index)) anomalyTypes.push('SPE异常');
        
        return [
          index + 1,
          results.re2_test[index],
          results.spe_test[index],
          anomalyTypes.join(', ')
        ];
      })
    ];
    const anomalySheet = XLSX.utils.aoa_to_sheet(anomalyData);
    XLSX.utils.book_append_sheet(workbook, anomalySheet, '异常样本');

    // 导出文件
    const fileName = `AE分析结果_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    
    return true;
  } catch (error) {
    console.error('导出Excel失败:', error);
    throw new Error('导出Excel文件失败');
  }
};

// 导出图表数据为CSV
export const exportChartDataToCSV = (
  chartData: any,
  chartTitle: string
) => {
  try {
    let csvContent = '';
    
    if (chartData.trainData) {
      // 训练损失曲线数据
      csvContent = 'Epoch,训练损失\n';
      chartData.trainData.forEach((loss: number, index: number) => {
        csvContent += `${index + 1},${loss}\n`;
      });
    } else if (chartData.yData) {
      // 监控图数据
      csvContent = '样本序号,统计量值,控制限,是否异常\n';
      chartData.yData.forEach((value: number, index: number) => {
        const isAnomaly = chartData.anomalyIndices?.includes(index) ? '是' : '否';
        csvContent += `${index + 1},${value},${chartData.controlLimit},${isAnomaly}\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const fileName = `${chartTitle}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    saveAs(blob, fileName);
    
    return true;
  } catch (error) {
    console.error('导出CSV失败:', error);
    throw new Error('导出CSV文件失败');
  }
};

// 生成分析报告的HTML内容
export const generateAnalysisReportHTML = (
  results: AEAnalysisResults,
  analysisInfo: AnalysisResult
) => {
  const createTime = new Date(analysisInfo.createdAt).toLocaleString();
  const completeTime = analysisInfo.completedAt ? new Date(analysisInfo.completedAt).toLocaleString() : '';
  
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>自动编码器分析报告</title>
    <style>
        body {
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1890ff;
            text-align: center;
            border-bottom: 2px solid #1890ff;
            padding-bottom: 10px;
        }
        h2 {
            color: #722ed1;
            border-left: 4px solid #722ed1;
            padding-left: 10px;
            margin-top: 30px;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .info-card {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #52c41a;
        }
        .info-card h3 {
            margin: 0 0 10px 0;
            color: #52c41a;
        }
        .anomaly-card {
            border-left-color: #ff4d4f;
        }
        .anomaly-card h3 {
            color: #ff4d4f;
        }
        .stats-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        .stats-table th,
        .stats-table td {
            border: 1px solid #d9d9d9;
            padding: 12px;
            text-align: left;
        }
        .stats-table th {
            background-color: #fafafa;
            font-weight: bold;
        }
        .highlight {
            background-color: #fff2e8;
            font-weight: bold;
        }
        .anomaly-highlight {
            background-color: #fff2f0;
            color: #ff4d4f;
            font-weight: bold;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #d9d9d9;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>自动编码器异常检测分析报告</h1>
        
        <h2>📋 基本信息</h2>
        <div class="info-grid">
            <div class="info-card">
                <h3>分析信息</h3>
                <p><strong>分析名称:</strong> ${analysisInfo.name}</p>
                <p><strong>创建时间:</strong> ${createTime}</p>
                <p><strong>完成时间:</strong> ${completeTime}</p>
            </div>
            <div class="info-card">
                <h3>数据信息</h3>
                <p><strong>训练样本:</strong> ${results.data_info.samples_train} 个</p>
                <p><strong>测试样本:</strong> ${results.data_info.samples_test} 个</p>
                <p><strong>特征维度:</strong> ${results.data_info.features} 维</p>
            </div>
            <div class="info-card">
                <h3>训练参数</h3>
                <p><strong>编码器维度:</strong> ${analysisInfo.parameters.encoderDim}</p>
                <p><strong>训练轮数:</strong> ${analysisInfo.parameters.epochs}</p>
                <p><strong>最终损失:</strong> ${results.train_losses[results.train_losses.length - 1].toFixed(6)}</p>
            </div>
        </div>

        <h2>🔍 异常检测结果</h2>
        <div class="info-grid">
            <div class="info-card ${results.re2_anomalies.count > 0 ? 'anomaly-card' : ''}">
                <h3>RE²异常检测</h3>
                <p><strong>异常样本数:</strong> ${results.re2_anomalies.count} / ${results.data_info.samples_test}</p>
                <p><strong>异常比例:</strong> ${results.re2_anomalies.percentage.toFixed(2)}%</p>
                <p><strong>控制限:</strong> ${results.re2_control_limit.toFixed(4)}</p>
            </div>
            <div class="info-card ${results.spe_anomalies.count > 0 ? 'anomaly-card' : ''}">
                <h3>SPE异常检测</h3>
                <p><strong>异常样本数:</strong> ${results.spe_anomalies.count} / ${results.data_info.samples_test}</p>
                <p><strong>异常比例:</strong> ${results.spe_anomalies.percentage.toFixed(2)}%</p>
                <p><strong>控制限:</strong> ${results.spe_control_limit.toFixed(4)}</p>
            </div>
        </div>

        <h2>📊 详细统计</h2>
        <table class="stats-table">
            <thead>
                <tr>
                    <th>检测方法</th>
                    <th>总样本数</th>
                    <th>异常样本数</th>
                    <th>异常比例</th>
                    <th>控制限</th>
                    <th>评估</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>RE²异常检测</td>
                    <td>${results.data_info.samples_test}</td>
                    <td class="${results.re2_anomalies.count > 0 ? 'anomaly-highlight' : ''}">${results.re2_anomalies.count}</td>
                    <td class="${results.re2_anomalies.percentage > 5 ? 'anomaly-highlight' : ''}">${results.re2_anomalies.percentage.toFixed(2)}%</td>
                    <td>${results.re2_control_limit.toFixed(4)}</td>
                    <td>${results.re2_anomalies.percentage > 5 ? '⚠️ 异常率较高' : '✅ 正常'}</td>
                </tr>
                <tr>
                    <td>SPE异常检测</td>
                    <td>${results.data_info.samples_test}</td>
                    <td class="${results.spe_anomalies.count > 0 ? 'anomaly-highlight' : ''}">${results.spe_anomalies.count}</td>
                    <td class="${results.spe_anomalies.percentage > 5 ? 'anomaly-highlight' : ''}">${results.spe_anomalies.percentage.toFixed(2)}%</td>
                    <td>${results.spe_control_limit.toFixed(4)}</td>
                    <td>${results.spe_anomalies.percentage > 5 ? '⚠️ 异常率较高' : '✅ 正常'}</td>
                </tr>
            </tbody>
        </table>

        <h2>📈 结论与建议</h2>
        <div class="info-card">
            <h3>分析结论</h3>
            ${generateConclusion(results)}
        </div>

        <div class="footer">
            <p>本报告由智能诊断系统自动生成 | 生成时间: ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>`;
};

// 生成分析结论
const generateConclusion = (results: AEAnalysisResults) => {
  const totalAnomalies = results.re2_anomalies.count + results.spe_anomalies.count;
  const avgAnomalyRate = (results.re2_anomalies.percentage + results.spe_anomalies.percentage) / 2;
  
  let conclusion = '';
  
  if (avgAnomalyRate < 1) {
    conclusion = `
      <p><strong>✅ 系统状态良好</strong></p>
      <p>检测到的异常样本非常少（平均异常率 ${avgAnomalyRate.toFixed(2)}%），系统运行状态正常。</p>
      <p><strong>建议:</strong> 继续保持当前的运行状态，定期进行监控。</p>
    `;
  } else if (avgAnomalyRate < 5) {
    conclusion = `
      <p><strong>⚠️ 轻微异常</strong></p>
      <p>检测到少量异常样本（平均异常率 ${avgAnomalyRate.toFixed(2)}%），可能存在轻微的工艺波动。</p>
      <p><strong>建议:</strong> 关注异常样本的时间分布，检查是否有规律性的工艺变化。</p>
    `;
  } else {
    conclusion = `
      <p><strong>🚨 需要关注</strong></p>
      <p>检测到较多异常样本（平均异常率 ${avgAnomalyRate.toFixed(2)}%），系统可能存在显著异常。</p>
      <p><strong>建议:</strong> 立即检查设备运行状态，分析异常样本的特征，必要时进行设备维护。</p>
    `;
  }
  
  // 添加RE²和SPE的差异分析
  const re2Rate = results.re2_anomalies.percentage;
  const speRate = results.spe_anomalies.percentage;
  const rateDiff = Math.abs(re2Rate - speRate);
  
  if (rateDiff > 2) {
    conclusion += `
      <p><strong>📊 检测方法差异分析:</strong></p>
      <p>RE²和SPE检测结果存在较大差异（${rateDiff.toFixed(2)}%），建议进一步分析：</p>
      <ul>
        <li>RE²主要检测数据重构误差的最大值</li>
        <li>SPE主要检测数据重构误差的总体程度</li>
        <li>差异较大可能表明异常类型的多样性</li>
      </ul>
    `;
  }
  
  return conclusion;
};

// 导出分析报告为PDF（使用浏览器打印功能）
export const exportAnalysisReportToPDF = (
  results: AEAnalysisResults,
  analysisInfo: AnalysisResult
) => {
  try {
    const htmlContent = generateAnalysisReportHTML(results, analysisInfo);
    
    // 创建新窗口并打印
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // 等待内容加载完成后打印
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
    }
    
    return true;
  } catch (error) {
    console.error('导出PDF失败:', error);
    throw new Error('导出PDF文件失败');
  }
}; 