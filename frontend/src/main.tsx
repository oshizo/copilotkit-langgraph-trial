import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { CopilotKit } from "@copilotkit/react-core";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* Copilot Cloud は使わないので publicApiKey/publicLicenseKey は不要。
       ランタイムURLだけ指定すれば初期化要件を満たせます。 */}
    <CopilotKit runtimeUrl="/api/copilotkit">
      <App />
    </CopilotKit>
  </React.StrictMode>
);
