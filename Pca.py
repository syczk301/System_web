import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from scipy.stats import gaussian_kde, chi2
from matplotlib.patches import Ellipse
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QLabel, QTextEdit, QScrollArea, QFrame, QHBoxLayout, QSizePolicy
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg as FigureCanvas
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QApplication, QStyle

class PCAAnalyzer:
    def __init__(self, main_window):
        self.main_window = main_window
        self.results = None
        
        # # 设置matplotlib中文字体支持
        # plt.rcParams['font.sans-serif'] = ['SimHei']
        # plt.rcParams['axes.unicode_minus'] = False
        
    def run_analysis(self, file_path, remove_outliers=True):
        try:
            # 通知用户分析开始
            self.main_window.pca_widget.update_status("正在进行PCA分析...", '#1890ff')
            
            # 数据预处理
            X_scaled = self._preprocess_data(file_path, remove_outliers)
            self.main_window.pca_widget.update_status("数据预处理完成，正在执行PCA分析...", '#1890ff')
            
            # 应用PCA
            X_pca, pca = self._apply_pca(X_scaled)
            
            # 数据划分
            X_train, X_val = train_test_split(X_pca, test_size=0.2, random_state=42)
            
            # 计算统计量
            self.main_window.pca_widget.update_status("正在计算监控统计量...", '#1890ff')
            T2_train, T2_val, SPE_train, SPE_val = self._calculate_statistics(X_train, X_val, pca, X_scaled)
            
            # 计算控制限
            T2_limit = self._calculate_control_limit(T2_val)
            SPE_limit = self._calculate_control_limit(SPE_val)
            
            # 初始化基本结果
            self.results = {
                'pca': pca,
                'X_pca': X_pca,
                'T2_train': T2_train,
                'T2_val': T2_val,
                'SPE_train': SPE_train,
                'SPE_val': SPE_val,
                'T2_limit': T2_limit,
                'SPE_limit': SPE_limit
            }
            
            # 添加可视化数据（如果存在）
            if hasattr(self, 'pca_vis_data') and self.pca_vis_data:
                self.results.update(self.pca_vis_data)
            
            # 分析完成，更新状态
            self.main_window.pca_widget.update_status("PCA分析完成！选择左侧按钮查看具体图表", '#52c41a')
            
            return True
        except Exception as e:
            print(f"PCA分析失败: {str(e)}")
            # 分析失败，更新状态
            self.main_window.pca_widget.update_status(f"PCA分析失败: {str(e)}", '#f5222d')
            return False

    def _preprocess_data(self, file_path, remove_outliers):
        data = pd.read_excel(file_path)
        if remove_outliers:
            Q1 = data.quantile(0.25)
            Q3 = data.quantile(0.75)
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR
            outlier_mask = (data < lower_bound) | (data > upper_bound)
            data_cleaned = data.copy()
            data_cleaned[outlier_mask] = np.nan
            data_cleaned = data_cleaned.fillna(data.mean())
            data = data_cleaned
        imputer = SimpleImputer(strategy='mean')
        X_imputed = imputer.fit_transform(data)
        scaler = StandardScaler()
        return scaler.fit_transform(X_imputed)

    def _apply_pca(self, X_scaled):
        pca = PCA(n_components=0.95)
        X_pca = pca.fit_transform(X_scaled)
        return X_pca, pca

    def _calculate_statistics(self, X_train, X_val, pca, X_scaled):
        T2_train = np.sum((X_train ** 2) / pca.explained_variance_, axis=1)
        T2_val = np.sum((X_val ** 2) / pca.explained_variance_, axis=1)
        
        X_train_reconstructed = pca.inverse_transform(X_train)
        X_val_reconstructed = pca.inverse_transform(X_val)
        
        train_start, train_end = 0, X_train.shape[0]
        val_start, val_end = train_end, train_end + X_val.shape[0]
        
        SPE_train = np.sum((X_scaled[train_start:train_end] - X_train_reconstructed) ** 2, axis=1)
        SPE_val = np.sum((X_scaled[val_start:val_end] - X_val_reconstructed) ** 2, axis=1)
        
        # 如果有足够的主成分，计算PCA投影相关的统计量
        self.pca_vis_data = {}
        if pca.n_components_ >= 3:
            # 使用PCA转换后的数据计算可视化
            X_pca_all = pca.transform(X_scaled)
            X_pca_vis = X_pca_all[:, :3]  # 仅使用前三个主成分
            
            # 计算T²统计量和控制限
            T2_vis = np.sum((X_pca_vis ** 2) / pca.explained_variance_[:3], axis=1)
            T2_limit_vis = chi2.ppf(0.99, df=3)  # 99% 置信限（卡方分布）
            T2_outliers_vis = np.where(T2_vis > T2_limit_vis)[0]
            
            # 保存在临时属性中
            self.pca_vis_data = {
                'X_pca_vis': X_pca_vis,
                'T2_vis': T2_vis,
                'T2_limit_vis': T2_limit_vis,
                'T2_outliers_vis': T2_outliers_vis
            }
        
        # 计算T²异常点（使用传入的T2_val和稍后会设置的T2_limit）
        return T2_train, T2_val, SPE_train, SPE_val

    def _calculate_control_limit(self, statistic, confidence_level=0.99):
        kde = gaussian_kde(np.ravel(statistic))
        x = np.linspace(min(statistic), max(statistic), 1000)
        cdf = np.cumsum(kde(x)) / np.sum(kde(x))
        return x[np.where(cdf >= confidence_level)[0][0]]

    def get_monitoring_charts(self):
        fig = plt.figure(figsize=(16, 8))  # 增加高度以适应下方文本框
        
        # T² 监控曲线
        plt.subplot(1, 2, 1)
        plt.plot(self.results['T2_train'], label='$T^2$ (训练集)', color='blue', alpha=0.8)
        plt.plot(range(len(self.results['T2_train']),
                    len(self.results['T2_train']) + len(self.results['T2_val'])),
                self.results['T2_val'], label='$T^2$ (测试集)', color='orange', alpha=0.8)
        plt.axhline(self.results['T2_limit'], color='red', linestyle='--', label='控制限')
        plt.xlabel('样本索引')
        plt.ylabel('$T^2$ 统计量值')
        plt.title('$T^2$ 统计量监控图')
        plt.legend()
        plt.grid(True)

        # SPE 监控曲线
        plt.subplot(1, 2, 2)
        plt.plot(self.results['SPE_train'], label='SPE (训练集)', color='blue', alpha=0.8)
        plt.plot(range(len(self.results['SPE_train']),
                    len(self.results['SPE_train']) + len(self.results['SPE_val'])),
                self.results['SPE_val'], label='SPE (测试集)', color='orange', alpha=0.8)
        plt.axhline(self.results['SPE_limit'], color='red', linestyle='--', label='控制限')
        plt.xlabel('样本索引')
        plt.ylabel('SPE 值')
        plt.title('SPE 统计量监控图')
        plt.legend()
        plt.grid(True)

        plt.tight_layout()
        return fig

    def get_cumulative_variance_chart(self):
        fig = plt.figure(figsize=(10, 6))
        cumulative_explained = np.cumsum(self.results['pca'].explained_variance_ratio_) * 100
        plt.bar(range(1, len(self.results['pca'].explained_variance_ratio_) + 1),
               cumulative_explained, color='lightblue', alpha=0.6,
               label='累计解释方差 (%)')

        # 95% 贡献率阈值
        plt.axhline(y=95, color='green', linestyle=':', label='95% 方差阈值')

        # 添加文本标注
        for i in range(0, len(cumulative_explained), 5):  # 每隔5个主成分添加一个标注
            plt.text(i + 1, cumulative_explained[i] + 2,
                    f'{cumulative_explained[i]:.2f}%',
                    ha='center', va='bottom', fontsize=9)

        plt.xlabel('主成分数目')
        plt.ylabel('解释方差 (%)')
        plt.title('主成分分析 - 累积解释方差')
        plt.legend(loc='lower right')
        plt.grid(True)
        plt.tight_layout()
        return fig

    def get_pca_projection(self, pc_x=0, pc_y=1):
        """生成PCA投影图"""
        if not self.results or 'X_pca_vis' not in self.results:
            print("PCA可视化数据不可用")
            return None
            
        try:
            fig, ax = plt.subplots(figsize=(10, 7), dpi=100)  # 增加高度以留出更多空间
            
            # 获取投影数据
            X_pca_vis = self.results['X_pca_vis']
            T2_vis = self.results['T2_vis']
            T2_outliers_vis = self.results['T2_outliers_vis']
            T2_limit_vis = self.results['T2_limit_vis']
            
            if any(x is None for x in [X_pca_vis, T2_vis, T2_outliers_vis, T2_limit_vis]):
                raise ValueError("部分PCA数据缺失")
                
            # 绘制散点图
            scatter = ax.scatter(X_pca_vis[:, pc_x], X_pca_vis[:, pc_y],
                               c=T2_vis, cmap='coolwarm', alpha=0.6, s=40,
                               edgecolors='k')
            
            # 添加颜色条
            cbar = plt.colorbar(scatter, ax=ax)
            cbar.set_label('$T^2$ 统计量', fontsize=12)
            
            # 仅标出高T²异常点（红色）
            ax.scatter(X_pca_vis[T2_outliers_vis, pc_x],
                      X_pca_vis[T2_outliers_vis, pc_y],
                      color='red', s=80, edgecolors='black',
                      label='高 $T^2$ 异常点')
            
            # 绘制置信椭圆
            try:
                cov = np.cov(X_pca_vis[:, [pc_x, pc_y]], rowvar=False)
                eigvals, eigvecs = np.linalg.eigh(cov)
                angle = np.degrees(np.arctan2(eigvecs[1, 0], eigvecs[0, 0]))
                width, height = 2 * np.sqrt(eigvals * T2_limit_vis)
                
                ellipse = Ellipse(np.mean(X_pca_vis[:, [pc_x, pc_y]], axis=0),
                                width, height, angle=angle,
                                edgecolor='black', facecolor='none',
                                linewidth=2, linestyle='--',
                                label='99% 置信椭圆')
                ax.add_patch(ellipse)
            except Exception as e:
                print(f"无法创建置信椭圆 PC{pc_x+1} vs PC{pc_y+1}: {str(e)}")
            
            # 设置轴标签和标题
            ax.set_xlabel(f'主成分 {pc_x+1}', fontsize=14)
            ax.set_ylabel(f'主成分 {pc_y+1}', fontsize=14)
            ax.set_title(f'PCA 投影 - 主成分 {pc_x+1} vs 主成分 {pc_y+1}',
                        fontsize=16, pad=15)
            
            # 调整刻度标签
            ax.tick_params(axis='both', labelsize=12)
            
            # 图例位置和字体大小（右上角，不需要移到图外）
            ax.legend(fontsize=12, loc='upper right')
            
            # 添加网格
            ax.grid(True, linestyle='--', alpha=0.6)
            
            # 调整布局
            plt.tight_layout(rect=[0.02, 0.05, 0.98, 0.95])  # 增加上下边距
            return fig
        except Exception as e:
            print(f"生成PCA投影图时出错: {str(e)}")
            return None

class PCAWidget(QWidget):
    def __init__(self, main_window):
        super().__init__()
        self.main_window = main_window
        self.analyzer = PCAAnalyzer(main_window)
        self.init_ui()
        
    def init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(15, 15, 15, 15)
        
        # 添加状态标签
        self.status_label = QLabel()
        self.status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        # 设置尺寸策略，使标签只占用文本内容所需的宽度
        self.status_label.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.status_label.setVisible(False)  # 初始状态不可见
        
        # 创建水平布局来包含状态标签，居中放置
        status_layout = QHBoxLayout()
        status_layout.setContentsMargins(0, 0, 0, 0)  # 完全移除边距
        status_layout.setSpacing(0)  # 移除间距
        status_layout.addStretch(1)
        status_layout.addWidget(self.status_label)
        status_layout.addStretch(1)
        layout.addLayout(status_layout)
        
        # 创建滚动区域来包含图表容器
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setFrameShape(QFrame.Shape.NoFrame)  # 去除边框
        self.scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)  # 禁用水平滚动条
        
        # 图表容器
        self.chart_container = QWidget()
        chart_layout = QVBoxLayout(self.chart_container)
        chart_layout.setContentsMargins(0, 0, 0, 0)
        
        # 添加欢迎界面
        welcome_widget = QWidget()
        welcome_layout = QVBoxLayout(welcome_widget)
        welcome_layout.setSpacing(20)
        
        # 添加标题
        title_label = QLabel("PCA主成分分析")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            font-size: 24px;
            font-weight: bold;
            color: #1890ff;
            margin-top: 20px;
        """)
        welcome_layout.addWidget(title_label)
        
        # 添加图标
        icon_label = QLabel()
        icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        # 使用内置图标
        icon = QApplication.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon)
        pixmap = icon.pixmap(128, 128)
        icon_label.setPixmap(pixmap)
        welcome_layout.addWidget(icon_label)
        
        # 添加描述
        desc_label = QLabel(
            "PCA（主成分分析）是一种常用的数据降维和特征提取技术，"
            "通过线性变换将原始数据投影到一组正交的主成分上，"
            "以捕获数据中的最大方差。"
        )
        desc_label.setWordWrap(True)
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet("""
            font-size: 14px;
            color: #666;
            margin: 10px 20px;
            line-height: 1.5;
        """)
        welcome_layout.addWidget(desc_label)
        
        # 添加功能说明
        functions_frame = QFrame()
        functions_frame.setStyleSheet("""
            background-color: #f5f5f5;
            border-radius: 8px;
            padding: 10px;
        """)
        functions_layout = QVBoxLayout(functions_frame)
        
        functions_title = QLabel("主要功能：")
        functions_title.setStyleSheet("font-size: 16px; font-weight: bold; color: #333;")
        functions_layout.addWidget(functions_title)
        
        functions = [
            ("执行分析", "对数据进行PCA分析，提取主成分"),
            ("显示监控图", "显示T²和SPE监控图，用于异常检测"),
            ("方差解释图", "显示主成分累计解释方差图"),
            ("投影散点图", "显示数据在主成分空间的投影")
        ]
        
        for title, desc in functions:
            function_label = QLabel(f"• <b>{title}</b>: {desc}")
            function_label.setStyleSheet("""
                font-size: 14px;
                color: #333;
                margin: 5px 0;
            """)
            functions_layout.addWidget(function_label)
        
        welcome_layout.addWidget(functions_frame)
        
        # 添加使用提示
        tip_label = QLabel("请从左侧功能面板选择相应的操作按钮开始使用")
        tip_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        tip_label.setStyleSheet("""
            font-size: 14px;
            color: #1890ff;
            margin-top: 20px;
            font-weight: bold;
        """)
        welcome_layout.addWidget(tip_label)
        
        # 添加伸缩空间
        welcome_layout.addStretch()
        
        # 将欢迎界面添加到图表容器
        chart_layout.addWidget(welcome_widget)
        
        # 完成滚动区域设置
        self.scroll_area.setWidget(self.chart_container)
        layout.addWidget(self.scroll_area)

    def update_status(self, message, color='#333'):
        # 更新状态标签，只设置颜色，不添加其他样式
        self.status_label.setText(message)
        self.status_label.setStyleSheet(f"color: {color}; font-size: 16px;")
        self.status_label.setVisible(True)

    def _clear_chart_container(self, preserve_welcome=False):
        """清除图表容器中的内容
        
        Args:
            preserve_welcome: 是否保留欢迎界面，如果为True且当前显示的是欢迎界面，则不清除
        """
        if self.chart_container.layout():
            # 检查是否需要保留欢迎界面
            if preserve_welcome:
                # 检查第一个子部件是否是欢迎界面
                if self.chart_container.layout().count() == 1:
                    first_item = self.chart_container.layout().itemAt(0)
                    if first_item and first_item.widget():
                        # 如果只有一个子部件，可能是欢迎界面，不清除
                        return self.chart_container.layout()
            
            # 清除所有子部件
            while self.chart_container.layout().count():
                item = self.chart_container.layout().takeAt(0)
                if item.widget():
                    item.widget().deleteLater()
        else:
            # 如果没有布局，创建一个
            layout = QVBoxLayout()
            self.chart_container.setLayout(layout)
        
        return self.chart_container.layout()

    def show_analysis_results(self):
        """PCA分析完成后的默认显示"""
        if not self.analyzer.results:
            self.update_status("请先进行PCA分析", '#faad14')
            return
        # 保留欢迎界面，只更新状态
        self.update_status("分析完成！选择左侧按钮查看具体图表", '#52c41a')

    def show_monitoring_charts(self):
        """显示监控图表"""
        if not self.analyzer.results:
            self.update_status("请先进行PCA分析", '#faad14')
            return

        try:
            layout = self._clear_chart_container(preserve_welcome=False)
            
            # 创建并添加监控图表
            monitoring_fig = self.analyzer.get_monitoring_charts()
            monitoring_canvas = FigureCanvas(monitoring_fig)
            monitoring_canvas.setMinimumHeight(400)  # 减小画布高度
            monitoring_canvas.setMinimumWidth(800)  # 适当减小画布宽度
            layout.addWidget(monitoring_canvas)
            
            # 添加异常检测结果文本框
            results_text = QTextEdit()
            results_text.setReadOnly(True)
            results_text.setMinimumHeight(120)  # 进一步减小最小高度
            results_text.setMaximumHeight(150)  # 进一步减小最大高度
            results_text.setStyleSheet("""
                QTextEdit {
                    font-family: Microsoft YaHei;
                    font-size: 14px;
                    line-height: 2;
                    padding: 15px 20px;
                    margin-top: 15px;
                    background-color: #f8f9fa;
                    border: 1px solid #e9ecef;
                    border-radius: 4px;
                    font-weight: 500;
                }
            """)
            
            # 获取异常点数据
            T2_train = self.analyzer.results['T2_train']
            T2_val = self.analyzer.results['T2_val']
            SPE_train = self.analyzer.results['SPE_train']
            SPE_val = self.analyzer.results['SPE_val']
            T2_limit = self.analyzer.results['T2_limit']
            SPE_limit = self.analyzer.results['SPE_limit']
            
            # 标记异常点
            T2_outliers_train = np.where(T2_train > T2_limit)[0]
            T2_outliers_val = np.where(T2_val > T2_limit)[0]
            SPE_outliers_train = np.where(SPE_train > SPE_limit)[0]
            SPE_outliers_val = np.where(SPE_val > SPE_limit)[0]
            
            # 生成异常检测报告
            report = f"""异常检测结果：
控制限：  T² = {T2_limit:.4f}    |    SPE = {SPE_limit:.4f}
异常样本数： T²： 训练集 {len(T2_outliers_train)} 个  |  测试集 {len(T2_outliers_val)} 个    |    SPE： 训练集 {len(SPE_outliers_train)} 个  |  测试集 {len(SPE_outliers_val)} 个
异常点位索引：
T² 训练集：{T2_outliers_train.tolist()} |    T² 测试集：{[i + len(T2_train) for i in T2_outliers_val]}
SPE 训练集：{SPE_outliers_train.tolist()} |    SPE 测试集：{[i + len(SPE_train) for i in SPE_outliers_val]}
"""
            results_text.setText(report)
            layout.addWidget(results_text)
            
            # 确保滚动到顶部
            self.scroll_area.verticalScrollBar().setValue(0)
            
            self.update_status("监控图表和异常检测结果显示成功", '#52c41a')
        except Exception as e:
            self.update_status(f"显示监控图表失败: {str(e)}", '#f5222d')
    
    def show_variance_chart(self):
        """显示方差解释图"""
        if not self.analyzer.results:
            self.update_status("请先进行PCA分析", '#faad14')
            return

        try:
            layout = self._clear_chart_container(preserve_welcome=False)
            
            # 创建并添加方差解释图
            variance_fig = self.analyzer.get_cumulative_variance_chart()
            variance_canvas = FigureCanvas(variance_fig)
            variance_canvas.setMinimumHeight(500)  # 设置更大的最小高度
            layout.addWidget(variance_canvas)
            
            # 确保滚动到顶部
            self.scroll_area.verticalScrollBar().setValue(0)
            
            self.update_status("累计解释方差图显示成功", '#52c41a')
        except Exception as e:
            self.update_status(f"显示方差解释图失败: {str(e)}", '#f5222d')
            
    def show_projections(self):
        """显示PCA投影图"""
        if not self.analyzer.results:
            self.update_status("请先进行PCA分析", '#faad14')
            return
        
        if 'X_pca_vis' not in self.analyzer.results:
            self.update_status("数据维度不足，无法生成投影图", '#faad14')
            return

        try:
            layout = self._clear_chart_container(preserve_welcome=False)
            
            # 直接创建投影图并添加
            pc12_fig = self.analyzer.get_pca_projection(0, 1)
            if pc12_fig:
                canvas12 = FigureCanvas(pc12_fig)
                canvas12.setMinimumHeight(400)
                canvas12.setMaximumHeight(550)
                layout.addWidget(canvas12)
            
                # 添加分隔线
                separator1 = QFrame()
                separator1.setFrameShape(QFrame.Shape.HLine)
                separator1.setFrameShadow(QFrame.Shadow.Sunken)
                separator1.setLineWidth(1)
                separator1.setStyleSheet("background-color: #ddd; margin: 20px 0;")
                layout.addWidget(separator1)
                
                # PC1 vs PC3
                pc13_fig = self.analyzer.get_pca_projection(0, 2)
                if pc13_fig:
                    canvas13 = FigureCanvas(pc13_fig)
                    canvas13.setMinimumHeight(400)
                    canvas13.setMaximumHeight(550)
                    layout.addWidget(canvas13)
                
                    # 添加分隔线
                    separator2 = QFrame()
                    separator2.setFrameShape(QFrame.Shape.HLine)
                    separator2.setFrameShadow(QFrame.Shadow.Sunken)
                    separator2.setLineWidth(1)
                    separator2.setStyleSheet("background-color: #ddd; margin: 20px 0;")
                    layout.addWidget(separator2)
                
                    # PC2 vs PC3
                    pc23_fig = self.analyzer.get_pca_projection(1, 2)
                    if pc23_fig:
                        canvas23 = FigureCanvas(pc23_fig)
                        canvas23.setMinimumHeight(400)
                        canvas23.setMaximumHeight(550)
                        layout.addWidget(canvas23)
            
            # 添加底部间距
            spacer = QWidget()
            spacer.setMinimumHeight(20)
            layout.addWidget(spacer)
            
            # 确保滚动到顶部
            self.scroll_area.verticalScrollBar().setValue(0)
            
            self.update_status("PCA投影图显示成功", '#52c41a')
        except Exception as e:
            self.update_status(f"显示PCA投影图失败: {str(e)}", '#f5222d')

    def reset_to_welcome(self):
        """重置界面到欢迎页状态"""
        # 清除图表容器中的内容
        self._clear_chart_container(preserve_welcome=False)
        
        # 重新创建欢迎界面
        welcome_widget = QWidget()
        welcome_layout = QVBoxLayout(welcome_widget)
        welcome_layout.setSpacing(20)
        
        # 添加标题
        title_label = QLabel("PCA主成分分析")
        title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        title_label.setStyleSheet("""
            font-size: 24px;
            font-weight: bold;
            color: #1890ff;
            margin-top: 20px;
        """)
        welcome_layout.addWidget(title_label)
        
        # 添加图标
        icon_label = QLabel()
        icon_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        # 使用内置图标
        icon = QApplication.style().standardIcon(QStyle.StandardPixmap.SP_ComputerIcon)
        pixmap = icon.pixmap(128, 128)
        icon_label.setPixmap(pixmap)
        welcome_layout.addWidget(icon_label)
        
        # 添加描述
        desc_label = QLabel(
            "PCA（主成分分析）是一种常用的数据降维和特征提取技术，"
            "通过线性变换将原始数据投影到一组正交的主成分上，"
            "以捕获数据中的最大方差。"
        )
        desc_label.setWordWrap(True)
        desc_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        desc_label.setStyleSheet("""
            font-size: 14px;
            color: #666;
            margin: 10px 20px;
            line-height: 1.5;
        """)
        welcome_layout.addWidget(desc_label)
        
        # 添加功能说明
        functions_frame = QFrame()
        functions_frame.setStyleSheet("""
            background-color: #f5f5f5;
            border-radius: 8px;
            padding: 10px;
        """)
        functions_layout = QVBoxLayout(functions_frame)
        
        functions_title = QLabel("主要功能：")
        functions_title.setStyleSheet("font-size: 16px; font-weight: bold; color: #333;")
        functions_layout.addWidget(functions_title)
        
        functions = [
            ("执行分析", "对数据进行PCA分析，提取主成分"),
            ("显示监控图", "显示T²和SPE监控图，用于异常检测"),
            ("方差解释图", "显示主成分累计解释方差图"),
            ("投影散点图", "显示数据在主成分空间的投影")
        ]
        
        for title, desc in functions:
            function_label = QLabel(f"• <b>{title}</b>: {desc}")
            function_label.setStyleSheet("""
                font-size: 14px;
                color: #333;
                margin: 5px 0;
            """)
            functions_layout.addWidget(function_label)
        
        welcome_layout.addWidget(functions_frame)
        
        # 添加使用提示
        tip_label = QLabel("请从左侧功能面板选择相应的操作按钮开始使用")
        tip_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        tip_label.setStyleSheet("""
            font-size: 14px;
            color: #1890ff;
            margin-top: 20px;
            font-weight: bold;
        """)
        welcome_layout.addWidget(tip_label)
        
        # 添加伸缩空间
        welcome_layout.addStretch()
        
        # 将欢迎界面添加到图表容器
        self.chart_container.layout().addWidget(welcome_widget)
        
        # 确保滚动到顶部
        self.scroll_area.verticalScrollBar().setValue(0)
        
        # 初始状态显示
        self.update_status("PCA分析就绪，请选择左侧功能按钮进行操作", '#1890ff')  