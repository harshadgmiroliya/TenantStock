import { Layout, Menu, Typography, Button, Space } from "antd";
import {
  DashboardOutlined,
  AppstoreOutlined,
  TagsOutlined,
  InboxOutlined,
  TeamOutlined,
  ShoppingCartOutlined,
  OrderedListOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { SocketProvider } from "../context/SocketContext";

const { Header, Sider, Content } = Layout;

const items = [
  { key: "/", icon: <DashboardOutlined />, label: <Link to="/">Dashboard</Link> },
  { key: "/products", icon: <AppstoreOutlined />, label: <Link to="/products">Products</Link> },
  { key: "/attributes", icon: <TagsOutlined />, label: <Link to="/attributes">Attributes</Link> },
  { key: "/inventory", icon: <InboxOutlined />, label: <Link to="/inventory">Inventory (SKUs)</Link> },
  { key: "/suppliers", icon: <TeamOutlined />, label: <Link to="/suppliers">Suppliers</Link> },
  { key: "/purchase-orders", icon: <ShoppingCartOutlined />, label: <Link to="/purchase-orders">Purchase orders</Link> },
  { key: "/sales-orders", icon: <OrderedListOutlined />, label: <Link to="/sales-orders">Sales orders</Link> },
];

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <SocketProvider>
      <Layout style={{ minHeight: "100vh" }}>
        <Sider breakpoint="lg" collapsedWidth={0}>
          <div style={{ padding: 16 }}>
            <Typography.Title level={4} style={{ color: "#fff", margin: 0 }}>
              TenantStock
            </Typography.Title>
          </div>
          <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={items} />
        </Sider>
        <Layout>
          <Header style={{ background: "#fff", display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
            <Space>
              <Typography.Text>
                {user?.name} · {user?.role}
              </Typography.Text>
              <Button
                icon={<LogoutOutlined />}
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                Log out
              </Button>
            </Space>
          </Header>
          <Content style={{ margin: 24 }}>
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </SocketProvider>
  );
}
