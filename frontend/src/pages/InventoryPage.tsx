import { useEffect, useState } from "react";
import { Card, Table, Typography, message } from "antd";
import api from "../api/client";
import { useSocket } from "../context/SocketContext";

type Sku = {
  _id: string;
  skuCode: string;
  productId: string;
  stock: number;
  reorderPoint: number;
  unitCost: number;
  attributes?: Record<string, string>;
};

export function InventoryPage() {
  const { lastInventoryEvent } = useSocket();
  const [rows, setRows] = useState<Sku[]>([]);

  const load = () => api.get<Sku[]>("/skus").then((r) => setRows(r.data));

  useEffect(() => {
    load().catch(() => message.error("Failed to load SKUs"));
  }, [lastInventoryEvent]);

  return (
    <Card title="Inventory (SKUs)">
      <Typography.Paragraph type="secondary">
        Stock levels update in real time via Socket.io when orders or receipts change.
      </Typography.Paragraph>
      <Table
        rowKey="_id"
        dataSource={rows}
        columns={[
          { title: "SKU", dataIndex: "skuCode" },
          {
            title: "Attributes",
            dataIndex: "attributes",
            render: (attrs: Sku["attributes"]) =>
              attrs ? Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(", ") : "",
          },
          { title: "Stock", dataIndex: "stock" },
          { title: "Reorder", dataIndex: "reorderPoint" },
          { title: "Unit cost", dataIndex: "unitCost" },
        ]}
      />
    </Card>
  );
}
