import React, { useState } from "react";
import {
  Drawer,
  Button,
  Space,
  Tag,
  Divider,
  Descriptions,
  List,
  Table,
  Modal,
  App,
  Timeline,
  Card,
} from "antd";
import {
  CloseOutlined,
  DollarOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { Payment, PaymentDistribution } from "../../types";
import { paymentService } from "../../services/paymentService";
import dayjs from "dayjs";
import EditPaymentModal from "./EditPaymentModal";

interface PaymentSidePanelProps {
  visible: boolean;
  onClose: () => void;
  payment: Payment | null;
  onDistribute: (payment: Payment) => void; // Changed from onAllocate
  onEdit: (payment: Payment) => void;
  onDelete: (payment: Payment) => void;
  onReload: () => void;
}

const PaymentSidePanel: React.FC<PaymentSidePanelProps> = ({
  visible,
  onClose,
  payment,
  onDistribute, // Changed from onAllocate
  onEdit,
  onDelete,
  onReload,
}) => {
  const { message, modal } = App.useApp();
  const [showEditModal, setShowEditModal] = useState(false);

  if (!payment) return null;

  // Add the canDistribute function here
  const canDistribute = () => {
    if (
      payment.payment_method === "cheque" ||
      payment.payment_method === "parchi"
    ) {
      return payment.status === "completed" || payment.status === "partial";
    }
    return payment.status === "completed" || payment.status === "partial";
  };

  const getPaymentMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      cash: "green",
      bank_transfer: "blue",
      cheque: "orange",
      parchi: "purple",
      jazzcash: "red",
      easypaisa: "cyan",
    };
    return colors[method] || "default";
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "orange",
      completed: "green",
      cancelled: "red",
      partial: "blue",
    };
    return colors[status] || "default";
  };

  const canAllocate = () => {
    if (
      payment.payment_method === "cheque" ||
      payment.payment_method === "parchi"
    ) {
      return payment.status === "completed" || payment.status === "partial";
    }
    return payment.status === "completed" || payment.status === "partial";
  };

  const handleMarkAsCompleted = async () => {
    try {
      // Check if cheque date exists
      if (payment.cheque_date) {
        const chequeDate = dayjs(payment.cheque_date);
        const today = dayjs();

        console.log("Cheque date check:", {
          chequeDate: chequeDate.format("DD/MM/YYYY"),
          today: today.format("DD/MM/YYYY"),
          chequeDateObj: chequeDate,
          todayObj: today,
        });

        // Compare only the dates (ignore time)
        const isFutureDate = chequeDate.isAfter(today, "day");

        if (isFutureDate) {
          message.error(
            `Cannot mark cheque as completed. Cheque date (${chequeDate.format(
              "DD/MM/YYYY"
            )}) is in the future. Please wait until the cheque date arrives.`
          );
          return;
        }
      }

      await paymentService.updatePaymentStatus(
        payment.id,
        "completed",
        payment.cheque_date
      );
      message.success("Payment marked as completed successfully");
      onReload();
      onClose();
    } catch (error: any) {
      console.error("Error marking as completed:", error);

      if (error.message?.includes("Cannot mark cheque as completed")) {
        message.error(error.message);
      } else {
        message.error("Failed to update payment status");
      }
    }
  };

  const handleDelete = () => {
    modal.confirm({
      title: "Delete Payment",
      content: `Are you sure you want to delete ${payment.payment_number}? This action cannot be undone.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      onOk: async () => {
        try {
          await paymentService.deletePayment(payment.id);
          message.success("Payment deleted successfully");
          onReload();
          onClose();
        } catch (error) {
          message.error("Failed to delete payment");
        }
      },
      centered: true,
    });
  };

  const handleEdit = () => {
    setShowEditModal(true);
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    onReload();
    message.success("Payment updated successfully");
  };

  const distributionColumns = [
    {
      title: "Payee",
      dataIndex: "payee_name",
      key: "payee_name",
      render: (
        text: string,
        record: PaymentDistribution // Changed type
      ) => (
        <div>
          <div>
            <strong>{text}</strong>
          </div>
          <Tag color="blue" style={{ marginTop: 4 }}>
            {record.payee_type?.toUpperCase() || "UNKNOWN"}
          </Tag>
        </div>
      ),
    },
    {
      title: "Purpose",
      dataIndex: "purpose",
      key: "purpose",
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount: number) => (
        <strong style={{ color: "#00b96b" }}>
          PKR {amount.toLocaleString()}
        </strong>
      ),
    },
    {
      title: "Date",
      dataIndex: "allocation_date",
      key: "allocation_date",
      render: (date: string) => dayjs(date).format("DD/MM/YYYY"),
    },
  ];

  const totalDistributed = // Changed from totalAllocated
    payment.distributions?.reduce((sum, dist) => sum + dist.amount, 0) || 0;
  const remainingAmount = payment.total_received - totalDistributed;

  return (
    <>
      <Drawer
        title={
          <div style={{ textAlign: "center", position: "relative" }}>
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={onClose}
              style={{ position: "absolute", left: 0, top: 0 }}
            />
            <div style={{ fontWeight: "bold", fontSize: "16px" }}>
              {payment.payment_number}
            </div>
          </div>
        }
        placement="right"
        onClose={onClose}
        open={visible}
        width={700}
        styles={{
          body: { padding: "16px 0" },
          header: { padding: "16px 24px", borderBottom: "1px solid #f0f0f0" },
          footer: {
            padding: "16px 24px",
            borderTop: "1px solid #f0f0f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          },
        }}
        footer={
          <div
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {/* Left side - Distribute and Status buttons */}
            <Space>
              {(payment.payment_method === "cheque" ||
                payment.payment_method === "parchi") &&
                payment.status === "pending" && (
                  <Button
                    icon={<CheckCircleOutlined />}
                    type="primary"
                    onClick={handleMarkAsCompleted}
                  >
                    Mark as Completed
                  </Button>
                )}
              {canDistribute() && (
                <Button
                  icon={<DollarOutlined />}
                  type="primary"
                  onClick={() => onDistribute(payment)} // Changed from onAllocate
                >
                  Distribute Funds
                </Button>
              )}
            </Space>

            {/* Right side - Edit and Delete buttons */}
            <Space>
              <Button icon={<EditOutlined />} onClick={handleEdit}>
                Edit Payment
              </Button>
              <Button icon={<DeleteOutlined />} danger onClick={handleDelete}>
                Delete Payment
              </Button>
            </Space>
          </div>
        }
      >
        <div style={{ padding: "0 24px" }}>
          {/* Status and Amount */}
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <Space>
              <Tag
                color={getStatusColor(payment.status)}
                style={{ fontSize: "14px", padding: "4px 12px" }}
              >
                {payment.status.toUpperCase()}
              </Tag>
              <Tag
                color={getPaymentMethodColor(payment.payment_method)}
                style={{ fontSize: "14px", padding: "4px 12px" }}
              >
                {payment.payment_method.replace("_", " ").toUpperCase()}
              </Tag>
            </Space>
            <div
              style={{
                fontSize: "32px",
                fontWeight: "bold",
                margin: "16px 0",
                color: "#00b96b",
              }}
            >
              PKR {payment.total_received.toLocaleString()}
            </div>
          </div>

          <Divider />

          {/* Payment Details */}
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Payment Date">
              {dayjs(payment.payment_date).format("DD/MM/YYYY")}
            </Descriptions.Item>
            <Descriptions.Item label="Customer">
              <div>
                <div>
                  <strong>{payment.customer?.company_name}</strong>
                </div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  {payment.customer?.first_name} {payment.customer?.last_name}
                </div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  {payment.customer?.mobile}
                </div>
              </div>
            </Descriptions.Item>
            {payment.reference_number && (
              <Descriptions.Item label="Reference Number">
                {payment.reference_number}
              </Descriptions.Item>
            )}
            {payment.bank_name && (
              <Descriptions.Item label="Bank Name">
                {payment.bank_name}
              </Descriptions.Item>
            )}
            {payment.cheque_date && (
              <Descriptions.Item label="Cheque Date">
                {dayjs(payment.cheque_date).format("DD/MM/YYYY")}
              </Descriptions.Item>
            )}
            {payment.notes && (
              <Descriptions.Item label="Notes">
                {payment.notes}
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider />

          {/* Distribution Summary */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div>Total Received</div>
                <strong style={{ fontSize: "16px" }}>
                  PKR {payment.total_received.toLocaleString()}
                </strong>
              </div>
              <div>
                <div>Distributed</div> {/* Changed from Allocated */}
                <strong style={{ fontSize: "16px", color: "#1890ff" }}>
                  PKR {totalDistributed.toLocaleString()}
                </strong>
              </div>
              <div>
                <div>Remaining</div>
                <strong
                  style={{
                    fontSize: "16px",
                    color: remainingAmount > 0 ? "#faad14" : "#00b96b",
                  }}
                >
                  PKR {remainingAmount.toLocaleString()}
                </strong>
              </div>
            </div>
          </Card>

          {/* Distributions */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: "500", marginBottom: 12 }}>
              Payment Distributions {/* Changed from Allocations */}
            </div>
            {payment.distributions && payment.distributions.length > 0 ? (
              <Table
                columns={distributionColumns}
                dataSource={payment.distributions}
                pagination={false}
                size="small"
                rowKey="id"
              />
            ) : (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "#999",
                  border: "1px dashed #d9d9d9",
                  borderRadius: "6px",
                }}
              >
                No distributions found for this payment
              </div>
            )}
          </div>

          {/* Payment Timeline */}
          <Divider />
          <div style={{ fontWeight: "500", marginBottom: 12 }}>
            Payment Timeline
          </div>
          <Timeline>
            <Timeline.Item
              dot={<ClockCircleOutlined style={{ fontSize: "16px" }} />}
              color="blue"
            >
              <div>Payment Received</div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                {dayjs(payment.created_at).format("DD/MM/YYYY HH:mm")}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>
                Amount: PKR {payment.total_received.toLocaleString()}
              </div>
            </Timeline.Item>
            {(payment.payment_method === "cheque" ||
              payment.payment_method === "parchi") && (
              <Timeline.Item
                dot={<CheckCircleOutlined style={{ fontSize: "16px" }} />}
                color={payment.status === "completed" ? "green" : "gray"}
              >
                <div>Cleared / Cashed Out</div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  {payment.status === "completed" ? "Completed" : "Pending"}
                </div>
              </Timeline.Item>
            )}
            {payment.distributions &&
              payment.distributions.map((dist, index) => (
                <Timeline.Item
                  key={dist.id}
                  dot={<DollarOutlined style={{ fontSize: "16px" }} />}
                  color="green"
                >
                  <div>Distributed to {dist.payee_name}</div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    {dayjs(dist.allocation_date).format("DD/MM/YYYY")} - PKR{" "}
                    {dist.amount.toLocaleString()}
                  </div>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    Purpose: {dist.purpose}
                  </div>
                </Timeline.Item>
              ))}
          </Timeline>
        </div>
      </Drawer>

      {/* Edit Payment Modal */}
      <EditPaymentModal
        visible={showEditModal}
        payment={payment}
        onClose={() => setShowEditModal(false)}
        onSuccess={handleEditSuccess}
      />
    </>
  );
};

export default PaymentSidePanel;
