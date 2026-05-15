import { useEffect, useState } from "react";
import { Button, Card, Form, InputNumber, Modal, Select, Space, Table, Tag, message } from "antd";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

type Order = {
  _id: string;
  status: string;
  items: { skuId: string; qtyOrdered: number; qtyFulfilled: number }[];
};

type Sku = { _id: string; skuCode: string };

export function SalesOrdersPage() {
  const { user } = useAuth();
  const { lastInventoryEvent } = useSocket();
  const canFulfill = user?.role === "Owner" || user?.role === "Manager";
  const [rows, setRows] = useState<Order[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    const [o, s] = await Promise.all([api.get<Order[]>("/sales-orders"), api.get<Sku[]>("/skus")]);
    setRows(o.data);
    setSkus(s.data);
  };

  useEffect(() => {
    load().catch(() => message.error("Failed to load sales orders"));
  }, [lastInventoryEvent]);

  return (
    <Card
      title="Sales orders"
      extra={
        <Button type="primary" onClick={() => setOpen(true)}>
          New order
        </Button>
      }
    >
      <Table
        rowKey="_id"
        dataSource={rows}
        columns={[
          {
            title: "Status",
            dataIndex: "status",
            render: (s: string) => <Tag>{s}</Tag>,
          },
          {
            title: "Lines",
            render: (_, r) =>
              r.items.map((i) => {
                const code = skus.find((x) => x._id === String(i.skuId))?.skuCode ?? String(i.skuId);
                return `${code}: ${i.qtyFulfilled}/${i.qtyOrdered}`;
              }).join(" · "),
          },
          {
            title: "Actions",
            render: (_, r) =>
              canFulfill ? (
                <Space>
                  <Button
                    size="small"
                    disabled={r.status === "fulfilled" || r.status === "cancelled"}
                    onClick={async () => {
                      await api.post(`/sales-orders/${r._id}/fulfill`);
                      message.success("Fulfillment attempted");
                      await load();
                    }}
                  >
                    Fulfill
                  </Button>
                  <Button
                    size="small"
                    danger
                    disabled={r.status === "cancelled"}
                    onClick={async () => {
                      await api.post(`/sales-orders/${r._id}/cancel`);
                      message.success("Cancelled");
                      await load();
                    }}
                  >
                    Cancel
                  </Button>
                </Space>
              ) : null,
          },
        ]}
      />

      <Modal
        title="New sales order"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={async () => {
          const v = await form.validateFields();
          await api.post("/sales-orders", { items: v.items });
          message.success("Created");
          setOpen(false);
          form.resetFields();
          await load();
        }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ items: [{ skuId: undefined, qtyOrdered: 1 }] }}
        >
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <div>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: "flex", marginBottom: 8 }}>
                    <Form.Item {...field} name={[field.name, "skuId"]} label="SKU" rules={[{ required: true }]}>
                      <Select style={{ width: 220 }} options={skus.map((s) => ({ label: s.skuCode, value: s._id }))} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "qtyOrdered"]} label="Qty" rules={[{ required: true }]}>
                      <InputNumber min={1} />
                    </Form.Item>
                    <Button onClick={() => remove(field.name)} danger type="link">
                      Remove
                    </Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block>
                  Add line
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Card>
  );
}
