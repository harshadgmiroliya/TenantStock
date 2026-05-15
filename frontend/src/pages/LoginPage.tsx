import { Card, Form, Input, Button, Typography, message, Spin } from "antd";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <Spin style={{ margin: "40vh auto", display: "block" }} />;
  }
  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ maxWidth: 400, margin: "80px auto" }}>
      <Card title="Sign in">
        <Typography.Paragraph type="secondary">
          Seed users: <code>owner@acme.test</code> / <code>password123</code>
        </Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={async (v) => {
            try {
              await login(v.email, v.password);
              message.success("Welcome");
              navigate("/", { replace: true });
            } catch {
              message.error("Invalid credentials");
            }
          }}
        >
          <Form.Item name="email" label="Email" rules={[{ required: true }]}>
            <Input type="email" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Sign in
          </Button>
        </Form>
      </Card>
    </div>
  );
}
