import { useCallback, useEffect, useState } from "react";
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, Tag, Typography, message } from "antd";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

type AttributeOption = { label: string; slug: string; sortOrder?: number };

type Attribute = {
  _id: string;
  name: string;
  slug: string;
  options: AttributeOption[];
  createdAt?: string;
  updatedAt?: string;
};

function normalizePayload(v: { name: string; slug: string; options: AttributeOption[] }) {
  return {
    name: v.name.trim(),
    slug: v.slug.trim().toLowerCase().replace(/\s+/g, "-"),
    options: (v.options as AttributeOption[]).map((o, i) => ({
      label: o.label.trim(),
      slug: o.slug.trim().toLowerCase().replace(/\s+/g, "-"),
      sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : i,
    })),
  };
}

export function AttributesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "Owner" || user?.role === "Manager";
  const [rows, setRows] = useState<Attribute[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Attribute | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(() => api.get<Attribute[]>("/attributes").then((r) => setRows(r.data)), []);

  useEffect(() => {
    load().catch(() => message.error("Failed to load attributes"));
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      options: [{ label: "", slug: "", sortOrder: 0 }],
    });
    setOpen(true);
  };

  const openEdit = (row: Attribute) => {
    setEditing(row);
    form.setFieldsValue({
      name: row.name,
      slug: row.slug,
      options: row.options.map((o, i) => ({
        label: o.label,
        slug: o.slug,
        sortOrder: typeof o.sortOrder === "number" ? o.sortOrder : i,
      })),
    });
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    const v = await form.validateFields();
    const payload = normalizePayload(v as { name: string; slug: string; options: AttributeOption[] });
    if (editing) {
      await api.patch(`/attributes/${editing._id}`, payload);
      message.success("Attribute updated");
    } else {
      await api.post("/attributes", payload);
      message.success("Attribute created");
    }
    closeModal();
    await load();
  };

  const handleDelete = async (row: Attribute) => {
    try {
      await api.delete(`/attributes/${row._id}`);
      message.success("Attribute deleted");
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error ?? "Could not delete attribute");
    }
  };

  return (
    <Card
      title="Product attributes"
      extra={
        canEdit ? (
          <Button type="primary" onClick={openCreate}>
            New attribute
          </Button>
        ) : null
      }
    >
      <Typography.Paragraph type="secondary">
        Attributes define variant axes (for example <strong>Size</strong> with options XL, XXL, or{" "}
        <strong>Color</strong> with Black, Blue). You must be <strong>Owner</strong> or <strong>Manager</strong> to
        create, edit, or delete.
      </Typography.Paragraph>

      <Table
        rowKey="_id"
        dataSource={rows}
        columns={[
          { title: "Name", dataIndex: "name" },
          { title: "Slug", dataIndex: "slug" },
          {
            title: "Options",
            dataIndex: "options",
            render: (opts: AttributeOption[]) =>
              opts?.length ? (
                <Space size={[4, 4]} wrap>
                  {opts.map((o) => (
                    <Tag key={`${o.slug}-${o.label}`}>
                      {o.label} ({o.slug})
                    </Tag>
                  ))}
                </Space>
              ) : (
                "—"
              ),
          },
          ...(canEdit
            ? [
                {
                  title: "Actions",
                  key: "actions",
                  width: 200,
                  render: (_: unknown, row: Attribute) => (
                    <Space>
                      <Button type="link" size="small" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Popconfirm
                        title="Delete this attribute?"
                        description="You cannot delete an attribute that is used by product variants."
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => handleDelete(row)}
                      >
                        <Button type="link" size="small" danger>
                          Delete
                        </Button>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />

      <Modal
        title={editing ? "Edit attribute" : "New attribute"}
        open={open}
        width={640}
        onCancel={closeModal}
        okText={editing ? "Save changes" : "Create"}
        destroyOnClose
        onOk={async () => {
          try {
            await handleSubmit();
          } catch (e: unknown) {
            const err = e as { response?: { data?: { error?: string } } };
            message.error(err.response?.data?.error ?? "Request failed");
            return Promise.reject(e);
          }
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Display name" rules={[{ required: true, message: "Name is required" }]}>
            <Input placeholder="e.g. Size" />
          </Form.Item>
          <Form.Item
            name="slug"
            label="Slug (unique per store)"
            rules={[{ required: true, message: "Slug is required" }]}
            extra="Lowercase, no spaces. Example: size, color."
          >
            <Input placeholder="e.g. size" />
          </Form.Item>

          <Typography.Text strong>Options</Typography.Text>
          <Form.List
            name="options"
            rules={[
              {
                validator: async (_, value) => {
                  if (!value?.length) throw new Error("Add at least one option");
                },
              },
            ]}
          >
            {(fields, { add, remove }) => (
              <div style={{ marginTop: 8 }}>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: "flex", marginBottom: 8 }} wrap>
                    <Form.Item
                      {...field}
                      name={[field.name, "label"]}
                      label="Label"
                      rules={[{ required: true }]}
                    >
                      <Input placeholder="XL" style={{ width: 140 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "slug"]} label="Slug" rules={[{ required: true }]}>
                      <Input placeholder="xl" style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "sortOrder"]} label="Order">
                      <InputNumber min={0} style={{ width: 80 }} />
                    </Form.Item>
                    <Button type="link" danger onClick={() => remove(field.name)}>
                      Remove
                    </Button>
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({ label: "", slug: "", sortOrder: fields.length })} block>
                  Add option
                </Button>
              </div>
            )}
          </Form.List>
        </Form>
      </Modal>
    </Card>
  );
}
