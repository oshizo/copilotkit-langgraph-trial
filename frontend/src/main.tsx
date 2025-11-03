import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { AguiProvider } from "./providers/AguiProvider";

const DEFAULT_API_URL = "http://localhost:8000/api/analyze";
const apiUrl = (import.meta.env.VITE_BACKEND_URL as string) ?? DEFAULT_API_URL;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AguiProvider apiUrl={apiUrl}>
      <App />
    </AguiProvider>
  </React.StrictMode>
);
