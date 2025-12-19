import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Perfect as-is - don't change!
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "antd-core": ["antd"],
          "antd-icons": ["@ant-design/icons"],
          supabase: ["@supabase/supabase-js"],
          "pdf-libs": ["jspdf", "jspdf-autotable", "html2canvas"],
          utils: ["lodash", "date-fns", "dayjs"],
        },
      },
    },
    chunkSizeWarningLimit: 1500, // Increase to hide warnings
  },
});
