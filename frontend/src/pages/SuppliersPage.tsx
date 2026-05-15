import { useEffect, useState } from "react";
import { Button, Card, Form, Input, Modal, Table, message } from "antd";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

type Supplier = { _id: string; name: string; email?: string };

export function SuppliersPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "Owner" || user?.role === "Manager";
  const [rows, setRows] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = () => api.get<Supplier[]>("/suppliers").then((r) => setRows(r.data));

  useEffect(() => {
    load().catch(() => message.error("Failed to load suppliers"));
  }, []);

  return (
    <Card
      title="Suppliers"
      extra={
        canEdit ? (
          <Button type="primary" onClick={() => setOpen(true)}>
            New supplier
          </Button>
        ) : null
      }
    >
      <Table
        rowKey="_id"
        dataSource={rows}
        columns={[
          { title: "Name", dataIndex: "name" },
          { title: "Email", dataIndex: "email" },
        ]}
      />
      <Modal
        title="New supplier"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={async () => {
          const v = await form.validateFields();
          await api.post("/suppliers", v);
          message.success("Created");
          setOpen(false);
          form.resetFields();
          await load();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
