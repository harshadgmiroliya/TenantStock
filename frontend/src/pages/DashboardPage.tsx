import { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Table, Typography, Spin } from "antd";
import { Line } from "@ant-design/charts";
import api from "../api/client";
import { useSocket } from "../context/SocketContext";

type DashboardSummary = {
  inventoryValue: number;
  skuCount: number;
  lowStockSkus: { _id: string; skuCode: string; stock: number; reorderPoint: number; inbound: number }[];
  topSellers: { skuId: string; skuCode: string; units: number }[];
  stockMovement7d: { day: string; netMovement: number }[];
};

export function DashboardPage() {
  const { lastInventoryEvent } = useSocket();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<DashboardSummary>("/dashboard/summary")
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lastInventoryEvent]);

  if (loading && !data) {
    return <Spin />;
  }

  if (!data) {
    return <Typography.Text type="danger">Failed to load dashboard</Typography.Text>;
  }

  return (
    <div>
      <Typography.Title level={3}>Dashboard</Typography.Title>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Inventory value" value={data.inventoryValue} precision={2} prefix="$" />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Active SKUs" value={data.skuCount} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Statistic title="Low-stock SKUs (net of inbound POs)" value={data.lowStockSkus.length} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card title="Top sellers (30 days)" style={{ marginBottom: 16 }}>
            <Table
              size="small"
              rowKey={(r) => r.skuId}
              pagination={false}
              dataSource={data.topSellers}
              columns={[
                { title: "SKU", dataIndex: "skuCode" },
                { title: "Units sold", dataIndex: "units" },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Low stock" style={{ marginBottom: 16 }}>
            <Table
              size="small"
              rowKey={(r) => r._id}
              pagination={false}
              dataSource={data.lowStockSkus}
              columns={[
                { title: "SKU", dataIndex: "skuCode" },
                { title: "Stock", dataIndex: "stock" },
                { title: "Reorder", dataIndex: "reorderPoint" },
                { title: "Inbound (open POs)", dataIndex: "inbound" },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Stock movement (7 days)">
        <Line
          data={data.stockMovement7d}
          xField="day"
          yField="netMovement"
          height={280}
          smooth
        />
      </Card>
    </div>
  );
}
