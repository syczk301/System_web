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
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;