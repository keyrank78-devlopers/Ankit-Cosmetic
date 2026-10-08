import api from "./api";

const orderService = {
  catalog: async (search) => {
    const response = await api.get("/admin/orders/catalog", { params: { search } });
    return response.data;
  },
  start: async (customerId) => {
    const response = await api.post("/admin/orders", { customerId });
    return response.data;
  },
  setLine: async (orderId, data) => {
    const response = await api.put(`/admin/orders/${orderId}/lines`, data);
    return response.data;
  },
  removeLine: async (orderId, productId) => {
    const response = await api.delete(`/admin/orders/${orderId}/lines/${productId}`);
    return response.data;
  },
  schemes: async (orderId) => {
    const response = await api.get(`/admin/orders/${orderId}/schemes`);
    return response.data;
  },
  setScheme: async (orderId, data) => {
    const response = await api.put(`/admin/orders/${orderId}/scheme`, data);
    return response.data;
  },
  setExpiry: async (orderId, data) => {
    const response = await api.put(`/admin/orders/${orderId}/expiry`, data);
    return response.data;
  },
  place: async (orderId, data) => {
    const response = await api.post(`/admin/orders/${orderId}/place`, data);
    return response.data;
  },
  paymentQr: async () => {
    const response = await api.get("/admin/settings/payment-qr");
    return response.data;
  },
  uploadPaymentQr: async (formData) => {
    const response = await api.put("/admin/settings/payment-qr", formData);
    return response.data;
  },
  addPromise: async (orderId, data) => {
    const response = await api.post(`/admin/orders/${orderId}/promises`, data);
    return response.data;
  },
  updatePromise: async (orderId, promiseId, data) => {
    const response = await api.patch(`/admin/orders/${orderId}/promises/${promiseId}`, data);
    return response.data;
  },
  removePromise: async (orderId, promiseId) => {
    const response = await api.delete(`/admin/orders/${orderId}/promises/${promiseId}`);
    return response.data;
  },
  updateStatus: async (orderId, status) => {
    const response = await api.patch(`/admin/orders/${orderId}/status`, { status });
    return response.data;
  },
  cancel: async (orderId) => {
    const response = await api.post(`/admin/orders/${orderId}/cancel`);
    return response.data;
  },
  list: async (params) => {
    const response = await api.get("/admin/orders", { params });
    return response.data;
  },
  revenue: async (params) => {
    const response = await api.get("/admin/orders/revenue", { params });
    return response.data;
  },
  reimbursements: async (params) => {
    const response = await api.get("/admin/orders/reimbursements", { params });
    return response.data;
  },
  expiryStock: async (params) => {
    const response = await api.get("/admin/inventory/expiry", { params });
    return response.data;
  },
  warehouse: async (params) => {
    const response = await api.get("/admin/orders/warehouse", { params });
    return response.data;
  },
  get: async (orderId) => {
    const response = await api.get(`/admin/orders/${orderId}`);
    return response.data;
  },
  remove: async (orderId) => {
    const response = await api.delete(`/admin/orders/${orderId}`);
    return response.data;
  },
  history: async (customerId, params) => {
    const response = await api.get(`/admin/orders/customer/${customerId}`, { params });
    return response.data;
  },
  dashboard: async () => {
    const response = await api.get("/admin/dashboard");
    return response.data;
  },
};

export default orderService;
