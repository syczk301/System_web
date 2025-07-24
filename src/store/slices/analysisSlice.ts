import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AnalysisResult {
  id: string;
  type: 'pca' | 'ica' | 'ae' | 'dl' | 'spc';
  name: string;
  dataFileId: string;
  parameters: Record<string, any>;
  results: Record<string, any>;
  charts: {
    type: string;
    data: any;
    options?: any;
  }[];
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface AnalysisConfig {
  pca: {
    nComponents: number;
    removeOutliers: boolean;
    confidenceLevel: number;
  };
  ica: {
    nComponents: number;
    maxIter: number;
    tolerance: number;
  };
  ae: {
    encoderDim: number;
    epochs: number;
    batchSize: number;
    learningRate: number;
  };
  dl: {
    modelType: 'transformer' | 'lstm' | 'cnn';
    hiddenSize: number;
    numLayers: number;
    epochs: number;
  };
  spc: {
    chartType: 'xr' | 'xs' | 'individual';
    controlLimits: number;
    subgroupSize: number;
  };
}

interface AnalysisState {
  results: AnalysisResult[];
  currentResult: AnalysisResult | null;
  config: AnalysisConfig;
  loading: boolean;
}

const initialState: AnalysisState = {
  results: [],
  currentResult: null,
  config: {
    pca: {
      nComponents: 2,
      removeOutliers: true,
      confidenceLevel: 0.95,
    },
    ica: {
      nComponents: 2,
      maxIter: 200,
      tolerance: 1e-4,
    },
    ae: {
      encoderDim: 10,
      epochs: 100,
      batchSize: 32,
      learningRate: 0.001,
    },
    dl: {
      modelType: 'transformer',
      hiddenSize: 128,
      numLayers: 3,
      epochs: 50,
    },
    spc: {
      chartType: 'xr',
      controlLimits: 3,
      subgroupSize: 5,
    },
  },
  loading: false,
};

const analysisSlice = createSlice({
  name: 'analysis',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    addResult: (state, action: PayloadAction<AnalysisResult>) => {
      state.results.push(action.payload);
    },
    updateResult: (state, action: PayloadAction<{ id: string; updates: Partial<AnalysisResult> }>) => {
      const index = state.results.findIndex(result => result.id === action.payload.id);
      if (index !== -1) {
        state.results[index] = { ...state.results[index], ...action.payload.updates };
      }
    },
    removeResult: (state, action: PayloadAction<string>) => {
      state.results = state.results.filter(result => result.id !== action.payload);
      if (state.currentResult?.id === action.payload) {
        state.currentResult = null;
      }
    },
    setCurrentResult: (state, action: PayloadAction<AnalysisResult | null>) => {
      state.currentResult = action.payload;
    },
    updateConfig: (state, action: PayloadAction<{ type: keyof AnalysisConfig; config: any }>) => {
      state.config[action.payload.type] = { ...state.config[action.payload.type], ...action.payload.config };
    },
    clearResults: (state) => {
      state.results = [];
      state.currentResult = null;
    },
  },
});

export const {
  setLoading,
  addResult,
  updateResult,
  removeResult,
  setCurrentResult,
  updateConfig,
  clearResults,
} = analysisSlice.actions;

export default analysisSlice.reducer;