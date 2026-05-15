import { Spin } from "antd";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return <Spin style={{ margin: "40vh auto", display: "block" }} />;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
