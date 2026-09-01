"use client";

import { useRef } from "react";
import { updateOrderStatus } from "@/lib/actions/order-actions";

export function OrderStatusForm({
  orderId,
  value,
}: {
  orderId: string;
  value: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={updateOrderStatus}>
      <input type="hidden" name="id" value={orderId} />
      <select
        name="status"
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-md border border-border-c bg-surface-2 text-xs px-2 py-1"
      >
        <option value="PENDING">Pending</option>
        <option value="PACKING">Packing</option>
        <option value="COMPLETED">Completed</option>
        <option value="DELIVERED">Delivered</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
    </form>
  );
}
