import React from "react";
import ReactDOM from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
} from "react-router-dom";
import GCS from "./pages/gcs";
import WEB from "./pages/web";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <GCS />,
  },
  {
    path: "/web",
    element: <WEB />,
  },
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
