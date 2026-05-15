import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Divider, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from "antd";
import api from "../api/client";
import { useAuth } from "../context/AuthContext";

type AttributeOption = { label: string; slug: string };

type Attribute = {
  _id: string;
  name: string;
  slug: string;
  options: AttributeOption[];
};

type AttributeSelectionRow = {
  attributeId: string;
  optionSlugs: string[];
};

type ProductAttributeSelection = {
  attributeId: Attribute | string;
  optionSlugs: string[];
};

type Product = {
  _id: string;
  name: string;
  description?: string;
  attributeSelections?: ProductAttributeSelection[];
};

function toId(value: string | { _id?: string } | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id ?? "";
}

function optionLabel(attr: Attribute | undefined, slug: string): string {
  return attr?.options.find((o) => o.slug === slug)?.label ?? slug;
}

function renderProductAttributes(row: Product) {
  const selections = row.attributeSelections;
  if (!selections?.length) return "—";
  return (
    <Space size={[4, 4]} wrap direction="vertical">
      {selections.map((sel) => {
        const attr = typeof sel.attributeId === "object" ? sel.attributeId : undefined;
        const attrName = attr?.name ?? "Attribute";
        const labels = sel.optionSlugs.map((slug) => optionLabel(attr, slug)).join(", ");
        return (
          <Tag key={`${toId(sel.attributeId)}-${sel.optionSlugs.join("-")}`} color="blue">
            {attrName}: {labels}
          </Tag>
        );
      })}
    </Space>
  );
}

type OptionPickerProps = {
  attributeId?: string;
  attributes: Attribute[];
  value?: string[];
  onChange?: (value: string[]) => void;
};

function AttributeOptionPicker({ attributeId, attributes, value, onChange }: OptionPickerProps) {
  const attr = attributes.find((a) => toId(a._id) === toId(attributeId));
  if (!attributeId) {
    return <Typography.Text type="secondary">Select an attribute first</Typography.Text>;
  }
  if (!attr) {
    return <Typography.Text type="danger">Unknown attribute</Typography.Text>;
  }
  return (
    <Select
      mode="multiple"
      allowClear
      placeholder={`Select ${attr.name} options`}
      value={value}
      onChange={onChange}
      options={attr.options.map((o) => ({ value: o.slug, label: o.label }))}
    />
  );
}

function productToFormValues(row: Product): {
  name: string;
  description: string;
  attributeSelections: AttributeSelectionRow[];
} {
  return {
    name: row.name,
    description: row.description ?? "",
    attributeSelections: (row.attributeSelections ?? []).map((sel) => ({
      attributeId: toId(sel.attributeId),
      optionSlugs: [...(sel.optionSlugs ?? [])],
    })),
  };
}

export function ProductsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "Owner" || user?.role === "Manager";
  const [rows, setRows] = useState<Product[]>([]);
  const [attributes, setAttributes] = useState<Attribute[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const modalProductRef = useRef<Product | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    const [productsRes, attrsRes] = await Promise.all([
      api.get<Product[]>("/products"),
      api.get<Attribute[]>("/attributes"),
    ]);
    setRows(productsRes.data);
    setAttributes(attrsRes.data);
  }, []);

  useEffect(() => {
    load().catch(() => message.error("Failed to load products"));
  }, [load]);

  const resetFormOnOpen = () => {
    form.resetFields();
    const row = modalProductRef.current;
    if (row) {
      form.setFieldsValue(productToFormValues(row));
    } else {
      form.setFieldsValue({ name: "", description: "", attributeSelections: [] });
    }
  };

  const openCreate = () => {
    modalProductRef.current = null;
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (row: Product) => {
    modalProductRef.current = row;
    setEditing(row);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setEditing(null);
    modalProductRef.current = null;
    form.resetFields();
  };

  const handleSubmit = async () => {
    const v = await form.validateFields();
    const selections = ((v.attributeSelections as AttributeSelectionRow[]) ?? []).filter(
      (s) => s?.attributeId && s.optionSlugs?.length
    );
    const payload = {
      name: (v.name as string).trim(),
      description: ((v.description as string) ?? "").trim(),
      attributeSelections: selections,
    };
    if (editing) {
      await api.patch(`/products/${editing._id}`, payload);
      message.success("Product updated");
    } else {
      await api.post("/products", payload);
      message.success("Product created");
    }
    closeModal();
    await load();
  };

  const usedAttributeIds = (excludeIndex: number) => {
    const list = (form.getFieldValue("attributeSelections") as AttributeSelectionRow[]) ?? [];
    return list
      .map((row, idx) => (idx === excludeIndex ? undefined : row?.attributeId))
      .filter(Boolean) as string[];
  };

  return (
    <Card
      title="Products"
      extra={
        canEdit ? (
          <Button type="primary" onClick={openCreate}>
            New product
          </Button>
        ) : null
      }
    >
      <Typography.Paragraph type="secondary">
        For each attribute (Size, Color, etc.), choose <strong>only the options this product uses</strong> — e.g. one
        color or two sizes. Create attributes on the <strong>Attributes</strong> page first.
      </Typography.Paragraph>

      <Table
        rowKey="_id"
        dataSource={rows}
        columns={[
          { title: "Name", dataIndex: "name" },
          { title: "Description", dataIndex: "description", ellipsis: true },
          {
            title: "Attributes & options",
            key: "attributes",
            render: (_, row) => renderProductAttributes(row),
          },
          ...(canEdit
            ? [
                {
                  title: "Actions",
                  key: "actions",
                  width: 120,
                  render: (_: unknown, row: Product) => (
                    <Button type="link" size="small" onClick={() => openEdit(row)}>
                      Edit
                    </Button>
                  ),
                },
              ]
            : []),
        ]}
      />

      <Modal
        title={editing ? "Edit product" : "New product"}
        open={open}
        width={640}
        onCancel={closeModal}
        okText={editing ? "Save" : "Create"}
        destroyOnClose
        afterOpenChange={(visible) => {
          if (visible) resetFormOnOpen();
        }}
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
          <Form.Item name="name" label="Name" rules={[{ required: true, message: "Name is required" }]}>
            <Input placeholder="e.g. T-Shirt" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="Optional" />
          </Form.Item>

          <Divider plain>Attributes & options</Divider>

          {attributes.length === 0 ? (
            <Typography.Text type="secondary">No attributes yet. Create them on the Attributes page.</Typography.Text>
          ) : (
            <Form.List name="attributeSelections">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Card key={field.key} size="small" style={{ marginBottom: 12 }}>
                      <Space align="start" style={{ width: "100%" }} wrap>
                        <Form.Item
                          name={[field.name, "attributeId"]}
                          label="Attribute"
                          rules={[{ required: true, message: "Select attribute" }]}
                          style={{ minWidth: 200 }}
                        >
                          <Select
                            placeholder="e.g. Size"
                            options={attributes
                              .filter((a) => {
                                const used = usedAttributeIds(field.name);
                                const current = form.getFieldValue([
                                  "attributeSelections",
                                  field.name,
                                  "attributeId",
                                ]) as string | undefined;
                                return !used.includes(a._id) || current === a._id;
                              })
                              .map((a) => ({ value: a._id, label: a.name }))}
                            onChange={(nextId) => {
                              const prevId = form.getFieldValue([
                                "attributeSelections",
                                field.name,
                                "attributeId",
                              ]) as string | undefined;
                              if (prevId !== nextId) {
                                form.setFieldValue(["attributeSelections", field.name, "optionSlugs"], []);
                              }
                            }}
                          />
                        </Form.Item>
                        <Form.Item
                          noStyle
                          shouldUpdate={(prev, cur) =>
                            prev.attributeSelections?.[field.name]?.attributeId !==
                            cur.attributeSelections?.[field.name]?.attributeId
                          }
                        >
                          {() => {
                            const attributeId = form.getFieldValue([
                              "attributeSelections",
                              field.name,
                              "attributeId",
                            ]) as string | undefined;
                            return (
                              <Form.Item
                                name={[field.name, "optionSlugs"]}
                                label="Options for this product"
                                rules={[{ required: true, message: "Select at least one option" }]}
                                style={{ minWidth: 260, flex: 1 }}
                              >
                                <AttributeOptionPicker attributeId={attributeId} attributes={attributes} />
                              </Form.Item>
                            );
                          }}
                        </Form.Item>
                        <Button type="text" danger onClick={() => remove(field.name)} style={{ marginTop: 30 }}>
                          Remove
                        </Button>
                      </Space>
                    </Card>
                  ))}
                  <Button
                    type="dashed"
                    onClick={() => add({ attributeId: undefined, optionSlugs: [] })}
                    block
                    disabled={fields.length >= attributes.length}
                  >
                    Add attribute
                  </Button>
                </>
              )}
            </Form.List>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
