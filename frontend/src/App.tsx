import { ConfigProvider, theme } from "antd";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedLayout } from "./routes/ProtectedLayout";
import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProductsPage } from "./pages/ProductsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { PurchaseOrdersPage } from "./pages/PurchaseOrdersPage";
import { SalesOrdersPage } from "./pages/SalesOrdersPage";
import { AttributesPage } from "./pages/AttributesPage";

export default function App() {
  return (
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedLayout />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="attributes" element={<AttributesPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="suppliers" element={<SuppliersPage />} />
                <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
                <Route path="sales-orders" element={<SalesOrdersPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ConfigProvider>
  );
}
