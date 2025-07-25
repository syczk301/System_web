import { configureStore } from '@reduxjs/toolkit';
import authSlice from './slices/authSlice';
import dataSlice from './slices/dataSlice';
import analysisSlice from './slices/analysisSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    data: dataSlice,
    analysis: analysisSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // 忽略这些action types的序列化检查
        ignoredActions: ['analysis/updateResult', 'analysis/addResult'],
        // 忽略这些路径的序列化检查
        ignoredPaths: ['analysis.results', 'analysis.results.*.results'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;