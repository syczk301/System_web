import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { ParsedData } from '../utils/excelParser';

export interface DataFile {
  id: string;
  name: string;
  size: number;
  uploadTime: string;
  status: 'uploading' | 'success' | 'error';
  data?: any[];
  columns?: string[];
  rawData?: ParsedData;
  statistics?: { [key: string]: any };
  rowCount?: number;
  columnCount?: number;
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
      state.files.push(action.payload);
    },
    updateFile: (state, action: PayloadAction<{ id: string; updates: Partial<DataFile> }>) => {
      const index = state.files.findIndex(file => file.id === action.payload.id);
      if (index !== -1) {
        state.files[index] = { ...state.files[index], ...action.payload.updates };
      }
    },
    removeFile: (state, action: PayloadAction<string>) => {
      state.files = state.files.filter(file => file.id !== action.payload);
      if (state.currentFile?.id === action.payload) {
        state.currentFile = null;
      }
    },
    setCurrentFile: (state, action: PayloadAction<DataFile | null>) => {
      state.currentFile = action.payload;
    },
    setFilter: (state, action: PayloadAction<DataFilter>) => {
      state.filter = action.payload;
    },
    clearFiles: (state) => {
      state.files = [];
      state.currentFile = null;
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