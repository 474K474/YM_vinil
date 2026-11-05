import React from "react";
import ReactDOM from "react-dom/client";
import { MiniPlayer } from "./MiniPlayer";
import "./mini.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MiniPlayer />
  </React.StrictMode>,
);
