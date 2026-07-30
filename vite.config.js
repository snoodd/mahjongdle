import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // relative asset paths — works whether hosted at a domain root or a subpath like /repo-name/
});
