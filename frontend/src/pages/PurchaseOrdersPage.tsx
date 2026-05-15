import { useEffect, useState } from "react";
import { Button, Card, Form, InputNumber, Modal, Select, Space, Table, Tag, message } from "antd";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

type Po = {
  _id: string;
  supplierId: string;
  status: string;
  items: { skuId: string; qtyOrdered: number; qtyReceived: number; unitPrice: number }[];
};

type Supplier = { _id: string; name: string };
type Sku = { _id: string; skuCode: string };

export function PurchaseOrdersPage() {
  const { user } = useAuth();
  const { lastInventoryEvent } = useSocket();
  const canEdit = user?.role === "Owner" || user?.role === "Manager";
  const [rows, setRows] = useState<Po[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [skus, setSkus] = useState<Sku[]>([]);
  const [open, setOpen] = useState(false);
  const [recv, setRecv] = useState<Po | null>(null);
  const [form] = Form.useForm();
  const [recvForm] = Form.useForm();

  const load = async () => {
    const [p, s, k] = await Promise.all([
      api.get<Po[]>("/purchase-orders"),
      api.get<Supplier[]>("/suppliers"),
      api.get<Sku[]>("/skus"),
    ]);
    setRows(p.data);
    setSuppliers(s.data);
    setSkus(k.data);
  };

  useEffect(() => {
    load().catch(() => message.error("Failed to load purchase orders"));
  }, [lastInventoryEvent]);

  return (
    <Card
      title="Purchase orders"
      extra={
        canEdit ? (
          <Button type="primary" onClick={() => setOpen(true)}>
            New PO
          </Button>
        ) : null
      }
    >
      <Table
        rowKey="_id"
        dataSource={rows}
        columns={[
          { title: "Supplier", dataIndex: "supplierId", render: (id: string) => suppliers.find((s) => s._id === id)?.name ?? id },
          {
            title: "Status",
            dataIndex: "status",
            render: (s: string) => <Tag>{s}</Tag>,
          },
          {
            title: "Lines",
            render: (_, r) => r.items.length,
          },
          {
            title: "Actions",
            render: (_, r) =>
              canEdit ? (
                <Space>
                  <Select
                    size="small"
                    value={r.status}
                    style={{ width: 130 }}
                    options={["Draft", "Sent", "Confirmed", "Received"].map((x) => ({ label: x, value: x }))}
                    onChange={async (status) => {
                      await api.patch(`/purchase-orders/${r._id}/status`, { status });
                      message.success("Updated");
                      await load();
                    }}
                  />
                  {["Sent", "Confirmed"].includes(r.status) ? (
                    <Button size="small" onClick={() => { setRecv(r); recvForm.resetFields(); }}>
                      Receive
                    </Button>
                  ) : null}
                </Space>
              ) : null,
          },
        ]}
      />

      <Modal
        title="New purchase order"
        open={open}
        onCancel={() => setOpen(false)}
        width={640}
        onOk={async () => {
          const v = await form.validateFields();
          await api.post("/purchase-orders", {
            supplierId: v.supplierId,
            status: v.status ?? "Draft",
            items: v.items,
          });
          message.success("Created");
          setOpen(false);
          form.resetFields();
          await load();
        }}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            status: "Draft",
            items: [{ skuId: undefined, qtyOrdered: 10, unitPrice: 5 }],
          }}
        >
          <Form.Item name="supplierId" label="Supplier" rules={[{ required: true }]}>
            <Select options={suppliers.map((s) => ({ label: s.name, value: s._id }))} />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select options={["Draft", "Sent", "Confirmed"].map((x) => ({ label: x, value: x }))} />
          </Form.Item>
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
                    <Form.Item {...field} name={[field.name, "unitPrice"]} label="Unit price" rules={[{ required: true }]}>
                      <InputNumber min={0} />
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

      <Modal
        title="Receive against PO"
        open={!!recv}
        onCancel={() => setRecv(null)}
        onOk={async () => {
          const v = await recvForm.validateFields();
          await api.post(`/purchase-orders/${recv!._id}/receive`, { receipts: v.receipts });
          message.success("Received");
          setRecv(null);
          await load();
        }}
      >
        <Form form={recvForm} layout="vertical" initialValues={{ receipts: [{ skuId: undefined, qty: 1 }] }}>
          <Form.List name="receipts">
            {(fields, { add, remove }) => (
              <div>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: "flex", marginBottom: 8 }}>
                    <Form.Item {...field} name={[field.name, "skuId"]} label="SKU" rules={[{ required: true }]}>
                      <Select
                        style={{ width: 220 }}
                        options={(recv?.items ?? []).map((i) => {
                          const sku = skus.find((s) => s._id === String(i.skuId));
                          return { label: sku?.skuCode ?? String(i.skuId), value: String(i.skuId) };
                        })}
                      />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "qty"]} label="Qty" rules={[{ required: true }]}>
                      <InputNumber min={1} />
                    </Form.Item>
                    <Button onClick={() => remove(field.name)} danger type="link">
                      Remove
                    </Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block>
                  Add receipt line
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Card>
  );
}
