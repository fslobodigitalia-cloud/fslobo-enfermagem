import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Prioriza .tsx/.ts sobre .js para imports sem extensão. Por padrão o
    // Vite resolve na ordem [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx",
    // ".json"] — ou seja, ".js" vence ".tsx" quando os dois arquivos
    // existem lado a lado com o mesmo nome. O projeto tem diversos
    // arquivos ".js" avulsos (não gerados por este build, não
    // referenciados por index.html) que ficaram ao lado de seus
    // equivalentes ".tsx"/".ts" reais — sem esta ordem explícita, o
    // resolvedor pega silenciosamente a versão ".js" desatualizada em vez
    // do código-fonte atual (foi exatamente isso que fez a rota
    // /medicamentos-na-pratica cair em NotFound: "./App" resolvia para o
    // "src/App.js" antigo, sem a rota nova). Os arquivos ".js" continuam
    // no disco (preservados) — só deixam de ser escolhidos na resolução.
    extensions: [".mjs", ".mts", ".ts", ".tsx", ".jsx", ".js", ".json"],
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@supabase") || id.includes("iceberg-js")) return "supabase";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("react-router")) return "router";
            return "vendor";
          }
        },
      },
    },
  },
});
