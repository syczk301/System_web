import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from scipy.stats import chi2
import os
import warnings
warnings.filterwarnings('ignore')

# 设置随机种子以确保结果可重现
torch.manual_seed(42)
np.random.seed(42)

class AutoEncoder(nn.Module):
    """基于PyTorch的自动编码器模型"""
    
    def __init__(self, input_dim, encoding_dim=10):
        super(AutoEncoder, self).__init__()
        
        # 编码器
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, encoding_dim),
            nn.ReLU()
        )
        
        # 解码器
        self.decoder = nn.Sequential(
            nn.Linear(encoding_dim, 32),
            nn.ReLU(),
            nn.Linear(32, 64),
            nn.ReLU(),
            nn.Linear(64, input_dim),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        encoded = self.encoder(x)
        decoded = self.decoder(encoded)
        return decoded
    
    def encode(self, x):
        return self.encoder(x)

class AEAnalyzer:
    """自动编码器分析器"""
    
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        self.is_trained = False
        self.train_losses = []
        
    def load_data(self, file_path):
        """加载数据"""
        try:
            if file_path.endswith('.xlsx'):
                data = pd.read_excel(file_path, decimal=',')
            else:
                data = pd.read_csv(file_path)
            
            # 只保留数值列
            numeric_columns = data.select_dtypes(include=[np.number]).columns
            data = data[numeric_columns]
            
            # 去除缺失值
            data = data.dropna()
            
            if data.empty:
                raise ValueError("数据为空或没有数值列")
            
            print(f"数据加载成功: {data.shape[0]} 行, {data.shape[1]} 列")
            return data
            
        except Exception as e:
            print(f"数据加载失败: {str(e)}")
            return None
    
    def preprocess_data(self, data, test_size=0.2):
        """数据预处理"""
        try:
            # 标准化
            X_scaled = self.scaler.fit_transform(data)
            
            # 划分训练集和测试集
            X_train, X_test = train_test_split(X_scaled, test_size=test_size, random_state=42)
            
            # 转换为PyTorch张量
            X_train_tensor = torch.FloatTensor(X_train).to(self.device)
            X_test_tensor = torch.FloatTensor(X_test).to(self.device)
            
            print(f"数据预处理完成 - 训练集: {X_train.shape}, 测试集: {X_test.shape}")
            return X_train_tensor, X_test_tensor
            
        except Exception as e:
            print(f"数据预处理失败: {str(e)}")
            return None, None
    
    def train_model(self, X_train, X_test, epochs=150, batch_size=32, learning_rate=0.001, progress_callback=None):
        """训练自动编码器模型"""
        try:
            input_dim = X_train.shape[1]
            encoding_dim = max(2, input_dim // 4)  # 编码维度为输入维度的1/4
            
            # 创建模型
            self.model = AutoEncoder(input_dim, encoding_dim).to(self.device)
            
            # 定义损失函数和优化器
            criterion = nn.MSELoss()
            optimizer = optim.Adam(self.model.parameters(), lr=learning_rate)
            
            # 创建数据加载器
            train_dataset = TensorDataset(X_train, X_train)
            train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
            
            self.train_losses = []
            
            if progress_callback:
                progress_callback("🚀 开始训练自动编码器模型...")
                progress_callback(f"📊 模型结构: {input_dim} -> {encoding_dim} -> {input_dim}")
                progress_callback(f"⚙️ 训练参数: epochs={epochs}, batch_size={batch_size}, lr={learning_rate}")
                progress_callback("-" * 50)
            
            # 训练循环
            self.model.train()
            for epoch in range(epochs):
                epoch_loss = 0.0
                for batch_idx, (data, target) in enumerate(train_loader):
                    optimizer.zero_grad()
                    # 前向传播
                    output = self.model(data)
                    loss = criterion(output, target)
                    # 反向传播
                    loss.backward()
                    optimizer.step()
                    epoch_loss += loss.item()
                # 计算平均损失
                avg_loss = epoch_loss / len(train_loader)
                self.train_losses.append(avg_loss)
                # 更新进度（每一轮都记录）
                if progress_callback:
                    progress_callback(f"训练轮次 {epoch + 1}/{epochs}, 损失: {avg_loss:.6f}")
            
            self.is_trained = True
            
            if progress_callback:
                progress_callback("-" * 50)
                progress_callback("✅ 模型训练完成!")
                progress_callback(f"📈 最终损失: {self.train_losses[-1]:.6f}")
            
            return True
            
        except Exception as e:
            if progress_callback:
                progress_callback(f"❌ 训练失败: {str(e)}")
            print(f"训练失败: {str(e)}")
            return False
    
    def calculate_statistics(self, X_data):
        """计算RE²和SPE统计量"""
        if not self.is_trained:
            raise ValueError("模型尚未训练")
        
        self.model.eval()
        with torch.no_grad():
            # 获取重构数据
            X_reconstructed = self.model(X_data)
            
            # 计算重构误差
            reconstruction_error = X_data - X_reconstructed
            
            # 计算SPE (平方预测误差)
            spe = torch.sum(reconstruction_error ** 2, dim=1).cpu().numpy()
            
            # 计算RE² (最大重构误差的平方)
            re2 = torch.max(reconstruction_error ** 2, dim=1)[0].cpu().numpy()
            
        return re2, spe
    
    def calculate_control_limits(self, statistics, confidence_level=0.99):
        """计算控制限"""
        # 使用经验分位数方法
        control_limit = np.percentile(statistics, confidence_level * 100)
        return control_limit
    
    def detect_anomalies(self, statistics, control_limit):
        """检测异常"""
        anomaly_mask = statistics > control_limit
        anomaly_indices = np.where(anomaly_mask)[0]
        anomaly_count = len(anomaly_indices)
        anomaly_percentage = (anomaly_count / len(statistics)) * 100
        
        return {
            'mask': anomaly_mask,
            'indices': anomaly_indices,
            'count': anomaly_count,
            'percentage': anomaly_percentage
        }

def run_fault_detection(file_path, progress_callback=None, epochs=150):
    """运行故障检测分析"""
    try:
        # 初始化分析器
        analyzer = AEAnalyzer()
        
        if progress_callback:
            progress_callback("📁 正在加载数据...")
        
        # 加载数据
        data = analyzer.load_data(file_path)
        if data is None:
            return None
        
        if progress_callback:
            progress_callback(f"✅ 数据加载成功: {data.shape[0]} 行, {data.shape[1]} 列")
            progress_callback("🔄 正在进行数据预处理...")
        
        # 预处理数据
        X_train, X_test = analyzer.preprocess_data(data)
        if X_train is None:
            return None
        
        if progress_callback:
            progress_callback("✅ 数据预处理完成")
        
        # 训练模型
        success = analyzer.train_model(X_train, X_test, epochs=epochs, progress_callback=progress_callback)
        if not success:
            return None
        
        if progress_callback:
            progress_callback("📊 正在计算统计量和控制限...")
        
        # 计算测试集统计量
        re2_test, spe_test = analyzer.calculate_statistics(X_test)
        
        # 计算控制限
        re2_control_limit = analyzer.calculate_control_limits(re2_test)
        spe_control_limit = analyzer.calculate_control_limits(spe_test)
        
        # 检测异常
        re2_anomalies = analyzer.detect_anomalies(re2_test, re2_control_limit)
        spe_anomalies = analyzer.detect_anomalies(spe_test, spe_control_limit)
        
        if progress_callback:
            progress_callback("✅ 统计量计算完成")
            progress_callback(f"🔍 RE² 异常检测: {re2_anomalies['count']} 个异常样本 ({re2_anomalies['percentage']:.2f}%)")
            progress_callback(f"🔍 SPE 异常检测: {spe_anomalies['count']} 个异常样本 ({spe_anomalies['percentage']:.2f}%)")
            progress_callback("🎉 分析完成!")
        
        # 返回结果
        results = {
            'analyzer': analyzer,
            'data': data,
            'X_train': X_train.cpu().numpy(),
            'X_test': X_test.cpu().numpy(),
            're2_test': re2_test,
            'spe_test': spe_test,
            're2_control_limit': re2_control_limit,
            'spe_control_limit': spe_control_limit,
            're2_anomalies': re2_anomalies,
            'spe_anomalies': spe_anomalies,
            'train_losses': analyzer.train_losses
        }
        
        return results
        
    except Exception as e:
        if progress_callback:
            progress_callback(f"❌ 分析过程出错: {str(e)}")
        print(f"故障检测分析失败: {str(e)}")
        return None

def run_ae_re2_analysis(file_path, progress_callback=None, epochs=150):
    """运行RE²分析"""
    return run_fault_detection(file_path, progress_callback, epochs)

def run_ae_spe_analysis(file_path, progress_callback=None, epochs=150):
    """运行SPE分析"""
    return run_fault_detection(file_path, progress_callback, epochs)

# 测试函数
if __name__ == "__main__":
    def test_callback(message):
        print(message)
    
    # 测试分析
    file_path = "../data/正常数据.xlsx"  # 根据实际路径调整
    if os.path.exists(file_path):
        results = run_fault_detection(file_path, test_callback, epochs=50)
        if results:
            print("测试成功!")
            print(f"RE² 控制限: {results['re2_control_limit']:.4f}")
            print(f"SPE 控制限: {results['spe_control_limit']:.4f}")
            print(f"RE² 异常数量: {results['re2_anomalies']['count']}")
            print(f"SPE 异常数量: {results['spe_anomalies']['count']}")
        else:
            print("测试失败!")
    else:
        print(f"测试文件不存在: {file_path}") 