import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ParsedData } from '../../utils/excelParser';

export interface DataFile {
  id: string;
  name: string;
  size: number;
  uploadTime: string;
  status: 'uploading' | 'success' | 'error';
  data?: any[];
  columns?: string[];
  rawData?: ParsedData;
  statistics?: any;
  rowCount?: number;
  columnCount?: number;
  error?: string;
}

export interface DataFilter {
  dateRange?: [string, string];
  workshop?: string;
  equipment?: string;
}

interface DataState {
  files: DataFile[];
  currentFile: DataFile | null;
  filter: DataFilter;
  loading: boolean;
  uploadProgress: number;
}

const initialState: DataState = {
  files: [],
  currentFile: null,
  filter: {},
  loading: false,
  uploadProgress: 0,
};

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setUploadProgress: (state, action: PayloadAction<number>) => {
      state.uploadProgress = action.payload;
    },
    addFile: (state, action: PayloadAction<DataFile>) => {
      console.log('[DataSlice] 添加文件:', action.payload.name, '状态:', action.payload.status);
      state.files.push(action.payload);
      console.log('[DataSlice] 当前文件总数:', state.files.length);
    },
    updateFile: (state, action: PayloadAction<{ id: string; updates: Partial<DataFile> }>) => {
      const { id, updates } = action.payload;
      const fileIndex = state.files.findIndex(file => file.id === id);
      if (fileIndex !== -1) {
        console.log('[DataSlice] 更新文件:', state.files[fileIndex].name, '更新内容:', Object.keys(updates));
        state.files[fileIndex] = { ...state.files[fileIndex], ...updates };
        if (updates.status) {
          console.log('[DataSlice] 文件状态更新为:', updates.status);
        }
      } else {
        console.warn('[DataSlice] 未找到要更新的文件 ID:', id);
      }
    },
    removeFile: (state, action: PayloadAction<string>) => {
      const fileId = action.payload;
      const fileIndex = state.files.findIndex(file => file.id === fileId);
      if (fileIndex !== -1) {
        const fileName = state.files[fileIndex].name;
        state.files.splice(fileIndex, 1);
        console.log('[DataSlice] 移除文件:', fileName, '剩余文件数:', state.files.length);
      }
    },
    setCurrentFile: (state, action: PayloadAction<DataFile | null>) => {
      state.currentFile = action.payload;
    },
    setFilter: (state, action: PayloadAction<DataFilter>) => {
      state.filter = action.payload;
    },
    clearFiles: (state) => {
      console.log('[DataSlice] 清空所有文件，之前有:', state.files.length, '个文件');
      state.files = [];
    },
  },
});

export const {
  setLoading,
  setUploadProgress,
  addFile,
  updateFile,
  removeFile,
  setCurrentFile,
  setFilter,
  clearFiles,
} = dataSlice.actions;

export default dataSlice.reducer;