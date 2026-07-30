import "./storagePolyfill.js";
import React from "react";
import ReactDOM from "react-dom/client";
import MahjongSolitaire from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MahjongSolitaire />
  </React.StrictMode>
);
