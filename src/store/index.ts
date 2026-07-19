import { configureStore } from '@reduxjs/toolkit'
import { portfolioApi } from '@/store/portfolioApi'

export const store = configureStore({
  reducer: {
    [portfolioApi.reducerPath]: portfolioApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(portfolioApi.middleware),
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
