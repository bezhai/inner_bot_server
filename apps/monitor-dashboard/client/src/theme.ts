import { ThemeConfig } from 'antd';

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: '#2563eb', // Modern vivid blue
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    colorInfo: '#3b82f6',
    borderRadius: 8,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 14,
    colorBgLayout: '#f1f5f9', // Slate-100
    colorTextBase: '#1e293b', // Slate-800
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: '#ffffff',
      headerBg: '#ffffff',
      bodyBg: '#f1f5f9',
    },
    Menu: {
      itemSelectedBg: '#eff6ff', // Blue-50
      itemSelectedColor: '#2563eb',
      itemColor: '#64748b', // Slate-500
    },
    Card: {
      boxShadowTertiary: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)', // Tailwind shadow-md like
      paddingLG: 24,
    },
    Typography: {
      titleMarginBottom: 0,
      titleMarginTop: 0,
    }
  }
};
